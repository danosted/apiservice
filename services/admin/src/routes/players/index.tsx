import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader, Pagination } from "@/components/common";
import { Button, Input, Table, Td, Th } from "@/components/ui";
import { queries } from "@/lib/queries";
import { formatDateTime, formatNumber } from "@/lib/utils";

// All list state lives in the URL, so every view is linkable (and screenshot-able).
const Search = z.object({
  q: z.string().optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});

export const Route = createFileRoute("/players/")({
  validateSearch: Search,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.query(queries.players(context.api, deps)),
  component: Players,
});

function Players() {
  const { api } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(queries.players(api, search));

  return (
    <>
      <PageHeader title="Players">
        <search>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q")?.toString().trim();
              navigate({ search: { q: q || undefined, page: 1 } });
            }}
          >
            <Input
              name="q"
              aria-label="Search players"
              placeholder="Name or id"
              defaultValue={search.q ?? ""}
              key={search.q ?? ""}
              className="w-64"
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </search>
      </PageHeader>

      <Table>
        <caption className="sr-only">Players</caption>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Id</Th>
            <Th className="text-right">Level</Th>
            <Th className="text-right">XP</Th>
            <Th>Joined</Th>
          </tr>
        </thead>
        <tbody>
          {data.players.map((p) => (
            <tr key={p.id} className="hover:bg-muted/60">
              <Td>
                <Link to="/players/$playerId" params={{ playerId: p.id }} className="font-medium hover:underline">
                  {p.displayName}
                </Link>
              </Td>
              <Td className="font-mono text-xs text-muted-foreground">{p.id}</Td>
              <Td className="text-right">{p.level}</Td>
              <Td className="text-right">{formatNumber(p.xp)}</Td>
              <Td>{formatDateTime(p.createdAt)}</Td>
            </tr>
          ))}
          {data.players.length === 0 && (
            <tr>
              <Td colSpan={5} className="py-8 text-center text-muted-foreground">
                No players match “{search.q}”.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>

      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        linkFor={(page) => ({ to: "/players", search: { ...search, page } })}
      />
    </>
  );
}
