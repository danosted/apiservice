import { z } from "zod";

// Shapes shared by the game service, the admin API and the admin UI.

export const Rarity = z.enum(["common", "uncommon", "rare", "epic", "legendary"]);
export type Rarity = z.infer<typeof Rarity>;

export const Item = z.object({
  id: z.string(),
  name: z.string(),
  rarity: Rarity,
  maxStack: z.number().int().positive(),
});
export type Item = z.infer<typeof Item>;

export const Player = z.object({
  id: z.string(),
  displayName: z.string(),
  level: z.number().int().nonnegative(),
  xp: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type Player = z.infer<typeof Player>;

export const InventoryEntry = z.object({
  item: Item,
  quantity: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});
export type InventoryEntry = z.infer<typeof InventoryEntry>;

export const PlayerDetail = z.object({
  player: Player,
  inventory: z.array(InventoryEntry),
});
export type PlayerDetail = z.infer<typeof PlayerDetail>;

export const ListPlayersInput = z.object({
  query: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type ListPlayersInput = z.input<typeof ListPlayersInput>;

export const PlayerPage = z.object({
  players: z.array(Player),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type PlayerPage = z.infer<typeof PlayerPage>;

export const AdjustInventoryInput = z.object({
  playerId: z.string().min(1),
  itemId: z.string().min(1),
  // Positive grants, negative removes.
  delta: z
    .number()
    .int()
    .refine((d) => d !== 0, "delta must not be 0"),
  // Retrying with the same key returns the original result instead of applying twice.
  idempotencyKey: z.string().min(8).max(200),
});
export type AdjustInventoryInput = z.infer<typeof AdjustInventoryInput>;

export const AdjustInventoryResult = z.object({
  entry: InventoryEntry,
  // True when this key was already applied and nothing changed now.
  replayed: z.boolean(),
});
export type AdjustInventoryResult = z.infer<typeof AdjustInventoryResult>;

export const GameStats = z.object({
  players: z.number().int(),
  items: z.number().int(),
  itemsHeld: z.number().int(),
});
export type GameStats = z.infer<typeof GameStats>;
