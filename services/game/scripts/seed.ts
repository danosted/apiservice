// Prints SQL that resets local game data to the deterministic seed.
// Run through `npm run seed -w services/game` (Node strips the types).
import { seedData } from "../../../packages/game-contract/src/seed.ts";

const q = (v: string | number) => (typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`);
const { items, players, inventory } = seedData();

const lines = [
  "DELETE FROM inventory_changes;",
  "DELETE FROM inventory;",
  "DELETE FROM players;",
  "DELETE FROM items;",
  ...items.map((i) => `INSERT INTO items VALUES (${[i.id, i.name, i.rarity, i.maxStack].map(q).join(", ")});`),
  ...players.map(
    (p) => `INSERT INTO players VALUES (${[p.id, p.displayName, p.level, p.xp, p.createdAt].map(q).join(", ")});`,
  ),
  ...inventory.map(
    (e) =>
      `INSERT INTO inventory (player_id, item_id, quantity, version) VALUES (${[e.playerId, e.itemId, e.quantity].map(q).join(", ")}, 1);`,
  ),
];
console.log(lines.join("\n"));
