"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building,
  CalendarClock,
  FileText,
  ListChecks,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Pencil,
  Phone,
  Plus,
  Search,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRDashStore, type ContextCustomerTab } from "@/lib/rdash/store";
import type { AuditLogEntry, RDashDatabase } from "@/lib/rdash/types";
import {
  formatDate,
  formatLocationLabel,
  indiaBusinessDate,
  quotationStatusStyle,
  relativeDay,
  taskStatusStyle,
  workRequiredStatusStyle,
} from "@/lib/rdash/format";
import { customerMapHref, customerProgress, customerWhatsappHref } from "@/lib/rdash/customer-progress";
import { isCustomerLinked } from "@/lib/rdash/customer-relations";
import { findCustomerIdentityMatches } from "@/lib/rdash/customer-identity";
import {
  customerLifecycleGaps,
  customerMatchesQuery,
  type CustomerPendingAction,
} from "@/lib/rdash/customer-desk-queries";
import { calculateSalesPipelineMetrics, collectWonWorkRequiredIds } from "@/lib/rdash/metrics";
import { Avatar, CopyValueButton, EmptyState, MetricCard, SectionHeader, StatusBadge } from "../primitives";
import { ContextRow } from "../ContextMenuHost";
import { CustomerSitesDialog } from "../CustomerSitesDialog";
import { EntityFilesCard } from "../EntityFilesCard";
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

const LIVE_WORK_ORDER_STATUSES = new Set(["scheduled", "in_progress", "on_hold"]);
const CUSTOMER_TABS: ReadonlyArray<{
  key: ContextCustomerTab;
  label: string;
  icon: React.ElementType;
}> = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "sites", label: "Sites", icon: Building },
  { key: "tasks", label: "Tasks", icon: ListChecks },
  { key: "quotations", label: "Quotations", icon: FileText },
  { key: "visits", label: "Visits", icon: MapPin },
  { key: "activity", label: "Activity", icon: Activity },
];

function customerRelatedIds(db: RDashDatabase, customerId: string): Set<string> {
  const ids = new Set<string>([customerId]);
  const direct = <T extends { id: string; customer_id?: string }>(rows: T[]) => {
    rows.forEach((row) => {
      if (row.customer_id === customerId) ids.add(row.id);
    });
  };

  direct(db.sites);
  direct(db.workRequired);
  direct(db.quotations);
  direct(db.workOrders);
  direct(db.visits);
  direct(db.followups);
  direct(db.blocked);
  direct(db.commSends);
  direct(db.variationRequests);

  db.tasks.forEach((row) => {
    if (isCustomerLinked(db, row, customerId)) ids.add(row.id);
  });
  db.risks.forEach((row) => {
    if (isCustomerLinked(db, row, customerId)) ids.add(row.id);
  });

  const siteIds = new Set(db.sites.filter((site) => site.customer_id === customerId).map((site) => site.id));
  db.areas.forEach((area) => {
    if (siteIds.has(area.site_id)) ids.add(area.id);
  });

  const workOrderIds = new Set(db.workOrders.filter((row) => row.customer_id === customerId).map((row) => row.id));
  db.boqs.forEach((row) => {
    if (workOrderIds.has(row.work_order_id)) ids.add(row.id);
  });
  db.drawings.forEach((row) => {
    if (row.work_order_id && workOrderIds.has(row.work_order_id)) ids.add(row.id);
  });
  db.executionLogs.forEach((row) => {
    if (row.work_order_id && workOrderIds.has(row.work_order_id)) ids.add(row.id);
  });

  return ids;
}

function customerAuditEvents(db: RDashDatabase, customerId: string): AuditLogEntry[] {
  const relatedIds = customerRelatedIds(db, customerId);
  return db.auditLog
    .filter((entry) =>
      (entry.entity_type === "customer" && entry.entity_id === customerId)
      || Boolean(entry.entity_id && relatedIds.has(entry.entity_id)),
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function CustomerDesk({ view }: { view?: "default" | "timeline" } = {}) {
  const db = useRDashStore((state) => state.db);
  const selectedCustomerId = useRDashStore((state) => state.selectedCustomerId);
  const selectCustomer = useRDashStore((state) => state.selectCustomer);
  const openDetail = useRDashStore((state) => state.openDetail);
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState("newest");
  const [filter, setFilter] = React.useState("all");
  const [addCustomerOpen, setAddCustomerOpen] = React.useState(false);
  const [editCustomerId, setEditCustomerId] = React.useState<string>();

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

  // Selection is explicit. An absent/stale selection never silently becomes the
  // first customer in the database.
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
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <CustomerSearchBar query={query} setQuery={setQuery} onAdd={() => setAddCustomerOpen(true)} />
          <SectionHeader title="Customers" count={filtered.length} action={listControls} />
          <div className="rd-scroll flex max-h-[calc(100vh-280px)] flex-col gap-2 overflow-y-auto pr-1">
            {filtered.map((customer) => {
              const progress = customerProgress(db, customer.id);
              const active = customer.id === selected?.id;
              return (
                <button key={customer.id} type="button" onClick={() => selectCustomer(customer.id)} className={cn("rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card transition-all hover:border-primary/30 hover:shadow-soft", active && "ring-2 ring-ring/40")}>
                  <div className="flex items-start gap-3">
                    <Avatar name={customer.name} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold">{customer.name}</p>
                        <StatusBadge label={progress.label} className="border-primary/20 bg-primary/10 text-primary" />
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {customer.phone || "No phone"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
            {!filtered.length && <EmptyState title="No customers found" description="Adjust the search or add a new customer." />}
          </div>
        </div>
        <div className="min-w-0">
          {selected
            ? <CustomerTimelineView name={selected.name} entries={customerAuditEvents(db, selected.id)} />
            : <EmptyState title="No customer selected" description="Pick a customer to view their event history." icon={<Activity className="h-7 w-7" />} />}
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
      <CustomerSitesDialog editId={editCustomerId} open={Boolean(editCustomerId)} onClose={() => setEditCustomerId(undefined)} onSaved={(id) => {
        setEditCustomerId(undefined);
        selectCustomer(id);
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

export function CustomerPortfolioDrawerContent({ customerId }: { customerId: string }) {
  return <CustomerPortfolioContext customerId={customerId} />;
}

function CustomerPortfolioContext({ customerId }: { customerId: string }) {
  const db = useRDashStore((state) => state.db);
  const setActiveModule = useRDashStore((state) => state.setActiveModule);
  const openCreateDialog = useRDashStore((state) => state.openCreateDialog);
  const openDetail = useRDashStore((state) => state.openDetail);
  const detailPanel = useRDashStore((state) => state.detailPanel);
  const contextHistory = useRDashStore((state) => state.contextHistory);
  const contextHistoryIndex = useRDashStore((state) => state.contextHistoryIndex);
  const setContextCustomerTab = useRDashStore((state) => state.setContextCustomerTab);
  const [tab, setTab] = React.useState<ContextCustomerTab>("overview");
  const [editCustomerOpen, setEditCustomerOpen] = React.useState(false);
  const [addSiteOpen, setAddSiteOpen] = React.useState(false);
  const [editSiteId, setEditSiteId] = React.useState<string>();

  const customer = db.customers.find((row) => row.id === customerId);
  const sites = db.sites.filter((row) => row.customer_id === customerId && !row.is_archived);
  const workRequired = db.workRequired.filter((row) => row.customer_id === customerId);
  const relatedTasks = db.tasks.filter((row) => isCustomerLinked(db, row, customerId));
  const relatedFollowups = db.followups.filter((row) => isCustomerLinked(db, row, customerId));
  const quotations = db.quotations.filter((row) => row.customer_id === customerId);
  const visits = db.visits.filter((row) => row.customer_id === customerId);
  const communications = db.commSends.filter((row) => isCustomerLinked(db, row, customerId));
  const risks = db.risks.filter((row) => isCustomerLinked(db, row, customerId));
  const obstacles = db.blocked.filter((row) => isCustomerLinked(db, row, customerId));
  const variations = db.variationRequests.filter((row) => isCustomerLinked(db, row, customerId));
  const openTasks = relatedTasks.filter((row) => row.status !== "completed" && row.status !== "cancelled");
  const lifecycleGaps = React.useMemo(
    () => customerLifecycleGaps(db, customerId).filter((gap) => gap.key !== "budget"),
    [db, customerId],
  );
  const progress = customerProgress(db, customerId);
  const singleSite = sites.length === 1 ? sites[0] : undefined;
  const mapHref = singleSite ? customerMapHref(singleSite.address, singleSite.latitude, singleSite.longitude) : undefined;
  const whatsappHref = customerWhatsappHref(customer?.phone);

  const currentContextEntry = contextHistory[contextHistoryIndex];
  const isContextCustomer = detailPanel.fromModule === "context"
    && detailPanel.kind === "customer"
    && detailPanel.recordId === customerId
    && currentContextEntry?.recordId === customerId;
  React.useEffect(() => {
    setTab(isContextCustomer ? currentContextEntry?.customerTab || "overview" : "overview");
  }, [customerId, currentContextEntry?.customerTab, isContextCustomer]);
  const selectTab = React.useCallback((next: ContextCustomerTab) => {
    setTab(next);
    if (isContextCustomer) setContextCustomerTab(next);
  }, [isContextCustomer, setContextCustomerTab]);

  if (!customer) return <EmptyState title="Customer not found" description="This customer record is no longer available." />;

  const gapAction = (gap: CustomerPendingAction) => {
    if (gap.key === "visit") openCreateDialog({ kind: "visit", customerId });
    else if (gap.key === "quotation") openCreateDialog({ kind: "quotation", customerId });
    else if (gap.key === "site") setAddSiteOpen(true);
    else if (gap.key === "measurement") selectTab("sites");
  };

  return (
    <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar name={customer.name} size={48} />
          <div className="min-w-0">
            <h2 className="break-words text-lg font-bold leading-snug tracking-tight">{customer.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {customer.phone
                ? <span className="inline-flex items-center gap-0.5"><a href={`tel:${customer.phone}`} className="flex items-center gap-1 hover:text-primary"><Phone className="h-3 w-3" />{customer.phone}</a><CopyValueButton value={customer.phone} label="Mobile number" /></span>
                : <span className="flex items-center gap-1"><Phone className="h-3 w-3" />No phone</span>}
              {customer.email && <a href={`mailto:${customer.email}`} className="flex items-center gap-1 hover:text-primary"><Mail className="h-3 w-3" />{customer.email}</a>}
              {sites.length > 1 && <span className="flex items-center gap-1"><Building className="h-3 w-3" />{sites.length} Sites</span>}
              {singleSite?.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{singleSite.address}</span>}
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={() => setEditCustomerOpen(true)}><Pencil className="h-3.5 w-3.5" /><span className="hidden sm:inline">Edit</span></Button>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium">{progress.summary}</span>
          <span className="shrink-0 text-[10px] font-mono text-muted-foreground">{progress.percent}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${progress.label}: ${progress.percent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent)}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button size="sm" className="h-7 text-xs" onClick={() => openCreateDialog({ kind: "quotation", customerId })}><FileText className="mr-1 h-3.5 w-3.5" />Create quotation</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openCreateDialog({ kind: "visit", customerId })}><MapPin className="mr-1 h-3.5 w-3.5" />Schedule visit</Button>
        {whatsappHref && <Button asChild size="sm" variant="outline" className="h-7 text-xs"><a href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-3.5 w-3.5" />WhatsApp</a></Button>}
        {mapHref && <Button asChild size="sm" variant="outline" className="h-7 text-xs"><a href={mapHref} target="_blank" rel="noreferrer"><Navigation className="mr-1 h-3.5 w-3.5" />Maps</a></Button>}
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => customer.phone ? window.location.href = `tel:${customer.phone}` : toast.info("No phone number on file")}><Phone className="mr-1 h-3.5 w-3.5" />Call</Button>
      </div>

      <div className="mt-4 flex items-center gap-1 overflow-x-auto border-b border-border pb-px rd-scroll rd-scroll-fade" role="tablist" aria-label="Customer record sections">
        {CUSTOMER_TABS.map(({ key, label, icon: Icon }) => {
          const count = key === "sites" ? sites.length
            : key === "tasks" ? relatedTasks.length
              : key === "quotations" ? quotations.length
                : key === "visits" ? visits.length
                  : key === "activity" ? relatedFollowups.length + communications.length + risks.length + obstacles.length + variations.length
                    : undefined;
          return <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => selectTab(key)} className={cn("flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition-colors", tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}><Icon className="h-3.5 w-3.5" />{label}{count !== undefined ? ` (${count})` : ""}</button>;
        })}
      </div>

      <div className="mt-3">
        {tab === "overview" && <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard label="Sites" value={sites.length} tone="primary" />
            <MetricCard label="Open tasks" value={openTasks.length} tone="warning" />
            <MetricCard label="Quotations" value={quotations.length} />
            <MetricCard label="Visits" value={visits.length} />
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Customer scope</p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setActiveModule("siteExecution")}>Open Sites &amp; Execution</Button>
            </div>
            {sites.length ? <div className="mt-2 space-y-2">{sites.map((site) => {
              const siteWork = workRequired.filter((row) => row.site_id === site.id || (sites.length === 1 && !row.site_id));
              const siteAreas = db.areas.filter((row) => row.site_id === site.id && !row.is_archived);
              return <button key={site.id} type="button" onClick={() => openDetail("site", site.id)} className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-left hover:bg-accent/20">
                <span className="min-w-0"><span className="block truncate text-xs font-semibold">{site.name}</span><span className="block truncate text-[10px] text-muted-foreground">{site.address || `${site.site_type} · ${site.stage}`}</span></span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{siteAreas.length} areas · {siteWork.length} work required</span>
              </button>;
            })}</div> : <p className="mt-2 text-xs text-muted-foreground">No site has been added yet.</p>}
          </div>
          <EntityFilesCard entityType="customer" entityId={customerId} title="Customer documents" />
          <SectionHeader title="Pending actions" count={lifecycleGaps.length + openTasks.length} />
          {lifecycleGaps.length + openTasks.length === 0
            ? <EmptyState title="No pending actions" description="There are no open CRM or execution actions for this customer." />
            : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {lifecycleGaps.map((gap) => <ContextRow key={gap.key} onSelect={() => gapAction(gap)} className="rounded-lg border border-border bg-background px-3 py-2"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-medium">{gap.label}</p><span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary">Resolve<ArrowRight className="h-3 w-3" /></span></div><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{gap.hint}</p></ContextRow>)}
              {openTasks.slice(0, 4).map((task) => <button key={task.id} type="button" onClick={() => openDetail("task", task.id)} className="rounded-lg border border-border bg-background px-3 py-2 text-left"><p className="truncate text-sm font-medium">{task.title}</p><p className="mt-1 text-[11px] text-muted-foreground">Due {relativeDay(task.due_date)} · {task.assignee_name || "Unassigned"}</p></button>)}
            </div>}
        </div>}

        {tab === "sites" && <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddSiteOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />Add site</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setActiveModule("siteExecution")}><Building className="mr-1 h-3.5 w-3.5" />Open Sites &amp; Execution</Button>
          </div>
          {!sites.length ? <EmptyState title="No sites" description="Add a site to start tracking property-specific work." icon={<Building className="h-7 w-7" />} /> : sites.map((site) => {
            const siteAreas = db.areas.filter((row) => row.site_id === site.id && !row.is_archived);
            const siteWork = workRequired.filter((row) => row.site_id === site.id || (sites.length === 1 && !row.site_id));
            const siteJobs = db.workOrders.filter((row) => row.site_id === site.id && LIVE_WORK_ORDER_STATUSES.has(row.status));
            const href = customerMapHref(site.address, site.latitude, site.longitude);
            return <div key={site.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate text-sm font-bold">{site.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{site.address || `${site.site_type} · ${site.stage}`}</p></div>
                <div className="flex shrink-0 gap-1">{href && <Button asChild size="icon" variant="ghost" className="h-7 w-7"><a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${site.name} in Maps`}><Navigation className="h-3.5 w-3.5" /></a></Button>}<Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditSiteId(site.id)} aria-label={`Edit ${site.name}`}><Pencil className="h-3.5 w-3.5" /></Button></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2"><MetricCard label="Areas" value={siteAreas.length} /><MetricCard label="Work required" value={siteWork.length} tone="primary" /><MetricCard label="Live work orders" value={siteJobs.length} tone="success" /></div>
              <div className="mt-3 space-y-1.5">{siteWork.length ? siteWork.map((work) => {
                const style = workRequiredStatusStyle(work.status);
                return <button key={work.id} type="button" onClick={() => openDetail("workRequired", work.id)} className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-2 text-left"><span className="min-w-0 truncate text-xs font-medium">{work.title}</span><StatusBadge label={style.label} className={style.className} /></button>;
              }) : <p className="rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">No work required recorded for this site.</p>}</div>
            </div>;
          })}
        </div>}

        {tab === "tasks" && <div className="flex flex-col gap-2">
          <div className="flex justify-end"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openCreateDialog({ kind: "task", customerId })}><Plus className="mr-1 h-3.5 w-3.5" />Add task</Button></div>
          {!relatedTasks.length ? <EmptyState title="No tasks" description="Add a task for this customer." icon={<ListChecks className="h-7 w-7" />} /> : relatedTasks.map((task) => {
            const style = taskStatusStyle(task.status);
            return <button key={task.id} type="button" onClick={() => openDetail("task", task.id)} className="rounded-lg border border-border bg-background px-3 py-2 text-left"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-medium">{task.title}</p><StatusBadge label={style.label} className={style.className} /></div><p className="mt-1 text-[11px] text-muted-foreground">Due {relativeDay(task.due_date)} · {task.assignee_name || "Unassigned"}</p></button>;
          })}
        </div>}

        {tab === "quotations" && <div className="flex flex-col gap-2">
          <div className="flex justify-end"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openCreateDialog({ kind: "quotation", customerId })}><Plus className="mr-1 h-3.5 w-3.5" />Add quotation</Button></div>
          {!quotations.length ? <EmptyState title="No quotations" description="Create the first quotation for this customer." icon={<FileText className="h-7 w-7" />} /> : quotations.map((quotation) => {
            const style = quotationStatusStyle(quotation.status);
            return <button key={quotation.id} type="button" onClick={() => openDetail("quotation", quotation.id)} className="rounded-lg border border-border bg-background px-3 py-2 text-left"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{quotation.quotation_no} · {quotation.title}</p><p className="text-[11px] text-muted-foreground">Valid till {relativeDay(quotation.valid_until)}</p></div><StatusBadge label={style.label} className={style.className} /></div></button>;
          })}
        </div>}

        {tab === "visits" && <div className="flex flex-col gap-2">
          <div className="flex justify-end"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openCreateDialog({ kind: "visit", customerId })}><Plus className="mr-1 h-3.5 w-3.5" />Schedule visit</Button></div>
          {!visits.length ? <EmptyState title="No visits" description="Schedule the first visit for this customer." icon={<MapPin className="h-7 w-7" />} /> : visits.map((visit) => <button key={visit.id} type="button" onClick={() => openDetail("visit", visit.id)} className="rounded-lg border border-border bg-background px-3 py-2 text-left"><p className="text-sm font-medium capitalize">{visit.visit_type.replace(/_/g, " ")} · {visit.location_name || "Site"}</p><p className="mt-1 text-[11px] text-muted-foreground">Scheduled {relativeDay(visit.scheduled_at)} · {visit.staff_name || "Unassigned"} · {visit.status.replace(/_/g, " ")}</p></button>)}
        </div>}

        {tab === "activity" && <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><MetricCard label="Follow-ups" value={relatedFollowups.length} tone="primary" /><MetricCard label="Communications" value={communications.length} /><MetricCard label="Open risks" value={risks.length} tone="warning" /><MetricCard label="Open obstacles" value={obstacles.filter((row) => !row.resolved).length} tone="destructive" /></div>
          <ActivitySection title={`Follow-ups (${relatedFollowups.length})`} empty="No follow-ups linked to this customer." rows={relatedFollowups.slice(0, 10).map((row) => ({ id: row.id, title: row.title, detail: `${row.followup_type || "general"} · due ${relativeDay(row.due_date)} · ${row.status}` }))} />
          <ActivitySection title={`Communications (${communications.length})`} empty="No logged customer communications." rows={communications.slice(0, 10).map((row) => ({ id: row.id, title: row.subject, detail: `${row.channel} · ${row.status} · ${formatDate(row.sent_at)}` }))} />
          <ActivitySection title={`Risks (${risks.length})`} empty="No customer risks." rows={risks.slice(0, 10).map((row) => ({ id: row.id, title: row.title, detail: `${row.type} · ${row.severity} · ${row.reason}` }))} />
          <ActivitySection title={`Obstacles (${obstacles.length})`} empty="No customer obstacles." rows={obstacles.slice(0, 10).map((row) => ({ id: row.id, title: row.title, detail: `${row.resolved ? "Resolved" : "Open"} · ${row.reason}` }))} />
          <ActivitySection title={`Variation requests (${variations.length})`} empty="No variation requests." rows={variations.slice(0, 10).map((row) => ({ id: row.id, title: `${row.variation_no} · ${row.title}`, detail: row.status.replace(/_/g, " ") }))} />
        </div>}
      </div>

      <CustomerSitesDialog editId={customerId} open={editCustomerOpen || addSiteOpen || Boolean(editSiteId)} autoAddSite={addSiteOpen} expandSiteId={editSiteId} onClose={() => {
        setEditCustomerOpen(false);
        setAddSiteOpen(false);
        setEditSiteId(undefined);
      }} />
    </div>
  );
}

function ActivitySection({ title, empty, rows }: { title: string; empty: string; rows: Array<{ id: string; title: string; detail: string }> }) {
  return <section><p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">{title}</p>{rows.length ? <div className="flex flex-col gap-1.5">{rows.map((row) => <div key={row.id} className="rounded-md border border-border bg-background px-2.5 py-1.5"><p className="truncate text-xs font-semibold">{row.title}</p><p className="truncate text-[10px] text-muted-foreground">{row.detail}</p></div>)}</div> : <p className="rounded-md border border-dashed border-border bg-muted/20 py-3 text-center text-xs text-muted-foreground">{empty}</p>}</section>;
}

function auditEntryNavigable(entry: AuditLogEntry) {
  return ["customer", "site", "workRequired", "work_required", "quotation", "workOrder", "work_order", "task", "followup", "visit", "blocked", "boq"].includes(entry.entity_type);
}

function CustomerTimelineView({ name, entries }: { name: string; entries: AuditLogEntry[] }) {
  const openDetail = useRDashStore((state) => state.openDetail);
  const grouped = React.useMemo(() => {
    const map = new Map<string, AuditLogEntry[]>();
    for (const entry of entries) {
      const day = indiaBusinessDate(entry.timestamp);
      map.set(day, [...(map.get(day) || []), entry]);
    }
    return [...map.entries()];
  }, [entries]);

  const openEntry = (entry: AuditLogEntry) => {
    const id = entry.entity_id;
    if (!id) return;
    switch (entry.entity_type) {
      case "customer": openDetail("customer", id); break;
      case "site": openDetail("site", id); break;
      case "workRequired":
      case "work_required": openDetail("workRequired", id); break;
      case "quotation": openDetail("quotation", id); break;
      case "workOrder":
      case "work_order": openDetail("workOrder", id); break;
      case "task": openDetail("task", id); break;
      case "followup": openDetail("followup", id); break;
      case "visit": openDetail("visit", id); break;
      case "blocked": openDetail("blocked", id); break;
      case "boq": openDetail("boq", id); break;
    }
  };

  return <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Avatar name={name} size={48} /><div className="min-w-0"><h2 className="break-words text-lg font-bold leading-snug tracking-tight">{name}</h2><p className="mt-0.5 text-xs text-muted-foreground">Event history · {entries.length} audited events</p></div></div><StatusBadge label="EVENT LOG" className="border-primary/20 bg-primary/10 text-primary" /></div>
    <SectionHeader title="Chronological event log" count={entries.length} />
    {!entries.length ? <EmptyState title="No audited events yet" description="Customer activity will appear here when it is recorded in the audit log." icon={<Activity className="h-7 w-7" />} /> : <div className="flex flex-col gap-4">{grouped.map(([day, dayEntries]) => <div key={day} className="flex flex-col gap-2"><div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-card/95 px-1 py-1 backdrop-blur-sm"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{relativeDay(day)}</span><span className="text-[10px] text-muted-foreground/70">· {new Date(`${day}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span><span className="ml-auto text-[10px] text-muted-foreground">{dayEntries.length} event{dayEntries.length === 1 ? "" : "s"}</span></div><ol className="relative ml-3 border-l border-border">{dayEntries.map((entry) => {
      const body = <><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Activity className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-foreground">{entry.action}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{entry.actor}{entry.actor_role ? ` (${entry.actor_role})` : ""} · {formatDate(entry.timestamp)} · {entry.entity_type.replace(/_/g, " ")}</p>{entry.reason && <p className="mt-1 text-[10px] text-muted-foreground">{entry.reason}</p>}</div><span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{entry.kind}</span></>;
      return <li key={entry.id} className="mb-2 ml-4 last:mb-0">{auditEntryNavigable(entry) ? <button type="button" onClick={() => openEntry(entry)} className="flex w-full items-start gap-2.5 rounded-md border border-border bg-background px-3 py-2 text-left transition-all hover:border-primary/30 hover:bg-accent/20">{body}</button> : <div className="flex w-full items-start gap-2.5 rounded-md border border-border bg-background px-3 py-2">{body}</div>}</li>;
    })}</ol></div>)}</div>}
  </div>;
}
