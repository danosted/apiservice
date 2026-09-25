import type { Clock, IdGenerator } from "@apiservice/core";

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export type NewAuditEntry = Omit<AuditEntry, "id" | "at">;

// Port: append-only record of every change an admin makes.
export interface AuditLog {
  record(entry: NewAuditEntry): Promise<AuditEntry>;
  list(page: number, pageSize: number): Promise<AuditPage>;
}

export class D1AuditLog implements AuditLog {
  constructor(
    private db: D1Database,
    private clock: Clock,
    private ids: IdGenerator,
  ) {}

  async record(e: NewAuditEntry): Promise<AuditEntry> {
    const entry = { ...e, id: this.ids.next(), at: this.clock.now().toISOString() };
    await this.db
      .prepare("INSERT INTO audit_log (id, at, actor, action, target, details) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(entry.id, entry.at, entry.actor, entry.action, entry.target, JSON.stringify(entry.details))
      .run();
    return entry;
  }

  async list(page: number, pageSize: number): Promise<AuditPage> {
    const [rows, count] = await this.db.batch([
      this.db
        .prepare("SELECT * FROM audit_log ORDER BY at DESC, id DESC LIMIT ? OFFSET ?")
        .bind(pageSize, (page - 1) * pageSize),
      this.db.prepare("SELECT COUNT(*) AS total FROM audit_log"),
    ]);
    const entries = (rows.results as (Omit<AuditEntry, "details"> & { details: string })[]).map((r) => ({
      ...r,
      details: JSON.parse(r.details),
    }));
    return { entries, total: (count.results[0] as { total: number }).total, page, pageSize };
  }
}

export class MemoryAuditLog implements AuditLog {
  private entries: AuditEntry[] = [];

  constructor(
    private clock: Clock,
    private ids: IdGenerator,
  ) {}

  async record(e: NewAuditEntry): Promise<AuditEntry> {
    const entry = { ...e, id: this.ids.next(), at: this.clock.now().toISOString() };
    this.entries.unshift(entry);
    return entry;
  }

  async list(page: number, pageSize: number): Promise<AuditPage> {
    return {
      entries: this.entries.slice((page - 1) * pageSize, page * pageSize),
      total: this.entries.length,
      page,
      pageSize,
    };
  }
}
