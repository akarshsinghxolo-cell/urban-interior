"use client";

import * as React from "react";
import { CheckCircle2, Clock3, GitPullRequest, Plus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatINR, titleCase } from "@/lib/rdash/format";
import { useRDashStore } from "@/lib/rdash/store";
import { VariationRequestDialog } from "./VariationRequestDialog";
import { EntityFilesCard } from "./EntityFilesCard";

function statusClasses(status: string) {
  if (status === "approved") return "border-success/30 bg-success/10 text-success";
  if (status === "rejected") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-warning/30 bg-warning/10 text-warning";
}

function statusIcon(status: string) {
  if (status === "approved") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "rejected") return <XCircle className="h-3.5 w-3.5" />;
  return <Clock3 className="h-3.5 w-3.5" />;
}

export function WorkOrderVariationsPanel({ workOrderId }: { workOrderId: string }) {
  const db = useRDashStore((state) => state.db);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const workOrder = db.workOrders.find((row) => row.id === workOrderId);
  const variations = (db.variationRequests || [])
    .filter((row) => row.work_order_id === workOrderId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  if (!workOrder) {
    return <div className="p-4 text-sm text-muted-foreground">Work Order not found.</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold">
            <GitPullRequest className="h-4 w-4 text-primary" />
            Variations
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Extra-scope and cost changes for {workOrder.work_order_no}. New requests
            stay outside Work Order cost until customer approval is recorded.
          </p>
        </div>
        <Button size="sm" className="h-8 shrink-0" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New variation
        </Button>
      </div>

      {variations.length ? (
        <div className="space-y-2">
          {variations.map((variation) => (
            <div
              key={variation.id}
              className="rounded-lg border border-border bg-card p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {variation.variation_no} · {variation.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {variation.description}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-bold">
                  {formatINR(variation.requested_amount)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                <span className="text-muted-foreground">
                  Raised by {variation.requested_by || "Team"} · {formatDate(variation.requested_at || variation.created_at)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${statusClasses(variation.status)}`}
                >
                  {statusIcon(variation.status)}
                  {titleCase(String(variation.status).replaceAll("_", " "))}
                </span>
              </div>
              {variation.decision_note ? (
                <p className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                  Decision note: {variation.decision_note}
                </p>
              ) : null}
              <EntityFilesCard entityType="variation_request" entityId={variation.id} title="Variation files & approval" manage showEmpty />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
          <GitPullRequest className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">No variations raised</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use New variation when site conditions or customer instructions change
            the approved scope.
          </p>
        </div>
      )}

      <VariationRequestDialog
        open={dialogOpen}
        workOrderId={workOrderId}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
