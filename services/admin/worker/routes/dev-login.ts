import { FAKE_USER_COOKIE, type FakeIdentityProvider, HttpError } from "@apiservice/core";
import { Hono } from "hono";

/**
 * /__dev  (only mounted with the fake identity provider)
 *   GET /login?as=editor&next=/players    sign in as a dev user, then redirect
 *   GET /logout
 */
export function devLoginRoutes(identity: FakeIdentityProvider) {
  const users = identity.userKeys();
  return new Hono()
    .get("/login", (c) => {
      const as = c.req.query("as") ?? "";
      if (!users.includes(as)) throw new HttpError(400, `as must be one of: ${users.join(", ")}`);
      const next = c.req.query("next") ?? "/";
      // Only same-site paths; "//host" would redirect off-site.
      const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
      c.header("set-cookie", `${FAKE_USER_COOKIE}=${as}; Path=/; HttpOnly; SameSite=Lax`);
      return c.redirect(safeNext, 302);
    })
    .get("/logout", (c) => {
      c.header("set-cookie", `${FAKE_USER_COOKIE}=; Path=/; Max-Age=0`);
      return c.redirect("/", 302);
    });
}
