import type { Permission, Role } from "@apiservice/core/authz";
import type { AdjustInventoryResult, GameStats, Item, PlayerDetail, PlayerPage } from "@apiservice/game-contract";

export type { Role };

export interface Me {
  email: string;
  name: string;
  roles: Role[];
  /** Computed by the server from the roles; drive UI decisions from these (see lib/authz.tsx). */
  permissions: Permission[];
  /** Full-page link that ends the session (depends on the identity provider). */
  signOutUrl: string;
}

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

export interface AdjustInventoryBody {
  itemId: string;
  delta: number;
  idempotencyKey: string;
}

// Port for the admin API. The app gets it through router context, so tests
// and UI work can pass a fake instead of the HTTP client.
export interface ApiClient {
  me(): Promise<Me>;
  stats(): Promise<GameStats>;
  items(): Promise<Item[]>;
  players(input: { q?: string; page: number }): Promise<PlayerPage>;
  player(id: string): Promise<PlayerDetail>;
  adjustInventory(playerId: string, body: AdjustInventoryBody): Promise<AdjustInventoryResult>;
  audit(page: number): Promise<AuditPage>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createHttpApiClient(fetchFn: typeof fetch = fetch.bind(globalThis), base = "/api"): ApiClient {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchFn(`${base}${path}`, {
      ...init,
      headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (body as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`;
      throw new ApiError(res.status, message, body);
    }
    return body as T;
  }

  return {
    me: () => call("/me"),
    stats: () => call("/stats"),
    items: () => call("/items"),
    players: ({ q, page }) => call(`/players?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page) })}`),
    player: (id) => call(`/players/${encodeURIComponent(id)}`),
    adjustInventory: (playerId, body) =>
      call(`/players/${encodeURIComponent(playerId)}/inventory`, { method: "POST", body: JSON.stringify(body) }),
    audit: (page) => call(`/audit?page=${page}`),
  };
}
