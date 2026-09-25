import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet, redirect } from "@tanstack/react-router";
import { Badge } from "@/components/ui";
import { type ApiClient, ApiError, type Me } from "@/lib/api";
import { queries } from "@/lib/queries";

export interface RouterContext {
  api: ApiClient;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // Every page except /sign-in needs a signed-in user; children get it as context.user.
  beforeLoad: async ({ context, location }) => {
    if (location.pathname === "/sign-in") return { user: null as Me | null };
    try {
      return { user: await context.queryClient.query(queries.me(context.api)) };
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw redirect({ to: "/sign-in", search: { next: location.href } });
      }
      throw err;
    }
  },
  component: RootLayout,
});

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/players", label: "Players" },
  { to: "/audit", label: "Audit log" },
] as const;

function RootLayout() {
  const { user } = Route.useRouteContext();
  if (!user) return <Outlet />;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r-(length:--border-width) bg-card">
        <div className="px-5 py-4 font-display text-lg font-semibold text-foreground">Game Admin</div>
        <nav aria-label="Main">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b-(length:--border-width) bg-card px-6 py-3 text-sm">
          <span>
            <span className="sr-only">Signed in as </span>
            {user.email}
          </span>
          {user.roles.map((role) => (
            <Badge key={role} tone="neutral">
              {role}
            </Badge>
          ))}
          {/* A plain link: signing out is a full page load, which also clears cached data. */}
          <a
            href={user.signOutUrl}
            className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Sign out
          </a>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
