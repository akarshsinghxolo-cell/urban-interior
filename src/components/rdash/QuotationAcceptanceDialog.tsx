"use client";
import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import { formatDate, formatINR } from "@/lib/rdash/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
export function QuotationAcceptanceDialog({ open, quotationId, onClose, }: {
    open: boolean;
    quotationId?: string;
    onClose: () => void;
}) {
    const db = useRDashStore((state) => state.db);
    const acceptQuotationForBidding = useRDashStore((state) => state.acceptQuotationForBidding);
    const quotationAcceptanceWarnings = useRDashStore((state) => state.quotationAcceptanceWarnings);
    const setActiveModule = useRDashStore((state) => state.setActiveModule);
    const quotation = quotationId ? db.quotations.find((row) => row.id === quotationId) : undefined;
    const selectableCoverage = React.useMemo(() => quotation?.coverage.filter((coverage) => coverage.status !== "accepted") || [], [quotation]);
    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
    const [warningConfirmed, setWarningConfirmed] = React.useState(false);
    React.useEffect(() => {
        if (!open)
            return;
        setSelectedIds(selectableCoverage.map((coverage) => coverage.id));
        setWarningConfirmed(false);
    }, [open, quotationId, selectableCoverage]);
    const warnings = quotationId ? quotationAcceptanceWarnings(quotationId, selectedIds) : [];
    const requiresWarningConfirmation = warnings.length > 0;
    const toggleCoverage = (id: string) => {
        setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
        setWarningConfirmed(false);
    };
    const accept = () => {
        if (!quotation)
            return;
        if (!selectedIds.length) {
            toast.error("Choose at least one scope to accept");
            return;
        }
        if (requiresWarningConfirmation && !warningConfirmed) {
            toast.error("Confirm the warning before accepting this quotation");
            return;
        }
        try {
            acceptQuotationForBidding(quotation.id, {
                coverageIds: selectedIds,
                acceptWithWarnings: requiresWarningConfirmation,
            });
            toast.success(`${selectedIds.length} quotation scope${selectedIds.length === 1 ? "" : "s"} accepted for contractor bidding`);
            setActiveModule("siteExecution");
            onClose();
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Quotation acceptance could not be completed");
        }
    };
    if (!open)
        return null;
    if (!quotation) {
        return (<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quotation not found</DialogTitle>
            <DialogDescription>This quotation is no longer available.</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button size="sm" onClick={onClose}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>);
    }
    if (quotation.status === "cancelled") {
        return (<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning"/> Cancelled quotation</DialogTitle>
            <DialogDescription>This version is retained as commercial history and cannot be accepted. Open its successor revision instead.</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button size="sm" onClick={onClose}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>);
    }
    return (<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4 text-success"/> Accept quotation scope</DialogTitle>
          <DialogDescription className="text-xs">Acceptance proof is not required. Select only the customer-approved scope(s); each accepted scope enters contractor bidding independently.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[62vh] space-y-4 overflow-y-auto px-5 py-4 rd-scroll">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary"><FileText className="h-4 w-4"/></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{quotation.quotation_no}</p><p className="truncate text-xs text-muted-foreground">{quotation.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatINR(quotation.total_amount)} · Rev {quotation.revision_no} · valid {formatDate(quotation.valid_until)}</p></div></div>
          </div>

          {selectableCoverage.length ? (<div className="space-y-2">
              <div><p className="text-xs font-semibold">Customer-approved scope</p><p className="text-[11px] text-muted-foreground">Unselected scope remains proposed and can be accepted later.</p></div>
              {selectableCoverage.map((coverage) => {
                const selected = selectedIds.includes(coverage.id);
                return (<label key={coverage.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 hover:bg-accent/25">
                    <Checkbox checked={selected} onCheckedChange={() => toggleCoverage(coverage.id)} className="mt-0.5"/>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{coverage.coverage_label}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{coverage.area_ids.length} area{coverage.area_ids.length === 1 ? "" : "s"} · {coverage.measurement_revision_ids.length} verified measurement revision{coverage.measurement_revision_ids.length === 1 ? "" : "s"}</span></span>
                  </label>);
            })}
            </div>) : (<div className="rounded-lg border border-success/25 bg-success/5 p-3 text-xs text-muted-foreground">All quotation scopes are already accepted. Open Sites &amp; Execution to continue contractor bidding.</div>)}

          {warnings.length > 0 && (<div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning"/><div><p className="text-xs font-semibold">Acceptance warning</p><ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div></div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs"><Checkbox checked={warningConfirmed} onCheckedChange={(checked) => setWarningConfirmed(Boolean(checked))} className="mt-0.5"/><span>I reviewed this exception and want to accept the selected scope anyway.</span></label>
            </div>)}
        </div>
        <DialogFooter className="border-t border-border px-5 py-3"><Button size="sm" variant="outline" onClick={onClose}>Cancel</Button><Button size="sm" onClick={accept} disabled={!selectedIds.length || (requiresWarningConfirmation && !warningConfirmed)}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Accept selected scope{selectedIds.length === 1 ? "" : "s"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>);
}
