import {
  AdjustInventoryInput,
  type AdjustInventoryResult,
  assertSameRequest,
  checkedQuantity,
  type GameApi,
  GameError,
  type GameStats,
  type InventoryEntry,
  type Item,
  ListPlayersInput,
  type Player,
  type PlayerDetail,
  type PlayerPage,
  type Rarity,
} from "@apiservice/game-contract";

interface ItemRow {
  id: string;
  name: string;
  rarity: string;
  max_stack: number;
}
interface PlayerRow {
  id: string;
  display_name: string;
  level: number;
  xp: number;
  created_at: string;
}
interface SlotRow {
  quantity: number;
  version: number;
}

const toItem = (r: ItemRow): Item => ({ id: r.id, name: r.name, rarity: r.rarity as Rarity, maxStack: r.max_stack });
const toPlayer = (r: PlayerRow): Player => ({
  id: r.id,
  displayName: r.display_name,
  level: r.level,
  xp: r.xp,
  createdAt: r.created_at,
});

// GameApi on D1. The rules (bounds, idempotency) match InMemoryGame.
export class D1Game implements GameApi {
  constructor(private db: D1Database) {}

  async stats(): Promise<GameStats> {
    const row = await this.db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM players) AS players,
                (SELECT COUNT(*) FROM items) AS items,
                (SELECT COALESCE(SUM(quantity), 0) FROM inventory) AS itemsHeld`,
      )
      .first<GameStats>();
    return row!;
  }

  async listItems(): Promise<Item[]> {
    const { results } = await this.db.prepare("SELECT * FROM items ORDER BY name").all<ItemRow>();
    return results.map(toItem);
  }

  async listPlayers(raw: ListPlayersInput): Promise<PlayerPage> {
    const { query, page, pageSize } = ListPlayersInput.parse(raw);
    const where = query ? "WHERE display_name LIKE ?1 COLLATE NOCASE OR id LIKE ?1" : "";
    const params = query ? [`%${query.replace(/[%_]/g, "")}%`] : [];
    const [rows, count] = await this.db.batch([
      this.db
        .prepare(`SELECT * FROM players ${where} ORDER BY id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`)
        .bind(...params),
      this.db.prepare(`SELECT COUNT(*) AS total FROM players ${where}`).bind(...params),
    ]);
    return {
      players: (rows.results as PlayerRow[]).map(toPlayer),
      total: (count.results[0] as { total: number }).total,
      page,
      pageSize,
    };
  }

  async getPlayer(id: string): Promise<PlayerDetail | null> {
    const [p, inv] = await this.db.batch([
      this.db.prepare("SELECT * FROM players WHERE id = ?").bind(id),
      this.db
        .prepare(
          `SELECT i.*, v.quantity, v.version FROM inventory v JOIN items i ON i.id = v.item_id
           WHERE v.player_id = ? AND v.quantity > 0 ORDER BY i.name`,
        )
        .bind(id),
    ]);
    const player = p.results[0] as PlayerRow | undefined;
    if (!player) return null;
    const inventory = (inv.results as (ItemRow & SlotRow)[]).map(
      (r): InventoryEntry => ({ item: toItem(r), quantity: r.quantity, version: r.version }),
    );
    return { player: toPlayer(player), inventory };
  }

  async adjustInventory(raw: AdjustInventoryInput): Promise<AdjustInventoryResult> {
    const input = AdjustInventoryInput.parse(raw);
    const [playerRes, itemRes, slotRes, priorRes] = await this.db.batch([
      this.db.prepare("SELECT id FROM players WHERE id = ?").bind(input.playerId),
      this.db.prepare("SELECT * FROM items WHERE id = ?").bind(input.itemId),
      this.db
        .prepare("SELECT quantity, version FROM inventory WHERE player_id = ? AND item_id = ?")
        .bind(input.playerId, input.itemId),
      this.db
        .prepare("SELECT player_id, item_id, delta FROM inventory_changes WHERE idempotency_key = ?")
        .bind(input.idempotencyKey),
    ]);
    if (!playerRes.results[0]) throw new GameError("not_found", "player not found");
    const itemRow = itemRes.results[0] as ItemRow | undefined;
    if (!itemRow) throw new GameError("not_found", "item not found");
    const item = toItem(itemRow);
    const slot = slotRes.results[0] as SlotRow | undefined;

    const prior = priorRes.results[0] as { player_id: string; item_id: string; delta: number } | undefined;
    if (prior) {
      assertSameRequest({ playerId: prior.player_id, itemId: prior.item_id, delta: prior.delta }, input);
      return { entry: { item, quantity: slot!.quantity, version: slot!.version }, replayed: true };
    }

    const quantity = checkedQuantity(slot?.quantity ?? 0, input.delta, item);
    const version = (slot?.version ?? 0) + 1;

    // Write only if the row is still at the version we read; the change record is inserted
    // in the same transaction only when that write happened (changes() = 1).
    const write = slot
      ? this.db
          .prepare("UPDATE inventory SET quantity = ?, version = ? WHERE player_id = ? AND item_id = ? AND version = ?")
          .bind(quantity, version, input.playerId, input.itemId, slot.version)
      : this.db
          .prepare(
            "INSERT INTO inventory (player_id, item_id, quantity, version) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
          )
          .bind(input.playerId, input.itemId, quantity, version);
    const record = this.db
      .prepare(
        `INSERT INTO inventory_changes (idempotency_key, player_id, item_id, delta)
         SELECT ?, ?, ?, ? WHERE changes() = 1`,
      )
      .bind(input.idempotencyKey, input.playerId, input.itemId, input.delta);

    let written: D1Result;
    try {
      [written] = await this.db.batch([write, record]);
    } catch (err) {
      // Same idempotency key committed concurrently.
      if (String(err).includes("UNIQUE")) throw new GameError("conflict", "concurrent request with the same key");
      throw err;
    }
    if (written.meta.changes !== 1) {
      throw new GameError("conflict", "inventory changed concurrently; reload and retry");
    }
    return { entry: { item, quantity, version }, replayed: false };
  }
}
