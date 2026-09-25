import { HttpError } from "@apiservice/core";
import { ListPlayersInput } from "@apiservice/game-contract";
import { z } from "zod";
import type { Deps } from "../deps";
import { apiRouter } from "../http/env";
import { gameCall } from "../http/game-call";
import { requirePermission } from "../http/middleware";
import { PageQuery, parse, parseJsonBody } from "../http/validation";

// Body the UI posts; the player comes from the URL.
const AdjustInventoryBody = z.object({
  itemId: z.string().min(1),
  delta: z.number().int(),
  idempotencyKey: z.string().min(8).max(200),
});

/**
 * /api/players
 *   GET  /                 search + paginate (?q=, ?page=)
 *   GET  /:id              profile and inventory
 *   POST /:id/inventory    grant or remove items, audited
 */
export function playerRoutes({ gameApi, audit }: Pick<Deps, "gameApi" | "audit">) {
  return apiRouter()
    .get("/", requirePermission("game:read"), async (c) => {
      const input = parse(ListPlayersInput, {
        query: c.req.query("q") || undefined,
        page: PageQuery.parse(c.req.query("page")),
      });
      return c.json(await gameCall(() => gameApi.listPlayers(input)));
    })

    .get("/:id", requirePermission("game:read"), async (c) => {
      const detail = await gameCall(() => gameApi.getPlayer(c.req.param("id")));
      if (!detail) throw new HttpError(404, "player not found");
      return c.json(detail);
    })

    .post("/:id/inventory", requirePermission("inventory:adjust"), async (c) => {
      const body = await parseJsonBody(c, AdjustInventoryBody);
      const playerId = c.req.param("id");
      const result = await gameCall(() => gameApi.adjustInventory({ ...body, playerId }));
      // A replayed key changed nothing, so it isn't audited again.
      if (!result.replayed) {
        await audit.record({
          actor: c.get("user").email,
          action: body.delta > 0 ? "inventory.grant" : "inventory.remove",
          target: `player:${playerId}`,
          details: { itemId: body.itemId, delta: body.delta, quantity: result.entry.quantity },
        });
      }
      return c.json(result);
    });
}
