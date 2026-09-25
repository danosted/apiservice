// Deterministic seed data for local dev, the in-memory fake and screenshots.
// No imports: services/game/scripts/seed.ts runs this file directly with Node.

export interface SeedData {
  items: { id: string; name: string; rarity: string; maxStack: number }[];
  players: { id: string; displayName: string; level: number; xp: number; createdAt: string }[];
  inventory: { playerId: string; itemId: string; quantity: number }[];
}

const ITEMS: SeedData["items"] = [
  { id: "wooden_sword", name: "Wooden Sword", rarity: "common", maxStack: 1 },
  { id: "iron_sword", name: "Iron Sword", rarity: "uncommon", maxStack: 1 },
  { id: "dragon_blade", name: "Dragon Blade", rarity: "legendary", maxStack: 1 },
  { id: "leather_armor", name: "Leather Armor", rarity: "common", maxStack: 1 },
  { id: "mithril_armor", name: "Mithril Armor", rarity: "epic", maxStack: 1 },
  { id: "health_potion", name: "Health Potion", rarity: "common", maxStack: 99 },
  { id: "mana_potion", name: "Mana Potion", rarity: "common", maxStack: 99 },
  { id: "elixir", name: "Elixir", rarity: "rare", maxStack: 10 },
  { id: "gold_coin", name: "Gold Coin", rarity: "common", maxStack: 9999 },
  { id: "gem_ruby", name: "Ruby", rarity: "rare", maxStack: 50 },
  { id: "phoenix_feather", name: "Phoenix Feather", rarity: "epic", maxStack: 5 },
  { id: "ancient_rune", name: "Ancient Rune", rarity: "legendary", maxStack: 3 },
];

const FIRST = ["Ash", "Bryn", "Cato", "Dara", "Eli", "Fenn", "Gia", "Hale", "Iris", "Jax", "Kira", "Lio"];
const LAST = ["storm", "vale", "brook", "fang", "wren", "forge", "light", "shade"];

// mulberry32: small seeded PRNG so every run produces identical data.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedData(playerCount = 48): SeedData {
  const rand = rng(42);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const players: SeedData["players"] = [];
  const inventory: SeedData["inventory"] = [];
  const epoch = Date.UTC(2026, 0, 1);

  for (let i = 1; i <= playerCount; i++) {
    const id = `player-${String(i).padStart(3, "0")}`;
    const level = 1 + Math.floor(rand() * 60);
    players.push({
      id,
      displayName: `${pick(FIRST)}${pick(LAST)}${i}`,
      level,
      xp: level * 1000 + Math.floor(rand() * 1000),
      createdAt: new Date(epoch + i * 86_400_000 * 3).toISOString(),
    });
    for (const item of ITEMS) {
      if (rand() < 0.35) {
        const quantity = item.maxStack === 1 ? 1 : 1 + Math.floor(rand() * Math.min(item.maxStack, 40));
        inventory.push({ playerId: id, itemId: item.id, quantity });
      }
    }
  }
  return { items: ITEMS, players, inventory };
}
