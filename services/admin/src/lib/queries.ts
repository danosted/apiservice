import { queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "./api";

// Query definitions shared by route loaders and components.
export const queries = {
  me: (api: ApiClient) => queryOptions({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 5 * 60_000 }),
  stats: (api: ApiClient) => queryOptions({ queryKey: ["stats"], queryFn: () => api.stats() }),
  items: (api: ApiClient) => queryOptions({ queryKey: ["items"], queryFn: () => api.items(), staleTime: 10 * 60_000 }),
  players: (api: ApiClient, input: { q?: string; page: number }) =>
    queryOptions({ queryKey: ["players", input], queryFn: () => api.players(input) }),
  player: (api: ApiClient, id: string) => queryOptions({ queryKey: ["player", id], queryFn: () => api.player(id) }),
  audit: (api: ApiClient, page: number) => queryOptions({ queryKey: ["audit", page], queryFn: () => api.audit(page) }),
};
