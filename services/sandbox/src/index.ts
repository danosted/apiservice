import { base64ToBytes, bytesToBase64, createApp, HttpError, methodNotAllowed, readJsonBody } from "@apiservice/core";

// Test bed for auth + D1 storage: a generic item covering each type D1 supports.

interface Bindings {
  DB: D1Database;
  API_BEARER_TOKEN: string;
}

// Max decoded size of `data`; D1 rows are capped at ~2 MB.
const MAX_DATA_BYTES = 1024 * 1024;

interface ItemRow {
  id: string;
  name: string;
  count: number | null;
  price: number | null;
  active: number;
  data: number[] | ArrayBuffer | null;
  metadata: string | null;
  created_at: string;
}

function toItem(row: ItemRow) {
  return {
    id: row.id,
    name: row.name,
    count: row.count,
    price: row.price,
    active: row.active === 1,
    data: row.data === null ? null : bytesToBase64(new Uint8Array(row.data)),
    metadata: row.metadata === null ? null : JSON.parse(row.metadata),
    created_at: row.created_at,
  };
}

function parseItemInput(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "body must be a JSON object");
  }
  const b = body as Record<string, unknown>;

  if (typeof b.name !== "string" || b.name.length === 0) {
    throw new HttpError(400, "name is required and must be a non-empty string");
  }
  if (b.count != null && !Number.isSafeInteger(b.count)) {
    throw new HttpError(400, "count must be an integer");
  }
  if (b.price != null && (typeof b.price !== "number" || !Number.isFinite(b.price))) {
    throw new HttpError(400, "price must be a finite number");
  }
  if (b.active != null && typeof b.active !== "boolean") {
    throw new HttpError(400, "active must be a boolean");
  }
  if (b.data != null && typeof b.data !== "string") {
    throw new HttpError(400, "data must be a base64 string");
  }
  if (b.metadata != null && (typeof b.metadata !== "object" || Array.isArray(b.metadata))) {
    throw new HttpError(400, "metadata must be a JSON object");
  }

  const data = b.data == null ? null : base64ToBytes(b.data as string);
  if (data && data.byteLength > MAX_DATA_BYTES) {
    throw new HttpError(413, `data exceeds ${MAX_DATA_BYTES} bytes`);
  }

  return {
    name: b.name,
    count: (b.count as number | undefined) ?? null,
    price: (b.price as number | undefined) ?? null,
    active: b.active === true ? 1 : 0,
    data,
    metadata: b.metadata == null ? null : JSON.stringify(b.metadata),
  };
}

const app = createApp<Bindings>("sandbox");

app.get("/items", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM items ORDER BY created_at DESC LIMIT 100").all<ItemRow>();
  return c.json({ items: results.map(toItem) });
});

app.post("/items", async (c) => {
  const input = parseItemInput(await readJsonBody(c));
  const row = await c.env.DB.prepare(
    `INSERT INTO items (id, name, count, price, active, data, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
  )
    .bind(crypto.randomUUID(), input.name, input.count, input.price, input.active, input.data, input.metadata)
    .first<ItemRow>();
  return c.json(toItem(row!), 201);
});

app.get("/items/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(c.req.param("id")).first<ItemRow>();
  if (!row) throw new HttpError(404, "item not found");
  return c.json(toItem(row));
});

app.delete("/items/:id", async (c) => {
  const result = await c.env.DB.prepare("DELETE FROM items WHERE id = ?").bind(c.req.param("id")).run();
  if (result.meta.changes === 0) throw new HttpError(404, "item not found");
  return c.body(null, 204);
});

app.all("/items", methodNotAllowed);
app.all("/items/:id", methodNotAllowed);

export default app;
