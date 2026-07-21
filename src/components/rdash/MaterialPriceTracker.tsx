"use client";
import * as React from "react";
import { Package, TrendingUp, TrendingDown, Minus, ArrowRight, DollarSign, History } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/rdash/format";

interface PriceTrend {
  id: string;
  articleName: string;
  vendorName: string;
  currentRate: number;
  previousRate?: number;
  changePct: number;
  trend: "up" | "down" | "stable";
  unit?: string;
  brand?: string;
  lastUpdated?: string;
}

/**
 * MaterialPriceTracker — a widget showing vendor rate trends.
 * Surfaces materials with recent price changes, allowing managers
 * to spot cost increases before they impact project margins.
 */
export function MaterialPriceTracker() {
  const db = useRDashStore((s) => s.db);
  const setActiveModule = useRDashStore((s) => s.setActiveModule);

  const trends = React.useMemo<PriceTrend[]>(() => {
    const trends: PriceTrend[] = [];

    // From vendor rate histories (actual price changes)
    const byArticle = new Map<string, PriceTrend>();
    for (const h of db.master.vendorRateHistories) {
      const key = `${h.vendor_id}-${h.article_id}`;
      const vendor = db.master.vendors.find((v) => v.id === h.vendor_id);
      const existing = byArticle.get(key);
      const changePct = h.old_rate && h.old_rate > 0 ? ((h.new_rate - h.old_rate) / h.old_rate) * 100 : 0;
      if (!existing || (h.new_rate > existing.currentRate)) {
        byArticle.set(key, {
          id: h.id,
          articleName: h.article_name,
          vendorName: vendor?.name || "Unknown",
          currentRate: h.new_rate,
          previousRate: h.old_rate,
          changePct,
          trend: changePct > 1 ? "up" : changePct < -1 ? "down" : "stable",
          unit: h.unit_id,
          lastUpdated: h.created_at,
        });
      }
    }

    // Also include current vendor rates (even without history)
    for (const vr of db.master.vendorRates) {
      const vendor = db.master.vendors.find((v) => v.id === vr.vendor_id);
      const key = `${vr.vendor_id}-${vr.article_id}`;
      if (!byArticle.has(key)) {
        byArticle.set(key, {
          id: vr.id,
          articleName: vr.article_name,
          vendorName: vendor?.name || "Unknown",
          currentRate: vr.rate,
          changePct: 0,
          trend: "stable",
          unit: vr.unit_id,
          brand: vr.brand,
          lastUpdated: vr.updated_at,
        });
      }
    }

    // Convert to array and sort by absolute change (biggest changes first)
    trends.push(...byArticle.values());
    trends.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    return trends.slice(0, 10);
  }, [db.master.vendorRateHistories, db.master.vendorRates, db.master.vendors]);

  // Summary stats
  const stats = React.useMemo(() => {
    const up = trends.filter((t) => t.trend === "up").length;
    const down = trends.filter((t) => t.trend === "down").length;
    const stable = trends.filter((t) => t.trend === "stable").length;
    const avgChange = trends.length > 0 ? trends.reduce((s, t) => s + t.changePct, 0) / trends.length : 0;
    return { up, down, stable, avgChange };
  }, [trends]);

  const trendConfig = {
    up: { icon: <TrendingUp className="h-3 w-3" />, color: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/20", label: "↑" },
    down: { icon: <TrendingDown className="h-3 w-3" />, color: "text-success", bg: "bg-success/10", ring: "ring-success/20", label: "↓" },
    stable: { icon: <Minus className="h-3 w-3" />, color: "text-muted-foreground", bg: "bg-muted", ring: "ring-border", label: "→" },
  };

  return (
    <section aria-label="Material price tracker" className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-muted/40 to-muted/10 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
            <Package className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold tracking-tight text-foreground">Material Price Tracker</h3>
            <p className="text-[11px] text-muted-foreground">Vendor rate trends &amp; changes</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveModule("vendorRates")}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          All rates <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
        <div className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-destructive" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Up</span>
          </div>
          <p className="rd-tabular mt-0.5 text-xs font-bold text-destructive">{stats.up}</p>
        </div>
        <div className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-success" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Down</span>
          </div>
          <p className="rd-tabular mt-0.5 text-xs font-bold text-success">{stats.down}</p>
        </div>
        <div className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1">
            <Minus className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Stable</span>
          </div>
          <p className="rd-tabular mt-0.5 text-xs font-bold text-foreground">{stats.stable}</p>
        </div>
        <div className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1">
            <DollarSign className={cn("h-3 w-3", stats.avgChange > 0 ? "text-destructive" : stats.avgChange < 0 ? "text-success" : "text-muted-foreground")} />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Avg</span>
          </div>
          <p className={cn("rd-tabular mt-0.5 text-xs font-bold", stats.avgChange > 0 ? "text-destructive" : stats.avgChange < 0 ? "text-success" : "text-foreground")}>
            {stats.avgChange > 0 ? "+" : ""}{stats.avgChange.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Price list */}
      {trends.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs font-medium text-muted-foreground">No vendor rate data available</p>
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto rd-scroll">
          {trends.map((t) => {
            const cfg = trendConfig[t.trend];
            return (
              <div key={t.id} className="group flex items-center gap-3 border-b border-border/60 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/40">
                {/* Trend icon */}
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1", cfg.bg, cfg.color, cfg.ring)}>
                  {cfg.icon}
                </span>

                {/* Material info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-semibold text-foreground">{t.articleName}</p>
                    {t.brand && (
                      <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[8px] font-medium text-muted-foreground">{t.brand}</span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {t.vendorName}
                    {t.unit && <span className="text-muted-foreground/40"> · per {t.unit}</span>}
                  </p>
                </div>

                {/* Price + change */}
                <div className="shrink-0 text-right">
                  <p className="rd-tabular text-xs font-bold text-foreground">{formatINR(t.currentRate)}</p>
                  {t.previousRate !== undefined && t.previousRate > 0 && (
                    <div className="flex items-center justify-end gap-0.5">
                      <span className="text-[10px] text-muted-foreground line-through">{formatINR(t.previousRate)}</span>
                      <span className={cn("rd-tabular text-[10px] font-bold", cfg.color)}>
                        {t.changePct > 0 ? "+" : ""}{t.changePct.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
