import { type GameApi, GameError } from "./api";
import {
  AdjustInventoryInput,
  type AdjustInventoryResult,
  type GameStats,
  type InventoryEntry,
  type Item,
  ListPlayersInput,
  type Player,
  type PlayerDetail,
  type PlayerPage,
  type Rarity,
} from "./schemas";
import { type SeedData, seedData } from "./seed";

interface Slot {
  quantity: number;
  version: number;
}

// In-memory GameApi with the same rules as the D1 implementation.
// Used by the admin service when GAME_BACKEND=fake, and in tests.
export class InMemoryGame implements GameApi {
  private items = new Map<string, Item>();
  private players = new Map<string, Player>();
  private inventory = new Map<string, Map<string, Slot>>(); // playerId -> itemId -> slot
  private applied = new Map<string, { input: AdjustInventoryInput }>();

  constructor(data: SeedData = seedData()) {
    for (const i of data.items) this.items.set(i.id, { ...i, rarity: i.rarity as Rarity });
    for (const p of data.players) this.players.set(p.id, { ...p });
    for (const e of data.inventory) this.slots(e.playerId).set(e.itemId, { quantity: e.quantity, version: 1 });
  }

  private slots(playerId: string) {
    let m = this.inventory.get(playerId);
    if (!m) {
      m = new Map();
      this.inventory.set(playerId, m);
    }
    return m;
  }

  private entry(item: Item, slot: Slot): InventoryEntry {
    return { item, quantity: slot.quantity, version: slot.version };
  }

  async stats(): Promise<GameStats> {
    let itemsHeld = 0;
    for (const slots of this.inventory.values()) for (const s of slots.values()) itemsHeld += s.quantity;
    return { players: this.players.size, items: this.items.size, itemsHeld };
  }

  async listItems(): Promise<Item[]> {
    return [...this.items.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async listPlayers(raw: ListPlayersInput): Promise<PlayerPage> {
    const { query, page, pageSize } = ListPlayersInput.parse(raw);
    const q = query?.toLowerCase();
    const all = [...this.players.values()]
      .filter((p) => !q || p.displayName.toLowerCase().includes(q) || p.id.includes(q))
      .sort((a, b) => a.id.localeCompare(b.id));
    return { players: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize };
  }

  async getPlayer(id: string): Promise<PlayerDetail | null> {
    const player = this.players.get(id);
    if (!player) return null;
    const inventory = [...this.slots(id).entries()]
      .filter(([, s]) => s.quantity > 0)
      .map(([itemId, s]) => this.entry(this.items.get(itemId)!, s))
      .sort((a, b) => a.item.name.localeCompare(b.item.name));
    return { player, inventory };
  }

  async adjustInventory(raw: AdjustInventoryInput): Promise<AdjustInventoryResult> {
    const input = AdjustInventoryInput.parse(raw);
    const item = this.items.get(input.itemId);
    if (!this.players.has(input.playerId)) throw new GameError("not_found", "player not found");
    if (!item) throw new GameError("not_found", "item not found");

    const prior = this.applied.get(input.idempotencyKey);
    if (prior) {
      assertSameRequest(prior.input, input);
      const slot = this.slots(input.playerId).get(input.itemId)!;
      return { entry: this.entry(item, slot), replayed: true };
    }

    const slot = this.slots(input.playerId).get(input.itemId) ?? { quantity: 0, version: 0 };
    const quantity = checkedQuantity(slot.quantity, input.delta, item);
    const next = { quantity, version: slot.version + 1 };
    this.slots(input.playerId).set(input.itemId, next);
    this.applied.set(input.idempotencyKey, { input });
    return { entry: this.entry(item, next), replayed: false };
  }
}

// Shared rules, also used by the D1 implementation.
export function checkedQuantity(current: number, delta: number, item: Item): number {
  const next = current + delta;
  if (next < 0) throw new GameError("invalid", `cannot remove ${-delta}; player has ${current}`);
  if (next > item.maxStack) throw new GameError("invalid", `${item.name} stacks to at most ${item.maxStack}`);
  return next;
}

export function assertSameRequest(
  prior: Pick<AdjustInventoryInput, "playerId" | "itemId" | "delta">,
  input: AdjustInventoryInput,
) {
  if (prior.playerId !== input.playerId || prior.itemId !== input.itemId || prior.delta !== input.delta) {
    throw new GameError("conflict", "idempotency key was already used for a different request");
  }
}
