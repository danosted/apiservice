import { Link, type LinkProps } from "@tanstack/react-router";
import { ApiError } from "@/lib/api";
import { Alert } from "./ui";

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
      {children}
    </div>
  );
}

export function ErrorPanel({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof ApiError ? `${error.status}: ` : "";
  return (
    <Alert>
      <p className="font-medium">Something went wrong</p>
      <p>
        {status}
        {message}
      </p>
    </Alert>
  );
}

// Previous/next links that keep the rest of the search params.
export function Pagination({
  page,
  pageSize,
  total,
  linkFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  linkFor: (page: number) => LinkProps;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const linkClass =
    "press rounded-md border-frame border-input bg-card px-3 py-1.5 text-sm shadow-control hover:bg-muted/60 aria-disabled:pointer-events-none aria-disabled:opacity-40";
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        <Link {...linkFor(page - 1)} className={linkClass} aria-disabled={page <= 1} disabled={page <= 1}>
          Previous
        </Link>
        <Link {...linkFor(page + 1)} className={linkClass} aria-disabled={page >= pages} disabled={page >= pages}>
          Next
        </Link>
      </div>
    </nav>
  );
}
