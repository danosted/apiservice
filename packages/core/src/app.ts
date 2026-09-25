import type { Context } from "hono";
import { Hono } from "hono";
import { type BaseBindings, bearerAuth } from "./auth";
import { HttpError, handleError, handleNotFound } from "./errors";

// A Hono app with the conventions every service shares: public GET /health,
// bearer auth on everything registered after it, and JSON error bodies.
export function createApp<B extends BaseBindings>(service: string) {
  const app = new Hono<{ Bindings: B }>();
  app.get("/health", (c) => c.json({ status: "ok", service }));
  app.use("*", bearerAuth<B>());
  app.onError(handleError);
  app.notFound(handleNotFound);
  return app;
}

export async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "body must be valid JSON");
  }
}

export function methodNotAllowed(): never {
  throw new HttpError(405, "method not allowed");
}
