"use client";
import * as React from "react";
import { TrendingUp, TrendingDown, Wallet, ArrowRight, PiggyBank } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { cn } from "@/lib/utils";
import { formatINRShort, formatINR } from "@/lib/rdash/format";
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from "recharts";

interface SiteMargin {
  workOrderId: string;
  workOrderNo: string;
  title: string;
  customerName: string;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  progress: number;
}

/**
 * ProfitabilitySnapshot — a compact widget showing real-time margin
 * for active work orders. Surfaces margin health at a glance with
 * color-coded indicators (green >20%, amber 10-20%, red <10%).
 */
export function ProfitabilitySnapshot() {
  const db = useRDashStore((s) => s.db);
  const setActiveModule = useRDashStore((s) => s.setActiveModule);

  const sites = React.useMemo<SiteMargin[]>(() => {
    const activeWos = db.workOrders.filter(
      (w) => w.status === "in_progress" || w.status === "scheduled",
    );
    return activeWos.map((wo) => {
      const revenue = wo.value;
      const costLines = db.workOrderCostLines.filter((c) => c.work_order_id === wo.id);
      const cost = costLines.reduce((sum, c) => sum + c.amount, 0);
      const margin = revenue - cost;
      const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
      const customer = db.customers.find((c) => c.id === wo.customer_id);
      return {
        workOrderId: wo.id,
        workOrderNo: wo.work_order_no,
        title: wo.title,
        customerName: customer?.name || "—",
        revenue,
        cost,
        margin,
        marginPct,
        progress: wo.progress,
      };
    });
  }, [db.workOrders, db.workOrderCostLines, db.customers]);

  const totals = React.useMemo(() => {
    const totalRevenue = sites.reduce((s, x) => s + x.revenue, 0);
    const totalCost = sites.reduce((s, x) => s + x.cost, 0);
    const totalMargin = totalRevenue - totalCost;
    const blendedPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
    return { totalRevenue, totalCost, totalMargin, blendedPct };
  }, [sites]);

  if (sites.length === 0) return null;

  const marginTone = (pct: number) =>
    pct >= 20 ? "text-success" : pct >= 10 ? "text-warning" : "text-destructive";
  const marginBg = (pct: number) =>
    pct >= 20 ? "bg-success/10 ring-success/20" : pct >= 10 ? "bg-warning/10 ring-warning/20" : "bg-destructive/10 ring-destructive/20";

  return (
    <section aria-label="Profitability snapshot" className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-muted/40 to-muted/10 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <PiggyBank className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold tracking-tight text-foreground">Site Profitability</h3>
            <p className="text-[11px] text-muted-foreground">Real-time margin for active work orders</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveModule("profitability")}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Details <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* CRON-6: Animated margin gauge + summary tiles */}
      <div className="flex items-center gap-4 border-b border-border bg-gradient-to-br from-muted/20 to-transparent px-4 py-3">
        {/* Radial margin gauge */}
        <div className="relative h-20 w-20 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              innerRadius="70%"
              outerRadius="100%"
              data={[{ value: Math.min(100, Math.max(0, totals.blendedPct)), fill: totals.blendedPct >= 20 ? "var(--success, #22c55e)" : totals.blendedPct >= 10 ? "var(--warning, #f59e0b)" : "var(--destructive, #ef4444)" }]}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar background={{ fill: "var(--muted, #e5e7eb)" }} dataKey="value" cornerRadius={10} animationDuration={800} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-sm font-bold tabular-nums", marginTone(totals.blendedPct))}>{totals.blendedPct.toFixed(0)}%</span>
            <span className="text-[8px] font-medium uppercase text-muted-foreground">margin</span>
          </div>
        </div>
        {/* Summary tiles */}
        <div className="grid flex-1 grid-cols-3 gap-px rounded-lg border border-border bg-border">
        <div className="bg-card px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Wallet className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Revenue</span>
          </div>
          <p className="rd-tabular mt-1 text-sm font-bold text-foreground">{formatINRShort(totals.totalRevenue)}</p>
        </div>
        <div className="bg-card px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3 text-destructive" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cost</span>
          </div>
          <p className="rd-tabular mt-1 text-sm font-bold text-foreground">{formatINRShort(totals.totalCost)}</p>
        </div>
        <div className="bg-card px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp className={cn("h-3 w-3", marginTone(totals.blendedPct))} />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Margin</span>
          </div>
          <p className={cn("rd-tabular mt-1 text-sm font-bold", marginTone(totals.blendedPct))}>
            {formatINRShort(totals.totalMargin)}
            <span className="ml-1 text-[10px] font-medium">({totals.blendedPct.toFixed(1)}%)</span>
          </p>
        </div>
        </div>
      </div>

      {/* Site list */}
      <div className="max-h-64 overflow-y-auto rd-scroll">
        {sites.map((site) => (
          <button
            key={site.workOrderId}
            type="button"
            onClick={() => setActiveModule("profitability")}
            className="group flex w-full items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-semibold text-foreground">{site.title}</p>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{site.workOrderNo}</span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{site.customerName} · {site.progress}% complete</p>
              {/* Progress bar */}
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", site.progress >= 80 ? "bg-success" : site.progress >= 40 ? "bg-primary" : "bg-warning")}
                  style={{ width: `${Math.min(100, site.progress)}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="rd-tabular text-xs font-bold text-foreground">{formatINR(site.margin)}</p>
              <span className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ring-1", marginBg(site.marginPct), marginTone(site.marginPct))}>
                {site.marginPct.toFixed(0)}%
              </span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </button>
        ))}
      </div>
    </section>
  );
}
