import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import type { Role } from "./authz";

export interface Identity {
  email: string;
  name: string;
  /** What the user may do is derived from these via permissionsFor() in authz.ts. */
  roles: Role[];
}

// Port: who is making this request? Null means unauthenticated.
export interface IdentityProvider {
  identify(request: Request): Promise<Identity | null>;
  /** Where the browser goes to end the session. */
  readonly signOutUrl: string;
}

/** Comma-separated emails that get the editor role; everyone else is a viewer. */
export function rolesFor(email: string, editorEmails: string): Role[] {
  const editors = editorEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return editors.includes(email.toLowerCase()) ? ["editor"] : ["viewer"];
}

export interface AccessIdentityOptions {
  /** e.g. https://myteam.cloudflareaccess.com */
  teamDomain: string;
  /** The Access application's AUD tag. */
  audience: string;
  editorEmails: string;
  /** Signing keys; defaults to the team's published JWKS. Injectable for tests. */
  keys?: JWTVerifyGetKey;
}

// Production: Cloudflare Access authenticates at the edge and forwards a signed JWT.
// We verify it ourselves rather than trusting that the request went through Access.
export class AccessIdentityProvider implements IdentityProvider {
  // Served by Cloudflare Access on every protected hostname; clears the Access session.
  readonly signOutUrl = "/cdn-cgi/access/logout";
  private keys: JWTVerifyGetKey;

  constructor(private opts: AccessIdentityOptions) {
    if (!opts.teamDomain || !opts.audience) throw new Error("Access identity needs teamDomain and audience");
    this.keys = opts.keys ?? createRemoteJWKSet(new URL(`${opts.teamDomain}/cdn-cgi/access/certs`));
  }

  async identify(request: Request): Promise<Identity | null> {
    const token = request.headers.get("cf-access-jwt-assertion");
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.opts.teamDomain,
        audience: this.opts.audience,
      });
      const email = typeof payload.email === "string" ? payload.email : null;
      if (!email) return null;
      return { email, name: email.split("@")[0], roles: rolesFor(email, this.opts.editorEmails) };
    } catch {
      return null;
    }
  }
}

export const FAKE_USER_HEADER = "x-dev-user";
export const FAKE_USER_COOKIE = "dev_user";

// Local dev and tests: the caller picks who they are with the `x-dev-user` header
// or `dev_user` cookie (set by /__dev/login). Only answers on localhost, so a
// misconfigured deployment fails closed instead of letting anyone in.
export class FakeIdentityProvider implements IdentityProvider {
  // Served by the admin Worker's dev-login routes.
  readonly signOutUrl = "/__dev/logout";

  constructor(private users: Record<string, Identity>) {}

  async identify(request: Request): Promise<Identity | null> {
    const { hostname } = new URL(request.url);
    if (!isLocalHost(hostname)) return null;
    const key = request.headers.get(FAKE_USER_HEADER) ?? readCookie(request, FAKE_USER_COOKIE);
    return key ? (this.users[key] ?? null) : null;
  }

  userKeys(): string[] {
    return Object.keys(this.users);
  }
}

export function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
