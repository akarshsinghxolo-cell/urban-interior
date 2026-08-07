"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { MetricCard } from "../primitives";
import { formatINR } from "@/lib/rdash/format";
import {
    articleVendorRateAverage,
    formatRateWithUnit,
} from "@/lib/rdash/vendor-rate-average";
import { ArticleVendorAssetLinks } from "../OperationalMediaPanel";
import { Search, Package, Building2, TrendingUp, TrendingDown, Star, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { QuotationItem } from "@/lib/rdash/types";

interface RateRow {
    id: string;
    vendorRateId?: string;
    articleId?: string;
    vendorId?: string;
    variantId?: string;
    articleName: string;
    categoryName?: string;
    workRequiredName?: string;
    unitName?: string;
    baseRate?: number;
    vendorName: string;
    hasVendorRate: boolean;
    vendorCity?: string;
    vendorRate: number;
    rawRate?: number;
    rawUnitName?: string;
    rateSourceLabel?: string;
    conversionError?: string;
    diffFromBase?: number;
    diffPct?: number;
    reliability?: number;
    onTimePct?: number;
}

function percentage(value: number): string {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

export function RateFinderModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const updateQuotation = useRDashStore((s) => s.updateQuotation);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const logAudit = useRDashStore((s) => s.logAudit);
    const currentUser = useRDashStore((s) => s.currentUser);
    const [q, setQ] = React.useState("");
    const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
    const [sortBy, setSortBy] = React.useState<"rate" | "reliability" | "diff">("rate");
    const [useInQuotation, setUseInQuotation] = React.useState<RateRow | null>(null);

    const rows: RateRow[] = React.useMemo(() => {
        const out: RateRow[] = [];
        const unitById = new Map(db.master.units.map((unit) => [unit.id, unit]));
        const workById = new Map(db.master.workSubcategories.map((work) => [work.id, work]));
        const categoryById = new Map(db.master.workCategories.map((category) => [category.id, category]));

        for (const article of db.master.articles) {
            const scopes = db.master.subcategoryArticleMap.filter((scope) => scope.article_id === article.id);
            const scope = scopes[0];
            const work = scope ? workById.get(scope.work_required_id) : undefined;
            const category = work
                ? categoryById.get(work.category_id)
                : article.category_id
                    ? categoryById.get(article.category_id)
                    : undefined;
            const defaultUnitId = article.default_unit_id || article.unit_id || scope?.unit_id;
            const defaultUnit = unitById.get(defaultUnitId || "")?.symbol || defaultUnitId || "unit";
            const baseRate = article.base_rate ?? scope?.reference_rate;
            const summary = articleVendorRateAverage(db, article.id);

            if (!summary.selected.length) {
                out.push({
                    id: `base-${article.id}`,
                    articleId: article.id,
                    articleName: article.name,
                    categoryName: category?.name,
                    workRequiredName: scopes.length > 1 ? `${scopes.length} sub categories` : work?.name,
                    unitName: defaultUnit,
                    baseRate,
                    vendorName: "— No vendor price",
                    vendorRate: Number.NaN,
                    hasVendorRate: false,
                });
                continue;
            }

            for (const selected of summary.selected) {
                const vendor = db.master.vendors.find((entry) => entry.id === selected.vendorId);
                const vendorRate = selected.normalizedLandedRate ?? Number.NaN;
                const diff = baseRate != null && Number.isFinite(vendorRate) ? vendorRate - baseRate : undefined;
                const diffPct = baseRate && diff != null ? (diff / baseRate) * 100 : undefined;
                const rawUnit = unitById.get(selected.rawUnitId || "")?.symbol || selected.rawUnitId || defaultUnit;
                out.push({
                    id: `${article.id}:${selected.vendorId}`,
                    vendorRateId: selected.vendorRateId,
                    articleId: article.id,
                    vendorId: selected.vendorId,
                    variantId: selected.variantId,
                    articleName: article.name,
                    categoryName: category?.name,
                    workRequiredName: scopes.length > 1 ? `${scopes.length} sub categories` : work?.name,
                    unitName: defaultUnit,
                    baseRate,
                    vendorName: vendor?.name || "Unknown vendor",
                    vendorCity: vendor?.city,
                    vendorRate,
                    rawRate: selected.rawRate,
                    rawUnitName: rawUnit,
                    rateSourceLabel: selected.active ? "Latest active" : "Latest available fallback",
                    conversionError: selected.conversionError,
                    diffFromBase: diff,
                    diffPct,
                    reliability: vendor?.reliability_score,
                    onTimePct: vendor?.on_time_pct,
                    hasVendorRate: true,
                });
            }
        }
        return out;
    }, [db]);

    const filtered = React.useMemo(() => {
        let list = rows;
        if (categoryFilter !== "all") list = list.filter((row) => row.categoryName === categoryFilter);
        if (q.trim()) {
            const query = q.toLowerCase();
            list = list.filter((row) => row.articleName.toLowerCase().includes(query)
                || row.vendorName.toLowerCase().includes(query)
                || (row.categoryName || "").toLowerCase().includes(query));
        }
        return [...list].sort((left, right) => {
            if (sortBy === "rate") {
                const leftRate = Number.isFinite(left.vendorRate) ? left.vendorRate : Number.POSITIVE_INFINITY;
                const rightRate = Number.isFinite(right.vendorRate) ? right.vendorRate : Number.POSITIVE_INFINITY;
                return leftRate - rightRate;
            }
            if (sortBy === "reliability") return (right.reliability || 0) - (left.reliability || 0);
            return (left.diffPct ?? Number.POSITIVE_INFINITY) - (right.diffPct ?? Number.POSITIVE_INFINITY);
        });
    }, [rows, q, categoryFilter, sortBy]);

    const categories = Array.from(new Set(rows.map((row) => row.categoryName).filter(Boolean))) as string[];
    const vendorRows = rows.filter((row) => row.hasVendorRate && Number.isFinite(row.vendorRate));
    const filteredVendorRows = filtered.filter((row) => row.hasVendorRate && Number.isFinite(row.vendorRate));
    const avgRate = vendorRows.length ? vendorRows.reduce((sum, row) => sum + row.vendorRate, 0) / vendorRows.length : 0;
    const bestRate = filteredVendorRows.length ? Math.min(...filteredVendorRows.map((row) => row.vendorRate)) : undefined;
    const bestSavings = filteredVendorRows.length ? filteredVendorRows.reduce((best, row) => {
        if (row.diffPct != null && row.diffPct < (best?.diffPct ?? 0)) return row;
        return best;
    }, filteredVendorRows[0]) : null;

    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Search className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Rate Finder</h2>
            <p className="text-xs text-muted-foreground">One current quoted rate per Vendor, normalized to each Article&apos;s default unit</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Vendor prices" value={vendorRows.length} tone="primary" icon={<Package className="h-4 w-4"/>}/>
        <MetricCard label="Articles" value={db.master.articles.length} tone="default" icon={<Package className="h-4 w-4"/>}/>
        <MetricCard label="Vendors" value={db.master.vendors.length} tone="default" icon={<Building2 className="h-4 w-4"/>}/>
        <MetricCard label="Avg quoted rate" value={formatRateWithUnit(avgRate)} tone="success" icon={<TrendingUp className="h-4 w-4"/>}/>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64 max-w-full">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search article, vendor, category…" className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2"/>
        </div>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
          <option value="all">All categories</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
          <option value="rate">Sort: Lowest quoted rate</option>
          <option value="reliability">Sort: Best reliability</option>
          <option value="diff">Sort: Biggest savings</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} article/vendor rows</span>
      </div>

      {bestSavings && bestSavings.diffPct != null && bestSavings.diffPct < 0 && (<div className="rounded-[var(--panel-radius)] border border-success/25 bg-success/[0.06] p-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-success"/>
            <p className="text-sm font-semibold text-success">Best saving: {bestSavings.articleName} from {bestSavings.vendorName} — {percentage(Math.abs(bestSavings.diffPct))}% below base rate (saves {formatRateWithUnit(Math.abs(bestSavings.diffFromBase || 0), bestSavings.unitName)})</p>
          </div>
        </div>)}

      <div className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.6fr_0.6fr_0.7fr] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>Article</span><span>Vendor</span><span className="text-right">Base rate</span><span className="text-right">Vendor quoted rate</span><span className="text-center">Diff</span><span className="text-center">Reliability</span><span className="text-center">Use</span>
        </div>
        {filtered.length === 0 ? (<div className="px-3 py-8 text-center text-xs text-muted-foreground">No rates found. Try a different search.</div>) : filtered.map((row) => {
            const usable = row.hasVendorRate && Number.isFinite(row.vendorRate);
            const isBest = usable && row.vendorRate === bestRate;
            const canOpen = Boolean(row.vendorRateId);
            return (<div key={row.id} role={canOpen ? "button" : undefined} tabIndex={canOpen ? 0 : undefined} onClick={() => { if (row.vendorRateId) openDetail("vendorRate" as any, row.vendorRateId); }} onKeyDown={(event) => { if (row.vendorRateId && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openDetail("vendorRate" as any, row.vendorRateId); } }} className={cn("grid w-full grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.6fr_0.6fr_0.7fr] items-center gap-2 border-b border-border px-3 py-2.5 text-left text-xs last:border-0", canOpen && "hover:bg-accent/30", isBest && "bg-success/[0.04]")}>
              <div className="min-w-0"><p className="truncate font-medium text-foreground">{row.articleName}</p><p className="text-[10px] text-muted-foreground">{row.categoryName}{row.workRequiredName ? ` · ${row.workRequiredName}` : ""} · default {row.unitName || "unit"}</p>{row.articleId ? <div className="mt-1"><ArticleVendorAssetLinks articleId={row.articleId} vendorId={row.vendorId} variantId={row.variantId} title="Catalogues"/></div> : null}</div>
              <div className="min-w-0"><p className="truncate font-medium">{row.vendorName}</p><p className="text-[10px] text-muted-foreground">{row.vendorCity || row.rateSourceLabel || ""}</p>{row.rawRate != null ? <p className="text-[10px] text-muted-foreground">Quoted {formatRateWithUnit(row.rawRate, row.rawUnitName)} · {row.rateSourceLabel}</p> : null}</div>
              <span className="text-right font-mono text-muted-foreground">{formatRateWithUnit(row.baseRate, row.unitName)}</span>
              <span className={cn("text-right font-mono font-semibold", isBest ? "text-success" : "text-foreground", row.conversionError && "text-warning")} title={row.conversionError}>{usable ? formatRateWithUnit(row.vendorRate, row.unitName) : row.conversionError ? "Conversion required" : "—"}</span>
              <span className="text-center">{row.diffPct != null ? <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", row.diffPct < 0 ? "bg-success/10 text-success" : row.diffPct > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{row.diffPct < 0 ? <TrendingDown className="h-2.5 w-2.5"/> : row.diffPct > 0 ? <TrendingUp className="h-2.5 w-2.5"/> : null}{row.diffPct > 0 ? "+" : ""}{percentage(row.diffPct)}%</span> : "—"}</span>
              <span className="text-center">{row.reliability != null ? <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", row.reliability >= 85 ? "bg-success/10 text-success" : row.reliability >= 70 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive")}><Star className="h-2.5 w-2.5"/>{row.reliability}</span> : "—"}</span>
              <span className="text-center">{usable ? <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={(event) => { event.stopPropagation(); setUseInQuotation(row); }}><ArrowRight className="mr-1 h-3 w-3"/> Use in quote</Button> : <span className="text-[10px] text-muted-foreground/60">—</span>}</span>
            </div>);
        })}
      </div>

      {filtered.length > 0 && <p className="text-[11px] text-muted-foreground">Base rate is the exact simple average of one selected normalized quoted rate per Vendor. The latest active rate is preferred; otherwise that Vendor&apos;s latest available rate is used.</p>}

      {useInQuotation && <UseInQuotationDialog rate={useInQuotation} db={db} onClose={() => setUseInQuotation(null)} onApply={(quotationId, lineId, newRate) => {
          const quotation = db.quotations.find((entry) => entry.id === quotationId);
          if (!quotation) return toast.error("Quotation not found.");
          const line = quotation.scope_lines.find((entry) => entry.id === lineId);
          if (!line) return toast.error("Select a valid quotation line.");
          const nextLines: QuotationItem[] = quotation.scope_lines.map((entry) => entry.id === lineId ? { ...entry, rate: newRate, amount: entry.quantity * newRate } : entry);
          try {
              updateQuotation(quotationId, { scope_lines: nextLines, items: nextLines });
              const actor = currentUser();
              logAudit({ actor: actor.name, actor_role: actor.role, action: `Rate Finder: applied ${useInQuotation.vendorName} quoted rate ${formatRateWithUnit(newRate, useInQuotation.unitName)} to line "${line.title}" on ${quotation.quotation_no}`, entity_type: "quotation", entity_id: quotationId, entity_label: quotation.quotation_no, kind: "update", source_module: "rateFinder", changes: [{ id: `ch-${Date.now()}`, field: "rate", before: line.rate, after: newRate }] });
              toast.success(`Rate applied to ${quotation.quotation_no} → ${line.title}`);
              setUseInQuotation(null);
          } catch (error) { toast.error(error instanceof Error ? error.message : "Could not apply rate"); }
      }} onOpenQuotations={() => { setUseInQuotation(null); setActiveModule("quotations"); }}/>} 
    </div>);
}

// H: "Use in quotation" dialog — pick a draft quotation + line and apply the Vendor quoted rate.
function UseInQuotationDialog({ rate, db, onClose, onApply, onOpenQuotations }: {
    rate: RateRow;
    db: import("@/lib/rdash/types").RDashDatabase;
    onClose: () => void;
    onApply: (quotationId: string, lineId: string, newRate: number) => void;
    onOpenQuotations: () => void;
}) {
    const draftQuotations = db.quotations.filter((q) => q.status === "draft");
    const [quotationId, setQuotationId] = React.useState<string>(draftQuotations[0]?.id || "");
    const articleId = rate.articleId;
    const { selectedQuotation, matchingLines } = React.useMemo(() => {
        const sq = draftQuotations.find((q) => q.id === quotationId);
        if (!sq) return { selectedQuotation: undefined, matchingLines: [] as QuotationItem[] };
        const byArticle = sq.scope_lines.filter((l) => articleId && l.article_id === articleId);
        const lines = byArticle.length ? byArticle : sq.scope_lines;
        return { selectedQuotation: sq, matchingLines: lines };
    }, [draftQuotations, quotationId, articleId]);
    const [lineId, setLineId] = React.useState<string>(matchingLines[0]?.id || "");
    React.useEffect(() => {
        if (matchingLines.length && !matchingLines.some((l) => l.id === lineId)) setLineId(matchingLines[0].id);
    }, [matchingLines, lineId]);
    const hasDrafts = draftQuotations.length > 0;
    return (<Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowRight className="h-4 w-4 text-primary"/> Use Vendor rate in quotation
          </DialogTitle>
          <DialogDescription className="text-xs">Apply <strong>{rate.vendorName}</strong>&apos;s quoted rate of <strong>{formatRateWithUnit(rate.vendorRate, rate.unitName)}</strong> for &quot;{rate.articleName}&quot; to a draft quotation line.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4 rd-scroll">
          {!hasDrafts ? (<div className="rounded-md border border-warning/40 bg-warning/[0.06] p-3 text-xs text-foreground/80">
              <p className="font-semibold text-warning">No draft quotations available.</p>
              <p className="mt-1">Open the Quotations module to create a new draft, or revise an existing quotation to make it editable.</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={onOpenQuotations}>Open Quotations →</Button>
            </div>) : (<>
              <div>
                <label className="text-[10px] font-semibold uppercase text-muted-foreground">Quotation (draft only)</label>
                <select value={quotationId} onChange={(e) => setQuotationId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                  {draftQuotations.map((q) => <option key={q.id} value={q.id}>{q.quotation_no} · {q.customer_name || "Customer"} · {q.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-muted-foreground">Line item {rate.articleId ? "(matches selected article)" : ""}</label>
                {matchingLines.length === 0 ? (<p className="mt-1 text-xs text-muted-foreground">This quotation has no scope lines yet. Add a line first.</p>) : (<select value={lineId} onChange={(e) => setLineId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
                  {matchingLines.map((l) => <option key={l.id} value={l.id}>{l.title} · qty {l.quantity} · current rate {formatINR(l.rate)}</option>)}
                </select>)}
              </div>
              {selectedQuotation && lineId && (() => {
                  const line = selectedQuotation.scope_lines.find((l) => l.id === lineId);
                  if (!line) return null;
                  const diff = rate.vendorRate - line.rate;
                  const diffPct = line.rate > 0 ? Math.round((diff / line.rate) * 100) : 0;
                  return (<div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Current rate</span><span className="font-mono font-semibold">{formatINR(line.rate)}</span></div>
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">New rate (Vendor)</span><span className="font-mono font-semibold text-primary">{formatRateWithUnit(rate.vendorRate, rate.unitName)}</span></div>
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Change</span><span className={cn("font-mono font-semibold", diff < 0 ? "text-success" : diff > 0 ? "text-destructive" : "text-muted-foreground")}>{diff > 0 ? "+" : ""}{formatINR(diff)} ({diffPct > 0 ? "+" : ""}{diffPct}%)</span></div>
                    <div className="mt-1 flex items-center justify-between border-t border-border pt-1"><span className="text-muted-foreground">New line amount</span><span className="font-mono font-bold">{formatINR(Math.round(line.quantity * rate.vendorRate))}</span></div>
                  </div>);
              })()}
            </>)}
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!hasDrafts || !lineId} onClick={() => onApply(quotationId, lineId, rate.vendorRate)}>
            <ArrowRight className="mr-1 h-3.5 w-3.5"/> Apply rate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}