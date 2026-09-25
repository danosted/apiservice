import { FakeIdentityProvider, handleError, handleNotFound } from "@apiservice/core";
import { Hono } from "hono";
import type { Deps } from "./deps";
import { apiRouter } from "./http/env";
import { authenticate, rejectCrossOrigin } from "./http/middleware";
import { auditRoutes } from "./routes/audit";
import { devLoginRoutes } from "./routes/dev-login";
import { gameDataRoutes } from "./routes/game-data";
import { meRoutes } from "./routes/me";
import { playerRoutes } from "./routes/players";

// The admin HTTP app: the route map at a glance. Each module under routes/ owns one
// area and receives only the dependencies it needs. Add a feature by writing a
// module and mounting it below.
export function createAdminApp(deps: Deps) {
  const app = new Hono().onError(handleError).notFound(handleNotFound);

  // Public
  app.get("/health", (c) => c.json({ status: "ok", service: "admin" }));
  if (deps.identity instanceof FakeIdentityProvider) {
    app.route("/__dev", devLoginRoutes(deps.identity));
  }

  // Authenticated API: every route below requires a signed-in user.
  const api = apiRouter()
    .use(authenticate(deps.identity), rejectCrossOrigin())
    .route("/me", meRoutes(deps))
    .route("/", gameDataRoutes(deps))
    .route("/players", playerRoutes(deps))
    .route("/audit", auditRoutes(deps));

  return app.route("/api", api);
}
