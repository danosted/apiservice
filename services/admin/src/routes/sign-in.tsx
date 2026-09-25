import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Card, CardTitle } from "@/components/ui";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/sign-in")({
  validateSearch: z.object({ next: z.string().optional() }),
  // Ask the API which dev users exist (only offered by the fake identity provider).
  loader: async ({ context }) => {
    try {
      await context.api.me();
      return { signedIn: true, devLogin: [] as string[] };
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { devLogin?: string[] } | null) : null;
      return { signedIn: false, devLogin: body?.devLogin ?? [] };
    }
  },
  component: SignIn,
});

function SignIn() {
  const { devLogin, signedIn } = Route.useLoaderData();
  const { next } = Route.useSearch();
  const target = next?.startsWith("/") ? next : "/";

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <h1 className="sr-only">Sign in</h1>
        <CardTitle>Game Admin</CardTitle>
        {signedIn ? (
          <a className="text-sm text-foreground underline" href={target}>
            You're signed in. Continue
          </a>
        ) : devLogin.length > 0 ? (
          <>
            <p className="mb-4 text-sm text-muted-foreground">Local development: choose who to sign in as.</p>
            <ul className="space-y-2">
              {devLogin.map((key) => (
                <li key={key}>
                  <a
                    href={`/__dev/login?${new URLSearchParams({ as: key, next: target })}`}
                    className="press block rounded-md border-frame border-input bg-card px-4 py-2 text-sm font-medium shadow-control hover:bg-muted/60"
                  >
                    Sign in as {key}
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your session has expired or you don't have access. Reload the page to sign in again.
          </p>
        )}
      </Card>
    </main>
  );
}
