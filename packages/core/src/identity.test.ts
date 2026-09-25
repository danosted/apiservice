import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { permissionsFor } from "./authz";
import { AccessIdentityProvider, FakeIdentityProvider, rolesFor } from "./identity";

const TEAM = "https://team.cloudflareaccess.com";
const AUD = "app-aud";

async function accessFixture() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const provider = new AccessIdentityProvider({
    teamDomain: TEAM,
    audience: AUD,
    editorEmails: "boss@example.com",
    keys: createLocalJWKSet({ keys: [jwk] }),
  });
  const sign = (claims: Record<string, unknown>, opts: { aud?: string; iss?: string; exp?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(opts.iss ?? TEAM)
      .setAudience(opts.aud ?? AUD)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(privateKey);
  const req = (token?: string) =>
    new Request("https://admin.example.com/api/me", token ? { headers: { "cf-access-jwt-assertion": token } } : {});
  return { provider, sign, req };
}

describe("AccessIdentityProvider", () => {
  it("accepts a valid Access JWT and assigns roles from the editor list", async () => {
    const { provider, sign, req } = await accessFixture();
    expect(await provider.identify(req(await sign({ email: "boss@example.com" })))).toEqual({
      email: "boss@example.com",
      name: "boss",
      roles: ["editor"],
    });
    expect((await provider.identify(req(await sign({ email: "someone@example.com" }))))?.roles).toEqual(["viewer"]);
  });

  it("rejects missing, wrong-audience, wrong-issuer and expired tokens", async () => {
    const { provider, sign, req } = await accessFixture();
    expect(await provider.identify(req())).toBeNull();
    expect(await provider.identify(req(await sign({ email: "a@b.c" }, { aud: "other" })))).toBeNull();
    expect(await provider.identify(req(await sign({ email: "a@b.c" }, { iss: "https://evil.example" })))).toBeNull();
    expect(await provider.identify(req(await sign({ email: "a@b.c" }, { exp: "-1m" })))).toBeNull();
    expect(await provider.identify(req("not-a-jwt"))).toBeNull();
  });

  it("rejects tokens signed by another key", async () => {
    const { provider, req } = await accessFixture();
    const other = await generateKeyPair("RS256");
    const token = await new SignJWT({ email: "a@b.c" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(TEAM)
      .setAudience(AUD)
      .setExpirationTime("5m")
      .sign(other.privateKey);
    expect(await provider.identify(req(token))).toBeNull();
  });
});

describe("FakeIdentityProvider", () => {
  const fake = new FakeIdentityProvider({ dev: { email: "dev@local.test", name: "Dev", roles: ["editor"] } });

  it("resolves the user from header or cookie on localhost", async () => {
    const byHeader = new Request("http://localhost:8788/api/me", { headers: { "x-dev-user": "dev" } });
    const byCookie = new Request("http://localhost:8788/api/me", { headers: { cookie: "a=1; dev_user=dev" } });
    expect((await fake.identify(byHeader))?.email).toBe("dev@local.test");
    expect((await fake.identify(byCookie))?.email).toBe("dev@local.test");
  });

  it("rejects unknown users and any non-local host", async () => {
    expect(await fake.identify(new Request("http://localhost/", { headers: { "x-dev-user": "x" } }))).toBeNull();
    const remote = new Request("https://admin.example.com/api/me", { headers: { "x-dev-user": "dev" } });
    expect(await fake.identify(remote)).toBeNull();
  });
});

describe("rolesFor", () => {
  it("matches case-insensitively and ignores blanks", () => {
    expect(rolesFor("Boss@Example.com", " boss@example.com , ")).toEqual(["editor"]);
    expect(rolesFor("x@example.com", "")).toEqual(["viewer"]);
  });
});

describe("permissionsFor", () => {
  it("grants the union of all roles held", () => {
    expect(permissionsFor(["viewer"]).has("inventory:adjust")).toBe(false);
    expect(permissionsFor(["editor"]).has("inventory:adjust")).toBe(true);
    expect([...permissionsFor(["viewer", "editor"])].sort()).toEqual(["audit:read", "game:read", "inventory:adjust"]);
    expect(permissionsFor([]).size).toBe(0);
  });
});
