"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore, contractorBids, contractorSettlements } from "@/lib/rdash/store";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { formatINR, formatINRShort, formatDate, relativeDay, titleCase } from "@/lib/rdash/format";
import { HardHat, Star, Phone, MapPin, TrendingUp, CheckCircle2, AlertTriangle, ArrowRight, Wrench, DollarSign, X, Gavel, HandCoins, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { OperationalMediaPanel } from "../OperationalMediaPanel";
export function ContractorDetailModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const createContractorRABill = useRDashStore((s) => s.createContractorRABill);
    const canReleaseContractorPayment = useRDashStore((s) => s.canReleaseContractorPayment);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const [selectedId, setSelectedId] = React.useState<string | null>(db.master.contractors[0]?.id || null);
    const [payDialog, setPayDialog] = React.useState<{
        workOrder: any;
    } | null>(null);
    const [categoryFilter, setCategoryFilter] = React.useState<string>("all");

    // Build a map of subcategory_id → category_id for resolving work_capabilities to categories
    const subToCategory = React.useMemo(() => {
        const map: Record<string, { categoryId: string; categoryName: string; subName: string }> = {};
        for (const sub of db.master.workSubcategories) {
            const cat = db.master.workCategories.find((c) => c.id === sub.category_id);
            map[sub.id] = { categoryId: sub.category_id, categoryName: cat?.name || "Uncategorized", subName: sub.name };
        }
        return map;
    }, [db.master.workSubcategories, db.master.workCategories]);

    // Build a set of categories available for filtering (from work_capabilities + trade field)
    const availableCategories = React.useMemo(() => {
        const cats = new Map<string, string>();
        for (const c of db.master.contractors) {
            if (c.trade) cats.set(`trade:${c.trade}`, c.trade);
            if (c.work_capabilities) {
                for (const cap of c.work_capabilities) {
                    const info = subToCategory[cap.subcategory_id];
                    if (info) cats.set(`cat:${info.categoryId}`, info.categoryName);
                    else if (cap.subcategory_name) cats.set(`trade:${cap.subcategory_name}`, cap.subcategory_name);
                }
            }
        }
        return Array.from(cats.entries()).map(([value, label]) => ({ value, label }));
    }, [db.master.contractors, subToCategory]);

    // Filter contractors by selected category
    const contractors = React.useMemo(() => {
        return db.master.contractors
            .filter((c) => {
                if (categoryFilter === "all") return true;
                if (categoryFilter.startsWith("trade:")) {
                    const tradeVal = categoryFilter.slice(6);
                    return c.trade === tradeVal || (c.work_capabilities?.some((cap) => cap.subcategory_name === tradeVal));
                }
                if (categoryFilter.startsWith("cat:")) {
                    const catId = categoryFilter.slice(4);
                    return c.work_capabilities?.some((cap) => subToCategory[cap.subcategory_id]?.categoryId === catId);
                }
                return true;
            })
            .map((c) => {
                const workOrders = db.workOrders.filter((j) => j.contractor_id === c.id);
                const activeJobs = workOrders.filter((j) => j.status === "in_progress" || j.status === "scheduled");
                const costLines = db.workOrderCostLines.filter((cl) => cl.vendor_id === c.id && cl.type === "contractor");
                const totalEarned = costLines.reduce((n, cl) => n + cl.amount, 0);
                const outstanding = c.outstanding || 0;
                const rates = db.master.contractorRates.filter((r) => r.contractor_id === c.id);
                const bids = contractorBids(db, c.id);
                const settlements = contractorSettlements(db, c.id);
                const selectedBids = bids.filter((b) => b.status === "selected").length;
                const abandonedSettlements = settlements.filter((s) => s.type === "abandonment").length;
                // Resolve this contractor's work categories for display
                const contractorCategories = new Set<string>();
                if (c.trade) contractorCategories.add(c.trade);
                if (c.work_capabilities) {
                    for (const cap of c.work_capabilities) {
                        const info = subToCategory[cap.subcategory_id];
                        if (info) contractorCategories.add(info.categoryName);
                        else if (cap.subcategory_name) contractorCategories.add(cap.subcategory_name);
                    }
                }
                return { ...c, workOrders, activeJobs, costLines, totalEarned, outstanding, rates, bids, settlements, selectedBids, abandonedSettlements, contractorCategories: Array.from(contractorCategories) };
            });
    }, [db, categoryFilter, subToCategory]);

    // Reset selection if the filtered list doesn't contain the selected contractor
    React.useEffect(() => {
        if (selectedId && !contractors.find((c) => c.id === selectedId)) {
            setSelectedId(contractors[0]?.id || null);
        }
    }, [contractors, selectedId]);

    const selected = contractors.find((c) => c.id === selectedId);
    const totalActive = contractors.reduce((n, c) => n + c.activeJobs.length, 0);
    const totalOutstanding = contractors.reduce((n, c) => n + c.outstanding, 0);
    const avgRating = contractors.length ? (contractors.reduce((n, c) => n + (c.rating || 0), 0) / contractors.length).toFixed(1) : "0";
    const totalBids = contractors.reduce((n, c) => n + c.bids.length, 0);
    const totalSettlements = contractors.reduce((n, c) => n + c.settlements.length, 0);
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><HardHat className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Contractor Management</h2>
            <p className="text-xs text-muted-foreground">Trade crews, ratings, active workOrders, bid history & settlements</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Contractors" value={contractors.length} tone="primary" icon={<HardHat className="h-4 w-4"/>}/>
        <MetricCard label="Active workOrders" value={totalActive} tone="warning" icon={<Wrench className="h-4 w-4"/>}/>
        <MetricCard label="Bids submitted" value={totalBids} tone="default" icon={<Gavel className="h-4 w-4"/>}/>
        <MetricCard label="Settlements" value={totalSettlements} tone="destructive" icon={<HandCoins className="h-4 w-4"/>}/>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-[var(--panel-radius)] border border-border bg-card p-2 shadow-card">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <h3 className="text-sm font-semibold">All contractors</h3>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs font-medium outline-none ring-ring focus-visible:ring-2" aria-label="Filter by work category">
              <option value="all">All categories</option>
              {availableCategories.map((cat) => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            {contractors.length === 0 ? (<p className="px-2.5 py-4 text-center text-xs text-muted-foreground">No contractors in this category.</p>) : null}
            {contractors.map((c) => (<button key={c.id} type="button" onClick={() => setSelectedId(c.id)} className={cn("flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors", selectedId === c.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent/40")}>
                <Avatar name={c.name} size={36}/>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{(c as any).contractorCategories?.length ? (c as any).contractorCategories.join(", ") : c.trade} · {c.city}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {c.activeJobs.length > 0 && <StatusBadge label={`${c.activeJobs.length} active`} className="bg-warning/10 text-warning border-warning/20"/>}
                  {c.abandonedSettlements > 0 && <StatusBadge label={`${c.abandonedSettlements} abandoned`} className="bg-destructive/10 text-destructive border-destructive/20"/>}
                  <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-foreground">
                    <Star className="h-3 w-3 fill-warning text-warning"/>{c.rating || "—"}
                  </span>
                </div>
              </button>))}
          </div>
        </div>
        {selected && (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={selected.name} size={48}/>
                <div>
                  <p className="text-base font-bold">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{selected.trade} · {selected.city}</p>
                  {(selected as any).contractorCategories?.length > 0 && (<div className="mt-1 flex flex-wrap gap-1">
                      {(selected as any).contractorCategories.map((cat: string) => (<span key={cat} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{cat}</span>))}
                    </div>)}
                  {selected.specializations && selected.specializations.length > 0 && (<div className="mt-1 flex flex-wrap gap-1">
                      {selected.specializations.map((s) => (<span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>))}
                    </div>)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/10 px-2.5 py-1 text-sm font-bold text-warning">
                  <Star className="h-3.5 w-3.5 fill-warning"/>{selected.rating || "—"}
                </span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-md bg-muted/40 p-2.5">
                <p className="text-[10px] uppercase text-muted-foreground">Phone</p>
                <p className="text-xs font-medium"><Phone className="mr-1 inline h-3 w-3"/>{selected.phone || "—"}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2.5">
                <p className="text-[10px] uppercase text-muted-foreground">Active workOrders</p>
                <p className="text-xs font-medium">{selected.activeJobs.length}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2.5">
                <p className="text-[10px] uppercase text-muted-foreground">Outstanding</p>
                <p className={cn("text-xs font-mono font-semibold", selected.outstanding > 0 ? "text-destructive" : "text-success")}>{formatINR(selected.outstanding)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2.5">
                <p className="text-[10px] uppercase text-muted-foreground">Total earned</p>
                <p className="text-xs font-mono font-semibold">{formatINR(selected.totalEarned)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2.5">
                <p className="text-[10px] uppercase text-muted-foreground">Reliability</p>
                <p className="text-xs font-mono font-semibold">{selected.reliability_score ?? "—"}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2.5">
                <p className="text-[10px] uppercase text-muted-foreground">On-time %</p>
                <p className="text-xs font-mono font-semibold">{selected.on_time_pct != null ? `${selected.on_time_pct}%` : "—"}</p>
              </div>
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <OperationalMediaPanel entityType="contractor" entityId={selected.id} title="Contractor files & references" compact/>
            </div>
            {selected.bids.length > 0 && (<div className="mt-4">
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  <Gavel className="h-3 w-3"/> Bid history ({selected.bids.length}) · {selected.selectedBids} won
                </p>
                <div className="flex flex-col gap-1">
                  {selected.bids.slice(0, 6).map((b) => (<button key={b.id} type="button" onClick={() => b.work_order_id && openDetail("workOrder", b.work_order_id)} className="flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-1.5 text-left hover:bg-accent/20">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{b.bid_no} · {b.work_order_no}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{(b.customer_name || "Customer")} · {b.scope.slice(0, 60)}{b.scope.length > 60 ? "…" : ""}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-xs font-semibold">{b.quote_amount ? formatINRShort(b.quote_amount) : "—"}</span>
                        <StatusBadge label={b.status === "selected" ? "Won" : b.status === "rejected" ? "Lost" : b.status === "withdrawn" ? "Withdrawn" : "Pending"} className={b.status === "selected" ? "bg-success/10 text-success border-success/20" : b.status === "rejected" || b.status === "withdrawn" ? "bg-muted text-muted-foreground border-border" : "bg-warning/10 text-warning border-warning/20"}/>
                      </div>
                    </button>))}
                </div>
              </div>)}
            {selected.settlements.length > 0 && (<div className="mt-4">
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  <HandCoins className="h-3 w-3"/> Settlement history ({selected.settlements.length})
                </p>
                <div className="flex flex-col gap-1">
                  {selected.settlements.map((s) => (<button key={s.id} type="button" onClick={() => openDetail("workOrder", s.work_order_id)} className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/[0.04] px-2.5 py-1.5 text-left hover:bg-destructive/[0.08]">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{s.settlement_no} · {s.work_order_no}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{s.type} · {s.completed_pct}% complete · settled {formatDate(s.settled_at)}</p>
                      </div>
                      <span className="ml-2 shrink-0 font-mono text-xs font-bold text-destructive">{formatINRShort(s.payable_amount)}</span>
                    </button>))}
                </div>
              </div>)}
            {selected.rates.length > 0 && (<div className="mt-4">
                <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Trade rates</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.rates.map((r) => (<span key={r.id} className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px]">
                      {r.trade}: <span className="font-mono font-semibold">{formatINR(r.rate)}/{r.unit_id || "unit"}</span>
                    </span>))}
                </div>
              </div>)}
            <div className="mt-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Assigned workOrders ({selected.workOrders.length})</p>
              {selected.workOrders.length === 0 ? (<p className="rounded-md border border-dashed border-border bg-muted/20 py-3 text-center text-xs text-muted-foreground">No workOrders assigned.</p>) : (<div className="flex flex-col gap-1.5">
                  {selected.workOrders.map((j) => (<div key={j.id} className="flex items-center gap-2.5 rounded-md border border-border bg-background px-2.5 py-2">
                      <button type="button" onClick={() => openDetail("workOrder", j.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:text-primary">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">{j.work_order_no} · {j.title}</p>
                          <p className="text-[10px] text-muted-foreground">{(j.customer_name || "Customer")} · {j.progress}% done</p>
                        </div>
                        <StatusBadge label={titleCase(j.status)} className={j.status === "in_progress" ? "bg-primary/10 text-primary border-primary/20" : j.status === "on_hold" ? "bg-warning/10 text-warning border-warning/20" : j.status === "abandoned" ? "bg-destructive/15 text-destructive border-destructive/25" : "bg-muted text-muted-foreground border-border"}/>
                        <ArrowRight className="h-3 w-3 text-muted-foreground"/>
                      </button>
                      <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-[11px]" onClick={() => setPayDialog({ workOrder: j })}>
                        <DollarSign className="mr-1 h-3 w-3"/> Create RA bill
                      </Button>
                    </div>))}
                </div>)}
            </div>
            {selected.costLines.length > 0 && (<div className="mt-4">
                <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Recent payments</p>
                <div className="flex flex-col gap-1">
                  {selected.costLines.slice(0, 5).map((cl) => (<div key={cl.id} className="flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-1.5">
                      <div>
                        <p className="text-xs font-medium">{cl.description}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDate(cl.date)}</p>
                      </div>
                      <span className="font-mono text-xs font-semibold">{formatINR(cl.amount)}</span>
                    </div>))}
                </div>
              </div>)}
          </div>)}
      </div>

      {payDialog && selected && (<CreateRABillDialog contractor={selected} workOrder={payDialog.workOrder} releaseGuard={canReleaseContractorPayment(payDialog.workOrder.id)} onClose={() => setPayDialog(null)} onUploadProof={() => {
                // CV-2: In-context shortcut — send the user to the Execution Logs module so they can
                // attach the contractor confirmation photo for this work order, then come back.
                openDetail("workOrder", payDialog.workOrder.id);
                setActiveModule("executionLogs");
                toast.info("Open the work order's Execution Logs and attach a contractor confirmation photo, then return here to file the RA bill.");
            }} onSubmit={(amount, description, progressPct) => {
                try {
                    createContractorRABill(payDialog.workOrder.id, selected.id, amount, description, progressPct);
                    toast.success(amount > 25000 ? `Verified RA bill created. Request one or more payment releases from Contractor Bills & Payments` : `Verified RA bill created`);
                    setPayDialog(null);
                }
                catch (error) {
                    toast.error(error instanceof Error ? error.message : "Contractor RA bill blocked");
                }
            }}/>)}
    </div>);
}
function CreateRABillDialog({ contractor, workOrder, releaseGuard, onClose, onUploadProof, onSubmit }: {
    contractor: any;
    workOrder: any;
    releaseGuard: {
        ok: boolean;
        reason?: string;
    };
    onClose: () => void;
    onUploadProof: () => void;
    onSubmit: (amount: number, description: string, progressPct?: number) => void;
}) {
    const [amount, setAmount] = React.useState("");
    const [description, setDescription] = React.useState(`${contractor.name} — progress payment for ${workOrder.work_order_no}`);
    const [progressPct, setProgressPct] = React.useState(workOrder.progress?.toString() || "");
    const requiresApproval = (parseFloat(amount) || 0) > 25000;
    // CV-2: The store now warns (via thread reply) but no longer hard-blocks RA bill creation when
    // contractor confirmation proof is missing. We still surface the warning prominently and offer
    // an in-context shortcut to upload the proof, but the submit button is no longer disabled —
    // the business can proceed and upload the proof before the final payment release.
    const proofMissing = !releaseGuard.ok;
    return (<Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-primary"/> Request contractor payment
          </DialogTitle>
          <DialogDescription className="text-xs">{contractor.name} · {workOrder.work_order_no} · {(workOrder.customer_name || "Customer")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Amount (₹)</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 58000" className="h-9 text-sm" autoFocus/>
            {amount && (<p className={cn("mt-1 text-[10px] font-medium", requiresApproval ? "text-warning" : "text-success")}>
                {requiresApproval ? "⚠ Above ₹25,000 policy — owner approval required" : "✓ Below ₹25,000 threshold — auto-approved, cost posted immediately"}
              </p>)}
          </div>
          {proofMissing && (<div className="rounded-md border border-warning/40 bg-warning/[0.08] p-2.5 text-xs text-warning">
              <div className="flex gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                <div className="flex-1">
                  <p className="font-semibold">Contractor confirmation proof not yet uploaded.</p>
                  <p className="mt-0.5 text-[11px] text-warning/90">{releaseGuard.reason}</p>
                  <p className="mt-1 text-[11px] text-warning/90">The RA bill can still be created (flexible mode) — upload the proof before releasing the final payment.</p>
                  <Button type="button" size="sm" variant="outline" className="mt-2 h-7 border-warning/50 text-warning hover:bg-warning/10" onClick={onUploadProof}>
                    <ArrowRight className="mr-1 h-3 w-3"/> Upload contractor confirmation
                  </Button>
                </div>
              </div>
            </div>)}
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Progress % (optional)</label>
            <Input type="number" value={progressPct} onChange={(e) => setProgressPct(e.target.value)} placeholder="e.g. 40" className="h-9 text-sm"/>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-sm"/>
          </div>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}><X className="mr-1 h-3.5 w-3.5"/> Cancel</Button>
          <Button size="sm" onClick={() => onSubmit(parseFloat(amount) || 0, description, progressPct ? parseFloat(progressPct) : undefined)} disabled={!amount || !description}>
            <DollarSign className="mr-1 h-3.5 w-3.5"/> {requiresApproval ? "Request approval" : "Post payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
