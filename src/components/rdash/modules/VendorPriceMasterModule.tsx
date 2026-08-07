"use client";

import * as React from "react";
import { BadgeCheck, Download, Search, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRDashStore } from "@/lib/rdash/store";
import type { Master, VendorRate } from "@/lib/rdash/types";
import { applyVendorRateUpdates, createInitialVendorRate } from "@/lib/rdash/vendor-rate";
import { canonicalVendorCapabilities, vendorQuotedRate } from "@/lib/rdash/vendor-profile";
import { confirmDialog } from "../ConfirmDialog";
import { EmptyState, MetricCard, StatusBadge } from "../primitives";

type PriceDraft = {
  vendorId: string;
  articleId: string;
  variantId: string;
  rate: string;
};

const emptyDraft = (vendorId = ""): PriceDraft => ({ vendorId, articleId: "", variantId: "", rate: "" });
const now = () => new Date().toISOString();
const toRate = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
};

function csv(filename: string, rows: Array<Array<string | number>>) {
  const content = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function unitIdFor(master: Master, articleId: string, variantId?: string) {
  const variant = variantId ? master.articleVariants.find((row) => row.id === variantId && row.article_id === articleId) : undefined;
  const article = master.articles.find((row) => row.id === articleId);
  return variant?.unit_id || article?.default_unit_id || article?.unit_id;
}

function unitLabel(master: Master, articleId: string, variantId?: string) {
  const unitId = unitIdFor(master, articleId, variantId);
  const unit = master.units.find((row) => row.id === unitId);
  return unit ? `${unit.symbol} · ${unit.name}` : unitId || "Not configured";
}

function scopeForArticle(master: Master, articleId: string) {
  return master.subcategoryArticleMap.find((row) => row.article_id === articleId);
}

function canonicalStatusRate(rate: VendorRate, status: VendorRate["status"], timestamp: string): VendorRate {
  return {
    id: rate.id,
    vendor_id: rate.vendor_id,
    article_id: rate.article_id,
    article_name: rate.article_name,
    variant_id: rate.variant_id,
    rate: vendorQuotedRate(rate),
    status,
    created_at: rate.created_at || rate.updated_at || timestamp,
    updated_at: timestamp,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5 text-xs font-semibold"><span>{label}</span>{children}</label>;
}

export function VendorPriceMasterModule() {
  const db = useRDashStore((state) => state.db);
  const mutateMaster = useRDashStore((state) => state.mutateMaster);
  const master = db.master;
  const [draft, setDraft] = React.useState<PriceDraft>(() => emptyDraft(master.vendors[0]?.id || ""));
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!draft.vendorId && master.vendors[0]?.id) setDraft((current) => ({ ...current, vendorId: master.vendors[0].id }));
  }, [draft.vendorId, master.vendors]);

  const selectedVendor = master.vendors.find((row) => row.id === draft.vendorId);
  const selectedArticle = master.articles.find((row) => row.id === draft.articleId);
  const selectedScope = draft.articleId ? scopeForArticle(master, draft.articleId) : undefined;
  const variants = master.articleVariants.filter((row) => row.article_id === draft.articleId && row.enabled !== false);
  const capability = selectedVendor && draft.articleId
    ? canonicalVendorCapabilities(selectedVendor, db).find((row) => row.article_id === draft.articleId)
    : undefined;

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return master.vendorRates.filter((rate) => {
      const vendor = master.vendors.find((row) => row.id === rate.vendor_id);
      const article = master.articles.find((row) => row.id === rate.article_id);
      const variant = master.articleVariants.find((row) => row.id === rate.variant_id);
      return !needle || `${vendor?.name || ""} ${vendor?.city || ""} ${article?.name || rate.article_name} ${variant?.name || ""} ${rate.status || "active"}`.toLowerCase().includes(needle);
    });
  }, [master, query]);

  const cheapest = React.useMemo(() => {
    const best = new Map<string, VendorRate>();
    master.vendorRates.forEach((rate) => {
      if (rate.status && rate.status !== "active") return;
      const key = `${rate.article_id}:${rate.variant_id || "base"}`;
      const current = best.get(key);
      if (!current || vendorQuotedRate(rate) < vendorQuotedRate(current)) best.set(key, rate);
    });
    return new Set([...best.values()].map((rate) => rate.id));
  }, [master.vendorRates]);

  const addPrice = () => {
    const vendor = selectedVendor;
    if (!vendor) return toast.error("Select a Vendor.");
    if (!selectedArticle) return toast.error("Select an Article.");
    if (!selectedScope) return toast.error("This Article has no Work/Article scope mapping. Configure it in Article Master first.");
    const selectedVariant = draft.variantId ? master.articleVariants.find((row) => row.id === draft.variantId) : undefined;
    if (draft.variantId && selectedVariant?.article_id !== selectedArticle.id) return toast.error("Selected Variant does not belong to this Article.");
    if (!unitIdFor(master, selectedArticle.id, draft.variantId || undefined)) return toast.error("Configure the Article/Variant unit before adding a Vendor rate.");
    const amount = toRate(draft.rate);
    if (!amount) return toast.error("Enter a quoted rate greater than zero.");
    const duplicate = master.vendorRates.some((rate) => rate.vendor_id === vendor.id && rate.article_id === selectedArticle.id && (rate.variant_id || "") === (draft.variantId || ""));
    if (duplicate) return toast.error("This Vendor already has a rate for the same Article and Variant. Edit the existing row instead.");

    mutateMaster((current) => createInitialVendorRate(current, {
      vendorId: vendor.id,
      scope: selectedScope,
      articleName: selectedArticle.name,
      variantId: draft.variantId || undefined,
      unitId: unitIdFor(current, selectedArticle.id, draft.variantId || undefined),
      rate: amount,
      sourceType: "MANUAL",
      sourceNo: "Vendor Price Matrix",
      changedBy: useRDashStore.getState().currentUser().name,
    }));
    setDraft((current) => emptyDraft(current.vendorId));
    toast.success(`Quoted rate saved for ${selectedArticle.name}.`);
  };

  const editAmount = (rate: VendorRate, rawValue: string) => {
    const amount = toRate(rawValue);
    if (!amount || amount === vendorQuotedRate(rate)) return;
    const scope = scopeForArticle(master, rate.article_id);
    if (!scope) return toast.error("Article scope mapping is missing; rate could not be updated.");
    const actor = useRDashStore.getState().currentUser();
    const before = vendorQuotedRate(rate);
    mutateMaster((current) => applyVendorRateUpdates(current, [{
      vendorId: rate.vendor_id,
      scope,
      articleName: master.articles.find((row) => row.id === rate.article_id)?.name || rate.article_name,
      variantId: rate.variant_id,
      unitId: unitIdFor(current, rate.article_id, rate.variant_id),
      rate: amount,
      sourceType: "MANUAL",
      sourceId: rate.id,
      sourceNo: "Vendor Price Matrix",
      changedBy: actor.name,
    }]));
    useRDashStore.getState().logAudit({
      actor: actor.name,
      actor_role: actor.role,
      action: `Vendor quoted rate edited: ${rate.article_name}`,
      entity_type: "vendorRate",
      entity_id: rate.id,
      entity_label: rate.article_name,
      kind: "update",
      source_module: "vendorRates",
      reason: `Quoted rate changed by ${actor.name}`,
      changes: [{ field: "rate", before, after: amount }],
    });
  };

  const updateStatus = (rate: VendorRate, status: "active" | "inactive") => {
    const timestamp = now();
    mutateMaster((current) => ({
      ...current,
      vendorRates: current.vendorRates.map((row) => row.id === rate.id ? canonicalStatusRate(row, status, timestamp) : row),
    }));
  };

  const deleteRate = async (rateId: string) => {
    const ok = await confirmDialog({ title: "Delete Vendor Rate", description: "This current quoted rate will be removed. Existing Vendor Rate History remains available for audit.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    mutateMaster((current) => ({ ...current, vendorRates: current.vendorRates.filter((rate) => rate.id !== rateId) }));
    toast.success("Vendor rate removed.");
  };

  const exportRows = () => {
    const data: Array<Array<string | number>> = [["Vendor", "City", "Article", "Variant", "Derived unit", "Quoted rate", "Status", "Updated"]];
    master.vendorRates.forEach((rate) => {
      const vendor = master.vendors.find((row) => row.id === rate.vendor_id);
      const article = master.articles.find((row) => row.id === rate.article_id);
      const variant = master.articleVariants.find((row) => row.id === rate.variant_id);
      data.push([vendor?.name || "", vendor?.city || "", article?.name || rate.article_name, variant?.name || "Base Article", unitLabel(master, rate.article_id, rate.variant_id), vendorQuotedRate(rate), rate.status || "active", rate.updated_at || ""]);
    });
    csv("urban-castle-vendor-rates.csv", data);
    toast.success("Canonical Vendor rate matrix exported.");
  };

  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Truck className="h-5 w-5" /></span><div><h2 className="text-lg font-bold tracking-tight">Vendor Price Matrix</h2><p className="text-xs text-muted-foreground">Live rate = Vendor + Article + optional Variant + quoted rate + status. Unit, GST and conversion stay in Article/Variant Master; availability, brand, lead time and MOQ stay in Vendor capability.</p></div></div><Button size="sm" variant="outline" onClick={exportRows}><Download className="mr-1 h-3.5 w-3.5" />Export</Button></div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard label="Vendors" value={master.vendors.length} tone="primary" icon={<Truck className="h-4 w-4" />} /><MetricCard label="Current rates" value={master.vendorRates.length} tone="success" icon={<BadgeCheck className="h-4 w-4" />} /><MetricCard label="Rate history" value={master.vendorRateHistories.length} tone="warning" /><MetricCard label="Unpriced articles" value={Math.max(0, master.articles.length - new Set(master.vendorRates.filter((row) => !row.status || row.status === "active").map((row) => row.article_id)).size)} tone="default" icon={<Search className="h-4 w-4" />} /></div>

    <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><div><h3 className="text-sm font-bold">Add quoted rate</h3><p className="mt-0.5 text-xs text-muted-foreground">No validity dates and no duplicated Unit/GST/commercial calculation fields are stored here.</p></div><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Field label="Vendor"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.vendorId} onChange={(event) => setDraft((current) => ({ ...current, vendorId: event.target.value }))}><option value="">Select Vendor</option>{master.vendors.filter((vendor) => !["inactive", "blacklisted"].includes(vendor.status || "")).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.city || "No city"}</option>)}</select></Field><Field label="Article"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.articleId} onChange={(event) => setDraft((current) => ({ ...current, articleId: event.target.value, variantId: "" }))}><option value="">Select Article</option>{master.articles.map((article) => <option key={article.id} value={article.id}>{article.name}</option>)}</select></Field><Field label="Variant"><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" disabled={!draft.articleId} value={draft.variantId} onChange={(event) => setDraft((current) => ({ ...current, variantId: event.target.value }))}><option value="">Base Article</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select></Field><Field label="Derived unit"><div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-semibold">{draft.articleId ? unitLabel(master, draft.articleId, draft.variantId || undefined) : "Select Article"}</div></Field><Field label="Quoted rate"><div className="flex gap-2"><Input type="number" min="0" step="0.01" value={draft.rate} onChange={(event) => setDraft((current) => ({ ...current, rate: event.target.value }))} /><Button type="button" onClick={addPrice}>Add</Button></div></Field></div>{selectedVendor && selectedArticle && <div className="mt-3 rounded-lg border border-border bg-muted/15 px-3 py-2 text-[11px] text-muted-foreground">Vendor capability: {capability ? <><strong className="text-foreground">matched</strong>{capability.brand ? ` · ${capability.brand}` : ""}{capability.availability ? ` · ${capability.availability.replaceAll("_", " ")}` : ""}{capability.typical_lead_time_days != null ? ` · ${capability.typical_lead_time_days} day lead` : ""}{capability.moq != null ? ` · MOQ ${capability.moq}` : ""}</> : <><strong className="text-warning">not recorded</strong> · rate can still be captured, but add the Article to Vendor supply capability for better recommendation quality.</>}</div>}</section>

    <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Current quoted rates</h3><p className="text-xs text-muted-foreground">Historical source and changes remain in Vendor Rate History; this table contains only current values.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Vendor / Article / Variant" className="pl-8" /></div></div>{rows.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[920px] text-left text-xs"><thead><tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground"><th className="px-2 py-2">Vendor</th><th className="px-2 py-2">Article</th><th className="px-2 py-2">Variant</th><th className="px-2 py-2">Derived unit</th><th className="px-2 py-2">Quoted rate</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Updated</th><th className="px-2 py-2"></th></tr></thead><tbody>{rows.map((rate) => { const vendor = master.vendors.find((row) => row.id === rate.vendor_id); const article = master.articles.find((row) => row.id === rate.article_id); const variant = master.articleVariants.find((row) => row.id === rate.variant_id); const isCheapest = cheapest.has(rate.id); return <tr key={rate.id} className="border-b border-border/60 last:border-0"><td className="px-2 py-2"><div className="font-semibold">{vendor?.name || rate.vendor_id}</div><div className="text-[10px] text-muted-foreground">{vendor?.city || ""}</div></td><td className="px-2 py-2 font-semibold">{article?.name || rate.article_name}</td><td className="px-2 py-2">{variant?.name || "Base Article"}</td><td className="px-2 py-2 text-muted-foreground">{unitLabel(master, rate.article_id, rate.variant_id)}</td><td className="px-2 py-2"><div className="flex items-center gap-2"><Input key={`${rate.id}-${vendorQuotedRate(rate)}`} type="number" min="0" step="0.01" defaultValue={vendorQuotedRate(rate)} className="h-8 w-28 font-mono font-bold" onBlur={(event) => editAmount(rate, event.target.value)} />{isCheapest && <StatusBadge label="Lowest" className="border-success/20 bg-success/10 text-success" />}</div></td><td className="px-2 py-2"><select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={rate.status === "inactive" ? "inactive" : "active"} onChange={(event) => updateStatus(rate, event.target.value as "active" | "inactive")}><option value="active">Active</option><option value="inactive">Inactive</option></select></td><td className="px-2 py-2 text-[10px] text-muted-foreground">{rate.updated_at ? new Date(rate.updated_at).toLocaleString("en-IN") : "—"}</td><td className="px-2 py-2 text-right"><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => void deleteRate(rate.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td></tr>; })}</tbody></table></div> : <div className="mt-3"><EmptyState title="No Vendor rates" description="Add the first current quoted rate above." /></div>}</section>
  </div>;
}
