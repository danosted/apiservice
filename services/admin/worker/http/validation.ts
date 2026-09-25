import { HttpError } from "@apiservice/core";
import type { Context } from "hono";
import { z } from "zod";

/** Parses with a Zod schema; failures become a 400 listing each issue. */
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new HttpError(400, r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  return r.data;
}

/** Reads the JSON body and validates it. */
export async function parseJsonBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, "body must be valid JSON");
  }
  return parse(schema, raw);
}

/** `?page=` as a positive integer, defaulting to 1 for missing or bad values. */
export const PageQuery = z.coerce.number().int().min(1).catch(1);
