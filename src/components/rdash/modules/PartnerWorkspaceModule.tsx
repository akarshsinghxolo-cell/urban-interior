"use client";

import * as React from "react";
import { ArrowRight, MapPin, Phone, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRDashStore } from "@/lib/rdash/store";
import { partnerMatchesQuery, partnerPortfolio, type PartnerKind } from "@/lib/rdash/partner-workspace";
import { formatINRShort, titleCase } from "@/lib/rdash/format";
import { EntityFormDialog } from "../EntityFormDialog";
import { Avatar, EmptyState, MetricCard, StatusBadge } from "../primitives";

export function PartnerWorkspaceModule({ kind }: { kind: PartnerKind }) {
  const db = useRDashStore((state) => state.db);
  const openDetail = useRDashStore((state) => state.openDetail);
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState("name");
  const [status, setStatus] = React.useState("all");
  const [city, setCity] = React.useState("all");
  const [focus, setFocus] = React.useState("all");
  const [formOpen, setFormOpen] = React.useState(false);
  const title = kind === "vendor" ? "Vendors" : "Contractors";
  const moduleId = kind === "vendor" ? "vendors" : "contractorDetail";
  const models = React.useMemo(() => (kind === "vendor" ? db.master.vendors : db.master.contractors)
    .map((partner) => partnerPortfolio(db, kind, partner)), [db, kind]);
  const cities = [...new Set(models.map(({ partner }) => partner.city).filter((value): value is string => Boolean(value)))].sort();
  const filtered = models.filter((model) => partnerMatchesQuery(model, query)
    && (status === "all" || (model.partner.status || "onboarding") === status)
    && (city === "all" || model.partner.city === city)
    && (focus === "all" || (focus === "attention" ? model.actions.length > 0 : focus === "outstanding" ? model.outstanding > 0 : model.activeOrders > 0)))
    .sort((a, b) => (sort === "outstanding" ? b.outstanding - a.outstanding : sort === "active" ? b.activeOrders - a.activeOrders : sort === "attention" ? b.actions.length - a.actions.length : 0)
      || (sort === "name-desc" ? b.partner.name.localeCompare(a.partner.name) : a.partner.name.localeCompare(b.partner.name)));
  const selectClass = "h-9 min-w-0 rounded-md border border-input bg-card px-2 text-xs text-foreground";
  const reset = () => { setQuery(""); setStatus("all"); setCity("all"); setFocus("all"); };

  return <div className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-bold">{title}</h1><p className="mt-1 text-xs text-muted-foreground">{kind === "vendor" ? "Suppliers, materials, purchasing and payables." : "Trade crews, capabilities, site work and payments."}</p></div>
      <Button onClick={() => setFormOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Add {kind}</Button>
    </div>
    <div className="relative rounded-xl border border-border bg-card p-3 shadow-card">
      <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input aria-label={`Search ${title.toLowerCase()}`} placeholder="Search name, phone, city or capability" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" />
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricCard label={title} value={filtered.length} hint="matching directory" />
      <MetricCard label={kind === "vendor" ? "Open purchase orders" : "Active work orders"} value={filtered.reduce((sum, row) => sum + row.activeOrders, 0)} tone="primary" />
      <MetricCard label="Outstanding" value={formatINRShort(filtered.reduce((sum, row) => sum + row.outstanding, 0))} tone="warning" />
      <MetricCard label="Need attention" value={filtered.filter((row) => row.actions.length > 0).length} />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold">{title} <span className="ml-1 text-muted-foreground">{filtered.length} / {models.length}</span></h2>
      <div className="flex max-w-full flex-wrap gap-2">
        <select aria-label={`Sort ${title.toLowerCase()}`} className={selectClass} value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Sort: Name A–Z</option><option value="name-desc">Name Z–A</option><option value="outstanding">Highest outstanding</option><option value="active">Most active orders</option><option value="attention">Needs attention first</option></select>
        <select aria-label="Filter status" className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{["onboarding", "active", "on_hold", "inactive", "blacklisted"].map((value) => <option key={value} value={value}>{titleCase(value.replaceAll("_", " "))}</option>)}</select>
        <select aria-label="Filter city" className={selectClass} value={city} onChange={(event) => setCity(event.target.value)}><option value="all">All cities</option>{cities.map((value) => <option key={value}>{value}</option>)}</select>
        <select aria-label="Filter work" className={selectClass} value={focus} onChange={(event) => setFocus(event.target.value)}><option value="all">All work</option><option value="attention">Needs attention</option><option value="active">Active orders</option><option value="outstanding">Outstanding balance</option></select>
        {(query || status !== "all" || city !== "all" || focus !== "all") && <Button size="sm" variant="ghost" onClick={reset}>Clear filters</Button>}
      </div>
    </div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {filtered.map((model) => <button type="button" key={model.partner.id} onClick={() => openDetail(kind, model.partner.id, moduleId)} aria-label={`Open ${model.partner.name}`} className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 text-left shadow-card transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex w-full items-start gap-3"><Avatar name={model.partner.name} size={40} /><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold">{model.partner.name}</h3><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{model.partner.phone || "Mobile pending"}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{model.partner.city || "City pending"}</p></div><StatusBadge label={titleCase((model.partner.status || "onboarding").replaceAll("_", " "))} /></div>
        <p className="mt-3 line-clamp-2 min-h-8 text-xs text-muted-foreground">{model.capabilityNames.join(" · ") || "Add supply or work capabilities"}</p>
        <div className="mt-3 grid w-full grid-cols-3 gap-2 border-t border-border pt-3 text-xs"><div><p className="text-muted-foreground">Active orders</p><p className="mt-1 font-semibold">{model.activeOrders}</p></div><div><p className="text-muted-foreground">Sites</p><p className="mt-1 font-semibold">{model.sites.length}</p></div><div><p className="text-muted-foreground">Outstanding</p><p className="mt-1 font-semibold">{formatINRShort(model.outstanding)}</p></div></div>
        <div className="mt-3 flex w-full items-center justify-between gap-2 text-xs"><span className={model.actions.length ? "text-warning" : "text-muted-foreground"}>{model.actions.length ? `${model.actions.length} pending action${model.actions.length === 1 ? "" : "s"}` : "No pending actions"}</span><ArrowRight className="h-4 w-4 text-primary" /></div>
      </button>)}
    </div>
    {!filtered.length && <EmptyState title={models.length ? "No matching partners" : `No ${title.toLowerCase()} yet`} description={models.length ? "Try a different search or clear the filters." : `Add a ${kind} to record capabilities and connect their work.`} action={<Button variant="outline" onClick={models.length ? reset : () => setFormOpen(true)}>{models.length ? "Clear filters" : `Add ${kind}`}</Button>} />}
    <EntityFormDialog type={kind} open={formOpen} onClose={() => setFormOpen(false)} onSaved={(id) => { setFormOpen(false); openDetail(kind, id, moduleId); }} />
  </div>;
}
