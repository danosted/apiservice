import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/common";
import { Card } from "@/components/ui";
import { queries } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.query(queries.stats(context.api)),
  component: Overview,
});

function Overview() {
  const { api } = Route.useRouteContext();
  const { data: stats } = useSuspenseQuery(queries.stats(api));
  const cards = [
    { label: "Players", value: stats.players, to: "/players" as const },
    { label: "Item types", value: stats.items },
    { label: "Items held", value: stats.itemsHeld },
  ];

  return (
    <>
      <PageHeader title="Overview" />
      <dl className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <dt className="text-sm text-muted-foreground">{c.label}</dt>
            <dd className="mt-1 text-3xl font-semibold text-foreground">
              {c.to ? (
                <Link to={c.to} className="hover:underline">
                  {formatNumber(c.value)}
                </Link>
              ) : (
                formatNumber(c.value)
              )}
            </dd>
          </Card>
        ))}
      </dl>
    </>
  );
}
