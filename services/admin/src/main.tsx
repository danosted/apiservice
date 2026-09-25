import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorPanel } from "./components/common";
import { type ApiClient, ApiError, createHttpApiClient } from "./lib/api";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

// Composition root for the UI: swap `api` for a fake to run without a backend.
export function createAppRouter(api: ApiClient, queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { api, queryClient },
    defaultPreload: "intent",
    // Loaders read through React Query, which owns caching.
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ({ error }) => <ErrorPanel error={error} />,
    defaultNotFoundComponent: () => <ErrorPanel error={new Error("Page not found")} />,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // 4xx won't fix itself; retry only network and server errors.
      retry: (count, err) => count < 2 && !(err instanceof ApiError && err.status < 500),
    },
  },
});
const router = createAppRouter(createHttpApiClient(), queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
