"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRDashStore } from "@/lib/rdash/store";
import { progressForWorkRequired } from "@/lib/rdash/customer-progress";
import { effectiveWorkRequiredStatus, evaluateWorkRequiredTransition } from "@/lib/rdash/work-required-lifecycle";
import type { WorkRequired, WorkRequiredStatus } from "@/lib/rdash/types";
import { workRequiredDisplayTitle } from "@/lib/rdash/work-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, StatusBadge } from "../primitives";

export function CustomerSalesProgress({ customerId }: { customerId: string }) {
  const db = useRDashStore((state) => state.db);
  const openDetail = useRDashStore((state) => state.openDetail);
  const openCreateDialog = useRDashStore((state) => state.openCreateDialog);
  const works = db.workRequired.filter((work) => work.customer_id === customerId);
  return <section aria-label="Customer sales pipeline" className="space-y-3">
    <div>
      <h3 className="font-semibold">Sales pipeline</h3>
      <p className="mt-1 text-xs text-muted-foreground">Progress updates from linked visits, verified measurements, quotations and work orders. Hold and lost decisions stay in place until you explicitly resume the work.</p>
    </div>
    {works.map((work) => {
      const status = effectiveWorkRequiredStatus(db, work);
      const progress = progressForWorkRequired({ ...work, status });
      const quotes = db.quotations.filter((quote) => quote.coverage.some((coverage) => coverage.work_required_id === work.id));
      const activeQuotes = quotes.filter((quote) => ["draft", "sent", "accepted"].includes(quote.status) && !quote.superseded_by_quotation_id);
      const visits = db.visits.filter((visit) => visit.work_required_id === work.id && !["cancelled", "missed"].includes(visit.status));
      const measurements = db.measurementRevisions.filter((revision) => revision.status === "verified" && (revision.work_required_id === work.id || work.area_ids.includes(revision.area_id)));
      const orders = db.workOrders.filter((order) => order.work_required_ids.includes(work.id) && !["cancelled", "abandoned"].includes(order.status));
      const site = db.sites.find((site) => site.id === work.site_id);
      return <article key={work.id} className="min-w-0 rounded-lg border border-border bg-background p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1"><h4 className="whitespace-normal break-words text-sm font-semibold">{workRequiredDisplayTitle(db.master.workSubcategories, work)}</h4><p className="mt-1 text-xs text-muted-foreground">{site?.name || "Customer-level requirement"}</p></div>
          <StatusBadge label={progress.label} />
        </div>
        <div className="my-3 h-1.5 rounded-full bg-muted" role="progressbar" aria-label={`${progress.label}: ${progress.percent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} /></div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <span>Visits: {visits.length}</span><span>Verified measurements: {measurements.length}</span><span>Active quotations: {activeQuotes.length}</span><span>Work orders: {orders.length}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => openDetail("workRequired", work.id, "customerDesk")}>{status === "on_hold" || status === "lost" ? "Review held / lost work" : "Open requirement"}</Button>
          <SalesDecision work={work} />
          {["new", "contacted"].includes(status) && <Button size="sm" onClick={() => openCreateDialog({ kind: "visit", customerId, siteId: work.site_id, workRequiredId: work.id })}>Schedule visit</Button>}
          {["visit_scheduled", "measurement_done"].includes(status) && <Button size="sm" onClick={() => openCreateDialog({ kind: "quotation", customerId, siteId: work.site_id, workRequiredId: work.id })}>Prepare quotation</Button>}
          {activeQuotes.map((quote) => <Button key={quote.id} size="sm" variant="outline" onClick={() => openDetail("quotation", quote.id, "customerDesk")}>{quote.quotation_no} · {quote.status}</Button>)}
          {orders.map((order) => <Button key={order.id} size="sm" variant="outline" onClick={() => openDetail("workOrder", order.id, "customerDesk")}>Open work order</Button>)}
        </div>
      </article>;
    })}
    {!works.length && <EmptyState title="No work required yet" description="Add the customer's work and site scope to start tracking sales progress." />}
  </section>;
}

function SalesDecision({ work }: { work: WorkRequired }) {
  const db = useRDashStore((state) => state.db);
  const transition = useRDashStore((state) => state.transitionWorkRequiredStatus);
  const [target, setTarget] = useState<WorkRequiredStatus | null>(null);
  const [reason, setReason] = useState("");
  const resuming = work.status === "on_hold" || work.status === "lost";
  const resumeStage = effectiveWorkRequiredStatus(db, { ...work, status: "new" });
  const choices: Array<{ status: WorkRequiredStatus; label: string }> = resuming
    ? [{ status: resumeStage, label: "Resume work" }]
    : [{ status: "contacted", label: "Mark contacted" }, { status: "negotiation", label: "In negotiation" }, { status: "on_hold", label: "Put on hold" }, { status: "lost", label: "Mark lost" }];
  const allowed = choices.filter((choice) => choice.status !== work.status && evaluateWorkRequiredTransition(db, work, choice.status).allowed);
  if (!allowed.length) return null;
  return <>
    {allowed.map((choice) => <Button key={choice.status} size="sm" variant="outline" onClick={() => { setReason(""); setTarget(choice.status); }}>{choice.label}</Button>)}
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) setTarget(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record sales decision</DialogTitle><DialogDescription>Record why this work is changing. Visits, measurements and quotations continue to update progress automatically.</DialogDescription></DialogHeader>
        <p className="text-sm font-semibold">{choices.find((choice) => choice.status === target)?.label}</p>
        <Textarea aria-label="Sales decision reason" placeholder="Reason for this decision" value={reason} onChange={(event) => setReason(event.target.value)} />
        <DialogFooter><Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button><Button disabled={!reason.trim()} onClick={() => {
          if (!target) return;
          try { transition(work.id, target, { reason: reason.trim(), source: "keyboard" }); setTarget(null); toast.success("Sales decision recorded"); }
          catch (error) { toast.error(error instanceof Error ? error.message : "Could not record sales decision"); }
        }}>Save decision</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
