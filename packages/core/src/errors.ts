import type { ErrorHandler, NotFoundHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// Throw from any handler to return `{ error: message }` with the given status.
export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
  }
}

export const handleError: ErrorHandler = (err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "internal error" }, 500);
};

export const handleNotFound: NotFoundHandler = (c) => c.json({ error: "not found" }, 404);
