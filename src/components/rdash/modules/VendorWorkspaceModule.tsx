"use client";

import * as React from "react";
import {
  Activity,
  BadgeIndianRupee,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileText,
  Gauge,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Sparkles,
  Star,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRDashStore } from "@/lib/rdash/store";
import { formatDate, formatINRShort, titleCase } from "@/lib/rdash/format";
import {
  buildVendorCommercialProfile,
  buildVendorRelationshipTimeline,
  canonicalVendorCapabilities,
  computeVendorPerformance,
  recommendVendorsForArticle,
  vendorQuotedRate,
  type VendorProfileRecord,
} from "@/lib/rdash/vendor-profile";
import { EntityFormDialog } from "../EntityFormDialog";
import { OperationalMediaPanel } from "../OperationalMediaPanel";
import { Avatar, EmptyState, MetricCard, SectionHeader, StatusBadge } from "../primitives";

type TabId = "overview" | "profile" | "catalogue" | "commercial" | "procurement" | "performance" | "timeline" | "files";

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "profile", label: "Profile", icon: Building2 },
  { id: "catalogue", label: "Supply capability", icon: Boxes },
  { id: "commercial", label: "Commercial", icon: BadgeIndianRupee },
  { id: "procurement", label: "Procurement", icon: Truck },
  { id: "performance", label: "Performance", icon: Gauge },
  { id: "timeline", label: "Timeline", icon: ClipboardList },
  { id: "files", label: "Files", icon: FileText },
];

function statusClass(status?: string) {
  if (status === "active") return "border-success/20 bg-success/10 text-success";
  if (status === "onboarding") return "border-primary/20 bg-primary/10 text-primary";
  if (status === "on_hold") return "border-warning/20 bg-warning/10 text-warning";
  if (status === "blacklisted" || status === "inactive") return "border-destructive/20 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

function scoreClass(score: number) {
  if (score >= 85) return "border-success/20 bg-success/10 text-success";
  if (score >= 65) return "border-warning/20 bg-warning/10 text-warning";
  return "border-destructive/20 bg-destructive/10 text-destructive";
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-muted/15 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><div className="mt-1 text-sm font-medium">{value || "—"}</div></div>;
}

function SmallRecord({ title, subtitle, amount, status, onOpen }: { title: string; subtitle?: string; amount?: number; status?: string; onOpen?: () => void }) {
  const body = <><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{title}</p>{subtitle && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{subtitle}</p>}</div><div className="flex shrink-0 items-center gap-2">{amount != null && <span className="font-mono text-xs font-bold">{formatINRShort(amount)}</span>}{status && <StatusBadge label={titleCase(String(status).replaceAll("_", " "))} />}</div></>;
  return onOpen ? <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-accent/20">{body}</button> : <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">{body}</div>;
}

function compactPhone(value?: string) { return String(value || "").replace(/\D/g, ""); }
function whatsappHref(value?: string) {
  const phone = compactPhone(value);
  if (!phone) return undefined;
  return `https://wa.me/${phone.length === 10 ? `91${phone}` : phone}`;
}
function mapHref(vendor: VendorProfileRecord) {
  if (Number.isFinite(vendor.latitude) && Number.isFinite(vendor.longitude)) return `https://www.google.com/maps?q=${vendor.latitude},${vendor.longitude}`;
  const address = [vendor.address, vendor.locality, vendor.city].filter(Boolean).join(", ");
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : undefined;
}

export function VendorWorkspaceModule() {
  const db = useRDashStore((state) => state.db);
  const openDetail = useRDashStore((state) => state.openDetail);
  const setActiveModule = useRDashStore((state) => state.setActiveModule);
  const vendors = db.master.vendors as VendorProfileRecord[];
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState(vendors[0]?.id || "");
  const [tab, setTab] = React.useState<TabId>("overview");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | undefined>();
  const [recommendArticleId, setRecommendArticleId] = React.useState("");

  React.useEffect(() => {
    if (!vendors.length) setSelectedId("");
    else if (!selectedId || !vendors.some((vendor) => vendor.id === selectedId)) setSelectedId(vendors[0].id || "");
  }, [selectedId, vendors]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return vendors;
    return vendors.filter((vendor) => [vendor.name, vendor.legal_name, vendor.phone, vendor.city, vendor.locality, vendor.gstin, vendor.vendor_type, ...(vendor.categories || []), ...(vendor.brands || [])].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [query, vendors]);

  const selected = vendors.find((vendor) => vendor.id === selectedId);
  const commercial = React.useMemo(() => selected ? buildVendorCommercialProfile(db, selected.id!) : undefined, [db, selected]);
  const performance = React.useMemo(() => selected ? computeVendorPerformance(db, selected.id!) : undefined, [db, selected]);
  const capabilities = React.useMemo(() => selected ? canonicalVendorCapabilities(selected, db) : [], [db, selected]);
  const timeline = React.useMemo(() => selected ? buildVendorRelationshipTimeline(db, selected.id!) : [], [db, selected]);
  const recommendations = React.useMemo(() => recommendArticleId ? recommendVendorsForArticle(db, recommendArticleId) : [], [db, recommendArticleId]);

  const purchaseOrders = React.useMemo(() => selected ? db.purchaseOrders.filter((row) => row.vendor_id === selected.id) : [], [db.purchaseOrders, selected]);
  const poIds = React.useMemo(() => new Set(purchaseOrders.map((row) => row.id)), [purchaseOrders]);
  const rfqs = React.useMemo(() => selected ? db.vendorRfqs.filter((row) => row.vendor_ids?.includes(selected.id!)) : [], [db.vendorRfqs, selected]);
  const bids = React.useMemo(() => selected ? db.vendorBids.filter((row) => row.vendor_id === selected.id) : [], [db.vendorBids, selected]);
  const grns = React.useMemo(() => db.grns.filter((row) => poIds.has(row.po_id)), [db.grns, poIds]);
  const rates = React.useMemo(() => selected ? db.master.vendorRates.filter((row) => row.vendor_id === selected.id) : [], [db.master.vendorRates, selected]);

  const openAdd = () => { setEditId(undefined); setFormOpen(true); };
  const openEdit = () => { if (!selected?.id) return; setEditId(selected.id); setFormOpen(true); };

  if (!selected || !commercial || !performance) {
    return <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold">Vendor 360°</h1><p className="text-xs text-muted-foreground">Canonical supplier profile, catalogue capability, pricing, performance, recommendation and relationship history.</p></div><Button onClick={openAdd}><Plus className="mr-1.5 h-4 w-4" />Add Vendor</Button></div><EmptyState title="No vendors yet" description="Create the first canonical Vendor profile." action={<Button onClick={openAdd}><Plus className="mr-1 h-4 w-4" />Add Vendor</Button>} /><EntityFormDialog type="vendor" open={formOpen} editId={editId} onClose={() => setFormOpen(false)} onSaved={(id) => { setSelectedId(id); setFormOpen(false); }} /></div>;
  }

  const wa = whatsappHref(selected.whatsapp || selected.phone);
  const maps = mapHref(selected);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span><div><h1 className="text-xl font-bold">Vendor 360°</h1><p className="text-xs text-muted-foreground">One relationship record from Vendor master through rates, sourcing, delivery, quality and payments.</p></div></div><Button onClick={openAdd}><Plus className="mr-1.5 h-4 w-4" />Add Vendor</Button></div>

    <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card"><div className="relative mb-3"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendors" className="h-9 pl-8" /></div><div className="rd-scroll max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto pr-1">{filtered.map((vendor) => { const score = computeVendorPerformance(db, vendor.id!); const capabilityCount = canonicalVendorCapabilities(vendor, db).length; return <button key={vendor.id} type="button" onClick={() => { setSelectedId(vendor.id!); setTab("overview"); }} className={cn("w-full rounded-xl border p-3 text-left transition-all", selectedId === vendor.id ? "border-primary bg-primary/[0.04] ring-2 ring-primary/10" : "border-border bg-background hover:bg-accent/20")}><div className="flex items-start gap-2.5"><Avatar name={vendor.name || "Vendor"} size={38} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-bold">{vendor.name}</p><StatusBadge label={`${score.overall}`} className={scoreClass(score.overall)} /></div><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{titleCase(String(vendor.vendor_type || "dealer").replaceAll("_", " "))} · {vendor.city || "City pending"}</p><div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>{capabilityCount} supplied article{capabilityCount === 1 ? "" : "s"}</span><StatusBadge label={titleCase(vendor.status || "onboarding")} className={statusClass(vendor.status)} /></div></div></div></button>; })}{!filtered.length && <p className="py-8 text-center text-xs text-muted-foreground">No matching vendors.</p>}</div></aside>

      <main className="min-w-0 space-y-4">
        <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Avatar name={selected.name || "Vendor"} size={52} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-xl font-bold">{selected.name}</h2><StatusBadge label={titleCase(selected.status || "onboarding")} className={statusClass(selected.status)} /><StatusBadge label={`Score ${performance.overall}`} className={scoreClass(performance.overall)} /></div><p className="mt-1 text-xs text-muted-foreground">{selected.legal_name && selected.legal_name !== selected.name ? `${selected.legal_name} · ` : ""}{titleCase(String(selected.vendor_type || "dealer").replaceAll("_", " "))}</p><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{selected.phone && <a href={`tel:${selected.phone}`} className="inline-flex items-center gap-1 hover:text-primary"><Phone className="h-3 w-3" />{selected.phone}</a>}{selected.email && <a href={`mailto:${selected.email}`} className="inline-flex items-center gap-1 hover:text-primary"><Mail className="h-3 w-3" />{selected.email}</a>}{(selected.locality || selected.city) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{[selected.locality, selected.city].filter(Boolean).join(", ")}</span>}</div></div></div><Button size="sm" variant="outline" onClick={openEdit}><Pencil className="mr-1 h-3.5 w-3.5" />Edit Vendor</Button></div><div className="mt-3 flex flex-wrap items-center gap-2">{selected.phone && <Button asChild size="sm" variant="outline" className="h-8"><a href={`tel:${selected.phone}`}><Phone className="mr-1 h-3.5 w-3.5" />Call</a></Button>}{wa && <Button asChild size="sm" variant="outline" className="h-8"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-3.5 w-3.5" />WhatsApp</a></Button>}{maps && <Button asChild size="sm" variant="outline" className="h-8"><a href={maps} target="_blank" rel="noreferrer"><MapPin className="mr-1 h-3.5 w-3.5" />Maps</a></Button>}<Button size="sm" variant="outline" className="h-8" onClick={() => setActiveModule("vendorRates")}><BadgeIndianRupee className="mr-1 h-3.5 w-3.5" />Price Matrix</Button><Button size="sm" variant="outline" className="h-8" onClick={() => setActiveModule("procurementInventory")}><Truck className="mr-1 h-3.5 w-3.5" />Procurement</Button></div></section>

        <div className="flex overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-card">{TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={cn("inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold", tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>

        {tab === "overview" && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard label="Vendor score" value={`${performance.overall}/100`} tone={performance.overall >= 85 ? "success" : performance.overall >= 65 ? "warning" : "destructive"} /><MetricCard label="Active rates" value={commercial.activeRateCount} tone="primary" /><MetricCard label="Purchase orders" value={commercial.purchaseOrderCount} tone="default" /><MetricCard label="Outstanding" value={formatINRShort(commercial.outstandingValue)} tone={commercial.outstandingValue > 0 ? "warning" : "success"} /></div><div className="grid gap-4 lg:grid-cols-2"><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Current relationship" /><div className="mt-3 grid grid-cols-2 gap-2"><InfoCell label="Supplied articles" value={capabilities.length} /><InfoCell label="Brands" value={(selected.brands || []).join(", ") || "—"} /><InfoCell label="On-time deliveries" value={`${performance.onTimeDeliveries}/${performance.completedDeliveries}`} /><InfoCell label="GRNs assessed" value={performance.grnCount} /></div></section><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Commercial pulse" /><div className="mt-3 grid grid-cols-2 gap-2"><InfoCell label="Lowest quote" value={commercial.lowestQuotedRate != null ? formatINRShort(commercial.lowestQuotedRate) : "—"} /><InfoCell label="Average quote" value={commercial.averageQuotedRate != null ? formatINRShort(commercial.averageQuotedRate) : "—"} /><InfoCell label="Ordered value" value={formatINRShort(commercial.totalOrderedValue)} /><InfoCell label="Average delivery" value={commercial.averageActualDeliveryDays != null ? `${Math.round(commercial.averageActualDeliveryDays)} days` : "—"} /></div></section></div></div>}

        {tab === "profile" && <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Identity & contact" /><div className="mt-3 grid grid-cols-2 gap-2"><InfoCell label="Vendor name" value={selected.name} /><InfoCell label="Legal name" value={selected.legal_name} /><InfoCell label="Vendor type" value={titleCase(String(selected.vendor_type || "dealer").replaceAll("_", " "))} /><InfoCell label="GSTIN" value={selected.gstin} /><InfoCell label="Mobile" value={selected.phone} /><InfoCell label="WhatsApp" value={selected.whatsapp} /><InfoCell label="Alternate" value={selected.alternate_phone} /><InfoCell label="Email" value={selected.email} /></div></section><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Location & classification" /><div className="mt-3 grid grid-cols-2 gap-2"><InfoCell label="City" value={selected.city} /><InfoCell label="Locality" value={selected.locality} /><InfoCell label="Coordinates" value={Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude) ? `${selected.latitude}, ${selected.longitude}` : "—"} /><InfoCell label="Categories" value={(selected.categories || []).join(", ")} /></div><div className="mt-2"><InfoCell label="Full address" value={selected.address} /></div></section></div>}

        {tab === "catalogue" && <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Structured supply capability" count={capabilities.length} /><div className="mt-3 grid gap-3 md:grid-cols-2">{capabilities.map((capability) => { const article = db.master.articles.find((row) => row.id === capability.article_id); const variants = (capability.variant_ids || []).map((id) => db.master.articleVariants.find((row) => row.id === id)?.name).filter(Boolean); return <div key={capability.id || capability.article_id} className="rounded-xl border border-border bg-muted/10 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{article?.name || capability.article_name || capability.article_id}</p><p className="text-[10px] text-muted-foreground">{capability.category_name || "Uncategorized"}{capability.brand ? ` · ${capability.brand}` : ""}</p></div>{capability.preferred && <StatusBadge label="Preferred" className="border-warning/20 bg-warning/10 text-warning" />}</div><div className="mt-3 grid grid-cols-3 gap-2"><InfoCell label="Availability" value={titleCase(String(capability.availability || "unknown").replaceAll("_", " "))} /><InfoCell label="Lead time" value={capability.typical_lead_time_days != null ? `${capability.typical_lead_time_days} days` : "—"} /><InfoCell label="MOQ" value={capability.moq ?? "—"} /></div>{variants.length > 0 && <p className="mt-2 text-[10px] text-muted-foreground">Variants: {variants.join(", ")}</p>}{capability.notes && <p className="mt-2 text-xs text-muted-foreground">{capability.notes}</p>}</div>; })}{!capabilities.length && <EmptyState title="No structured capability" description="Edit this Vendor and add supplied articles, variants, brand, availability and lead time." />}</div></section>}

        {tab === "commercial" && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricCard label="Lowest current quote" value={commercial.lowestQuotedRate != null ? formatINRShort(commercial.lowestQuotedRate) : "—"} tone="success" /><MetricCard label="Average current quote" value={commercial.averageQuotedRate != null ? formatINRShort(commercial.averageQuotedRate) : "—"} tone="primary" /><MetricCard label="Billed" value={formatINRShort(commercial.totalBilledValue)} tone="warning" /><MetricCard label="Paid" value={formatINRShort(commercial.totalPaidValue)} tone="success" /></div><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><div className="flex items-center justify-between gap-3"><SectionHeader title="Current Vendor rates" count={rates.length} /><Button size="sm" variant="outline" onClick={() => setActiveModule("vendorRates")}>Open Price Matrix</Button></div><div className="mt-3 space-y-2">{rates.map((rate) => { const variant = db.master.articleVariants.find((row) => row.id === rate.variant_id); return <SmallRecord key={rate.id} title={`${rate.article_name}${variant ? ` · ${variant.name}` : ""}`} subtitle={`${rate.current_source_type || "Manual"}${rate.current_source_no ? ` · ${rate.current_source_no}` : ""}`} amount={vendorQuotedRate(rate)} status={rate.status || "active"} />; })}{!rates.length && <p className="py-6 text-center text-xs text-muted-foreground">No Vendor rates recorded.</p>}</div></section></div>}

        {tab === "procurement" && <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="RFQs & bids" count={rfqs.length + bids.length} /><div className="mt-3 space-y-2">{rfqs.map((row) => <SmallRecord key={row.id} title={row.rfq_no || row.id} subtitle="RFQ invitation" status={row.status} />)}{bids.map((row: any) => <SmallRecord key={row.id} title={row.bid_no || row.id} subtitle="Vendor bid" amount={Number(row.total_amount || row.quote_amount || 0) || undefined} status={row.status} />)}{!rfqs.length && !bids.length && <p className="py-6 text-center text-xs text-muted-foreground">No RFQ or bid history.</p>}</div></section><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Purchase orders & receipts" count={purchaseOrders.length + grns.length} /><div className="mt-3 space-y-2">{purchaseOrders.map((row) => <SmallRecord key={row.id} title={row.po_no || row.id} subtitle={row.expected_delivery ? `Expected ${formatDate(row.expected_delivery)}` : "Purchase order"} amount={row.total_amount} status={row.status} onOpen={() => openDetail("purchaseOrder", row.id)} />)}{grns.map((row) => <SmallRecord key={row.id} title={row.grn_no || row.id} subtitle="Goods receipt" status={row.status} onOpen={() => openDetail("grn", row.id)} />)}{!purchaseOrders.length && !grns.length && <p className="py-6 text-center text-xs text-muted-foreground">No purchase or receipt history.</p>}</div></section></div>}

        {tab === "performance" && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><MetricCard label="Overall" value={`${performance.overall}`} tone={performance.overall >= 85 ? "success" : performance.overall >= 65 ? "warning" : "destructive"} /><MetricCard label="Delivery 40%" value={`${performance.delivery}`} tone="primary" /><MetricCard label="Quality 30%" value={`${performance.quality}`} tone="success" /><MetricCard label="Price 20%" value={`${performance.price}`} tone="warning" /><MetricCard label="Relationship 10%" value={`${performance.relationship}`} tone="default" /></div><section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Vendor Recommendation Engine" /><div className="mt-3 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]"><div><label className="text-xs font-semibold">Article to source</label><select className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={recommendArticleId} onChange={(event) => setRecommendArticleId(event.target.value)}><option value="">Select article</option>{db.master.articles.map((article) => <option key={article.id} value={article.id}>{article.name}</option>)}</select><p className="mt-2 text-[10px] text-muted-foreground">Ranking uses 50% observed Vendor performance, 35% current price and 15% capability availability / lead time.</p></div><div className="space-y-2">{recommendations.slice(0, 6).map((recommendation, index) => <button key={recommendation.vendorId} type="button" onClick={() => { setSelectedId(recommendation.vendorId); setTab("overview"); }} className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left hover:bg-accent/20", recommendation.vendorId === selected.id && "border-primary bg-primary/[0.04]")}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">{recommendation.vendorName}</p><StatusBadge label={`Score ${recommendation.score}`} className={scoreClass(recommendation.score)} /></div><p className="mt-1 text-[10px] text-muted-foreground">{recommendation.reasons.join(" · ")}</p></div>{recommendation.quotedRate != null && <span className="shrink-0 font-mono text-xs font-bold">{formatINRShort(recommendation.quotedRate)}</span>}</button>)}{recommendArticleId && !recommendations.length && <EmptyState title="No matching vendors" description="Add this article to a Vendor capability or create a current Vendor rate." />}{!recommendArticleId && <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground"><Sparkles className="mr-2 h-4 w-4" />Select an article to rank eligible Vendors.</div>}</div></div></section></div>}

        {tab === "timeline" && <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Vendor relationship timeline" count={timeline.length} /><div className="mt-3 space-y-2">{timeline.map((event) => <div key={event.id} className="rounded-lg border border-border bg-muted/10 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{event.title}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{titleCase(event.kind)}{event.detail ? ` · ${event.detail}` : ""}</p></div><div className="text-right">{event.amount != null && <p className="font-mono text-xs font-bold">{formatINRShort(event.amount)}</p>}<p className="text-[10px] text-muted-foreground">{formatDate(event.at)}</p></div></div></div>)}{!timeline.length && <EmptyState title="No relationship history" description="RFQs, bids, orders, receipts, bills, payments and Vendor edits will appear here." />}</div></section>}

        {tab === "files" && <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Vendor files & evidence" /><div className="mt-3"><OperationalMediaPanel entityType="vendor" entityId={selected.id!} title="Vendor files, catalogues and references" /></div></section>}
      </main>
    </div>

    <EntityFormDialog type="vendor" open={formOpen} editId={editId} onClose={() => setFormOpen(false)} onSaved={(id) => { setSelectedId(id); setFormOpen(false); }} />
  </div>;
}
