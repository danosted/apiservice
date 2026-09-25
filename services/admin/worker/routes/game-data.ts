import type { Deps } from "../deps";
import { apiRouter } from "../http/env";
import { gameCall } from "../http/game-call";
import { requirePermission } from "../http/middleware";

/**
 * Read-only game reference data.
 *   GET /api/stats    totals for the overview page
 *   GET /api/items    item catalog
 */
export function gameDataRoutes({ gameApi }: Pick<Deps, "gameApi">) {
  return apiRouter()
    .get("/stats", requirePermission("game:read"), async (c) => c.json(await gameCall(() => gameApi.stats())))
    .get("/items", requirePermission("game:read"), async (c) => c.json(await gameCall(() => gameApi.listItems())));
}
