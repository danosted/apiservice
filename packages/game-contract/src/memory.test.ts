import { describe, expect, it } from "vitest";
import { GameError } from "./api";
import { InMemoryGame } from "./memory";
import type { SeedData } from "./seed";

const data: SeedData = {
  items: [
    { id: "potion", name: "Potion", rarity: "common", maxStack: 10 },
    { id: "sword", name: "Sword", rarity: "rare", maxStack: 1 },
  ],
  players: [{ id: "p1", displayName: "Alice", level: 1, xp: 0, createdAt: "2026-01-01T00:00:00.000Z" }],
  inventory: [{ playerId: "p1", itemId: "potion", quantity: 3 }],
};

const adjust = (game: InMemoryGame, delta: number, key: string, itemId = "potion") =>
  game.adjustInventory({ playerId: "p1", itemId, delta, idempotencyKey: key });

describe("InMemoryGame.adjustInventory", () => {
  it("applies a change and bumps the version", async () => {
    const game = new InMemoryGame(data);
    const r = await adjust(game, 2, "key-00001");
    expect(r).toMatchObject({ replayed: false, entry: { quantity: 5, version: 2 } });
  });

  it("replays a retried key without applying it twice", async () => {
    const game = new InMemoryGame(data);
    await adjust(game, 2, "key-00001");
    const again = await adjust(game, 2, "key-00001");
    expect(again).toMatchObject({ replayed: true, entry: { quantity: 5 } });
  });

  it("rejects reusing a key for a different change", async () => {
    const game = new InMemoryGame(data);
    await adjust(game, 2, "key-00001");
    await expect(adjust(game, 3, "key-00001")).rejects.toMatchObject({ code: "conflict" });
  });

  it("enforces zero and max-stack bounds", async () => {
    const game = new InMemoryGame(data);
    await expect(adjust(game, -4, "key-00002")).rejects.toMatchObject({ code: "invalid" });
    await expect(adjust(game, 8, "key-00003")).rejects.toMatchObject({ code: "invalid" });
    await expect(adjust(game, 2, "key-00004", "sword")).rejects.toMatchObject({ code: "invalid" });
  });

  it("hides emptied slots from the player detail", async () => {
    const game = new InMemoryGame(data);
    await adjust(game, -3, "key-00005");
    expect((await game.getPlayer("p1"))?.inventory).toEqual([]);
  });

  it("reports unknown players and items as not_found", async () => {
    const game = new InMemoryGame(data);
    await expect(adjust(game, 1, "key-00006", "nope")).rejects.toMatchObject({ code: "not_found" });
    await expect(
      game.adjustInventory({ playerId: "ghost", itemId: "potion", delta: 1, idempotencyKey: "key-00007" }),
    ).rejects.toBeInstanceOf(GameError);
  });
});

describe("GameError.fromUnknown", () => {
  it("recovers the code from a message that crossed an RPC boundary", () => {
    const e = GameError.fromUnknown(new Error("GameError: conflict: stale version"));
    expect(e?.code).toBe("conflict");
    expect(e?.detail).toBe("stale version");
    expect(GameError.fromUnknown(new Error("boom"))).toBeNull();
  });
});
