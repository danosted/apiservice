import {
  AccessIdentityProvider,
  type Clock,
  FakeIdentityProvider,
  type Identity,
  type IdentityProvider,
  type IdGenerator,
  systemClock,
  uuidGenerator,
} from "@apiservice/core";
import { type GameApi, InMemoryGame } from "@apiservice/game-contract";
import { type AuditLog, D1AuditLog, MemoryAuditLog } from "./audit";

// Everything the admin API depends on. Routes only see these interfaces.
export interface Deps {
  identity: IdentityProvider;
  gameApi: GameApi;
  audit: AuditLog;
  clock: Clock;
  ids: IdGenerator;
}

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  GAME: Fetcher;
  ENVIRONMENT: "local" | "production";
  IDENTITY: "access" | "fake";
  GAME_BACKEND: "binding" | "fake";
  AUDIT_BACKEND: "d1" | "memory";
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  EDITOR_EMAILS?: string;
}

export const FAKE_USERS: Record<string, Identity> = {
  editor: { email: "editor@local.test", name: "Local Editor", roles: ["editor"] },
  viewer: { email: "viewer@local.test", name: "Local Viewer", roles: ["viewer"] },
};

// Composition root: the only place that reads config and picks implementations.
export function buildDeps(env: Env): Deps {
  const fakes = [env.IDENTITY === "fake", env.GAME_BACKEND === "fake", env.AUDIT_BACKEND === "memory"];
  if (fakes.some(Boolean) && env.ENVIRONMENT !== "local") {
    throw new Error("fake identity/game/audit backends are only allowed when ENVIRONMENT=local");
  }

  const clock = systemClock;
  const ids = uuidGenerator;

  const identity =
    env.IDENTITY === "fake"
      ? new FakeIdentityProvider(FAKE_USERS)
      : new AccessIdentityProvider({
          teamDomain: env.ACCESS_TEAM_DOMAIN ?? "",
          audience: env.ACCESS_AUD ?? "",
          editorEmails: env.EDITOR_EMAILS ?? "",
        });

  // RPC stubs mirror the target's methods; GameRpc in services/game implements GameApi.
  const game: GameApi = env.GAME_BACKEND === "fake" ? new InMemoryGame() : (env.GAME as unknown as GameApi);

  const audit = env.AUDIT_BACKEND === "memory" ? new MemoryAuditLog(clock, ids) : new D1AuditLog(env.DB, clock, ids);

  return { identity, gameApi: game, audit, clock, ids };
}
