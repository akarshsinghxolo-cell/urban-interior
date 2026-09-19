"use client";

import * as React from "react";
import { Building, CheckCircle2, MapPin, Plus, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRDashStore } from "@/lib/rdash/store";
import { formatDate, titleCase } from "@/lib/rdash/format";
import { Avatar, EmptyState, MetricCard, StatusBadge } from "../primitives";
import { OperationalMediaPanel } from "../OperationalMediaPanel";
import { CustomerMeasurementDialog } from "../customer/CustomerMeasurementDialog";
import { toast } from "sonner";

/**
 * Measurement Visit queue/orchestration only.
 *
 * Area fields, Area upsert rules, Work Required linking, verified measurement
 * serialization and report evidence are owned by CustomerMeasurementDialog.
 * This module therefore cannot create a competing Area/measurement path.
 */
export function SiteMeasurementModule() {
  const db = useRDashStore((state) => state.db);
  const openCreateDialog = useRDashStore((state) => state.openCreateDialog);
  const startContractorVisit = useRDashStore((state) => state.startContractorVisit);
  const completeContractorVisit = useRDashStore((state) => state.completeContractorVisit);
  const setActiveModule = useRDashStore((state) => state.setActiveModule);
  const [activeVisitId, setActiveVisitId] = React.useState<string | null>(null);

  const measurementVisits = db.visits.filter((visit) => visit.visit_type === "measurement");
  const records = measurementVisits.map((visit) => {
    const customer = db.customers.find((row) => row.id === visit.customer_id);
    const site = visit.site_id ? db.sites.find((row) => row.id === visit.site_id) : undefined;
    const revisions = db.measurementRevisions.filter((revision) => revision.visit_id === visit.id && revision.status === "verified");
    const areaRows = revisions.map((revision) => ({
      revision,
      area: db.areas.find((row) => row.id === revision.area_id),
    }));
    return {
      visit,
      customerName: customer?.name || visit.location_name,
      site,
      areaRows,
      totalArea: revisions.reduce((sum, revision) => sum + (revision.length || 0) * (revision.width || 0), 0),
    };
  });

  const completed = records.filter((record) => record.visit.report_filed && record.areaRows.length > 0).length;
  const pending = records.filter((record) => !record.visit.report_filed).length;
  const totalArea = records.reduce((sum, record) => sum + record.totalArea, 0);

  const openCapture = (visitId: string) => {
    const visit = db.visits.find((row) => row.id === visitId);
    if (!visit) return toast.error("Measurement Visit was not found.");
    if (visit.report_filed) return toast.info("This Measurement report is already filed. Create a new Measurement Visit for a correction.");

    const contractorVisit = visit.assignee_type === "contractor" || Boolean(visit.contractor_id);
    if (contractorVisit && (visit.status === "scheduled" || visit.status === "en_route")) {
      try {
        startContractorVisit(visit.id);
        toast.success("Contractor visit started. Complete it before filing measurements.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Contractor visit could not be started.");
      }
      return;
    }
    if (contractorVisit && visit.status === "checked_in") {
      try {
        completeContractorVisit(visit.id);
        setActiveVisitId(visit.id);
        toast.success("Contractor visit completed. Capture the Customer Site Areas now.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Contractor visit could not be completed.");
      }
      return;
    }
    if (!contractorVisit && (visit.status !== "report_pending" || !visit.check_out_verified)) {
      toast.info("Complete the assigned field check-in and check-out before capturing measurements.");
      setActiveModule("fieldOperations");
      return;
    }
    if (visit.status !== "report_pending") return toast.error("This Visit is not ready for Measurement capture.");
    setActiveVisitId(visit.id);
  };

  const actionLabel = (visitId: string) => {
    const visit = db.visits.find((row) => row.id === visitId);
    if (!visit) return "Visit unavailable";
    if (visit.report_filed) return "Filed — new Visit required";
    const contractorVisit = visit.assignee_type === "contractor" || Boolean(visit.contractor_id);
    if (contractorVisit && (visit.status === "scheduled" || visit.status === "en_route")) return "Start contractor visit";
    if (contractorVisit && visit.status === "checked_in") return "Complete & capture";
    if (!contractorVisit && visit.status !== "report_pending") return "Open Field Visits";
    return "Capture measurement";
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Ruler className="h-5 w-5" /></span>
          <div><h2 className="text-lg font-bold tracking-tight">Site Measurement</h2><p className="text-xs text-muted-foreground">Visit queue for the canonical Customer Area measurement workflow</p></div>
        </div>
        <Button size="sm" onClick={() => openCreateDialog({ kind: "visit", visitType: "measurement" })}><Plus className="mr-1 h-3.5 w-3.5" />New Measurement</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Measurement visits" value={records.length} tone="primary" icon={<Ruler className="h-4 w-4" />} />
        <MetricCard label="Captured" value={completed} tone="success" icon={<CheckCircle2 className="h-4 w-4" />} />
        <MetricCard label="Pending" value={pending} tone="warning" icon={<MapPin className="h-4 w-4" />} />
        <MetricCard label="Total area" value={`${totalArea.toLocaleString("en-IN")} sq.ft`} tone="default" icon={<Ruler className="h-4 w-4" />} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {records.map(({ visit, customerName, site, areaRows, totalArea: recordArea }) => (
          <div key={visit.id} className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5"><Avatar name={customerName} size={38} /><div><p className="text-sm font-bold">{customerName}</p><p className="text-[11px] text-muted-foreground">{visit.location_name} · {formatDate(visit.scheduled_at)}</p>{site && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-primary"><Building className="h-3 w-3" />{site.name}</p>}</div></div>
              <StatusBadge label={titleCase(visit.status)} className={visit.report_filed ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"} />
            </div>

            {areaRows.length > 0 && <div className="mt-3"><div className="mb-2 grid grid-cols-3 gap-2 text-center"><div className="rounded-md bg-muted/40 p-1.5"><p className="text-[10px] uppercase text-muted-foreground">Areas</p><p className="text-sm font-bold">{areaRows.length}</p></div><div className="rounded-md bg-muted/40 p-1.5"><p className="text-[10px] uppercase text-muted-foreground">Area</p><p className="text-sm font-bold">{recordArea.toLocaleString("en-IN")}</p></div><div className="rounded-md bg-muted/40 p-1.5"><p className="text-[10px] uppercase text-muted-foreground">Proofs</p><p className="text-sm font-bold">{visit.proof_attachment_ids.length}</p></div></div><div className="space-y-1">{areaRows.slice(0, 4).map(({ revision, area }) => <div key={revision.id} className="flex items-center justify-between rounded-md border border-border bg-background px-2 py-1 text-xs"><span className="font-medium">{area?.name || "Archived Area"}</span><span className="font-mono text-muted-foreground">{revision.length || 0}×{revision.width || 0} {revision.unit}</span></div>)}</div></div>}

            <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => openCapture(visit.id)} disabled={Boolean(visit.report_filed) || ["cancelled", "missed", "completed"].includes(visit.status)}><Ruler className="mr-1.5 h-3.5 w-3.5" />{actionLabel(visit.id)}</Button>
            <div className="mt-3 border-t border-border pt-3"><OperationalMediaPanel entityType="visit" entityId={visit.id} title="Measurement visit evidence & references" compact /></div>
          </div>
        ))}
      </div>

      {!records.length && <EmptyState title="No measurement visits scheduled" description="Schedule a Measurement Visit from Customer or Site context; Area capture itself uses the Customer-owned workflow." icon={<Ruler className="h-8 w-8" />} />}
      {activeVisitId && <CustomerMeasurementDialog visitId={activeVisitId} onClose={() => setActiveVisitId(null)} />}
    </div>
  );
}
