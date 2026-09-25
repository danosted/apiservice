import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader, Pagination } from "@/components/common";
import { Table, Td, Th } from "@/components/ui";
import { queries } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";

const Search = z.object({ page: z.coerce.number().int().min(1).catch(1).default(1) });

export const Route = createFileRoute("/audit")({
  validateSearch: Search,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.query(queries.audit(context.api, deps.page)),
  component: Audit,
});

function Audit() {
  const { api } = Route.useRouteContext();
  const { page } = Route.useSearch();
  const { data } = useSuspenseQuery(queries.audit(api, page));

  return (
    <>
      <PageHeader title="Audit log" />
      <Table>
        <caption className="sr-only">Changes made through the dashboard, newest first</caption>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Who</Th>
            <Th>Action</Th>
            <Th>Target</Th>
            <Th>Details</Th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((e) => {
            const playerId = e.target.startsWith("player:") ? e.target.slice(7) : null;
            return (
              <tr key={e.id}>
                <Td className="whitespace-nowrap">{formatDateTime(e.at)}</Td>
                <Td>{e.actor}</Td>
                <Td className="font-mono text-xs">{e.action}</Td>
                <Td>
                  {playerId ? (
                    <Link to="/players/$playerId" params={{ playerId }} className="hover:underline">
                      {playerId}
                    </Link>
                  ) : (
                    e.target
                  )}
                </Td>
                <Td className="font-mono text-xs text-muted-foreground">
                  {Object.entries(e.details)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(" ")}
                </Td>
              </tr>
            );
          })}
          {data.entries.length === 0 && (
            <tr>
              <Td colSpan={5} className="py-8 text-center text-muted-foreground">
                No changes recorded yet.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        linkFor={(p) => ({ to: "/audit", search: { page: p } })}
      />
    </>
  );
}
