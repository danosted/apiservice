import { FakeIdentityProvider, fixedClock, sequentialIds } from "@apiservice/core";
import { InMemoryGame } from "@apiservice/game-contract";
import { describe, expect, it } from "vitest";
import { createAdminApp } from "./app";
import { MemoryAuditLog } from "./audit";
import { buildDeps, type Deps, type Env, FAKE_USERS } from "./deps";

// The whole admin API, built from fakes only.
function setup(overrides: Partial<Deps> = {}) {
  const clock = fixedClock("2026-09-25T12:00:00.000Z");
  const ids = sequentialIds("audit");
  const deps: Deps = {
    identity: new FakeIdentityProvider(FAKE_USERS),
    gameApi: new InMemoryGame(),
    audit: new MemoryAuditLog(clock, ids),
    clock,
    ids,
    ...overrides,
  };
  const app = createAdminApp(deps);
  const call = (path: string, init: RequestInit & { as?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.as) headers.set("x-dev-user", init.as);
    if (init.body) headers.set("content-type", "application/json");
    return app.request(`http://localhost:8788${path}`, { ...init, headers });
  };
  return { deps, call };
}

const grant = (delta: number, key = "test-key-1") =>
  JSON.stringify({ itemId: "health_potion", delta, idempotencyKey: key });

describe("admin API", () => {
  it("requires a signed-in user and offers dev logins", async () => {
    const { call } = setup();
    const res = await call("/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ devLogin: ["editor", "viewer"] });
    expect(await (await call("/api/me", { as: "viewer" })).json()).toMatchObject({
      roles: ["viewer"],
      permissions: ["audit:read", "game:read"],
    });
  });

  it("lets editors adjust inventory and records it in the audit log", async () => {
    const { call, deps } = setup();
    const res = await call("/api/players/player-001/inventory", { method: "POST", as: "editor", body: grant(2) });
    expect(res.status).toBe(200);
    const { entries } = await deps.audit.list(1, 10);
    expect(entries).toEqual([
      {
        id: "audit-1",
        at: "2026-09-25T12:00:00.000Z",
        actor: "editor@local.test",
        action: "inventory.grant",
        target: "player:player-001",
        details: expect.objectContaining({ itemId: "health_potion", delta: 2 }),
      },
    ]);
  });

  it("does not audit a replayed request twice", async () => {
    const { call, deps } = setup();
    for (let i = 0; i < 2; i++) {
      await call("/api/players/player-001/inventory", { method: "POST", as: "editor", body: grant(1) });
    }
    expect((await deps.audit.list(1, 10)).total).toBe(1);
  });

  it("forbids viewers and cross-origin writes", async () => {
    const { call } = setup();
    const viewer = await call("/api/players/player-001/inventory", { method: "POST", as: "viewer", body: grant(1) });
    expect(viewer.status).toBe(403);
    const crossOrigin = await call("/api/players/player-001/inventory", {
      method: "POST",
      as: "editor",
      body: grant(1),
      headers: { origin: "https://evil.example" },
    });
    expect(crossOrigin.status).toBe(403);
  });

  it("maps game errors to HTTP statuses", async () => {
    const { call } = setup();
    const post = (body: string) => call("/api/players/player-001/inventory", { method: "POST", as: "editor", body });
    expect((await post(grant(-100000))).status).toBe(422);
    await post(grant(1, "same-key-1"));
    expect((await post(grant(2, "same-key-1"))).status).toBe(409);
    expect((await call("/api/players/ghost", { as: "editor" })).status).toBe(404);
    expect((await post(JSON.stringify({ itemId: "x" }))).status).toBe(400);
  });

  it("only mounts the dev login with the fake identity provider", async () => {
    const withFake = setup();
    expect((await withFake.call("/__dev/login?as=viewer")).status).toBe(302);
    const withoutFake = setup({ identity: { identify: async () => null, signOutUrl: "/logout" } });
    expect((await withoutFake.call("/__dev/login?as=viewer")).status).toBe(404);
  });
});

describe("buildDeps", () => {
  const base = { ENVIRONMENT: "production", IDENTITY: "access", GAME_BACKEND: "binding", AUDIT_BACKEND: "d1" } as const;

  it("refuses fake backends outside local", () => {
    for (const fake of [{ IDENTITY: "fake" }, { GAME_BACKEND: "fake" }, { AUDIT_BACKEND: "memory" }] as const) {
      expect(() => buildDeps({ ...base, ...fake } as unknown as Env)).toThrow(/only allowed when ENVIRONMENT=local/);
    }
  });

  it("refuses Access identity without its settings", () => {
    expect(() => buildDeps({ ...base } as unknown as Env)).toThrow(/teamDomain and audience/);
  });
});

describe("game call resilience", () => {
  const lost = () => Object.assign(new Error("Network connection lost."), { retryable: true });

  it("retries transient RPC failures", async () => {
    const game = new InMemoryGame();
    let failures = 2;
    const flaky = Object.assign(Object.create(game), {
      stats: () => (failures-- > 0 ? Promise.reject(lost()) : game.stats()),
    });
    const { call } = setup({ gameApi: flaky });
    expect((await call("/api/stats", { as: "viewer" })).status).toBe(200);
  });

  it("gives 503 when the game service stays unreachable", async () => {
    const down = Object.assign(Object.create(new InMemoryGame()), { stats: () => Promise.reject(lost()) });
    const { call } = setup({ gameApi: down });
    const res = await call("/api/stats", { as: "viewer" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "game service unavailable; try again shortly" });
  });
});

describe("permissions", () => {
  it("enforces permissions, not roles: a user without roles can sign in but read nothing", async () => {
    const noRoles = {
      identify: async () => ({ email: "new@example.com", name: "new", roles: [] }),
      signOutUrl: "/logout",
    };
    const { call } = setup({ identity: noRoles });
    expect(await (await call("/api/me")).json()).toMatchObject({ roles: [], permissions: [] });
    for (const path of ["/api/stats", "/api/items", "/api/players", "/api/players/player-001", "/api/audit"]) {
      const res = await call(path);
      expect(res.status, path).toBe(403);
    }
  });

  it("names the missing permission", async () => {
    const { call } = setup();
    const res = await call("/api/players/player-001/inventory", { method: "POST", as: "viewer", body: grant(1) });
    expect(await res.json()).toEqual({ error: "missing permission inventory:adjust" });
  });
});
