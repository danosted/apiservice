import type { Deps } from "../deps";
import { apiRouter } from "../http/env";
import { requirePermission } from "../http/middleware";
import { PageQuery } from "../http/validation";

const PAGE_SIZE = 25;

/**
 * /api/audit
 *   GET /    changes made through the dashboard, newest first (?page=)
 */
export function auditRoutes({ audit }: Pick<Deps, "audit">) {
  return apiRouter().get("/", requirePermission("audit:read"), async (c) =>
    c.json(await audit.list(PageQuery.parse(c.req.query("page")), PAGE_SIZE)),
  );
}
