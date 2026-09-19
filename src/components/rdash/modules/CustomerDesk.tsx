"use client";

import * as React from "react";
import { AlertTriangle, MapPin, Phone, Search, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { customerProgress } from "@/lib/rdash/customer-progress";
import { findCustomerIdentityMatches } from "@/lib/rdash/customer-identity";
import { customerMatchesQuery } from "@/lib/rdash/customer-desk-queries";
import { calculateSalesPipelineMetrics, collectWonWorkRequiredIds } from "@/lib/rdash/metrics";
import { formatLocationLabel } from "@/lib/rdash/format";
import { Avatar, EmptyState, MetricCard, SectionHeader, StatusBadge } from "../primitives";
import { ContextRow } from "../ContextMenuHost";
import { CustomerSitesDialog } from "../CustomerSitesDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CustomerDesk as HistoricalCustomerDesk } from "./CustomerDeskPortfolio";

export { CustomerPortfolioDrawerContent } from "./CustomerDeskPortfolio";

const LIVE_WORK_ORDER_STATUSES = new Set(["scheduled", "in_progress", "on_hold"]);

/**
 * Safe route shell around the restored historical Customer portfolio.
 *
 * The rich portfolio/detailed-area feature surface lives in
 * CustomerDeskPortfolio. This shell keeps the later correctness fixes for the
 * customer list: explicit selection, optional phones, accurate counters and
 * pair-locked duplicate merge. Opening a customer still lands in the restored
 * full portfolio drawer.
 */
export function CustomerDesk({ view }: { view?: "default" | "timeline" } = {}) {
  const db = useRDashStore((state) => state.db);
  const selectedCustomerId = useRDashStore((state) => state.selectedCustomerId);
  const selectCustomer = useRDashStore((state) => state.selectCustomer);
  const openDetail = useRDashStore((state) => state.openDetail);
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState("newest");
  const [filter, setFilter] = React.useState("all");
  const [addCustomerOpen, setAddCustomerOpen] = React.useState(false);

  const filtered = React.useMemo(() => db.customers
    .filter((customer) => customerMatchesQuery(db, customer, query))
    .filter((customer) => filter === "all"
      || (filter === "with-site"
        ? db.sites.some((site) => site.customer_id === customer.id)
        : filter === "without-site"
          ? !db.sites.some((site) => site.customer_id === customer.id)
          : customer.status === filter))
    .sort((a, b) => sort === "name-asc"
      ? a.name.localeCompare(b.name)
      : sort === "name-desc"
        ? b.name.localeCompare(a.name)
        : sort === "oldest"
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at)), [db, filter, query, sort]);

  // An absent or stale selection stays absent. The historical portfolio is
  // mounted only after the operator explicitly selects a real customer.
  const selected = selectedCustomerId
    ? db.customers.find((customer) => customer.id === selectedCustomerId)
    : undefined;

  const wonWorkRequiredIds = React.useMemo(
    () => collectWonWorkRequiredIds(db.quotations, db.workOrders),
    [db.quotations, db.workOrders],
  );
  const openRequiredCount = React.useMemo(
    () => calculateSalesPipelineMetrics(db.workRequired, { wonWorkRequiredIds }).openCount,
    [db.workRequired, wonWorkRequiredIds],
  );
  const liveWorkOrders = React.useMemo(
    () => db.workOrders.filter((row) => LIVE_WORK_ORDER_STATUSES.has(row.status)).length,
    [db.workOrders],
  );

  const listControls = (
    <div className="flex items-center gap-2">
      <select aria-label="Sort customers" value={sort} onChange={(event) => setSort(event.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground">
        <option value="newest">Sort: Newest first</option>
        <option value="name-asc">Name: A–Z</option>
        <option value="name-desc">Name: Z–A</option>
        <option value="oldest">Oldest first</option>
      </select>
      <select aria-label="Filter customers" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground">
        <option value="all">Filter: All</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="blocked">Blocked</option>
        <option value="with-site">With site</option>
        <option value="without-site">Site pending</option>
      </select>
    </div>
  );

  if (view === "timeline") {
    if (selected) return <HistoricalCustomerDesk view="timeline" />;
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <CustomerSearchBar query={query} setQuery={setQuery} onAdd={() => setAddCustomerOpen(true)} />
          <SectionHeader title="Customers" count={filtered.length} action={listControls} />
          <div className="rd-scroll flex max-h-[calc(100vh-280px)] flex-col gap-2 overflow-y-auto pr-1">
            {filtered.map((customer) => {
              const progress = customerProgress(db, customer.id);
              return (
                <button key={customer.id} type="button" onClick={() => selectCustomer(customer.id)} className="rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card transition-all hover:border-primary/30 hover:shadow-soft">
                  <div className="flex items-start gap-3">
                    <Avatar name={customer.name} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold">{customer.name}</p>
                        <StatusBadge label={progress.label} className="border-primary/20 bg-primary/10 text-primary" />
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" /> {customer.phone || "No phone"}</p>
                    </div>
                  </div>
                </button>
              );
            })}
            {!filtered.length && <EmptyState title="No customers found" description="Adjust the search or add a new customer." />}
          </div>
        </div>
        <div className="min-w-0">
          <EmptyState title="No customer selected" description="Pick a customer to view the restored activity timeline." />
        </div>
        <CustomerSitesDialog open={addCustomerOpen} onClose={() => setAddCustomerOpen(false)} onSaved={(id) => selectCustomer(id)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <CustomerSearchBar query={query} setQuery={setQuery} onAdd={() => setAddCustomerOpen(true)} duplicateControl={<CustomerDuplicateMergeControl />} />
      <div className="rd-metric-grid">
        <MetricCard label="Customers" value={filtered.length} hint={query || filter !== "all" ? "matching filters" : "visible now"} />
        <MetricCard label="Open work required" value={openRequiredCount} tone="primary" />
        <MetricCard label="Live work orders" value={liveWorkOrders} tone="success" />
      </div>
      <SectionHeader title="Customers" count={filtered.length} action={listControls} />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((customer) => {
          const progress = customerProgress(db, customer.id);
          const sites = db.sites.filter((site) => site.customer_id === customer.id);
          const primarySite = sites[0];
          const locationLabel = sites.length > 1
            ? `${sites.length} Sites`
            : formatLocationLabel(primarySite?.locality, primarySite?.address, primarySite?.city) || "Site pending";
          const active = customer.id === selected?.id;
          return (
            <ContextRow
              key={customer.id}
              onSelect={() => {
                selectCustomer(customer.id);
                openDetail("customer", customer.id, "customerDesk");
              }}
              className={cn("min-h-[140px] rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card transition-all hover:border-primary/30 hover:shadow-soft", active && "ring-2 ring-ring/40")}
            >
              <div className="flex items-start gap-3">
                <Avatar name={customer.name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2 pr-9">
                    <p className="min-w-0 flex-1 truncate text-sm font-bold">{customer.name}</p>
                    <StatusBadge label={progress.label} className="max-w-[52%] border-primary/20 bg-primary/10 text-primary" />
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" /> {customer.phone || "No phone"}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {locationLabel}</p>
                  <p className="mt-2 line-clamp-2 text-xs text-foreground/70">{progress.summary}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${progress.label}: ${progress.percent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent)}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
                  </div>
                </div>
              </div>
            </ContextRow>
          );
        })}
      </div>
      {!filtered.length && <EmptyState title="No customers found" description="Adjust the search or add a new customer." />}
      <CustomerSitesDialog open={addCustomerOpen} onClose={() => setAddCustomerOpen(false)} onSaved={(id) => {
        selectCustomer(id);
        openDetail("customer", id, "customerDesk");
      }} />
    </div>
  );
}

function CustomerSearchBar({ query, setQuery, onAdd, duplicateControl }: {
  query: string;
  setQuery: (value: string) => void;
  onAdd: () => void;
  duplicateControl?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer" aria-label="Search customers" className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2" />
        </div>
        <Button size="sm" onClick={onAdd} className="gap-1.5"><UserPlus className="h-4 w-4" /><span className="hidden sm:inline">Add</span></Button>
        {duplicateControl}
      </div>
    </div>
  );
}

function CustomerDuplicateMergeControl() {
  const db = useRDashStore((state) => state.db);
  const mergeCustomers = useRDashStore((state) => state.mergeCustomers);
  const selectCustomer = useRDashStore((state) => state.selectCustomer);
  const [open, setOpen] = React.useState(false);
  const [pairKey, setPairKey] = React.useState("");
  const [survivorId, setSurvivorId] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");

  const duplicatePairs = React.useMemo(() => {
    const pairs: Array<{ key: string; first: typeof db.customers[number]; second: typeof db.customers[number]; fields: string[] }> = [];
    const seen = new Set<string>();
    for (const customer of db.customers) {
      for (const match of findCustomerIdentityMatches(db.customers, customer, { excludeCustomerId: customer.id })) {
        const key = [customer.id, match.customer.id].sort().join("::");
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ key, first: customer, second: match.customer, fields: match.fields });
      }
    }
    return pairs;
  }, [db.customers]);

  const selectedPair = duplicatePairs.find((pair) => pair.key === pairKey) || duplicatePairs[0];
  const openReview = () => {
    const first = duplicatePairs[0];
    if (!first) return;
    setPairKey(first.key);
    setSurvivorId(first.first.id);
    setConfirmation("");
    setOpen(true);
  };
  const choosePair = (key: string) => {
    const pair = duplicatePairs.find((candidate) => candidate.key === key);
    if (!pair) return;
    setPairKey(key);
    setSurvivorId(pair.first.id);
    setConfirmation("");
  };
  const merge = () => {
    if (!selectedPair || confirmation !== "MERGE") return;
    if (survivorId !== selectedPair.first.id && survivorId !== selectedPair.second.id) {
      toast.error("Choose the surviving customer from the detected duplicate pair.");
      return;
    }
    const duplicateId = survivorId === selectedPair.first.id ? selectedPair.second.id : selectedPair.first.id;
    try {
      mergeCustomers(survivorId, duplicateId);
      selectCustomer(survivorId);
      setOpen(false);
      toast.success("Duplicate customer merged into the selected surviving record.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Customer merge could not be completed.");
    }
  };

  if (!duplicatePairs.length) return null;
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5 border-warning/40 text-warning" onClick={openReview}>
        <AlertTriangle className="h-3.5 w-3.5" /><span className="hidden lg:inline">Resolve duplicates</span><span className="rounded-full bg-warning/15 px-1.5 text-[10px]">{duplicatePairs.length}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resolve duplicate customers</DialogTitle>
            <DialogDescription>Only a detected identity-matching pair can be merged. Choose which record survives.</DialogDescription>
          </DialogHeader>
          {selectedPair && <div className="space-y-3">
            <label className="grid gap-1 text-xs font-medium">Detected duplicate pair
              <select value={selectedPair.key} onChange={(event) => choosePair(event.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
                {duplicatePairs.map((pair) => <option key={pair.key} value={pair.key}>{pair.first.name} ↔ {pair.second.name} · {pair.fields.join(", ")}</option>)}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {[selectedPair.first, selectedPair.second].map((customer) => (
                <button key={customer.id} type="button" onClick={() => setSurvivorId(customer.id)} className={cn("rounded-lg border p-3 text-left", survivorId === customer.id ? "border-primary bg-primary/5" : "border-border bg-background")}>
                  <p className="text-xs font-semibold">{survivorId === customer.id ? "Keep" : "Merge into other"}</p>
                  <p className="mt-1 text-sm font-bold">{customer.name}</p>
                  <p className="text-[11px] text-muted-foreground">{customer.phone || customer.email || customer.id}</p>
                </button>
              ))}
            </div>
            <label className="grid gap-1 text-xs font-medium">Type MERGE to confirm
              <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="MERGE" className="h-9" />
            </label>
          </div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!selectedPair || !survivorId || confirmation !== "MERGE"} onClick={merge}>Merge records</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
