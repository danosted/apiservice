import type {
  AdjustInventoryInput,
  AdjustInventoryResult,
  GameStats,
  Item,
  ListPlayersInput,
  PlayerDetail,
  PlayerPage,
} from "./schemas";

// Port for game data. The game service implements it on D1 and exposes it over
// RPC; the admin service consumes it through a service binding or the in-memory fake.
export interface GameApi {
  stats(): Promise<GameStats>;
  listItems(): Promise<Item[]>;
  listPlayers(input: ListPlayersInput): Promise<PlayerPage>;
  /** Null when the player doesn't exist. */
  getPlayer(id: string): Promise<PlayerDetail | null>;
  /** Throws GameError on unknown player/item, bounds violations or version conflicts. */
  adjustInventory(input: AdjustInventoryInput): Promise<AdjustInventoryResult>;
}

export type GameErrorCode = "not_found" | "invalid" | "conflict";

// Error messages are prefixed with the code so they survive RPC, which only
// preserves the message across the Worker boundary (as "GameError: <code>: ...").
export class GameError extends Error {
  constructor(
    public code: GameErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "GameError";
  }

  static fromUnknown(err: unknown): GameError | null {
    if (err instanceof GameError) return err;
    const m = err instanceof Error ? /^(?:GameError: )?(not_found|invalid|conflict): (.*)$/s.exec(err.message) : null;
    return m ? new GameError(m[1] as GameErrorCode, m[2]) : null;
  }

  get detail(): string {
    return this.message.slice(this.code.length + 2);
  }
}
