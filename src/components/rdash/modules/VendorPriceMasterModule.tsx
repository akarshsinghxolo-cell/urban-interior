"use client";
import * as React from "react";
import { BadgeCheck, Download, Plus, Search, Star, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { Master, VendorRate } from "@/lib/rdash/types";
import { MetricCard, EmptyState, StatusBadge } from "../primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatINR } from "@/lib/rdash/format";
import { applyVendorRateUpdates } from "@/lib/rdash/vendor-rate";
import { ArticleVendorAssetLinks } from "../OperationalMediaPanel";
import { confirmDialog } from "../ConfirmDialog";
function now() { return new Date().toISOString(); }
function makeId() { return `vendor-rate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function toNumber(value: string) { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : 0; }
function unitLabel(master: Master, unitId?: string) { const unit = master.units.find((entry) => entry.id === unitId); return unit ? `${unit.symbol} · ${unit.name}` : unitId || "—"; }
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
type PriceDraft = {
    vendorId: string;
    categoryId: string;
    workId: string;
    scopeId: string;
    variantId: string;
    rate: string;
    delivery: string;
    moq: string;
    brand: string;
    grade: string;
    notes: string;
    gstInclusive: boolean;
    preferred: boolean;
};
const emptyDraft = (): PriceDraft => ({ vendorId: "", categoryId: "", workId: "", scopeId: "", variantId: "", rate: "", delivery: "", moq: "", brand: "", grade: "", notes: "", gstInclusive: true, preferred: false });
export function VendorPriceMasterModule() {
    const db = useRDashStore((state) => state.db);
    const mutateMaster = useRDashStore((state) => state.mutateMaster);
    const openDetail = useRDashStore((state) => state.openDetail);
    const master = db.master;
    const [draft, setDraft] = React.useState<PriceDraft>(() => ({ ...emptyDraft(), vendorId: master.vendors[0]?.id || "" }));
    const [query, setQuery] = React.useState("");
    const scopeLines = React.useMemo(() => master.workSubcategories.filter((work) => !draft.categoryId || work.category_id === draft.categoryId), [master.workSubcategories, draft.categoryId]);
    const scopeOptions = React.useMemo(() => master.subcategoryArticleMap.filter((scope) => {
        const work = master.workSubcategories.find((entry) => entry.id === scope.work_required_id);
        return (!draft.categoryId || work?.category_id === draft.categoryId) && (!draft.workId || scope.work_required_id === draft.workId);
    }), [master, draft.categoryId, draft.workId]);
    const selectedScope = master.subcategoryArticleMap.find((entry) => entry.id === draft.scopeId);
    const selectedArticle = master.articles.find((entry) => entry.id === selectedScope?.article_id);
    const selectedVariant = master.articleVariants.find((entry) => entry.id === draft.variantId);
    const resolvedUnitId = selectedVariant?.unit_id || selectedScope?.unit_id;
    const variants = master.articleVariants.filter((variant) => variant.article_id === selectedArticle?.id && variant.enabled !== false);
    const rows = React.useMemo(() => {
        const needle = query.trim().toLowerCase();
        return master.vendorRates.filter((rate) => {
            const vendor = master.vendors.find((entry) => entry.id === rate.vendor_id);
            const scope = master.subcategoryArticleMap.find((entry) => entry.id === rate.work_required_article_id);
            const article = master.articles.find((entry) => entry.id === (scope?.article_id || rate.article_id));
            const work = master.workSubcategories.find((entry) => entry.id === scope?.work_required_id);
            const category = master.workCategories.find((entry) => entry.id === work?.category_id);
            const variant = master.articleVariants.find((entry) => entry.id === rate.variant_id);
            const text = `${vendor?.name} ${vendor?.city} ${category?.name} ${work?.name} ${article?.name} ${variant?.name} ${rate.brand} ${rate.grade}`.toLowerCase();
            return !needle || text.includes(needle);
        });
    }, [master, query]);
    const cheapest = React.useMemo(() => {
        const best = new Map<string, VendorRate>();
        master.vendorRates.forEach((rate) => {
            const key = `${rate.work_required_article_id || rate.article_id}:${rate.variant_id || "base"}`;
            const current = best.get(key);
            if (!current || rate.rate < current.rate)
                best.set(key, rate);
        });
        return new Set([...best.values()].map((rate) => rate.id));
    }, [master.vendorRates]);
    const addPrice = () => {
        const vendor = master.vendors.find((entry) => entry.id === draft.vendorId);
        if (!vendor)
            return toast.error("Select a vendor.");
        if (!selectedScope || !selectedArticle || !resolvedUnitId)
            return toast.error("Select category, submodule and exact material article.");
        if (draft.variantId && selectedVariant?.article_id !== selectedArticle.id)
            return toast.error("The selected variant does not belong to the selected material article.");
        const duplicate = master.vendorRates.some((rate) => rate.vendor_id === vendor.id && rate.work_required_article_id === selectedScope.id && (rate.variant_id || "") === (draft.variantId || ""));
        if (duplicate)
            return toast.error("This vendor already has a price for this exact submodule material and variant.");
        const rate: VendorRate = {
            id: makeId(), vendor_id: vendor.id, article_id: selectedArticle.id, article_name: selectedArticle.name,
            work_required_article_id: selectedScope.id, variant_id: draft.variantId || undefined, unit_id: resolvedUnitId,
            rate: toNumber(draft.rate), delivery_days: toNumber(draft.delivery), moq: toNumber(draft.moq), gst_inclusive: draft.gstInclusive,
            preferred: draft.preferred, brand: draft.brand.trim(), grade: draft.grade.trim(), notes: draft.notes.trim(), valid_from: now().slice(0, 10), updated_at: now(),
        };
        mutateMaster((current) => ({ ...current, vendorRates: [...current.vendorRates, rate] }));
        setDraft((current) => ({ ...emptyDraft(), vendorId: current.vendorId, categoryId: current.categoryId, workId: current.workId, scopeId: current.scopeId }));
        toast.success(`Vendor price saved for ${selectedArticle.name}.`);
    };
    const updateRate = (rateId: string, patch: Partial<VendorRate>) => {
        const existing = master.vendorRates.find((rate) => rate.id === rateId);
        const oldRate = existing?.rate;
        mutateMaster((current) => {
            const existingInner = current.vendorRates.find((rate) => rate.id === rateId);
            const scope = existingInner?.work_required_article_id ? current.subcategoryArticleMap.find((row) => row.id === existingInner.work_required_article_id) : undefined;
            if (existingInner && scope && patch.rate !== undefined && patch.rate !== existingInner.rate) {
                const updated = applyVendorRateUpdates(current, [{
                    vendorId: existingInner.vendor_id,
                    scope,
                    articleName: existingInner.article_name,
                    unitId: existingInner.unit_id || scope.unit_id,
                    variantId: existingInner.variant_id,
                    rate: patch.rate,
                    sourceType: "MANUAL",
                    sourceId: existingInner.id,
                    sourceNo: "Vendor Price Matrix",
                    changedBy: "Manual edit",
                    notes: "Manual vendor price matrix update.",
                }]);
                return { ...updated, vendorRates: updated.vendorRates.map((rate) => rate.id === rateId ? { ...rate, ...patch, updated_at: now() } : rate) };
            }
            return { ...current, vendorRates: current.vendorRates.map((rate) => rate.id === rateId ? { ...rate, ...patch, updated_at: now() } : rate) };
        });
        // Audit log for vendor rate edits — financial
        if (existing && patch.rate !== undefined && patch.rate !== oldRate) {
            const actor = useRDashStore.getState().currentUser();
            const vendor = master.vendors.find((v) => v.id === existing.vendor_id);
            useRDashStore.getState().logAudit({
                actor: actor.name,
                actor_role: actor.role,
                action: `Vendor rate edited: ${existing.article_name} (${vendor?.name || "vendor"})`,
                entity_type: "vendorRate",
                entity_id: rateId,
                entity_label: `${existing.article_name} · ${vendor?.name || ""}`,
                kind: "update",
                source_module: "vendorRates",
                reason: `Financial edit by ${actor.name} (${actor.role})`,
                changes: [{ field: "rate", before: oldRate, after: patch.rate }],
            });
        }
    };
    const deleteRate = async (rateId: string) => {
        const ok = await confirmDialog({
            title: "Delete Vendor Price",
            description: "This vendor price entry will be permanently removed.",
            confirmLabel: "Delete",
            danger: true,
        });
        if (!ok)
            return;
        mutateMaster((current) => ({ ...current, vendorRates: current.vendorRates.filter((rate) => rate.id !== rateId) }));
        toast.success("Vendor price removed.");
    };
    const exportRows = () => {
        const data: Array<Array<string | number>> = [["Vendor", "City", "Category", "Submodule", "Material", "Variant", "Unit", "Rate", "Reference", "Delivery days", "MOQ", "GST inclusive", "Preferred", "Brand", "Grade", "Notes"]];
        master.vendorRates.forEach((rate) => {
            const vendor = master.vendors.find((entry) => entry.id === rate.vendor_id);
            const scope = master.subcategoryArticleMap.find((entry) => entry.id === rate.work_required_article_id);
            const article = master.articles.find((entry) => entry.id === (scope?.article_id || rate.article_id));
            const work = master.workSubcategories.find((entry) => entry.id === scope?.work_required_id);
            const category = master.workCategories.find((entry) => entry.id === work?.category_id);
            const variant = master.articleVariants.find((entry) => entry.id === rate.variant_id);
            data.push([vendor?.name || "", vendor?.city || "", category?.name || "", work?.name || "", article?.name || rate.article_name, variant?.name || "Base article", unitLabel(master, rate.unit_id), rate.rate, scope?.reference_rate || 0, rate.delivery_days || 0, rate.moq || 0, rate.gst_inclusive ? "Yes" : "No", rate.preferred ? "Yes" : "No", rate.brand || "", rate.grade || "", rate.notes || ""]);
        });
        csv("rdash-vendor-price-matrix.csv", data);
        toast.success("Vendor price matrix exported.");
    };
    return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Truck className="h-5 w-5"/></span><div><h2 className="text-lg font-bold tracking-tight">Vendor Price Matrix</h2><p className="text-xs text-muted-foreground">Every price belongs to one exact submodule material and optional article variant. Units are derived, never typed freely.</p></div></div><Button size="sm" variant="outline" onClick={exportRows}><Download className="h-3.5 w-3.5"/> Export matrix</Button></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard label="Vendors" value={master.vendors.length} tone="primary" icon={<Truck className="h-4 w-4"/>}/><MetricCard label="Price rows" value={master.vendorRates.length} tone="success" icon={<BadgeCheck className="h-4 w-4"/>}/><MetricCard label="Rate history" value={master.vendorRateHistories.length} hint="active + superseded" tone="warning" icon={<Star className="h-4 w-4"/>}/><MetricCard label="Unpriced contexts" value={Math.max(0, master.subcategoryArticleMap.length - new Set(master.vendorRates.map((rate) => rate.work_required_article_id)).size)} tone="default" icon={<Search className="h-4 w-4"/>}/></div>
    <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><div className="mb-3"><h3 className="text-sm font-bold">Add exact vendor price</h3><p className="mt-0.5 text-xs text-muted-foreground">Choose the category path first. The selected material and variant determine the permitted unit automatically.</p></div><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><Field label="Vendor"><select value={draft.vendorId} onChange={(event) => setDraft((current) => ({ ...current, vendorId: event.target.value }))}>{master.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.city || "No city"}</option>)}</select></Field><Field label="Category"><select value={draft.categoryId} onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value, workId: "", scopeId: "", variantId: "" }))}><option value="">All categories</option>{master.workCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field label="Submodule"><select value={draft.workId} onChange={(event) => setDraft((current) => ({ ...current, workId: event.target.value, scopeId: "", variantId: "" }))}><option value="">Select submodule</option>{scopeLines.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}</select></Field><Field label="Material article"><select value={draft.scopeId} onChange={(event) => setDraft((current) => ({ ...current, scopeId: event.target.value, variantId: "" }))}><option value="">Select scoped material</option>{scopeOptions.map((scope) => { const article = master.articles.find((entry) => entry.id === scope.article_id); return <option key={scope.id} value={scope.id}>{article?.name || "Material"} · {unitLabel(master, scope.unit_id)}</option>; })}</select></Field><Field label="Variant"><select disabled={!selectedArticle} value={draft.variantId} onChange={(event) => setDraft((current) => ({ ...current, variantId: event.target.value }))}><option value="">Base article · {unitLabel(master, selectedScope?.unit_id)}</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · {unitLabel(master, variant.unit_id || selectedScope?.unit_id)}</option>)}</select></Field><Field label="Resolved unit"><div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-bold text-primary">{unitLabel(master, resolvedUnitId)}</div></Field></div><div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-7"><Field label="Rate"><Input type="number" min="0" value={draft.rate} onChange={(event) => setDraft((current) => ({ ...current, rate: event.target.value }))}/></Field><Field label="Delivery days"><Input type="number" min="0" value={draft.delivery} onChange={(event) => setDraft((current) => ({ ...current, delivery: event.target.value }))}/></Field><Field label="MOQ"><Input type="number" min="0" value={draft.moq} onChange={(event) => setDraft((current) => ({ ...current, moq: event.target.value }))}/></Field><Field label="Brand"><Input value={draft.brand} onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))}/></Field><Field label="Grade"><Input value={draft.grade} onChange={(event) => setDraft((current) => ({ ...current, grade: event.target.value }))}/></Field><Field label="Price flags"><div className="flex h-9 items-center gap-3 rounded-md border border-input bg-background px-3 text-xs"><label className="inline-flex items-center gap-1"><input checked={draft.gstInclusive} type="checkbox" onChange={(event) => setDraft((current) => ({ ...current, gstInclusive: event.target.checked }))}/> GST incl.</label><label className="inline-flex items-center gap-1"><input checked={draft.preferred} type="checkbox" onChange={(event) => setDraft((current) => ({ ...current, preferred: event.target.checked }))}/> Preferred</label></div></Field><Field label="Save"><Button className="w-full" onClick={addPrice}><Plus className="h-3.5 w-3.5"/> Add price</Button></Field></div><div className="mt-3"><Field label="Commercial note"><Textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Warranty, payment terms, lead-time exception or product note"/></Field></div></section>
    <section className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5"><div className="relative w-full max-w-md"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendor, submodule, article, variant…" className="pl-8"/></div><span className="text-xs text-muted-foreground">{rows.length} prices shown</span></div>{rows.length ? <div className="overflow-x-auto"><table className="min-w-[1150px] w-full text-left text-xs"><thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Vendor</th><th className="px-3 py-2">Category / submodule</th><th className="px-3 py-2">Material / variant</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Rate</th><th className="px-3 py-2">Vs ref.</th><th className="px-3 py-2">Delivery / MOQ</th><th className="px-3 py-2">Flags</th><th className="px-3 py-2"/></tr></thead><tbody>{rows.map((rate) => { const vendor = master.vendors.find((entry) => entry.id === rate.vendor_id); const scope = master.subcategoryArticleMap.find((entry) => entry.id === rate.work_required_article_id); const article = master.articles.find((entry) => entry.id === (scope?.article_id || rate.article_id)); const work = master.workSubcategories.find((entry) => entry.id === scope?.work_required_id); const category = master.workCategories.find((entry) => entry.id === work?.category_id); const variant = master.articleVariants.find((entry) => entry.id === rate.variant_id); const variance = rate.rate - (scope?.reference_rate || 0); return <tr key={rate.id} className={cn("border-t border-border align-top hover:bg-accent/25", cheapest.has(rate.id) && "bg-success/[0.04]")}><td className="px-3 py-2.5"><b>{vendor?.name || "Missing vendor"}</b><small className="mt-1 block text-muted-foreground">{vendor?.city || "—"}</small></td><td className="px-3 py-2.5"><b>{category?.name || "—"}</b><small className="mt-1 block text-muted-foreground">{work?.name || "Missing submodule"}</small></td><td className="px-3 py-2.5"><b>{article?.name || rate.article_name}</b><small className="mt-1 block text-muted-foreground">{variant?.name || "Base article"}{rate.brand || rate.grade ? ` · ${[rate.brand, rate.grade].filter(Boolean).join(" / ")}` : ""}</small><div className="mt-1"><ArticleVendorAssetLinks articleId={article?.id || rate.article_id} vendorId={rate.vendor_id} variantId={rate.variant_id} title="Catalogues"/></div></td><td className="px-3 py-2.5">{unitLabel(master, rate.unit_id)}</td><td className="px-3 py-2.5"><Input className="h-8 w-24" type="number" min="0" value={rate.rate} onChange={(event) => updateRate(rate.id, { rate: toNumber(event.target.value) })}/></td><td className={cn("px-3 py-2.5 font-mono", variance < 0 ? "text-success" : variance > 0 ? "text-destructive" : "text-muted-foreground")}>{variance === 0 ? "At reference" : `${variance > 0 ? "+" : ""}${formatINR(variance)}`}</td><td className="px-3 py-2.5">{rate.delivery_days || 0} days<small className="mt-1 block text-muted-foreground">MOQ {rate.moq || 0}</small></td><td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{cheapest.has(rate.id) ? <StatusBadge label="Cheapest" className="bg-success/10 text-success border-success/20"/> : null}{rate.preferred ? <StatusBadge label="Preferred" className="bg-primary/10 text-primary border-primary/20"/> : null}{!rate.gst_inclusive ? <StatusBadge label="GST extra" className="bg-warning/10 text-warning border-warning/20"/> : null}</div></td><td className="px-3 py-2.5"><div className="flex items-center gap-1"><Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openDetail("vendorRate" as any, rate.id)}>Open</Button><Button size="icon" variant="ghost" onClick={() => deleteRate(rate.id)} aria-label="Delete vendor price"><Trash2 className="h-4 w-4 text-destructive"/></Button></div></td></tr>; })}</tbody></table></div> : <div className="p-8"><EmptyState title="No vendor prices found" description="Add a price against an exact submodule material. It will immediately be available to Rate Finder and Procurement." icon={<Truck className="h-7 w-7"/>}/></div>}</section>
  </div>;
}
function Field({ label, children }: {
    label: string;
    children: React.ReactNode;
}) { return <label className="grid min-w-0 gap-1 text-[11px] font-semibold text-muted-foreground"><span>{label}</span>{children}</label>; }
