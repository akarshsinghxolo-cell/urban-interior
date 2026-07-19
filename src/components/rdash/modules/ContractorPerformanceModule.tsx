"use client";
import * as React from "react";
import { Trophy, TrendingUp, TrendingDown, Star, HardHat, Award, Wrench, RefreshCw, } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { formatINR, formatINRShort } from "@/lib/rdash/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ContractorPerf {
    contractor_id: string;
    contractor_name: string;
    trade?: string;
    city?: string;
    specializations?: string[];
    reliability_score?: number;
    on_time_pct?: number;
    past_jobs_count?: number;
    rating?: number;
    total_award_value: number;
    work_order_count: number;
    total_billed: number;
    total_paid: number;
    outstanding: number;
    bids_submitted: number;
    bids_selected: number;
    selection_rate: number;
    direct_awards: number;
}

function computeContractorPerformance(db: any): ContractorPerf[] {
    const contractors = db.master.contractors || [];
    const workOrders = db.workOrders || [];
    const contractorBills = db.contractorBills || [];
    const contractorPayments = db.contractorPayments || [];
    const contractorBids = db.contractorBids || [];
    return contractors.map((contractor: any) => {
        const contractorWOs = workOrders.filter((wo: any) => wo.contractor_id === contractor.id);
        const contractorBillsFor = contractorBills.filter((b: any) => b.contractor_id === contractor.id);
        const contractorPaymentsFor = contractorPayments.filter((p: any) => p.contractor_id === contractor.id);
        const bids = contractorBids.filter((b: any) => b.contractor_id === contractor.id);
        const selectedBids = bids.filter((b: any) => b.status === "selected");
        const totalAwardValue = contractorWOs.reduce((n: number, wo: any) => n + (wo.contractor_award_amount || 0), 0);
        const totalBilled = contractorBillsFor.reduce((n: number, b: any) => n + (b.amount || 0), 0);
        const totalPaid = contractorPaymentsFor.reduce((n: number, p: any) => n + (p.amount || 0), 0);
        const outstanding = Math.max(0, totalBilled - totalPaid);
        const directAwards = contractorWOs.filter((wo: any) => wo.contractor_selection_method === "direct_award").length;
        const selectionRate = bids.length > 0 ? Math.round((selectedBids.length / bids.length) * 100) : 0;
        return {
            contractor_id: contractor.id,
            contractor_name: contractor.name,
            trade: contractor.trade,
            city: contractor.city,
            specializations: contractor.specializations,
            reliability_score: contractor.reliability_score,
            on_time_pct: contractor.on_time_pct,
            past_jobs_count: contractor.past_jobs_count,
            rating: contractor.rating,
            total_award_value: totalAwardValue,
            work_order_count: contractorWOs.length,
            total_billed: totalBilled,
            total_paid: totalPaid,
            outstanding,
            bids_submitted: bids.length,
            bids_selected: selectedBids.length,
            selection_rate: selectionRate,
            direct_awards: directAwards,
        };
    }).sort((a: ContractorPerf, b: ContractorPerf) => b.total_award_value - a.total_award_value);
}

function rankBadge(index: number): { icon: string; className: string } {
    if (index === 0) return { icon: "🥇", className: "bg-warning/15 text-warning border-warning/30" };
    if (index === 1) return { icon: "🥈", className: "bg-muted/50 text-muted-foreground border-border" };
    if (index === 2) return { icon: "🥉", className: "bg-orange-500/15 text-orange-600 border-orange-500/30" };
    return { icon: String(index + 1), className: "bg-muted/30 text-muted-foreground border-border" };
}

function scoreTone(score?: number): "success" | "warning" | "destructive" | "muted" {
    if (score === undefined) return "muted";
    if (score >= 85) return "success";
    if (score >= 70) return "warning";
    return "destructive";
}

export function ContractorPerformanceModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const recomputeContractorPerformance = useRDashStore((s) => s.recomputeContractorPerformance);
    const contractors = React.useMemo(() => computeContractorPerformance(db), [db]);
    // J: Refresh all contractor scores from RA-bill + payment performance.
    const handleRefreshAll = () => {
        let success = 0;
        let failed = 0;
        for (const c of contractors) {
            try { recomputeContractorPerformance(c.contractor_id); success++; }
            catch (err) { console.warn("[ContractorPerformance] recompute failed", err); failed++; }
        }
        toast.success(`Recomputed ${success} contractor score${success === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}.`);
    };
    const handleRefreshOne = (contractorId: string, name: string) => {
        try {
            recomputeContractorPerformance(contractorId);
            toast.success(`Recomputed performance score for ${name}.`);
        }
        catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not recompute score.");
        }
    };
    const totals = React.useMemo(() => ({
        awardValue: contractors.reduce((n, c) => n + c.total_award_value, 0),
        billed: contractors.reduce((n, c) => n + c.total_billed, 0),
        paid: contractors.reduce((n, c) => n + c.total_paid, 0),
        outstanding: contractors.reduce((n, c) => n + c.outstanding, 0),
        workOrders: contractors.reduce((n, c) => n + c.work_order_count, 0),
    }), [contractors]);

    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20">
            <HardHat className="h-4 w-4"/>
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Contractor Performance</h2>
            <p className="text-xs text-muted-foreground">Leaderboard ranked by total award value — reliability, bid selection rate, and payment status</p>
          </div>
        </div>
        {/* J: Refresh score button — recomputes every contractor's reliability/on-time/rating
            from actual RA-bill + payment performance and writes the values back to the master. */}
        <Button size="sm" variant="outline" onClick={handleRefreshAll} disabled={!contractors.length}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5"/> Refresh all scores
        </Button>
      </div>

      {/* Summary cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary/80"><HardHat className="h-4 w-4"/>Total Awarded</div>
          <p className="mt-1 text-lg font-bold text-foreground">{formatINRShort(totals.awardValue)}</p>
          <p className="text-[10px] text-muted-foreground">{totals.workOrders} work orders</p>
        </div>
        <div className="rounded-lg border border-warning/20 bg-warning/[0.04] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-warning/80"><TrendingUp className="h-4 w-4"/>Total Billed</div>
          <p className="mt-1 text-lg font-bold text-foreground">{formatINRShort(totals.billed)}</p>
        </div>
        <div className="rounded-lg border border-success/20 bg-success/[0.04] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-success/80"><Award className="h-4 w-4"/>Total Paid</div>
          <p className="mt-1 text-lg font-bold text-foreground">{formatINRShort(totals.paid)}</p>
        </div>
        <div className="rounded-lg border border-destructive/20 bg-destructive/[0.04] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-destructive/80"><TrendingDown className="h-4 w-4"/>Outstanding</div>
          <p className="mt-1 text-lg font-bold text-foreground">{formatINRShort(totals.outstanding)}</p>
        </div>
      </section>

      {/* Leaderboard */}
      <section className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Trophy className="h-4 w-4 text-warning"/>Contractor Leaderboard</h3>
          <p className="text-xs text-muted-foreground">Ranked by total award value · click a contractor to open detail</p>
        </div>
        {contractors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <HardHat className="h-12 w-12 text-muted-foreground/30"/>
            <p className="mt-2 text-sm text-muted-foreground">No contractors found. Add contractors in Master Setup.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {contractors.map((c, i) => {
                const rank = rankBadge(i);
                const relTone = scoreTone(c.reliability_score);
                const onTimeTone = scoreTone(c.on_time_pct);
                const hasActivity = c.work_order_count > 0;
                return (
                  <div key={c.contractor_id} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-all hover:bg-muted/20", !hasActivity && "opacity-60")}>
                    <button type="button" onClick={() => openDetail("contractor" as any, c.contractor_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      {/* Rank badge */}
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold", rank.className)}>{rank.icon}</span>
                      {/* Contractor info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold text-foreground">{c.contractor_name}</p>
                          {c.trade && <span className="hidden shrink-0 rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground sm:inline">{c.trade}</span>}
                          {c.direct_awards > 0 && <span title={`${c.direct_awards} direct-award(s) — no formal bid round`} className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[9px] font-semibold text-warning"><Wrench className="h-2 w-2"/>{c.direct_awards} DA</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                          {c.city && <span>{c.city}</span>}
                          <span>{c.work_order_count} WOs · {formatINRShort(c.total_award_value)}</span>
                          {c.bids_submitted > 0 && <span>Bids: {c.bids_selected}/{c.bids_submitted} ({c.selection_rate}%)</span>}
                          {c.outstanding > 0 && <span className="text-destructive">Outstanding: {formatINRShort(c.outstanding)}</span>}
                        </div>
                      </div>
                      {/* Scores */}
                      <div className="hidden shrink-0 items-center gap-4 sm:flex">
                        {/* Reliability */}
                        <div className="text-center">
                          <p className="text-[9px] font-semibold uppercase text-muted-foreground">Reliability</p>
                          <p className={cn("text-sm font-bold", relTone === "success" ? "text-success" : relTone === "warning" ? "text-warning" : relTone === "destructive" ? "text-destructive" : "text-muted-foreground")}>{c.reliability_score ?? "—"}</p>
                        </div>
                        {/* On-time */}
                        <div className="text-center">
                          <p className="text-[9px] font-semibold uppercase text-muted-foreground">On-time</p>
                          <p className={cn("text-sm font-bold", onTimeTone === "success" ? "text-success" : onTimeTone === "warning" ? "text-warning" : onTimeTone === "destructive" ? "text-destructive" : "text-muted-foreground")}>{c.on_time_pct ? `${c.on_time_pct}%` : "—"}</p>
                        </div>
                        {/* Past jobs */}
                        {c.past_jobs_count !== undefined && (
                          <div className="text-center">
                            <p className="text-[9px] font-semibold uppercase text-muted-foreground">Past Jobs</p>
                            <p className="text-sm font-bold text-foreground">{c.past_jobs_count}</p>
                          </div>
                        )}
                        {/* Rating */}
                        {c.rating !== undefined && (
                          <div className="text-center">
                            <p className="text-[9px] font-semibold uppercase text-muted-foreground">Rating</p>
                            <p className="flex items-center gap-0.5 text-sm font-bold text-warning"><Star className="h-3 w-3 fill-current"/>{c.rating}</p>
                          </div>
                        )}
                      </div>
                      {/* Award value */}
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-bold text-foreground">{formatINRShort(c.total_award_value)}</p>
                        <p className="text-[10px] text-muted-foreground">{c.work_order_count} WOs</p>
                      </div>
                    </button>
                    {/* J: Per-contractor refresh button */}
                    <Button size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-[11px]" onClick={() => handleRefreshOne(c.contractor_id, c.contractor_name)} title="Recompute this contractor's score from RA-bill + payment performance">
                      <RefreshCw className="h-3 w-3"/>
                    </Button>
                  </div>
                );
            })}
          </div>
        )}
      </section>
    </div>);
}
