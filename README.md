# apiservice

A monorepo of APIs and an admin dashboard on Cloudflare's free tier. Each product is its own Worker (compute) with its own D1 database (persistent SQLite). Shared code lives in packages.

## Layout

```
packages/
  core/            @apiservice/core: createApp(), bearer auth, identity providers, HttpError, Clock/IdGenerator
  game-contract/   @apiservice/game-contract: game schemas (Zod), the GameApi interface, InMemoryGame fake, seed data
services/
  sandbox/         test bed: generic /items CRUD covering every D1 type            (port 8787)
  admin/           admin dashboard: React UI + Hono /api, behind Cloudflare Access  (port 8788)
  game/            persistent game state; RPC for other Workers (see its README)    (port 8789)
scripts/           start/stop/verify/smoke, and ui.mjs for driving the dashboard in a browser
```

Each service deploys, scales and fails independently. Workers call each other through **service bindings**, never over the public internet: the admin dashboard reads and changes game data by calling `GameRpc` in the game service.

Services built with `createApp()` (sandbox, game) get:
- `GET /health`, which is public
- bearer auth on every other route
- JSON errors shaped as `{ "error": "..." }`; throw `HttpError(status, message)` from any handler to return one

Routes use [Hono](https://hono.dev).

## Admin dashboard

`services/admin` is one Worker serving two things:

- **The UI (`src/`):** a single-page app built with React, TanStack Router (file-based routes in `src/routes/`, with list state kept in the URL), TanStack Query, TanStack Form and Tailwind. Built by Vite with Cloudflare's Vite plugin.
- **The API (`worker/`):** Hono routes under `/api` that call the game service and write an audit log of every change.

```
worker/
  index.ts        Worker entry: builds the app once per isolate
  deps.ts         composition root: picks implementations from config
  app.ts          route map: mounts each module under its path
  routes/         one module per area (players.ts, audit.ts, ...); each gets only the deps it needs
  http/           shared plumbing: middleware (auth, roles, CSRF), validation, gameCall
```

**Theme.** `src/theme.css` is the one place that decides how the dashboard looks. It defines semantic tokens (`background`, `card`, `muted`, `foreground`, `border`, `input`, `primary`, `destructive`, `success`, item rarities and `--radius`) that Tailwind turns into utilities such as `bg-card` and `text-muted-foreground`. Components use only those, never raw palette colors like `bg-white` or `text-slate-500`. The names follow shadcn/ui, so its components drop in unchanged. A second theme, such as dark mode, is one extra block overriding the same variables.

To add an endpoint group, write `routes/<area>.ts` exporting `<area>Routes(deps)`, then mount it in `app.ts`. Each module's doc comment lists its routes.

**Dependency injection.** The API is built from interfaces, and `buildDeps()` in `worker/deps.ts` picks the implementations from config:

| Dependency | Production | Local / tests |
|---|---|---|
| `IdentityProvider` | `AccessIdentityProvider`: verifies the Cloudflare Access JWT | `FakeIdentityProvider`: `X-Dev-User` header or `/__dev/login?as=editor` |
| `GameApi` | service binding to `GameRpc` | `InMemoryGame` (`GAME_BACKEND=fake`) |
| `AuditLog` | `D1AuditLog` | `MemoryAuditLog` (`AUDIT_BACKEND=memory`) |
| `Clock`, `IdGenerator` | system time, UUIDs | fixed values in tests |

The top level of `wrangler.jsonc` holds the local settings, and `env.production` the deployed ones. `buildDeps()` refuses to start with any fake unless `ENVIRONMENT=local`, and the fake identity only answers on localhost, so a misconfigured deploy fails closed.

The UI gets its `ApiClient` the same way, through router context (see `createAppRouter()` in `src/main.tsx`).

**Authorization is by permission, never by role.** `packages/core/src/authz.ts` is the only place that maps roles to permissions (`game:read`, `inventory:adjust`, `audit:read`):
- **API routes** declare what they need: `requirePermission("inventory:adjust")`.
- **`/api/me`** returns the user's computed `permissions`.
- **The UI** checks those with `<RequirePermission permission="…">` or `useHasPermission("…")` from `src/lib/authz.tsx`.

Adding or changing a role is an edit to that one file. The server enforces every check; the UI only decides what to show.

Who holds which role comes from the identity provider. Today viewers can read, and editors, listed in `EDITOR_EMAILS`, can also grant and remove items. Every change is idempotent (the UI sends a key per submit) and recorded in the audit log.

## Dev environment

Open this folder in VS Code and reopen it in the devcontainer. It installs npm dependencies and Playwright's Chromium automatically.

Local D1 data lives in `~/.wrangler-state/<service>` inside the container, not in the repo. The repo sits on a Windows mount where SQLite can't lock files. That data survives container restarts but not rebuilds.

## Local secrets

The bearer-token services (sandbox, game) read `services/<name>/.dev.vars`, which is git-ignored. Give each service a **different** token:

```
cp services/sandbox/.dev.vars.example services/sandbox/.dev.vars
openssl rand -hex 32   # paste into API_BEARER_TOKEN
```

The admin dashboard needs no secrets locally, since it uses the fake identity.

To keep secrets out of Claude Code's context, `.claude/settings.json` should deny `Read(**/.dev.vars)`. Cloudflare account credentials for wrangler live in the root `.cf.env`, which is also git-ignored.

## Running

```
npm start                       # all services in the background: migrate, start, wait for /health
npm start -- --seed game admin  # just these, resetting game data to the seed first
npm run seed                    # reset local game data to the seed
npm stop                        # stop what npm start started
npm run dev:admin               # one service in the foreground (or dev:sandbox / dev:game)
```

The dashboard is at http://localhost:8788; sign in as `editor` or `viewer` on the sign-in page.

## Checking

```
npm run check                   # lint (Biome) + typecheck + unit tests (Vitest)
npm run format                  # apply Biome formatting and safe fixes
npm run verify                  # API checks against running services
npm run smoke                   # start with test tokens + seed, run API checks and UI flows, stop
```

`verify` checks every service for a public `/health`, 401s on missing or wrong credentials, and acceptance of the right ones. Service-specific checks go in `services/<name>/verify.sh`; see `scripts/verify.sh` for the helpers and the `# probe:` / `# auth-header:` settings. `verify` never prints tokens.

Logs, pid files, test tokens and screenshots go to `.dev-run/` (git-ignored).

### Driving the UI

`scripts/ui.mjs` drives the dashboard in headless Chromium. It reports browser console errors and failed requests, and exits non-zero if there are any.

```
npm run ui -- shot /players/player-001          # screenshot -> .dev-run/screens/players-player-001.png
npm run ui -- shot /players --as viewer --full  # as another user, full page
npm run ui -- snapshot /players                 # accessibility tree as text (cheaper than a screenshot)
npm run ui -- run services/admin/flows/grant-and-remove-item.json
npm run ui -- flows                             # every services/admin/flows/*.json
```

Flows are JSON step lists (`goto`, `click`, `fill`, `select`, `expectText`, …; see the top of `scripts/ui.mjs`). They find elements by accessible role and label, so good accessibility doubles as the test hooks.

## Deploying a service

```
set -a; . ./.cf.env; set +a                 # CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
cd services/<name>
npx wrangler d1 create <db-name>            # paste the id into wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put API_BEARER_TOKEN    # sandbox/game; run it yourself and type the value at the prompt
npm run deploy
```

For the admin dashboard, first create a Cloudflare Access application for its hostname. Then fill in `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `EDITOR_EMAILS` under `env.production` in `services/admin/wrangler.jsonc`. `npm run deploy` builds and deploys that environment, with `workers_dev` off so Access can't be bypassed through a `*.workers.dev` URL. Deploy the game service first, since the admin dashboard binds to it.

## Adding a service

1. Copy `services/game` (for an API) to `services/<name>`.
2. Rename it in `package.json` (`@apiservice/<name>`), in `wrangler.jsonc` (`apiservice-<name>`, `<name>-db`) and in `createApp("<name>")`.
3. Pick an unused dev port and inspector port in the `dev` script, and a unique placeholder `database_id`, which is also the local database key.
4. Add `dev:` / `deploy:` / `db:migrate:*` shortcuts to the root `package.json`, and the port to `.devcontainer/devcontainer.json`.
5. Update `services/<name>/verify.sh` for the new routes.
6. Run `npm install`. The start, verify and smoke scripts find the service on their own.

## Auth roadmap

- **Admin dashboard:** Cloudflare Access (for example Google or GitHub login restricted to your email) plus JWT verification in the Worker. Done.
- **Worker to Worker:** service bindings, with no credentials. Done for admin → game.
- **External game server → game service:** a bearer token now; a Cloudflare Access service token later.
- **Players:** login through a known identity provider, with user-scoped reads only. Not built yet.
