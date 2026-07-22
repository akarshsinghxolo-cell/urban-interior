"use client";
import * as React from "react";
import { Trophy, TrendingUp, TrendingDown, Star, Clock, Package, Award, RefreshCw, } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { formatINR, formatINRShort } from "@/lib/rdash/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface VendorPerf {
    vendor_id: string;
    vendor_name: string;
    city?: string;
    category?: string;
    reliability_score?: number;
    on_time_pct?: number;
    total_po_value: number;
    po_count: number;
    total_billed: number;
    total_paid: number;
    outstanding: number;
    avg_delivery_days?: number;
    on_time_delivery_pct: number;
    rating?: number;
}

function computeVendorPerformance(db: any): VendorPerf[] {
    const vendors = db.master.vendors || [];
    const purchaseOrders = db.purchaseOrders || [];
    const vendorBills = db.vendorBills || [];
    const vendorPayments = db.vendorPayments || [];
    return vendors.map((vendor: any) => {
        const vendorPOs = purchaseOrders.filter((po: any) => po.vendor_id === vendor.id);
        const vendorBillsForVendor = vendorBills.filter((b: any) => b.vendor_id === vendor.id);
        const vendorPaymentsForVendor = vendorPayments.filter((p: any) => p.vendor_id === vendor.id);
        const totalPoValue = vendorPOs.reduce((n: number, po: any) => n + (po.total_amount || 0), 0);
        const totalBilled = vendorBillsForVendor.reduce((n: number, b: any) => n + (b.total_amount || b.amount || 0), 0);
        const totalPaid = vendorPaymentsForVendor.reduce((n: number, p: any) => n + (p.amount || 0), 0);
        const outstanding = Math.max(0, totalBilled - totalPaid);
        // On-time delivery: POs where actual_delivery <= expected_delivery
        const deliveredPOs = vendorPOs.filter((po: any) => po.actual_delivery && po.expected_delivery);
        const onTimeDeliveries = deliveredPOs.filter((po: any) => po.actual_delivery! <= po.expected_delivery!).length;
        const onTimePct = deliveredPOs.length > 0 ? Math.round((onTimeDeliveries / deliveredPOs.length) * 100) : (vendor.on_time_pct || 0);
        return {
            vendor_id: vendor.id,
            vendor_name: vendor.name,
            city: vendor.city,
            category: vendor.category,
            reliability_score: vendor.reliability_score,
            on_time_pct: vendor.on_time_pct,
            total_po_value: totalPoValue,
            po_count: vendorPOs.length,
            total_billed: totalBilled,
            total_paid: totalPaid,
            outstanding,
            on_time_delivery_pct: onTimePct,
            rating: vendor.rating,
        };
    }).sort((a: VendorPerf, b: VendorPerf) => b.total_po_value - a.total_po_value);
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

export function VendorPerformanceModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const recomputeVendorPerformance = useRDashStore((s) => s.recomputeVendorPerformance);
    const vendors = React.useMemo(() => computeVendorPerformance(db), [db]);
    // J: Refresh all vendor scores. Best-effort per-vendor — never abort the
    // whole batch on a single failure.
    const handleRefreshAll = () => {
        let success = 0;
        let failed = 0;
        for (const v of vendors) {
            try { recomputeVendorPerformance(v.vendor_id); success++; }
            catch (err) { console.warn("[VendorPerformance] recompute failed", err); failed++; }
        }
        toast.success(`Recomputed ${success} vendor performance score${success === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}.`);
    };
    const handleRefreshOne = (vendorId: string, name: string) => {
        try {
            recomputeVendorPerformance(vendorId);
            toast.success(`Recomputed performance score for ${name}.`);
        }
        catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not recompute score.");
        }
    };
    const totals = React.useMemo(() => ({
        poValue: vendors.reduce((n, v) => n + v.total_po_value, 0),
        billed: vendors.reduce((n, v) => n + v.total_billed, 0),
        paid: vendors.reduce((n, v) => n + v.total_paid, 0),
        outstanding: vendors.reduce((n, v) => n + v.outstanding, 0),
        avgOnTime: vendors.length > 0 ? Math.round(vendors.reduce((n, v) => n + (v.on_time_delivery_pct || 0), 0) / vendors.length) : 0,
        avgReliability: vendors.length > 0 ? Math.round(vendors.reduce((n, v) => n + (v.reliability_score || 0), 0) / vendors.length) : 0,
        avgRating: vendors.length > 0 ? Math.round(vendors.reduce((n, v) => n + (v.rating || 0), 0) / vendors.length) : 0,
    }), [vendors]);

    // CRON-9: Radar chart data for top 5 vendors
    const radarData = React.useMemo(() => {
        const top5 = [...vendors].sort((a, b) => b.total_po_value - a.total_po_value).slice(0, 5);
        return top5.map((v) => ({
            vendor: v.vendor_name.length > 12 ? v.vendor_name.slice(0, 10) + "…" : v.vendor_name,
            "On-Time": v.on_time_delivery_pct || 0,
            "Reliability": v.reliability_score || 0,
            "Rating": (v.rating || 0) * 20, // scale 0-5 to 0-100
        }));
    }, [vendors]);

    return (<div className="flex flex-col gap-5">
      {/* CRON-9: Vendor performance radar chart */}
      {radarData.length > 0 && (
        <div className="rounded-[var(--panel-radius)] border border-border bg-gradient-to-br from-card to-muted/10 p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold">Performance Comparison</h3>
              <p className="text-[10px] text-muted-foreground">Top 5 vendors by PO value · On-Time %, Reliability, Rating</p>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                <PolarGrid stroke="var(--border, #e5e7eb)" strokeOpacity={0.4} />
                <PolarAngleAxis dataKey="vendor" tick={{ fontSize: 10, fill: "var(--muted-foreground, #71717a)" }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "var(--muted-foreground, #71717a)" }} strokeOpacity={0.2} />
                <Radar name="On-Time" dataKey="On-Time" stroke="var(--success, #22c55e)" fill="var(--success, #22c55e)" fillOpacity={0.15} animationDuration={600} />
                <Radar name="Reliability" dataKey="Reliability" stroke="var(--primary, #6366f1)" fill="var(--primary, #6366f1)" fillOpacity={0.15} animationDuration={800} />
                <Radar name="Rating" dataKey="Rating" stroke="var(--warning, #f59e0b)" fill="var(--warning, #f59e0b)" fillOpacity={0.15} animationDuration={1000} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)" }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-warning to-warning/80 text-warning-foreground shadow-md shadow-warning/20">
            <Trophy className="h-4 w-4"/>
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Vendor Performance</h2>
            <p className="text-xs text-muted-foreground">Leaderboard ranked by total PO value — reliability, on-time delivery, and payment status</p>
          </div>
        </div>
        {/* J: Refresh score button — recomputes every vendor's reliability/on-time/rating
            from actual GRN + bill performance and writes the values back to the master. */}
        <Button size="sm" variant="outline" onClick={handleRefreshAll} disabled={!vendors.length}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5"/> Refresh all scores
        </Button>
      </div>

      {/* Summary cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary/80"><Package className="h-4 w-4"/>Total PO Value</div>
          <p className="mt-1 text-lg font-bold text-foreground">{formatINRShort(totals.poValue)}</p>
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
          <h3 className="flex items-center gap-2 text-sm font-bold"><Trophy className="h-4 w-4 text-warning"/>Vendor Leaderboard</h3>
          <p className="text-xs text-muted-foreground">Ranked by total PO value · click a vendor to open detail</p>
        </div>
        {vendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground/30"/>
            <p className="mt-2 text-sm text-muted-foreground">No vendors found. Add vendors in Master Setup.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {vendors.map((v, i) => {
                const rank = rankBadge(i);
                const relTone = scoreTone(v.reliability_score);
                const onTimeTone = scoreTone(v.on_time_delivery_pct);
                const hasActivity = v.po_count > 0;
                return (
                  <div key={v.vendor_id} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-all hover:bg-muted/20", !hasActivity && "opacity-60")}>
                    <button type="button" onClick={() => openDetail("vendor" as any, v.vendor_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      {/* Rank badge */}
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold", rank.className)}>{rank.icon}</span>
                      {/* Vendor info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold text-foreground">{v.vendor_name}</p>
                          {v.category && <span className="hidden shrink-0 rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground sm:inline">{v.category}</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                          {v.city && <span>{v.city}</span>}
                          <span>{v.po_count} POs · {formatINRShort(v.total_po_value)}</span>
                          {v.total_billed > 0 && <span>Billed: {formatINRShort(v.total_billed)}</span>}
                          {v.outstanding > 0 && <span className="text-destructive">Outstanding: {formatINRShort(v.outstanding)}</span>}
                        </div>
                      </div>
                      {/* Scores */}
                      <div className="hidden shrink-0 items-center gap-4 sm:flex">
                        {/* Reliability */}
                        <div className="text-center">
                          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Reliability</p>
                          <p className={cn("text-sm font-bold", relTone === "success" ? "text-success" : relTone === "warning" ? "text-warning" : relTone === "destructive" ? "text-destructive" : "text-muted-foreground")}>{v.reliability_score ?? "—"}</p>
                        </div>
                        {/* On-time */}
                        <div className="text-center">
                          <p className="text-[10px] font-semibold uppercase text-muted-foreground">On-time</p>
                          <p className={cn("text-sm font-bold", onTimeTone === "success" ? "text-success" : onTimeTone === "warning" ? "text-warning" : onTimeTone === "destructive" ? "text-destructive" : "text-muted-foreground")}>{v.on_time_delivery_pct}%</p>
                        </div>
                        {/* Rating */}
                        {v.rating !== undefined && (
                          <div className="text-center">
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Rating</p>
                            <p className="flex items-center gap-0.5 text-sm font-bold text-warning"><Star className="h-3 w-3 fill-current"/>{v.rating}</p>
                          </div>
                        )}
                      </div>
                      {/* PO value */}
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-bold text-foreground">{formatINRShort(v.total_po_value)}</p>
                        <p className="text-[10px] text-muted-foreground">{v.po_count} POs</p>
                      </div>
                    </button>
                    {/* J: Per-vendor refresh button */}
                    <Button size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-[11px]" onClick={() => handleRefreshOne(v.vendor_id, v.vendor_name)} title="Recompute this vendor's score from GRN + bill performance">
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
