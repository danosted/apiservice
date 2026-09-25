import { createAdminApp } from "./app";
import { buildDeps, type Env } from "./deps";

// The Worker only handles /api/*, /health and /__dev/* (see run_worker_first in
// wrangler.jsonc); everything else is the static UI served by Workers Assets.

let cached: { env: Env; app: ReturnType<typeof createAdminApp> } | undefined;

export default {
  fetch(request, env, ctx) {
    // Build once per isolate so caches (e.g. Access signing keys) are reused.
    if (cached?.env !== env) cached = { env, app: createAdminApp(buildDeps(env)) };
    return cached.app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
