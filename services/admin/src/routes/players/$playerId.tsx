import type { Item } from "@apiservice/game-contract";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { ErrorPanel, PageHeader } from "@/components/common";
import { Alert, Badge, Button, Card, CardTitle, Input, Label, Select, Table, Td, Th } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { RequirePermission } from "@/lib/authz";
import { queries } from "@/lib/queries";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const Route = createFileRoute("/players/$playerId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query(queries.player(context.api, params.playerId)),
      context.queryClient.query(queries.items(context.api)),
    ]);
  },
  errorComponent: ({ error }) => (
    <>
      <BackLink />
      <ErrorPanel error={error} />
    </>
  ),
  component: PlayerPage,
});

function BackLink() {
  return (
    <Link to="/players" className="mb-4 inline-block text-sm text-muted-foreground hover:underline">
      ← All players
    </Link>
  );
}

function PlayerPage() {
  const { api } = Route.useRouteContext();
  const { playerId } = Route.useParams();
  const { data } = useSuspenseQuery(queries.player(api, playerId));
  const { player, inventory } = data;

  return (
    <>
      <BackLink />
      <PageHeader title={player.displayName} />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card>
          <CardTitle>Profile</CardTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Id</dt>
            <dd className="font-mono text-xs">{player.id}</dd>
            <dt className="text-muted-foreground">Level</dt>
            <dd>{player.level}</dd>
            <dt className="text-muted-foreground">XP</dt>
            <dd>{formatNumber(player.xp)}</dd>
            <dt className="text-muted-foreground">Joined</dt>
            <dd>{formatDateTime(player.createdAt)}</dd>
          </dl>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <section aria-labelledby="inventory-heading">
            <h2 id="inventory-heading" className="mb-3 text-base font-semibold text-foreground">
              Inventory
            </h2>
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Rarity</Th>
                  <Th className="text-right">Quantity</Th>
                  <Th className="text-right">Max stack</Th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((e) => (
                  <tr key={e.item.id}>
                    <Td className="font-medium">{e.item.name}</Td>
                    <Td>
                      <Badge tone={e.item.rarity}>{e.item.rarity}</Badge>
                    </Td>
                    <Td className="text-right">{formatNumber(e.quantity)}</Td>
                    <Td className="text-right text-muted-foreground">{formatNumber(e.item.maxStack)}</Td>
                  </tr>
                ))}
                {inventory.length === 0 && (
                  <tr>
                    <Td colSpan={4} className="py-8 text-center text-muted-foreground">
                      Inventory is empty.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </section>

          <RequirePermission
            permission="inventory:adjust"
            fallback={<Alert tone="info">You have read-only access to this inventory.</Alert>}
          >
            <AdjustInventoryForm playerId={player.id} />
          </RequirePermission>
        </div>
      </div>
    </>
  );
}

const AdjustForm = z.object({
  itemId: z.string().min(1, "Choose an item"),
  quantity: z.number().int("Whole numbers only").min(1, "At least 1"),
  mode: z.enum(["grant", "remove"]),
});

function AdjustInventoryForm({ playerId }: { playerId: string }) {
  const { api } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: items } = useSuspenseQuery(queries.items(api));
  const [result, setResult] = useState<string | null>(null);

  const mutation = useMutation({
    // The key is created once per submit, so React Query retries reuse it and can't double-apply.
    mutationFn: (v: { itemId: string; delta: number; idempotencyKey: string }) => api.adjustInventory(playerId, v),
    onSuccess: async (res, v) => {
      const verb = v.delta > 0 ? "Granted" : "Removed";
      setResult(`${verb} ${Math.abs(v.delta)} × ${res.entry.item.name}. Now ${res.entry.quantity}.`);
      await Promise.all(
        [["player", playerId], ["stats"], ["audit"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  const form = useForm({
    defaultValues: { itemId: "", quantity: 1, mode: "grant" } as z.infer<typeof AdjustForm>,
    validators: { onSubmit: AdjustForm },
    onSubmit: async ({ value }) => {
      setResult(null);
      await mutation
        .mutateAsync({
          itemId: value.itemId,
          delta: value.mode === "grant" ? value.quantity : -value.quantity,
          idempotencyKey: crypto.randomUUID(),
        })
        .catch(() => {});
    },
  });

  return (
    <Card>
      <CardTitle>Adjust inventory</CardTitle>
      <form
        aria-label="Adjust inventory"
        className="grid gap-4 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <form.Field name="itemId">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor={field.name}>Item</Label>
              <Select
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
              >
                <option value="">Choose an item…</option>
                {items.map((i: Item) => (
                  <option key={i.id} value={i.id}>
                    {i.name} (max {i.maxStack})
                  </option>
                ))}
              </Select>
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
        <form.Field name="quantity">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor={field.name}>Quantity</Label>
              <Input
                id={field.name}
                type="number"
                min={1}
                value={Number.isNaN(field.state.value) ? "" : field.state.value}
                onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
        <form.Field name="mode">
          {(field) => (
            <div className="space-y-1">
              <Label htmlFor={field.name}>Action</Label>
              <Select
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as "grant" | "remove")}
              >
                <option value="grant">Grant</option>
                <option value="remove">Remove</option>
              </Select>
            </div>
          )}
        </form.Field>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Apply"}
            </Button>
          )}
        </form.Subscribe>
      </form>
      <div className="mt-4 empty:hidden">
        {result && <Alert tone="success">{result}</Alert>}
        {mutation.error && (
          <Alert>{mutation.error instanceof ApiError ? mutation.error.message : "Request failed"}</Alert>
        )}
      </div>
    </Card>
  );
}

function FieldError({ errors }: { errors: unknown[] }) {
  if (errors.length === 0) return null;
  const text = errors.map((e) => (typeof e === "object" && e && "message" in e ? String(e.message) : String(e)));
  return <p className="text-xs text-destructive">{text.join(", ")}</p>;
}
