import { HttpError } from "@apiservice/core";
import { GameError } from "@apiservice/game-contract";

// Cloudflare flags transient RPC failures (e.g. "Network connection lost" after the
// game Worker restarts or redeploys) as retryable.
const isRetryable = (err: unknown) => (err as { retryable?: boolean } | null)?.retryable === true;

/**
 * Wraps a GameApi call: maps GameErrors to HTTP statuses and retries transient
 * RPC failures. Retrying is safe for every GameApi call: reads have no side
 * effects and adjustInventory is idempotent by key.
 */
export async function gameCall<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const g = GameError.fromUnknown(err);
      if (g) throw new HttpError(g.code === "not_found" ? 404 : g.code === "conflict" ? 409 : 422, g.detail);
      if (!isRetryable(err)) throw err;
      if (attempt >= attempts) throw new HttpError(503, "game service unavailable; try again shortly");
      await new Promise((r) => setTimeout(r, 100 * attempt));
    }
  }
}
