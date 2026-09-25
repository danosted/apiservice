# game

Persistent game state: inventory, progression and player metadata, stored in D1 (the `DB` binding).

Real-time play and replication are handled by the authoritative game server, which runs outside Cloudflare. This service is the storage behind that server.

## Interfaces

- **`GameRpc`** (in `src/index.ts`): an RPC entrypoint for other Workers in the account, used by the admin dashboard through a service binding. It implements `GameApi` from `@apiservice/game-contract`, delegating to `D1Game` (in `src/d1-game.ts`).
- **HTTP `/v1`** (bearer auth): reserved for the game server; only a skeleton for now.

`@apiservice/game-contract` holds the shared Zod schemas, the `GameApi` interface, and `InMemoryGame`, a fake that follows the same rules for tests and for UI work without this service running.

## Local data

`npm run seed` (from the repo root) resets the local database to a fixed set of 48 players and 12 items with inventories. `npm start -- --seed` does the same while starting.

## Callers

- **Game server (trusted writer):** grants items, records progression and settles results. This is a machine-to-machine caller from outside Cloudflare, so it needs its own credential. Today that's the service's bearer token; later it could be a Cloudflare Access service token.
- **Player clients (optional):** at most user-scoped reads, such as "my inventory", using the player's login token. Never writes: a modified client could claim anything.

## Write safety

- **Idempotency:** the game server should send a unique key with every grant or progression write, so a retried request doesn't give a player an item twice.
- **Concurrency:** give mutable rows (such as inventory) a `version` column, and reject writes that are based on a stale version.
