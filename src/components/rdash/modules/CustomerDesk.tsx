"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Search, UserPlus, FilePlus2, Phone, MapPin, Mail, MessageCircle, Navigation, CalendarClock, Wallet, FileText, ListChecks, Activity, Building, Plus, CheckCircle2, AlertTriangle, Pencil, Package, Truck, Receipt, Send, Check, ChevronDown, } from "lucide-react";
import { useRDashStore, siteFinancials, type ContextCustomerTab } from "@/lib/rdash/store";
import { Avatar, CopyValueButton, StatusBadge, MetricCard, SectionHeader, EmptyState } from "../primitives";
import { ContextRow, type ContextAction } from "../ContextMenuHost";
import { buildCustomerActions, buildTaskActions, buildQuotationActions, buildPaymentActions, buildVisitActions } from "../recordActions";
import { CustomerSitesDialog } from "../CustomerSitesDialog";
import { SiteFormDialog } from "../SiteFormDialog";
import { FilePreview, type FilePreviewSource } from "../FilePreview";
import { assetPreview } from "@/lib/rdash/file-attachments";
import { EntityFilesCard } from "../EntityFilesCard";
import { useUploadDraft } from "@/lib/uploads/use-upload-draft";
import { WorkRequiredCreateDialog } from "../WorkRequiredCreateDialog";
import { RecordPaymentDialog } from "../ActionDialogs";
import { entityStatusStyle, workRequiredStatusStyle, taskStatusStyle, paymentStatusStyle, invoiceStatusStyle, quotationStatusStyle, formatINR, formatINRShort, formatDate, relativeDay, workByCustomerFallback, } from "@/lib/rdash/format";
import { workByCustomer } from "@/lib/rdash/seed";
import { customerMapHref, customerProgress, customerWhatsappHref } from "@/lib/rdash/customer-progress";
import { isCustomerLinked } from "@/lib/rdash/customer-relations";
import { findCustomerIdentityMatches } from "@/lib/rdash/customer-identity";
import { calculateSalesPipelineMetrics, collectWonWorkRequiredIds, latestQuotationRevisions } from "@/lib/rdash/metrics";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
const COMMON_ROOM_NAMES = [
    "Kitchen",
    "Bedroom",
    "Master Bedroom",
    "Kids Bedroom",
    "Hall",
    "Living Area",
    "Dining",
    "Balcony",
    "Bathroom",
    "Toilet",
    "Reception",
    "Terrace",
    "Office",
    "Store Area",
    "Utility",
    "Pooja Area",
    "Lobby",
    "Passage",
];
const normalizeAreaName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const titleCaseAreaName = (value: string) => value.trim().replace(/\s+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
export function CustomerDesk({ view }: {
    view?: "default" | "timeline";
} = {}) {
    const db = useRDashStore((s) => s.db);
    const selectedCustomerId = useRDashStore((s) => s.selectedCustomerId);
    const selectCustomer = useRDashStore((s) => s.selectCustomer);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const openActionDialog = useRDashStore((s) => s.openActionDialog);
    const openCreateDialog = useRDashStore((s) => s.openCreateDialog);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [q, setQ] = React.useState("");
    const [sort, setSort] = React.useState("default");
    const [filter, setFilter] = React.useState("all");
    const customerDispatch = React.useMemo(() => ({ setActiveModule, openActionDialog, openCreateDialog }), [setActiveModule, openActionDialog, openCreateDialog]);
    const [addCustomerOpen, setAddCustomerOpen] = React.useState(false);
    // B-19: Local state for the unified Customer and Sites edit dialog.
    // The Edit context-menu action on a customer row uses this to open the form directly,
    // instead of just opening the detail panel and forcing the user to click Edit again.
    const [editCustomerId, setEditCustomerId] = React.useState<string | undefined>(undefined);
    const filtered = db.customers.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.phone.includes(q) ||
        db.sites.some((site) => site.customer_id === p.id && [site.name, site.address, site.locality, site.city, site.building_name].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase())))
        .filter((p) => filter === "all" ||
        (filter === "with-site" ? db.sites.some((site) => site.customer_id === p.id) :
            filter === "without-site" ? !db.sites.some((site) => site.customer_id === p.id) : p.status === filter))
        .sort((a, b) => sort === "name-asc" ? a.name.localeCompare(b.name) :
        sort === "name-desc" ? b.name.localeCompare(a.name) :
            sort === "newest" ? b.created_at.localeCompare(a.created_at) :
                sort === "oldest" ? a.created_at.localeCompare(b.created_at) : 0);
    const customerListControls = (<div className="flex items-center gap-2">
      <select aria-label="Sort customers" value={sort} onChange={(event) => setSort(event.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground">
        <option value="default">Sort: Default</option>
        <option value="name-asc">Name: A–Z</option>
        <option value="name-desc">Name: Z–A</option>
        <option value="newest">Newest first</option>
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
    </div>);
    const selected = db.customers.find((p) => p.id === selectedCustomerId) || db.customers[0];
    const selectedTasks = (db.tasks || []).filter((t) => selected ? isCustomerLinked(db, t, selected.id) : false);
    const selectedQuotes = (db.quotations || []).filter((qu) => qu.customer_id === selected?.id);
    const selectedPayments = (db.payments || []).filter((pa) => pa.customer_id === selected?.id);
    const selectedVisits = (db.visits || []).filter((v) => v.customer_id === selected?.id);
    const selectedSites = (db.sites || []).filter((s) => s.customer_id === selected?.id);
    const selectedAreas = (db.areas || []).filter((r) => selectedSites.some((s) => s.id === r.site_id));
    const wonWorkRequiredIds = React.useMemo(() => collectWonWorkRequiredIds(db.quotations || [], db.workOrders || []), [db.quotations, db.workOrders]);
    const openReqCount = React.useMemo(() => calculateSalesPipelineMetrics(db.workRequired || [], { wonWorkRequiredIds }).openCount, [db.workRequired, wonWorkRequiredIds]);
    // B-9: Build a comprehensive Set of entity IDs that belong to this customer so the timeline
    // audit-log filter can match entries by ID (instead of the previous fragile substring match
    // on entity_label). Covers quotations, payments, tasks, visits, sites, workRequired, workOrders,
    // invoices, followups, blocked, commSends, and the customer record itself.
    const selectedRelatedIds = React.useMemo(() => {
        const ids = new Set<string>();
        if (!selected)
            return ids;
        ids.add(selected.id);
        const pushWhereCustomer = <T extends { customer_id?: string; id: string }>(rows: T[]) => rows.forEach((r) => { if (r.customer_id === selected.id) ids.add(r.id); });
        pushWhereCustomer(db.quotations);
        pushWhereCustomer(db.payments);
        pushWhereCustomer(db.visits);
        pushWhereCustomer(db.sites);
        pushWhereCustomer(db.workRequired || []);
        pushWhereCustomer(db.workOrders);
        pushWhereCustomer(db.invoices);
        pushWhereCustomer(db.followups);
        pushWhereCustomer(db.blocked);
        pushWhereCustomer(db.commSends);
        // Tasks may carry customer_id directly or resolve via parent links (site/quotation/visit/etc).
        (db.tasks || []).forEach((t) => { if (isCustomerLinked(db, t, selected.id)) ids.add(t.id); });
        // Areas belong to sites that belong to this customer.
        (db.areas || []).forEach((a) => { if (selectedSites.some((s) => s.id === a.site_id)) ids.add(a.id); });
        return ids;
    }, [db, selected, selectedSites]);
    const selectAndOpenCustomer = (customerId: string) => {
        selectCustomer(customerId);
        openDetail("customer", customerId, "customerDesk");
    };
    if (view === "timeline") {
        return (<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-3">
          <div className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer" className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2"/>
              </div>
              <Button size="sm" variant="default" className="gap-1.5" onClick={() => setAddCustomerOpen(true)}>
                <UserPlus className="h-4 w-4"/> <span className="hidden sm:inline">Add</span>
              </Button>
            </div>
          </div>

          <SectionHeader title="Customers" count={filtered.length} action={customerListControls}/>

          <div className="rd-scroll flex max-h-[calc(100vh-280px)] flex-col gap-2 overflow-y-auto pr-1">
            {filtered.map((p) => {
                const progress = customerProgress(db, p.id);
                const active = p.id === selected?.id;
                return (<button key={p.id} type="button" onClick={() => selectCustomer(p.id)} className={cn("rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card transition-all hover:border-primary/30 hover:shadow-soft", active && "ring-2 ring-ring/40")}>
                  <div className="flex items-start gap-3">
                    <Avatar name={p.name} size={38}/>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold text-foreground">{p.name}</p>
                        <StatusBadge label={progress.label} className="bg-primary/10 text-primary border-primary/20"/>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3"/> {p.phone}
                      </p>
                    </div>
                                      </div>
                </button>);
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {selected ? (<CustomerTimelineView customerId={selected.id} name={selected.name} tasks={selectedTasks} quotations={selectedQuotes} payments={selectedPayments} visits={selectedVisits} sites={selectedSites} auditLog={db.auditLog.filter((a) => (a.entity_type === "customer" && a.entity_id === selected.id) || (a.entity_id && selectedRelatedIds.has(a.entity_id)))} drawings={(db.drawings || []).filter((d) => d.work_order_id && db.workOrders.some((w) => w.id === d.work_order_id && w.customer_id === selected.id))} executionLogs={(db.executionLogs || []).filter((el) => el.work_order_id && db.workOrders.some((w) => w.id === el.work_order_id && w.customer_id === selected.id))} boqs={(db.boqs || []).filter((b) => b.work_order_id && db.workOrders.some((w) => w.id === b.work_order_id && w.customer_id === selected.id))} purchaseOrders={(db.purchaseOrders || []).filter((p) => p.work_order_id && db.workOrders.some((w) => w.id === p.work_order_id && w.customer_id === selected.id))} grns={(db.grns || []).filter((g) => g.work_order_id && db.workOrders.some((w) => w.id === g.work_order_id && w.customer_id === selected.id))} vendorBills={(db.vendorBills || []).filter((vb) => vb.work_order_id && db.workOrders.some((w) => w.id === vb.work_order_id && w.customer_id === selected.id))} workOrders={(db.workOrders || []).filter((w) => w.customer_id === selected.id)} commSends={(db.commSends || []).filter((c) => c.customer_id === selected.id)} />) : (<EmptyState title="No customer selected" description="Pick a customer from the list to view their timeline."/>)}
        </div>

        <CustomerSitesDialog open={addCustomerOpen} onClose={() => setAddCustomerOpen(false)} onSaved={(id) => { selectCustomer(id); }}/>
        {/* B-19: Unified Customer and Sites editor — opened by the context-menu Edit action. */}
        <CustomerSitesDialog editId={editCustomerId} open={Boolean(editCustomerId)} onClose={() => setEditCustomerId(undefined)} onSaved={(id) => { setEditCustomerId(undefined); selectCustomer(id); }}/>
      </div>);
    }
    return (<div className="flex flex-col gap-3">
      <div className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer" className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2"/>
          </div>
          <Button size="sm" variant="default" className="gap-1.5" onClick={() => setAddCustomerOpen(true)}>
            <UserPlus className="h-4 w-4"/> <span className="hidden sm:inline">Add</span>
          </Button>
          <CustomerDuplicateMergeControl />
        </div>
      </div>

      <div className="rd-metric-grid">
        <MetricCard label="Customers" value={db.customers.length} hint="visible now"/>
        <MetricCard label="Open work required" value={openReqCount} tone="primary"/>
        <MetricCard label="Live work orders" value={db.workOrders.length} tone="success"/>
      </div>

      <SectionHeader title="Customers" count={filtered.length} action={customerListControls}/>

      <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((p) => {
            const progress = customerProgress(db, p.id);
            const customerSites = db.sites.filter((site) => site.customer_id === p.id);
            const primarySite = customerSites[0];
            const locationLabel = customerSites.length > 1 ? `${customerSites.length} Sites` : [primarySite?.locality, primarySite?.address, primarySite?.city].filter(Boolean).join(", ") || "Site pending";
            const work = progress.summary || workByCustomer[p.id] || workByCustomerFallback(customerSites);
            const active = p.id === selected?.id;
            return (<ContextRow key={p.id} actions={buildCustomerActions(p.id, customerDispatch, { onOpen: () => selectAndOpenCustomer(p.id), onEdit: () => setEditCustomerId(p.id) })} onSelect={() => selectAndOpenCustomer(p.id)} className={cn("min-h-[148px] rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card transition-all hover:border-primary/30 hover:shadow-soft", active && "ring-2 ring-ring/40")}>
              <div className="flex items-start gap-3">
                <Avatar name={p.name} size={40}/>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2 pr-9">
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{p.name}</p>
                    <StatusBadge label={progress.label} className="max-w-[52%] bg-primary/10 text-primary border-primary/20"/>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3"/> {p.phone || "—"}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3"/> {locationLabel}</p>
                  <p className="mt-2 line-clamp-2 text-xs text-foreground/70">{work}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`${progress.label}: ${progress.percent}%`}><div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }}/></div>
                </div>
              </div>
            </ContextRow>);
        })}
      </div>

      {filtered.length === 0 && <EmptyState title="No customers found" description="Adjust the search or add a new customer."/>}

      <CustomerSitesDialog open={addCustomerOpen} onClose={() => setAddCustomerOpen(false)} onSaved={(id) => {
            selectCustomer(id);
            openDetail("customer", id, "customerDesk");
        }}/>
        {/* B-19: Unified Customer and Sites editor — opened by the context-menu Edit action. */}
        <CustomerSitesDialog editId={editCustomerId} open={Boolean(editCustomerId)} onClose={() => setEditCustomerId(undefined)} onSaved={(id) => { setEditCustomerId(undefined); selectCustomer(id); }}/>
    </div>);
}
function CustomerDuplicateMergeControl() {
    const db = useRDashStore((state) => state.db);
    const mergeCustomers = useRDashStore((state) => state.mergeCustomers);
    const selectCustomer = useRDashStore((state) => state.selectCustomer);
    const [open, setOpen] = React.useState(false);
    const [survivorId, setSurvivorId] = React.useState("");
    const [duplicateId, setDuplicateId] = React.useState("");
    const [confirmation, setConfirmation] = React.useState("");
    const duplicatePairs = React.useMemo(() => {
        const pairs: Array<{
            first: typeof db.customers[number];
            second: typeof db.customers[number];
            fields: string[];
        }> = [];
        const seen = new Set<string>();
        for (const customer of db.customers) {
            for (const match of findCustomerIdentityMatches(db.customers, customer, { excludeCustomerId: customer.id })) {
                const key = [customer.id, match.customer.id].sort().join("::");
                if (seen.has(key))
                    continue;
                seen.add(key);
                pairs.push({ first: customer, second: match.customer, fields: match.fields });
            }
        }
        return pairs;
    }, [db.customers]);
    const customersInDuplicates = React.useMemo(() => {
        const byId = new Map<string, typeof db.customers[number]>();
        duplicatePairs.forEach((pair) => { byId.set(pair.first.id, pair.first); byId.set(pair.second.id, pair.second); });
        return [...byId.values()];
    }, [duplicatePairs]);
    const openReview = () => {
        const firstPair = duplicatePairs[0];
        if (!firstPair)
            return;
        setSurvivorId(firstPair.first.id);
        setDuplicateId(firstPair.second.id);
        setConfirmation("");
        setOpen(true);
    };
    const merge = () => {
        if (confirmation !== "MERGE") {
            toast.error('Type MERGE to confirm the customer merge.');
            return;
        }
        try {
            mergeCustomers(survivorId, duplicateId);
            selectCustomer(survivorId);
            setOpen(false);
            toast.success("Duplicate customer merged. All linked history now belongs to the surviving customer.");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Customer merge could not be completed.");
        }
    };
    if (duplicatePairs.length === 0)
        return null;
    return (<>
      <Button size="sm" variant="outline" className="gap-1.5 border-warning/40 text-warning" onClick={openReview}>
        <AlertTriangle className="h-3.5 w-3.5"/> <span className="hidden lg:inline">Resolve duplicates</span><span className="rounded-full bg-warning/15 px-1.5 text-[10px]">{duplicatePairs.length}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resolve duplicate customers</DialogTitle>
            <DialogDescription>Keep one customer record. The duplicate record will be removed after every Site, work, finance, task, communication, file, and activity link is moved to the surviving customer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              {duplicatePairs.map((pair) => <p key={`${pair.first.id}-${pair.second.id}`} className="mb-1 last:mb-0"><strong>{pair.first.name}</strong> ↔ <strong>{pair.second.name}</strong> · matching {pair.fields.join(", ")}</p>)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium">Keep this customer
                <select value={survivorId} onChange={(event) => setSurvivorId(event.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
                  {customersInDuplicates.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone || customer.email || customer.id}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">Merge and remove this duplicate
                <select value={duplicateId} onChange={(event) => setDuplicateId(event.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
                  {customersInDuplicates.filter((customer) => customer.id !== survivorId).map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone || customer.email || customer.id}</option>)}
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-xs font-medium">Type MERGE to confirm
              <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="MERGE" className="h-9"/>
            </label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" disabled={!survivorId || !duplicateId || survivorId === duplicateId || confirmation !== "MERGE"} onClick={merge}>Merge records</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>);
}
export function CustomerPortfolioContext({ customerId, name, phone, email, reqStatus, budget, tasks, quotations, payments, visits, sites, areas, taskDispatch, quoteDispatch, customerDispatch, }: {
    customerId: string;
    name: string;
    phone: string;
    email?: string;
    reqStatus?: {
        label: string;
        className: string;
    };
    budget?: number;
    tasks: import("@/lib/rdash/types").Task[];
    quotations: import("@/lib/rdash/types").Quotation[];
    payments: import("@/lib/rdash/types").Payment[];
    visits: import("@/lib/rdash/types").Visit[];
    sites: import("@/lib/rdash/types").Site[];
    areas: import("@/lib/rdash/types").Area[];
    taskDispatch: {
        updateTask: (id: string, patch: Record<string, unknown>) => void;
    };
    quoteDispatch: {
        updateQuotation: (id: string, patch: Record<string, unknown>) => void;
    };
    customerDispatch: {
        setActiveModule: (id: string, label?: string, icon?: string) => void;
        openActionDialog: (type: "record-payment" | "send-catalogue" | "send-reference" | "send-pinterest" | "send-material", customerId?: string) => void;
        openCreateDialog: (request: import("@/lib/rdash/store").CreateDialogRequest) => void;
    };
}) {
    const db = useRDashStore((s) => s.db);
    const relatedTasks = React.useMemo(() => db.tasks.filter((row) => isCustomerLinked(db, row, customerId)), [db, customerId]);
    const relatedFollowups = React.useMemo(() => db.followups.filter((row) => isCustomerLinked(db, row, customerId)), [db, customerId]);
    const relatedCommunications = React.useMemo(() => db.commSends.filter((row) => isCustomerLinked(db, row, customerId)), [db, customerId]);
    const relatedRisks = React.useMemo(() => db.risks.filter((row) => isCustomerLinked(db, row, customerId)), [db, customerId]);
    const relatedObstacles = React.useMemo(() => db.blocked.filter((row) => isCustomerLinked(db, row, customerId)), [db, customerId]);
    const relatedReceipts = React.useMemo(() => db.customerReceipts.filter((row) => isCustomerLinked(db, row, customerId)), [db, customerId]);
    const relatedVariations = React.useMemo(() => db.variationRequests.filter((row) => isCustomerLinked(db, row, customerId)), [db, customerId]);
    const relatedReferenceAssignments = React.useMemo(() => db.entityReferenceAssignments.filter((row) => isCustomerLinked(db, row, customerId)), [db, customerId]);
    // B-8: relatedAttachments now aggregates ALL file attachments belonging to this customer —
    // direct customer attachments AND attachments on related records (visits, tasks, sites,
    // quotations, payments, workOrders, workRequired, invoices, followups, blocked, commSends,
    // areas) whose entity belongs to this customer. Previously this only used isCustomerLinked,
    // which silently excluded entities (e.g. visits) that have customer_id set but no parent
    // site/workOrder/workRequired — those threw inside resolveEntityContext and returned false.
    // We now ALSO match by direct customer_id lookup on the entity, so the gallery shows
    // measurement photos, task completion proofs, site photos, etc. The `seen` Set in
    // relatedActivityFiles prevents double-counting when an attachment matches both paths.
    const relatedAttachments = React.useMemo(() => {
        const customerSiteIds = new Set(db.sites.filter((s) => s.customer_id === customerId).map((s) => s.id));
        const relatedEntityIds = new Set<string>([customerId]);
        const push = (rows: Array<{ id: string; customer_id?: string }>) => rows.forEach((r) => { if (r.customer_id === customerId) relatedEntityIds.add(r.id); });
        push(db.visits);
        push(db.tasks);
        push(db.sites);
        push(db.quotations);
        push(db.payments);
        push(db.workOrders);
        push(db.workRequired || []);
        push(db.invoices);
        push(db.followups);
        push(db.blocked);
        push(db.commSends);
        db.areas.forEach((a) => { if (customerSiteIds.has(a.site_id)) relatedEntityIds.add(a.id); });
        return db.entityFileAttachments.filter((row) => {
            if (row.entity_type === "customer" && row.entity_id === customerId) return true;
            if (relatedEntityIds.has(row.entity_id)) return true;
            // Fallback for attachments whose entity resolves through a parent link
            // (e.g. a task whose site_id belongs to this customer, even though task.customer_id is empty).
            return isCustomerLinked(db, row, customerId);
        });
    }, [db, customerId]);
    const relatedActivityFiles = React.useMemo(() => {
        const filesById = new Map((db.master.fileAssets || []).map((file: any) => [file.id, file]));
        const results: Array<{
            id: string;
            preview: FilePreviewSource;
            label: string;
        }> = [];
        const seen = new Set<string>();
        const add = (driveFileId?: string, label?: string) => {
            const file = driveFileId ? filesById.get(driveFileId) : undefined;
            if (!file || seen.has(file.id))
                return;
            seen.add(file.id);
            results.push({ id: file.id, preview: assetPreview(file as any), label: label || file.kind?.replaceAll("_", " ") || "File" });
        };
        relatedAttachments.forEach((attachment) => add(attachment.file_asset_id, `${attachment.entity_type.replace(/_/g, " ")} · ${attachment.role}`));
        relatedReferenceAssignments.forEach((assignment: any) => {
            if (assignment.resource_type === "catalogue")
                add((db.master.catalogues || []).find((item: any) => item.id === assignment.resource_id)?.drive_asset_id, "Catalogue");
            if (assignment.resource_type === "reference_media")
                add((db.master.referenceMedia || []).find((item: any) => item.id === assignment.resource_id)?.drive_asset_id, "Reference media");
        });
        return results;
    }, [db.master.catalogues, db.master.fileAssets, db.master.referenceMedia, relatedAttachments, relatedReferenceAssignments]);
    const detailPanel = useRDashStore((s) => s.detailPanel);
    const contextHistory = useRDashStore((s) => s.contextHistory);
    const contextHistoryIndex = useRDashStore((s) => s.contextHistoryIndex);
    const setContextCustomerTab = useRDashStore((s) => s.setContextCustomerTab);
    const openDetail = useRDashStore((s) => s.openDetail);
    const captureStructuredWorkRequired = useRDashStore((s) => s.captureStructuredWorkRequired);
    const [tab, setTab] = React.useState<ContextCustomerTab>("overview");
    const currentContextEntry = contextHistory[contextHistoryIndex];
    const isContextCustomer = detailPanel.fromModule === "context" && detailPanel.kind === "customer" && detailPanel.recordId === customerId && currentContextEntry?.recordId === customerId;
    React.useEffect(() => {
        setTab(isContextCustomer ? currentContextEntry?.customerTab || "overview" : "overview");
    }, [customerId, isContextCustomer, currentContextEntry?.customerTab]);
    const selectCustomerTab = React.useCallback((next: ContextCustomerTab) => {
        setTab(next);
        if (isContextCustomer)
            setContextCustomerTab(next);
    }, [isContextCustomer, setContextCustomerTab]);
    const [addSiteOpen, setAddSiteOpen] = React.useState(false);
    const [editSiteId, setEditSiteId] = React.useState<string | undefined>();
    const [editCustomerOpen, setEditCustomerOpen] = React.useState(false);
    const [captureWorkRequiredId, setCaptureWorkRequiredId] = React.useState<string | null>(null);
    const [createWorkRequiredSiteId, setCreateWorkRequiredSiteId] = React.useState<string | null>(null);
    // B-5: Local dialog instance for "Add advance" — opens RecordPaymentDialog with the
    // Advance payment toggle pre-checked, so the new milestone lands in this customer's
    // Advances tab without the user having to remember to flip the toggle.
    const [advanceDialogOpen, setAdvanceDialogOpen] = React.useState(false);
    // Overview scope filter: clicking an area chip shows only the work captured in that area.
    const [scopeAreaId, setScopeAreaId] = React.useState<string | null>(null);
    const openTasks = relatedTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
    const customerInvoices = db.invoices.filter((invoice) => invoice.customer_id === customerId);
    const customerAdvances = payments.filter((p) => p.is_advance);
    const customerAdvanceIds = new Set(customerAdvances.map((payment) => payment.id));
    const receivedAdvanceAmount = db.customerReceipts.filter((receipt) => receipt.payment_id && customerAdvanceIds.has(receipt.payment_id)).reduce((sum, receipt) => sum + receipt.amount, 0);
    const customerJobs = db.workOrders.filter((j) => j.customer_id === customerId);
    const customerJobIds = new Set(customerJobs.map((j) => j.id));
    const customerVendorBills = db.vendorBills.filter((b) => {
        if (b.status === "paid")
            return false;
        const po = b.po_id ? db.purchaseOrders.find((p) => p.id === b.po_id) : undefined;
        return po?.work_order_id && customerJobIds.has(po.work_order_id);
    });
    const customerContractorCosts = db.workOrderCostLines.filter((c) => customerJobIds.has(c.work_order_id) && c.type === "contractor");
    const customerContractorApprovals = db.actions.filter((a) => a.status === "pending" && a.linked_record_type === "contractor_payment" && customerJobs.some((j) => j.id === a.linked_record_id));
    const progress = customerProgress(db, customerId);
    const singleSite = sites.length === 1 ? sites[0] : undefined;
    const customerWorkRequired = db.workRequired.filter((work) => work.customer_id === customerId);
    const customerLevelAreaIds = new Set(customerWorkRequired.filter((work) => !work.site_id).flatMap((work) => work.area_ids || []));
    const customerAreas = db.areas.filter((area) => sites.some((site) => site.id === area.site_id) || customerLevelAreaIds.has(area.id));
    const mapHref = singleSite ? customerMapHref(singleSite.address, singleSite.latitude, singleSite.longitude) : undefined;
    const whatsappHref = customerWhatsappHref(phone);
    const currentQuote = latestQuotationRevisions(quotations)
        .filter((quote) => quote.status === "sent" || quote.status === "draft" || quote.status === "accepted")
        .sort((a, b) => (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""))[0];
    const currentJob = customerJobs.find((workOrder) => workOrder.status === "scheduled" || workOrder.status === "in_progress" || workOrder.status === "on_hold");
    const tabs = [
        { key: "overview" as const, label: "Overview", icon: <Activity className="h-3.5 w-3.5"/> },
        { key: "sites" as const, label: `Sites (${sites.length})`, icon: <Building className="h-3.5 w-3.5"/> },
        { key: "tasks" as const, label: `Tasks (${relatedTasks.length})`, icon: <ListChecks className="h-3.5 w-3.5"/> },
        { key: "quotations" as const, label: `Quotations (${quotations.length})`, icon: <FileText className="h-3.5 w-3.5"/> },
        { key: "payments" as const, label: `Payments (${payments.length})`, icon: <Wallet className="h-3.5 w-3.5"/> },
        { key: "invoices" as const, label: `Invoices (${customerInvoices.length})`, icon: <FileText className="h-3.5 w-3.5"/> },
        { key: "advances" as const, label: `Advances (${customerAdvances.length})`, icon: <Wallet className="h-3.5 w-3.5"/> },
        { key: "liabilities" as const, label: `Liabilities (${customerVendorBills.length + customerContractorApprovals.length})`, icon: <AlertTriangle className="h-3.5 w-3.5"/> },
        { key: "visits" as const, label: `Visits (${visits.length})`, icon: <MapPin className="h-3.5 w-3.5"/> },
        { key: "activity" as const, label: `Activity (${relatedFollowups.length + relatedCommunications.length + relatedRisks.length + relatedObstacles.length + relatedVariations.length + relatedAttachments.length})`, icon: <Activity className="h-3.5 w-3.5"/> },
    ];
    return (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar name={name} size={48}/>
          <div className="min-w-0">
            <h2 className="break-words text-lg font-bold leading-snug tracking-tight">{name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {phone ? <span className="inline-flex items-center gap-0.5"><a href={`tel:${phone}`} className="flex items-center gap-1 hover:text-primary"><Phone className="h-3 w-3"/>{phone}</a><CopyValueButton value={phone} label="Mobile number"/></span> : <span className="flex items-center gap-1"><Phone className="h-3 w-3"/>—</span>}
              {email && <a href={`mailto:${email}`} className="flex items-center gap-1 hover:text-primary"><Mail className="h-3 w-3"/>{email}</a>}
              {singleSite?.address && (mapHref ? <a href={mapHref} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary"><MapPin className="h-3 w-3"/>{singleSite.address}</a> : <span className="flex items-center gap-1"><MapPin className="h-3 w-3"/>{singleSite.address}</span>)}
              {sites.length > 1 && <span className="flex items-center gap-1"><Building className="h-3 w-3"/>{sites.length} Sites</span>}
            </div>
            <p className="mt-1 text-xs font-medium text-foreground/80">{sites.length ? `${sites.length} site${sites.length === 1 ? "" : "s"}` : "No site added"}</p>
            <div className="mt-1.5 sm:hidden"><StatusBadge label={progress.label} className="bg-primary/10 text-primary border-primary/20"/></div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <StatusBadge label={progress.label} className="hidden bg-primary/10 text-primary border-primary/20 sm:inline-flex"/>
          <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={() => setEditCustomerOpen(true)}>
            <Pencil className="h-3.5 w-3.5"/><span className="hidden sm:inline">Edit</span>
          </Button>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
        <div className="flex items-center justify-between gap-3"><span className="text-xs font-medium">{progress.summary}</span><span className="text-[10px] font-mono text-muted-foreground">{progress.percent}%</span></div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }}/></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {currentJob ? (<Button size="sm" variant="default" className="h-7 text-xs" onClick={() => openDetail("workOrder", currentJob.id)}><Building className="mr-1 h-3.5 w-3.5"/> Open workOrder</Button>) : currentQuote ? (<Button size="sm" variant="default" className="h-7 text-xs" onClick={() => openDetail("quotation", currentQuote.id)}><FileText className="mr-1 h-3.5 w-3.5"/> {currentQuote.status === "draft" ? "Edit quotation" : "Open quotation"}</Button>) : (<Button size="sm" variant="default" className="h-7 text-xs" onClick={() => customerDispatch.openCreateDialog({ kind: "quotation", customerId })}><FileText className="mr-1 h-3.5 w-3.5"/> Create quotation</Button>)}
        {!currentJob && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => customerDispatch.openCreateDialog({ kind: "visit", customerId })}><MapPin className="mr-1 h-3.5 w-3.5"/> Schedule visit</Button>}
        {currentJob && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => customerDispatch.openCreateDialog({ kind: "visit", customerId })}><MapPin className="mr-1 h-3.5 w-3.5"/> Schedule visit</Button>}
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => customerDispatch.openActionDialog("record-payment", customerId)}><Wallet className="mr-1 h-3.5 w-3.5"/> Add collection milestone</Button>
        {whatsappHref && <Button asChild size="sm" variant="outline" className="h-7 text-xs"><a href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-3.5 w-3.5"/> WhatsApp</a></Button>}
        {mapHref && <Button asChild size="sm" variant="outline" className="h-7 text-xs"><a href={mapHref} target="_blank" rel="noreferrer"><Navigation className="mr-1 h-3.5 w-3.5"/> Maps</a></Button>}
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { if (phone)
        window.location.href = `tel:${phone}`;
    else
        toast.info("No phone number on file"); }}><Phone className="mr-1 h-3.5 w-3.5"/> Call</Button>
      </div>
      <div className="mt-4 flex items-center gap-1 overflow-x-auto border-b border-border pb-px rd-scroll rd-scroll-fade">
        {tabs.map((t) => (<button key={t.key} type="button" onClick={() => selectCustomerTab(t.key)} className={cn("flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition-colors", tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.icon}
            {t.label}
          </button>))}
      </div>
      <div className="mt-3">
        {tab === "overview" && (<div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard label="Sites" value={sites.length} tone="primary"/>
              <MetricCard label="Open tasks" value={openTasks.length} tone="warning"/>
              <MetricCard label="Quotations" value={quotations.length}/>
              <MetricCard label="Budget" value={budget ? formatINR(budget) : "—"} tone="success"/>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Customer scope</p>
              <div className="mt-2 grid gap-2">
                {(sites.length ? sites : [undefined]).map((site) => {
                    const scopedAreas = customerAreas.filter((area) => area.site_id === (site?.id || "") || (Boolean(singleSite) && !area.site_id));
                    const scopedWork = customerWorkRequired.filter((work) => work.site_id === (site?.id || "") || (Boolean(singleSite) && !work.site_id));
                    const visibleWork = scopeAreaId ? scopedWork.filter((work) => (work.area_ids || []).includes(scopeAreaId)) : scopedWork;
                    return <div key={site?.id || "customer-level"} className="rounded-md border border-border bg-muted/20 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold">{site?.name || name}</p>
                          <p className="text-[10px] text-muted-foreground">{site ? site.address || `${site.site_type} · ${site.stage}` : "Customer-level work"}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{scopedAreas.length} Area{scopedAreas.length === 1 ? "" : "s"} · {scopedWork.length} Work Required</span>
                      </div>
                      {scopedAreas.length ? <div className="mt-2 flex flex-wrap gap-1">{scopedAreas.map((area) => {
                        const active = scopeAreaId === area.id;
                        const areaWorkCount = scopedWork.filter((work) => (work.area_ids || []).includes(area.id)).length;
                        return <button key={area.id} type="button" aria-pressed={active} onClick={() => setScopeAreaId(active ? null : area.id)} title={`Show only work required in ${area.name}`} className={cn("rounded border px-1.5 py-0.5 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted")}>{area.name}<span className={cn("ml-1 font-mono", active ? "text-primary-foreground/80" : "text-muted-foreground/70")}>{areaWorkCount}</span></button>;
                      })}</div> : null}
                      {scopedWork.length ? (visibleWork.length ? <div className="mt-2 grid gap-1">{visibleWork.map((work) => <div key={work.id} className="flex items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1 text-[11px]"><span className="truncate font-medium">{work.title}</span><span className="shrink-0 text-[10px] text-muted-foreground">{workRequiredStatusStyle(work.status).label}</span></div>)}</div> : <p className="mt-2 text-[11px] text-muted-foreground">No Work Required in the selected area — tap the area again to see all.</p>) : <p className="mt-2 text-[11px] text-muted-foreground">No Work Required recorded.</p>}
                    </div>;
                })}
              </div>
            </div>
            <EntityFilesCard entityType="customer" entityId={customerId} title="Customer documents" />
            {/* Customer Financial Summary — 360-degree financial view */}
            {(() => {
                const customerWorkOrders = db.workOrders.filter((wo: any) => wo.customer_id === customerId);
                const acceptedScopes = db.acceptedScopes.filter((s: any) => s.customer_id === customerId);
                const totalAccepted = acceptedScopes.reduce((n: number, s: any) => n + (s.accepted_value || 0), 0);
                const totalReceived = relatedReceipts.reduce((n: number, r: any) => n + (r.amount || 0), 0)
                    + payments.filter((p: any) => p.status === "received").reduce((n: number, p: any) => n + (p.received_amount || p.amount || 0), 0);
                const totalInvoiced = db.invoices.filter((i: any) => i.customer_id === customerId).reduce((n: number, i: any) => n + (i.total_amount || 0), 0);
                const totalOutstanding = Math.max(0, totalAccepted - totalReceived);
                const woValue = customerWorkOrders.reduce((n: number, wo: any) => n + (wo.value || 0), 0);
                const poValue = db.purchaseOrders.filter((po: any) => customerWorkOrders.some((wo: any) => wo.id === po.work_order_id)).reduce((n: number, po: any) => n + (po.total_amount || 0), 0);
                const vendorBills = db.vendorBills.filter((b: any) => customerWorkOrders.some((wo: any) => wo.id === b.work_order_id)).reduce((n: number, b: any) => n + (b.total_amount || b.amount || 0), 0);
                const contractorBills = db.contractorBills.filter((b: any) => customerWorkOrders.some((wo: any) => wo.id === b.work_order_id)).reduce((n: number, b: any) => n + (b.amount || 0), 0);
                const totalSpent = vendorBills + contractorBills;
                const margin = totalAccepted - totalSpent;
                const marginPct = totalAccepted > 0 ? Math.round((margin / totalAccepted) * 10000) / 100 : 0;
                const marginTone = marginPct > 20 ? "success" : marginPct > 5 ? "warning" : "destructive";
                return totalAccepted > 0 || totalReceived > 0 ? (
                  <div className="rounded-lg border border-border bg-gradient-to-br from-card to-muted/20 p-3 shadow-sm">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Financial Summary</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-md border border-success/20 bg-success/[0.04] p-2">
                        <p className="text-[10px] font-semibold uppercase text-success/80">Received</p>
                        <p className="mt-0.5 font-mono text-sm font-bold text-success">{formatINR(totalReceived)}</p>
                      </div>
                      <div className="rounded-md border border-warning/20 bg-warning/[0.04] p-2">
                        <p className="text-[10px] font-semibold uppercase text-warning/80">Outstanding</p>
                        <p className="mt-0.5 font-mono text-sm font-bold text-warning">{formatINR(totalOutstanding)}</p>
                      </div>
                      <div className="rounded-md border border-destructive/20 bg-destructive/[0.04] p-2">
                        <p className="text-[10px] font-semibold uppercase text-destructive/80">Spent</p>
                        <p className="mt-0.5 font-mono text-sm font-bold text-destructive">{formatINR(totalSpent)}</p>
                      </div>
                      <div className={cn("rounded-md border p-2", marginTone === "success" ? "border-success/20 bg-success/[0.04]" : marginTone === "warning" ? "border-warning/20 bg-warning/[0.04]" : "border-destructive/20 bg-destructive/[0.04]")}>
                        <p className={cn("text-[10px] font-semibold uppercase", marginTone === "success" ? "text-success/80" : marginTone === "warning" ? "text-warning/80" : "text-destructive/80")}>Margin ({marginPct}%)</p>
                        <p className={cn("mt-0.5 font-mono text-sm font-bold", marginTone === "success" ? "text-success" : marginTone === "warning" ? "text-warning" : "text-destructive")}>{formatINR(margin)}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                      <span>Accepted value: <strong className="text-foreground">{formatINR(totalAccepted)}</strong></span>
                      <span>Invoiced: <strong className="text-foreground">{formatINR(totalInvoiced)}</strong></span>
                      <span>WO value: <strong className="text-foreground">{formatINR(woValue)}</strong></span>
                      <span>POs: <strong className="text-foreground">{formatINR(poValue)}</strong></span>
                      <span>Work orders: <strong className="text-foreground">{customerWorkOrders.length}</strong></span>
                    </div>
                  </div>
                ) : null;
            })()}
            <SectionHeader title="Pending actions" count={openTasks.length}/>
            {openTasks.length === 0 ? (<EmptyState title="No pending actions" description="This customer is fully actioned."/>) : (<div className="grid gap-2 sm:grid-cols-2">
                {openTasks.slice(0, 4).map((t) => (<ContextRow key={t.id} actions={buildTaskActions(t.id, taskDispatch, { onOpen: () => openDetail("task", t.id), readOnly: true })} onSelect={() => openDetail("task", t.id)} className="rounded-lg border border-border bg-background px-3 py-2">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <StatusBadge label={taskStatusStyle(t.status).label} className={taskStatusStyle(t.status).className}/>
                      <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3"/>{relativeDay(t.due_date)}</span>
                    </div>
                  </ContextRow>))}
              </div>)}
          </div>)}

        {tab === "sites" && (<div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddSiteOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5"/> Add site
              </Button>
            </div>

            {sites.length === 0 ? (<EmptyState title="No sites" description="Add a site to start tracking per-property work." icon={<Building className="h-7 w-7"/>}/>) : (<div className="grid gap-3">
                {sites.map((site) => {
                    const fin = siteFinancials(db, site.id);
                    const siteAreas = customerAreas.filter((area) => area.site_id === site.id || (Boolean(singleSite) && !area.site_id));
                    return (<div key={site.id} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4 shrink-0 text-primary"/>
                            <p className="truncate text-sm font-bold">{site.name}</p>
                            {site.source_partner_name && (<StatusBadge label={`Referred by ${site.source_partner_name}`} className="bg-primary/10 text-primary border-primary/20"/>)}
                          </div>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <MapPin className="h-3 w-3"/> {site.address || "—"}
                          </p>
                          {site.latitude != null && site.longitude != null && (<p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}</p>)}
                          {site.notes && <p className="mt-1 text-[11px] text-foreground/70">{site.notes}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {customerMapHref(site.address, site.latitude, site.longitude) && <Button asChild size="icon" variant="ghost" className="h-7 w-7" title="Open Site map"><a href={customerMapHref(site.address, site.latitude, site.longitude)} target="_blank" rel="noreferrer"><Navigation className="h-3.5 w-3.5"/></a></Button>}
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit Site" onClick={() => setEditSiteId(site.id)}><Pencil className="h-3.5 w-3.5"/></Button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-[10px] uppercase text-muted-foreground">Quoted</p>
                          <p className="font-mono text-xs font-semibold">{formatINRShort(fin.quoted)}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-[10px] uppercase text-muted-foreground">Contracted</p>
                          <p className="font-mono text-xs font-semibold">{formatINRShort(fin.contracted)}</p>
                        </div>
                        <div className="rounded-md bg-success/10 p-2">
                          <p className="text-[10px] uppercase text-success">Collected</p>
                          <p className="font-mono text-xs font-semibold text-success">{formatINRShort(fin.collected)}</p>
                        </div>
                        <div className="rounded-md bg-primary/10 p-2">
                          <p className="text-[10px] uppercase text-primary">Invoiced</p>
                          <p className="font-mono text-xs font-semibold text-primary">{formatINRShort(fin.invoiced)}</p>
                        </div>
                        <div className="rounded-md bg-warning/10 p-2">
                          <p className="text-[10px] uppercase text-warning">Receivable</p>
                          <p className="font-mono text-xs font-semibold text-warning">{formatINRShort(fin.receivable)}</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-md border border-border bg-muted/20 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Work Required</p>
                            <p className="text-[11px] text-muted-foreground">Capture is locked to this Site and a named work requirement.</p>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreateWorkRequiredSiteId(site.id)}>
                            <Plus className="mr-1 h-3.5 w-3.5"/> Add work required
                          </Button>
                        </div>
                        {(() => {
                            const siteWorkRequired = customerWorkRequired.filter((work) => work.site_id === site.id || (Boolean(singleSite) && !work.site_id));
                            return siteWorkRequired.length ? (<div className="mt-2 flex flex-col gap-1.5">
                              {siteWorkRequired.map((work) => {
                                  const workAreaNames = (work.area_ids || []).map((areaId) => siteAreas.find((area) => area.id === areaId)?.name).filter(Boolean).join(", ");
                                  return (<div key={work.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold">{work.title}</p>
                                    <p className="truncate text-[10px] text-muted-foreground">{work.structured_items?.length || 0} structured line(s) · {workRequiredStatusStyle(work.status).label}{workAreaNames ? ` with ${workAreaNames}` : ""}</p>
                                  </div>
                                  <Button size="sm" variant="outline" className="h-7 shrink-0 text-[11px]" onClick={() => setCaptureWorkRequiredId(work.id)}>
                                    <ListChecks className="mr-1 h-3.5 w-3.5"/> Capture detailed area
                                  </Button>
                                </div>);
                              })}
                            </div>) : (<p className="mt-2 rounded-md border border-dashed border-border bg-background px-2 py-2 text-[11px] text-muted-foreground">No Work Required exists for this Site. Add one before capturing a detailed area.</p>);
                        })()}
                      </div>
                      {fin.workOrders.length > 0 && (<div className="mt-3">
                          <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Work Orders at this site ({fin.workOrders.length})</p>
                          <div className="flex flex-col gap-1">
                            {fin.workOrders.slice(0, 4).map((j) => (<button key={j.id} type="button" onClick={() => openDetail("workOrder", j.id)} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1 text-left text-[11px] transition-colors hover:border-primary/30 hover:bg-accent/40">
                                <span className="truncate">{j.work_order_no} · {j.title}</span>
                                <span className="ml-2 shrink-0 font-mono text-muted-foreground">{formatINRShort(j.value)}</span>
                              </button>))}
                          </div>
                        </div>)}
                    </div>);
                })}
              </div>)}
          </div>)}

        {tab === "tasks" && (<div className="flex flex-col gap-2">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => customerDispatch.openCreateDialog({ kind: "task", customerId })}>
                <Plus className="h-3.5 w-3.5"/> Add task
              </Button>
            </div>
            {relatedTasks.length === 0 ? <EmptyState title="No tasks" description="Click 'Add task' to create the first task for this customer." icon={<ListChecks className="h-7 w-7"/>}/> : relatedTasks.map((t) => (<ContextRow key={t.id} actions={buildTaskActions(t.id, taskDispatch, { onOpen: () => openDetail("task", t.id), readOnly: true })} onSelect={() => openDetail("task", t.id)} className="rounded-lg border border-border bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <StatusBadge label={taskStatusStyle(t.status).label} className={taskStatusStyle(t.status).className}/>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Due {relativeDay(t.due_date)} · {t.assignee_name}</p>
              </ContextRow>))}
          </div>)}

        {tab === "quotations" && (<div className="flex flex-col gap-2">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => customerDispatch.openCreateDialog({ kind: "quotation", customerId })}>
                <Plus className="h-3.5 w-3.5"/> Add quotation
              </Button>
            </div>
            {quotations.length === 0 ? <EmptyState title="No quotations" description="Click 'Add quotation' to draft the first quotation for this customer." icon={<FileText className="h-7 w-7"/>}/> : quotations.map((qu) => (<ContextRow key={qu.id} actions={buildQuotationActions(qu.id, quoteDispatch, { onOpen: () => openDetail("quotation", qu.id) })} onSelect={() => openDetail("quotation", qu.id)} className="rounded-lg border border-border bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{qu.quotation_no} · {qu.title}</p>
                    <p className="text-[11px] text-muted-foreground">{formatINR(qu.total_amount)} · valid till {relativeDay(qu.valid_until)}</p>
                  </div>
                  <StatusBadge label={quotationStatusStyle(qu.status).label} className={quotationStatusStyle(qu.status).className}/>
                </div>
              </ContextRow>))}
          </div>)}

        {tab === "payments" && (<div className="flex flex-col gap-2">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => customerDispatch.openActionDialog("record-payment", customerId)}>
                <Plus className="h-3.5 w-3.5"/> Add collection milestone
              </Button>
            </div>
            {payments.length === 0 ? <EmptyState title="No payments" description="Click 'Add collection milestone' to record the first payment milestone for this customer." icon={<Wallet className="h-7 w-7"/>}/> : payments.map((pa) => (<ContextRow key={pa.id} actions={buildPaymentActions(pa.id, null, { onOpen: () => openDetail("payment", pa.id) })} onSelect={() => openDetail("payment", pa.id)} className="rounded-lg border border-border bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{formatINR(pa.amount)}</p>
                    <p className="text-[11px] text-muted-foreground">Due {relativeDay(pa.due_date)} · {pa.mode}</p>
                  </div>
                  <StatusBadge label={paymentStatusStyle(pa.status).label} className={paymentStatusStyle(pa.status).className}/>
                </div>
              </ContextRow>))}
          </div>)}

        {tab === "invoices" && (<div className="flex flex-col gap-2">
            {customerInvoices.length === 0 ? <EmptyState title="No invoices" description="Issue an invoice from the collection milestone before recording customer receipts." icon={<FileText className="h-7 w-7"/>}/> : customerInvoices.map((invoice) => {
                const status = invoiceStatusStyle(invoice.status);
                return (<button key={invoice.id} type="button" onClick={() => openDetail("invoice", invoice.id)} className="rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-accent/20">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{invoice.invoice_no} - {invoice.title}</p>
                      <p className="text-[11px] text-muted-foreground">Due {relativeDay(invoice.due_date)} - balance {formatINR(invoice.balance_amount)}</p>
                    </div>
                    <StatusBadge label={status.label} className={status.className}/>
                  </div>
                </button>);
            })}
          </div>)}

        {tab === "visits" && (<div className="flex flex-col gap-2">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => customerDispatch.openCreateDialog({ kind: "visit", customerId })}>
                <Plus className="h-3.5 w-3.5"/> Schedule visit
              </Button>
            </div>
            {visits.length === 0 ? <EmptyState title="No visits" description="Click 'Schedule visit' to plan the first visit for this customer." icon={<MapPin className="h-7 w-7"/>}/> : visits.map((v) => (<ContextRow key={v.id} actions={buildVisitActions(v.id, null, { onOpen: () => openDetail("visit", v.id) })} onSelect={() => openDetail("visit", v.id)} className="rounded-lg border border-border bg-background px-3 py-2">
                <p className="text-sm font-medium capitalize">{v.visit_type.replace(/_/g, " ")} · {v.location_name}</p>
                <p className="text-[11px] text-muted-foreground">{relativeDay(v.scheduled_at)} · {v.staff_name}</p>
              </ContextRow>))}
          </div>)}
        {tab === "activity" && (<div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard label="Follow-ups" value={relatedFollowups.length} tone="primary"/>
              <MetricCard label="Communications" value={relatedCommunications.length}/>
              <MetricCard label="Open risks" value={relatedRisks.length} tone="warning"/>
              <MetricCard label="Open obstacles" value={relatedObstacles.filter((row) => !row.resolved).length} tone="destructive"/>
            </div>
            <CustomerActivitySection title={`Follow-ups (${relatedFollowups.length})`} empty="No follow-ups linked to this customer." rows={relatedFollowups.slice(0, 10).map((row) => ({ id: row.id, title: row.title, detail: `${row.followup_type || "general"} · due ${relativeDay(row.due_date)} · ${row.status}` }))}/>
            <CustomerActivitySection title={`Communications (${relatedCommunications.length})`} empty="No logged customer communications." rows={relatedCommunications.slice(0, 10).map((row) => ({ id: row.id, title: row.subject, detail: `${row.channel} · ${row.status} · ${formatDate(row.sent_at)}` }))}/>
            <CustomerActivitySection title={`Risks (${relatedRisks.length})`} empty="No customer risks." rows={relatedRisks.slice(0, 10).map((row) => ({ id: row.id, title: row.title, detail: `${row.type} · ${row.severity} · ${row.reason}` }))}/>
            <CustomerActivitySection title={`Obstacles (${relatedObstacles.length})`} empty="No customer obstacles." rows={relatedObstacles.slice(0, 10).map((row) => ({ id: row.id, title: row.title, detail: `${row.resolved ? "Resolved" : "Open"} · ${row.reason}` }))}/>
            <CustomerActivitySection title={`Variation requests (${relatedVariations.length})`} empty="No variation requests." rows={relatedVariations.slice(0, 10).map((row) => ({ id: row.id, title: `${row.variation_no} · ${row.title}`, detail: `${row.status.replace(/_/g, " ")} · ${formatINR(row.requested_amount)}` }))}/>
            <CustomerActivitySection title={`Receipts (${relatedReceipts.length})`} empty="No customer receipts." rows={relatedReceipts.slice(0, 10).map((row) => ({ id: row.id, title: `${row.receipt_no} · ${formatINR(row.amount)}`, detail: `${row.mode} · ${formatDate(row.received_at)}` }))}/>
            <CustomerActivitySection title={`Reference media & catalogues (${relatedReferenceAssignments.length})`} empty="No linked references." rows={relatedReferenceAssignments.slice(0, 10).map((row) => ({ id: row.id, title: row.entity_label || row.resource_type.replace(/_/g, " "), detail: `${row.resource_type.replace(/_/g, " ")} · ${row.purpose.replace(/_/g, " ")} · ${row.status}` }))}/>
            <CustomerFileGallery title={`Files & proofs (${relatedActivityFiles.length})`} empty="No customer-linked files, proofs, catalogues, or communication attachments." files={relatedActivityFiles}/>
          </div>)}

        {tab === "advances" && (<div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
                <MetricCard label="Total advances" value={formatINRShort(customerAdvances.reduce((n, p) => n + p.amount, 0))} tone="primary"/>
                <MetricCard label="Received advances" value={formatINRShort(receivedAdvanceAmount)} tone="success"/>
                <MetricCard label="Advance balance" value={formatINRShort(customerAdvances.reduce((sum, payment) => sum + Math.max(0, payment.amount - (payment.received_amount || 0)), 0))} tone="warning"/>
              </div>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setAdvanceDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5"/> Add advance
              </Button>
            </div>
            {customerAdvances.length === 0 ? (<EmptyState title="No advances" description="Customer advance payments (marked is_advance) will appear here. Use 'Add advance' to record one." icon={<Wallet className="h-7 w-7"/>}/>) : (<div className="flex flex-col gap-2">
                {customerAdvances.map((p) => (<div key={p.id} className="rounded-lg border border-border bg-background px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{formatINR(p.amount)} · {p.milestone_label || "Advance"}</p>
                        <p className="text-[11px] text-muted-foreground">Received {formatINR(p.received_amount || 0)} · Balance {formatINR(Math.max(0, p.amount - (p.received_amount || 0)))} · Due {relativeDay(p.due_date)}</p>
                        {p.site_id && <p className="text-[10px] text-primary">→ {db.sites.find((s) => s.id === p.site_id)?.name || p.site_id}</p>}
                      </div>
                      <StatusBadge label={paymentStatusStyle(p.status).label} className={paymentStatusStyle(p.status).className}/>
                    </div>
                  </div>))}
              </div>)}
          </div>)}
        {tab === "liabilities" && (<div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MetricCard label="Vendor bills unpaid" value={formatINRShort(customerVendorBills.reduce((n, b) => n + b.total_amount, 0))} tone="destructive"/>
              <MetricCard label="Contractor cost (incurred)" value={formatINRShort(customerContractorCosts.reduce((n, c) => n + c.amount, 0))} tone="warning"/>
              <MetricCard label="Pending contractor approvals" value={customerContractorApprovals.length} tone="primary"/>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Vendor bills unpaid ({customerVendorBills.length})</p>
              {customerVendorBills.length === 0 ? (<p className="rounded-md border border-dashed border-border bg-muted/20 py-3 text-center text-xs text-muted-foreground">No unpaid vendor bills.</p>) : (<div className="flex flex-col gap-1.5">
                  {customerVendorBills.map((b) => (<div key={b.id} className="rounded-md border border-border bg-background px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">{b.bill_no} · {b.vendor_name}</p>
                          <p className="text-[10px] text-muted-foreground">{b.po_no} / {b.grn_no} · due {relativeDay(b.due_date)}{b.matched === false ? " · disputed" : ""}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-mono text-xs font-semibold">{formatINR(b.total_amount)}</span>
                          <StatusBadge label={b.status} className={b.status === "disputed" ? "bg-destructive/10 text-destructive border-destructive/20" : b.status === "draft" ? "bg-muted text-muted-foreground border-border" : "bg-warning/10 text-warning border-warning/20"}/>
                        </div>
                      </div>
                    </div>))}
                </div>)}
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Pending contractor payment approvals ({customerContractorApprovals.length})</p>
              {customerContractorApprovals.length === 0 ? (<p className="rounded-md border border-dashed border-border bg-muted/20 py-3 text-center text-xs text-muted-foreground">No pending contractor payment approvals.</p>) : (<div className="flex flex-col gap-1.5">
                  {customerContractorApprovals.map((a) => (<div key={a.id} className="rounded-md border border-warning/30 bg-warning/[0.05] px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">{a.title}</p>
                          <p className="text-[10px] text-muted-foreground">Requested by {a.requested_by} · due {a.due_date ? relativeDay(a.due_date) : "—"}</p>
                        </div>
                        <span className="font-mono text-xs font-bold text-warning">{formatINR(a.amount || 0)}</span>
                      </div>
                    </div>))}
                </div>)}
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Contractor cost incurred ({customerContractorCosts.length})</p>
              {customerContractorCosts.length === 0 ? (<p className="rounded-md border border-dashed border-border bg-muted/20 py-3 text-center text-xs text-muted-foreground">No contractor cost lines yet.</p>) : (<div className="flex flex-col gap-1">
                  {customerContractorCosts.slice(0, 8).map((c) => (<div key={c.id} className="flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-1 text-[11px]">
                      <div className="min-w-0">
                        <p className="truncate">{c.description}</p>
                        <p className="text-[10px] text-muted-foreground">{c.vendor_name || "—"} · {formatDate(c.date)}</p>
                      </div>
                      <span className="ml-2 shrink-0 font-mono font-semibold">{formatINR(c.amount)}</span>
                    </div>))}
                </div>)}
            </div>
          </div>)}
      </div>
      {captureWorkRequiredId && (() => {
            const work = db.workRequired.find((row) => row.id === captureWorkRequiredId);
            const site = work ? sites.find((row) => row.id === work.site_id) : undefined;
            return work && site ? (<StructuredWorkRequiredDialog workRequired={work} site={site} areas={areas.filter((area) => area.site_id === site.id)} onClose={() => setCaptureWorkRequiredId(null)} onSave={(lines) => {
                    try {
                        captureStructuredWorkRequired(work.id, lines);
                        toast.success(`Captured ${lines.length} detailed area line(s) for ${work.title}`);
                        setCaptureWorkRequiredId(null);
                        return true;
                    }
                    catch (error) {
                        toast.error(error instanceof Error ? error.message : "Structured work could not be captured.");
                        return false;
                    }
                }}/>) : null;
        })()}
      {createWorkRequiredSiteId && (() => {
            const site = sites.find((row) => row.id === createWorkRequiredSiteId);
            return site ? (<WorkRequiredCreateDialog open customerId={customerId} site={site} initialAreaIds={areas.filter((area) => area.site_id === site.id && !area.is_archived).map((area) => area.id)} onOpenChange={(next) => { if (!next)
                setCreateWorkRequiredSiteId(null); }} onCreated={(id) => { setCaptureWorkRequiredId(id); }}/>) : null;
        })()}
      <SiteFormDialog open={addSiteOpen} customerId={customerId} onClose={() => setAddSiteOpen(false)} onSaved={() => setAddSiteOpen(false)}/>
      <SiteFormDialog open={Boolean(editSiteId)} customerId={customerId} siteId={editSiteId} onClose={() => setEditSiteId(undefined)} onSaved={() => setEditSiteId(undefined)}/>
      <CustomerSitesDialog editId={customerId} open={editCustomerOpen} onClose={() => setEditCustomerOpen(false)}/>
      {/* B-5: Local RecordPaymentDialog pre-configured for advance creation (opened from "Add advance"). */}
      <RecordPaymentDialog open={advanceDialogOpen} onOpenChange={(v) => !v && setAdvanceDialogOpen(false)} customerId={customerId} defaultIsAdvance/>
    </div>);
}
function CustomerFileGallery({ title, empty, files }: {
    title: string;
    empty: string;
    files: Array<{
        id: string;
        preview: FilePreviewSource;
        label: string;
    }>;
}) {
    return (<section className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold">{title}</p><span className="text-[10px] text-muted-foreground">Click a thumbnail to fetch the file</span></div>
      {files.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">{files.map((file) => <div key={file.id} className="min-w-0"><FilePreview file={file.preview} compact controls/><p className="mt-1 truncate text-[10px] text-muted-foreground" title={file.label}>{file.label}</p></div>)}</div> : <p className="rounded-md border border-dashed border-border py-3 text-center text-xs text-muted-foreground">{empty}</p>}
    </section>);
}
function CustomerActivitySection({ title, empty, rows }: {
    title: string;
    empty: string;
    rows: Array<{
        id: string;
        title: string;
        detail: string;
    }>;
}) {
    return (<div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">{title}</p>
      {rows.length === 0 ? (<p className="rounded-md border border-dashed border-border bg-muted/20 py-3 text-center text-xs text-muted-foreground">{empty}</p>) : (<div className="flex flex-col gap-1.5">
          {rows.map((row) => (<div key={row.id} className="rounded-md border border-border bg-background px-2.5 py-1.5">
              <p className="truncate text-xs font-semibold">{row.title}</p>
              <p className="truncate text-[10px] text-muted-foreground">{row.detail}</p>
            </div>))}
        </div>)}
    </div>);
}
export function CustomerPortfolioDrawerContent({ customerId }: {
    customerId: string;
}) {
    const db = useRDashStore((s) => s.db);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const openActionDialog = useRDashStore((s) => s.openActionDialog);
    const openCreateDialog = useRDashStore((s) => s.openCreateDialog);
    const updateTask = useRDashStore((s) => s.updateTask);
    const updateQuotation = useRDashStore((s) => s.updateQuotation);
    const customer = db.customers.find((customer) => customer.id === customerId);
    if (!customer) {
        return <EmptyState title="Customer not found" description="This customer record is no longer available."/>;
    }
    const sites = db.sites.filter((site) => site.customer_id === customerId);
    const workRequiredRows = db.workRequired.filter((work) => work.customer_id === customerId);
    const customerLevelAreaIds = new Set(workRequiredRows.filter((work) => !work.site_id).flatMap((work) => work.area_ids || []));
    const areas = db.areas.filter((area) => sites.some((site) => site.id === area.site_id) || customerLevelAreaIds.has(area.id));
    const workRequired = workRequiredRows[0];
    const tasks = db.tasks.filter((task) => isCustomerLinked(db, task, customerId));
    const quotations = db.quotations.filter((quotation) => quotation.customer_id === customerId);
    const payments = db.payments.filter((payment) => payment.customer_id === customerId);
    const visits = db.visits.filter((visit) => visit.customer_id === customerId);
    return (<CustomerPortfolioContext customerId={customer.id} name={customer.name} phone={customer.phone} email={customer.email} reqStatus={workRequired ? workRequiredStatusStyle(workRequired.status) : undefined} budget={workRequired?.budget} tasks={tasks} quotations={quotations} payments={payments} visits={visits} sites={sites} areas={areas} taskDispatch={{ updateTask }} quoteDispatch={{ updateQuotation }} customerDispatch={{ setActiveModule, openActionDialog, openCreateDialog }}/>);
}
type TimelineEntry = {
    id: string;
    ts: string;
    kind: "visit" | "payment" | "quotation" | "task" | "audit" | "site" | "drawing" | "executionLog" | "boq" | "po" | "grn" | "vendorBill" | "workOrder" | "communication";
    title: string;
    subtitle: string;
    amount?: number;
    status?: string;
};
function CustomerTimelineView({ customerId, name, tasks, quotations, payments, visits, sites, auditLog, drawings, executionLogs, boqs, purchaseOrders, grns, vendorBills, workOrders, commSends, }: {
    customerId: string;
    name: string;
    tasks: import("@/lib/rdash/types").Task[];
    quotations: import("@/lib/rdash/types").Quotation[];
    payments: import("@/lib/rdash/types").Payment[];
    visits: import("@/lib/rdash/types").Visit[];
    sites: import("@/lib/rdash/types").Site[];
    auditLog: import("@/lib/rdash/types").AuditLogEntry[];
    drawings: import("@/lib/rdash/types").Drawing[];
    executionLogs: import("@/lib/rdash/types").DailyExecutionLog[];
    boqs: import("@/lib/rdash/types").WorkOrderBOQ[];
    purchaseOrders: import("@/lib/rdash/types").PurchaseOrder[];
    grns: import("@/lib/rdash/types").GRN[];
    vendorBills: import("@/lib/rdash/types").VendorBill[];
    workOrders: import("@/lib/rdash/types").WorkOrder[];
    commSends: import("@/lib/rdash/types").CommSend[];
}) {
    const openDetail = useRDashStore((s) => s.openDetail);
    const entries: TimelineEntry[] = React.useMemo(() => {
        const e: TimelineEntry[] = [];
        for (const v of visits) {
            e.push({
                id: v.id,
                ts: v.scheduled_at,
                kind: "visit",
                title: `${v.visit_type.replace(/_/g, " ")} · ${v.location_name || "site"}`,
                subtitle: `Visit · ${v.staff_name}${v.status === "completed" ? " · completed" : v.status === "scheduled" ? " · scheduled" : ""}`,
                status: v.status,
            });
        }
        for (const p of payments) {
            e.push({
                id: p.id,
                ts: p.due_date || p.created_at,
                kind: "payment",
                title: `${p.is_advance ? "Advance" : "Payment"} · ${p.milestone_label || p.mode || ""}`.trim(),
                subtitle: `Payment · ${p.mode || "—"}${p.status ? ` · ${p.status}` : ""}`,
                amount: p.amount,
                status: p.status,
            });
        }
        for (const q of quotations) {
            e.push({
                id: q.id,
                ts: q.created_at,
                kind: "quotation",
                title: `${q.quotation_no} · ${q.title}`,
                subtitle: `Quotation · ${q.status}${q.total_amount ? ` · ${formatINR(q.total_amount)}` : ""}`,
                amount: q.total_amount,
                status: q.status,
            });
        }
        for (const t of tasks) {
            e.push({
                id: t.id,
                ts: t.due_date || t.created_at,
                kind: "task",
                title: t.title,
                subtitle: `Task · ${t.assignee_name || "—"} · ${t.status}`,
                status: t.status,
            });
        }
        for (const s of sites) {
            e.push({
                id: s.id,
                ts: s.created_at || new Date().toISOString(),
                kind: "site",
                title: `Site added · ${s.name}`,
                subtitle: `Site · ${s.address || "—"}`,
            });
        }
        for (const a of auditLog) {
            if (a.kind === "create" || a.kind === "update" || a.kind === "send" || a.kind === "receive" || a.kind === "approve" || a.kind === "decision" || a.kind === "comment") {
                e.push({
                    id: a.id,
                    ts: a.timestamp,
                    kind: "audit",
                    title: a.action,
                    subtitle: `Audit · ${a.actor}${a.actor_role ? ` (${a.actor_role})` : ""}`,
                });
            }
        }
        // Drawings — concept designs, floor plans, electrical, 3D renders, revisions
        for (const d of drawings) {
            e.push({
                id: d.id,
                ts: d.uploaded_at || d.created_at,
                kind: "drawing",
                title: `${d.drawing_no} · ${d.title}`,
                subtitle: `Drawing · ${d.uploaded_by || "—"}${d.status ? ` · ${d.status}` : ""}`,
                status: d.status,
            });
        }
        // Execution logs — daily progress, photos, quality inspections, completion
        for (const el of executionLogs) {
            e.push({
                id: el.id,
                ts: el.date || el.created_at,
                kind: "executionLog",
                title: `${el.log_no} · ${el.date ? new Date(el.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}`,
                subtitle: `Execution · ${el.filed_by || "—"}${el.progress_pct != null ? ` · ${el.progress_pct}%` : ""}`,
                status: el.progress_pct != null ? `${el.progress_pct}%` : undefined,
            });
        }
        // BOQs — bill of quantities
        for (const b of boqs) {
            e.push({
                id: b.id,
                ts: b.created_at,
                kind: "boq",
                title: `BOQ · ${b.title || b.work_order_no || "Site"}`,
                subtitle: `BOQ · ${b.status || "draft"}`,
                status: b.status,
            });
        }
        // Work orders — execution tracking
        for (const w of workOrders) {
            e.push({
                id: w.id,
                ts: w.created_at,
                kind: "workOrder",
                title: `${w.work_order_no} · ${w.title}`,
                subtitle: `Work Order · ${w.status}`,
                status: w.status,
            });
        }
        // Purchase orders — procurement
        for (const po of purchaseOrders) {
            e.push({
                id: po.id,
                ts: po.created_at,
                kind: "po",
                title: `${po.po_no} · ${po.vendor_name || "Vendor"}`,
                subtitle: `PO · ${po.status}`,
                amount: po.total_amount,
                status: po.status,
            });
        }
        // GRNs — goods received
        for (const g of grns) {
            e.push({
                id: g.id,
                ts: g.created_at,
                kind: "grn",
                title: `${g.grn_no} · ${g.vendor_name || "Vendor"}`,
                subtitle: `GRN · received`,
                status: "received",
            });
        }
        // Vendor bills — accounts payable
        for (const vb of vendorBills) {
            e.push({
                id: vb.id,
                ts: vb.created_at,
                kind: "vendorBill",
                title: `${vb.bill_no} · ${vb.vendor_name || "Vendor"}`,
                subtitle: `Vendor Bill · ${vb.status}`,
                amount: vb.amount,
                status: vb.status,
            });
        }
        // Communications — WhatsApp, Email, Phone
        for (const c of commSends) {
            e.push({
                id: c.id,
                ts: c.sent_at,
                kind: "communication",
                title: `${c.channel === "whatsapp" ? "WhatsApp" : c.channel === "email" ? "Email" : c.channel === "pinterest" ? "Pinterest" : c.channel === "catalogue" ? "Catalogue" : c.channel === "material" ? "Material" : c.channel === "reference" ? "Reference" : c.channel} · ${c.subject}`,
                subtitle: `Communication · ${c.staff_name || "—"}`,
                status: c.status,
            });
        }
        return e.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    }, [tasks, quotations, payments, visits, sites, auditLog, drawings, executionLogs, boqs, purchaseOrders, grns, vendorBills, workOrders, commSends]);
    const grouped = React.useMemo(() => {
        const map = new Map<string, TimelineEntry[]>();
        for (const entry of entries) {
            const day = new Date(entry.ts).toISOString().slice(0, 10);
            if (!map.has(day))
                map.set(day, []);
            map.get(day)!.push(entry);
        }
        return Array.from(map.entries());
    }, [entries]);
    const kindMeta: Record<TimelineEntry["kind"], {
        icon: React.ElementType;
        tone: string;
        label: string;
    }> = {
        visit: { icon: MapPin, tone: "bg-primary/10 text-primary", label: "Visit" },
        payment: { icon: Wallet, tone: "bg-success/10 text-success", label: "Payment" },
        quotation: { icon: FileText, tone: "bg-warning/10 text-warning", label: "Quotation" },
        task: { icon: ListChecks, tone: "bg-muted text-foreground/70", label: "Task" },
        audit: { icon: Activity, tone: "bg-muted/60 text-muted-foreground", label: "Activity" },
        site: { icon: Building, tone: "bg-primary/10 text-primary", label: "Site" },
        drawing: { icon: FileText, tone: "bg-warning/10 text-warning", label: "Drawing" },
        executionLog: { icon: Activity, tone: "bg-primary/10 text-primary", label: "Execution" },
        boq: { icon: FileText, tone: "bg-muted text-foreground/70", label: "BOQ" },
        workOrder: { icon: Building, tone: "bg-primary/10 text-primary", label: "Work Order" },
        po: { icon: Package, tone: "bg-primary/10 text-primary", label: "PO" },
        grn: { icon: Truck, tone: "bg-success/10 text-success", label: "GRN" },
        vendorBill: { icon: Receipt, tone: "bg-destructive/10 text-destructive", label: "Vendor Bill" },
        communication: { icon: Send, tone: "bg-primary/10 text-primary", label: "Comm" },
    };
    const openEntry = (entry: TimelineEntry) => {
        if (entry.kind === "quotation")
            openDetail("quotation", entry.id);
        else if (entry.kind === "task")
            openDetail("task", entry.id);
        else if (entry.kind === "payment")
            openDetail("payment", entry.id);
        else if (entry.kind === "visit")
            openDetail("visit", entry.id);
        else if (entry.kind === "workOrder")
            openDetail("workOrder", entry.id);
        else if (entry.kind === "po")
            openDetail("po", entry.id);
        else if (entry.kind === "grn")
            openDetail("grn", entry.id);
        else if (entry.kind === "vendorBill")
            openDetail("vendorBill", entry.id);
        else if (entry.kind === "boq")
            openDetail("boq", entry.id);
    };
    return (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar name={name} size={48}/>
          <div className="min-w-0">
            <h2 className="break-words text-lg font-bold leading-snug tracking-tight">{name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Timeline · {entries.length} activities</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <StatusBadge label="TIMELINE" className="bg-primary/10 text-primary border-primary/20"/>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Visits" value={visits.length} tone="primary"/>
        <MetricCard label="Quotations" value={quotations.length}/>
        <MetricCard label="Payments" value={payments.length} tone="success"/>
        <MetricCard label="Tasks" value={tasks.length} tone="warning"/>
      </div>

      <SectionHeader title="Activity feed" count={entries.length}/>

      {entries.length === 0 ? (<EmptyState title="No activity yet" description={`Once ${name} has visits, payments, quotations, or tasks, they will appear here in chronological order.`} icon={<Activity className="h-7 w-7"/>}/>) : (<div className="flex flex-col gap-4">
          {grouped.map(([day, dayEntries]) => (<div key={day} className="flex flex-col gap-2">
              <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-card/95 px-1 py-1 backdrop-blur-sm">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {relativeDay(day)}
                </span>
                <span className="text-[10px] text-muted-foreground/70">· {new Date(day).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{dayEntries.length} activit{dayEntries.length === 1 ? "y" : "ies"}</span>
              </div>
              <ol className="relative ml-3 border-l border-border">
                {dayEntries.map((entry) => {
                    const meta = kindMeta[entry.kind];
                    const Icon = meta.icon;
                    return (<li key={entry.id} className="mb-2 ml-4 last:mb-0">
                      <button type="button" onClick={() => openEntry(entry)} className="group flex w-full items-start gap-2.5 rounded-md border border-border bg-background px-3 py-2 text-left transition-all hover:border-primary/30 hover:bg-accent/20 hover:shadow-sm">
                        <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", meta.tone)}>
                          <Icon className="h-3.5 w-3.5"/>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">{entry.title}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{entry.subtitle}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5">
                          {entry.amount !== undefined && (<span className="font-mono text-[11px] font-bold text-foreground/80">{formatINR(entry.amount)}</span>)}
                          {entry.status && (<span className="text-[10px] uppercase tracking-wider text-muted-foreground">{entry.status.replace(/_/g, " ")}</span>)}
                        </div>
                      </button>
                    </li>);
                })}
              </ol>
            </div>))}
        </div>)}
    </div>);
}
// Compact select-with-tickboxes dropdown: each row shows a checkbox reflecting
// what is required/already selected, ticked rows float to the top, and category
// groups are separated by blank space. Single-select for the line value.
function TickDropdown({ value, groups, ticked, placeholder, disabled, onChange, ariaLabel, }: {
    value?: string;
    groups: Array<{ key: string; items: Array<{ id: string; name: string }> }>;
    ticked: Set<string>;
    placeholder: string;
    disabled?: boolean;
    onChange: (id: string) => void;
    ariaLabel: string;
}) {
    const [open, setOpen] = React.useState(false);
    const selectedName = groups.flatMap((group) => group.items).find((item) => item.id === value)?.name;
    return (<div className="relative">
      <button type="button" disabled={disabled} aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex h-8 w-full items-center justify-between gap-1 rounded-md border border-input bg-card px-2 text-left text-xs disabled:cursor-not-allowed disabled:opacity-60">
        <span className={cn("truncate", !selectedName && "font-normal text-muted-foreground")}>{selectedName || placeholder}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground"/>
      </button>
      {open && (<>
        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true"/>
        <div role="listbox" aria-label={ariaLabel} onKeyDown={(event) => { if (event.key === "Escape")
            setOpen(false); }} className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg rd-scroll">
          {groups.map((group, groupIndex) => (<React.Fragment key={group.key}>
              {groupIndex > 0 && <div className="h-3" aria-hidden="true"/>}
              {[...group.items].sort((a, b) => Number(ticked.has(b.id)) - Number(ticked.has(a.id))).map((item) => {
            const isTicked = ticked.has(item.id);
            return (<button key={item.id} type="button" role="option" aria-selected={value === item.id} title={isTicked ? "Required in this work or already selected" : undefined} onClick={() => { onChange(item.id); setOpen(false); }} className={cn("flex min-h-9 w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent", value === item.id && "bg-primary/10 font-medium")}>
                  <span aria-hidden="true" className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border", isTicked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>{isTicked && <Check className="h-2.5 w-2.5"/>}</span>
                  <span className="truncate">{item.name}</span>
                </button>);
        })}
            </React.Fragment>))}
        </div>
      </>)}
    </div>);
}
// Rounds to 2 decimals and returns a string for the number inputs.
const areaStr = (value: number) => String(Math.round(value * 100) / 100);
function StructuredWorkRequiredDialog({ workRequired, site, areas, onClose, onSave, }: {
    workRequired: import("@/lib/rdash/types").WorkRequired;
    site: import("@/lib/rdash/types").Site;
    areas: import("@/lib/rdash/types").Area[];
    onClose: () => void;
    onSave: (lines: Array<{
        site_id: string;
        area_id?: string;
        area_name?: string;
        create_area?: boolean;
        area_type?: import("@/lib/rdash/types").AreaType;
        category_id: string;
        subcategory_id: string;
        length_ft?: number;
        breadth_ft?: number;
        height_ft?: number;
        floor_area?: number;
        quantity: number;
        notes?: string;
    }>) => boolean;
}) {
    const db = useRDashStore((state) => state.db);
    const { registerBatch, commitBatches } = useUploadDraft(true);
    type DraftLine = {
        area_id?: string;
        area_name?: string;
        create_area?: boolean;
        area_type?: import("@/lib/rdash/types").AreaType;
        category_id?: string;
        subcategory_id?: string;
        length?: string;
        breadth?: string;
        height?: string;
        wall_area: string;
        floor_area?: string;
        notes?: string;
    };
    const freshLine = (): DraftLine => ({ wall_area: "", category_id: workRequired.work_category_id });
    const initialLines = (): DraftLine[] => {
        const areaIds = workRequired.area_ids.filter((areaId) => areas.some((area) => area.id === areaId && !area.is_archived));
        const subcategoryIds = workRequired.work_subcategory_ids || [];
        const scopedAreas: Array<string | undefined> = areaIds.length ? areaIds : [undefined];
        const scopedSubcategories: Array<string | undefined> = subcategoryIds.length ? subcategoryIds : [undefined];
        return scopedSubcategories.flatMap((subcategoryId) => scopedAreas.map((areaId) => ({
            ...freshLine(),
            area_id: areaId,
            subcategory_id: subcategoryId,
        })));
    };
    const [lines, setLines] = React.useState<DraftLine[]>(initialLines);
    const updateLine = (index: number, patch: Partial<DraftLine>) => setLines((current) => current.map((line, row) => row === index ? { ...line, ...patch } : line));
    // Dimension edits auto-fill both areas; wall/ceiling values stay editable
    // afterwards (doors, openings) until a dimension changes again.
    const updateDims = (index: number, patch: Partial<DraftLine>) => setLines((current) => current.map((line, row) => {
        if (row !== index)
            return line;
        const next = { ...line, ...patch };
        const l = Number(next.length) || 0;
        const b = Number(next.breadth) || 0;
        const h = Number(next.height) || 0;
        if (l > 0 && b > 0) {
            next.floor_area = areaStr(l * b);
            // Height present → wall area 2·(L+B)·H; height empty (e.g. roof railing)
            // → running feet 2·(L+B).
            next.wall_area = areaStr(h > 0 ? 2 * (l + b) * h : 2 * (l + b));
        }
        return next;
    }));
    const addLine = () => setLines((current) => [...current, freshLine()]);
    const removeLine = (index: number) => setLines((current) => current.filter((_, row) => row !== index));
    const lineKey = React.useCallback((line: DraftLine) => {
        const area = line.area_id || (line.create_area && line.area_name ? `new:${normalizeAreaName(line.area_name)}` : "");
        return area && line.category_id && line.subcategory_id ? [area, line.category_id, line.subcategory_id].join("::") : "";
    }, []);
    const existingKeys = React.useMemo(() => new Set((workRequired.structured_items || []).map((item) => [item.area_id || "", item.category_id || "", item.subcategory_id || item.work_required_article_id || ""].join("::"))), [workRequired.structured_items]);
    const duplicateIndexes = React.useMemo(() => {
        const seen = new Set<string>();
        const duplicates = new Set<number>();
        lines.forEach((line, index) => {
            const key = lineKey(line);
            if (key && (seen.has(key) || existingKeys.has(key)))
                duplicates.add(index);
            if (key)
                seen.add(key);
        });
        return duplicates;
    }, [existingKeys, lineKey, lines]);
    const validLine = (line: DraftLine) => Boolean((line.area_id || (line.create_area && line.area_name?.trim())) &&
        line.category_id && line.subcategory_id &&
        Number.isFinite(Number(line.wall_area)) && Number(line.wall_area) > 0);
    const validLines = lines.filter(validLine);
    const canSave = validLines.length === lines.length && lines.length > 0 && duplicateIndexes.size === 0;
    const areaTypes: Array<{
        value: import("@/lib/rdash/types").AreaType;
        label: string;
    }> = [
        { value: "bedroom", label: "Bedroom" }, { value: "guest_room", label: "Guest room" }, { value: "living_room", label: "Living room / Hall" }, { value: "kitchen", label: "Kitchen" }, { value: "bathroom", label: "Bathroom" }, { value: "balcony", label: "Balcony" }, { value: "office_cabin", label: "Office cabin" }, { value: "reception", label: "Reception" }, { value: "other", label: "Other" },
    ];
    const renderLine = (line: DraftLine, index: number) => {
        const subcategories = line.category_id ? db.master.workSubcategories.filter((row) => row.category_id === line.category_id) : [];
        const duplicate = duplicateIndexes.has(index);
        // Ticked categories: required by work captured in this line's Area, the work
        // being captured, previous captures, and the other lines in this session.
        const areaWorkCategories = line.area_id
            ? db.workRequired
                .filter((row) => row.site_id === site.id && (row.area_ids || []).includes(line.area_id!))
                .map((row) => row.work_category_id)
            : [];
        const categoryTicks = new Set([workRequired.work_category_id,
            ...(workRequired.structured_items || []).map((item) => item.category_id),
            ...areaWorkCategories,
            ...lines.filter((_, row) => row !== index).map((row) => row.category_id),
        ].filter((id): id is string => Boolean(id)));
        // Ticked subcategories: the work's own subcategories, previous captures and
        // the other lines in this session.
        const subTicks = new Set([
            ...(workRequired.work_subcategory_ids || []),
            ...(workRequired.structured_items || []).map((item) => item.subcategory_id),
            ...lines.filter((_, row) => row !== index).map((row) => row.subcategory_id),
        ].filter((id): id is string => Boolean(id)));
        const subOptions = subcategories.map((subcategory) => ({ id: subcategory.id, name: subcategory.name }));
        return (<div key={index} className={cn("rounded-lg border p-3", duplicate ? "border-destructive/50 bg-destructive/[0.04]" : "border-border bg-muted/20")}>
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">Line {index + 1}</span>{lines.length > 1 && <button type="button" onClick={() => removeLine(index)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove line ${index + 1}`}><Plus className="h-3.5 w-3.5 rotate-45"/></button>}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Area *</label>
            <select value={line.create_area ? "__new__" : line.area_id || ""} onChange={(event) => {
            const value = event.target.value;
            if (value === "__new__")
                updateLine(index, { area_id: undefined, area_name: "", create_area: true, area_type: "other", length: undefined, breadth: undefined, height: undefined, wall_area: "", floor_area: undefined });
            else
                updateLine(index, { area_id: value || undefined, area_name: undefined, create_area: false, area_type: undefined, length: undefined, breadth: undefined, height: undefined, wall_area: "", floor_area: undefined });
        }} className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs">
              <option value="">— select area —</option>
              {areas.filter((area) => !area.is_archived).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              <option value="__new__">+ Create new area</option>
            </select>
          </div>
          {line.create_area && <><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">New area name *</label><Input value={line.area_name || ""} onChange={(event) => updateLine(index, { area_name: event.target.value })} placeholder="e.g. Living Room" className="h-8 text-xs"/></div><div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Area type *</label><select value={line.area_type || "other"} onChange={(event) => updateLine(index, { area_type: event.target.value as import("@/lib/rdash/types").AreaType })} className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs">{areaTypes.map((areaType) => <option key={areaType.value} value={areaType.value}>{areaType.label}</option>)}</select></div></>}
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Category *</label>
            <TickDropdown value={line.category_id} ariaLabel="Category" placeholder="— select category —" onChange={(categoryId) => updateLine(index, { category_id: categoryId, subcategory_id: undefined })} ticked={categoryTicks} groups={[{ key: "all", items: db.master.workCategories.map((category) => ({ id: category.id, name: category.name })) }]}/>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Subcategory *</label>
            <TickDropdown value={line.subcategory_id} ariaLabel="Subcategory" placeholder="— select subcategory —" disabled={!line.category_id} onChange={(subcategoryId) => updateLine(index, { subcategory_id: subcategoryId })} ticked={subTicks} groups={subOptions.length ? [
            { key: "ticked", items: subOptions.filter((option) => subTicks.has(option.id)) },
            { key: "others", items: subOptions.filter((option) => !subTicks.has(option.id)) },
        ].filter((group) => group.items.length) : []}/>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Length (ft)</label>
            <Input type="number" min="0" step="any" inputMode="decimal" value={line.length || ""} onChange={(event) => updateDims(index, { length: event.target.value })} placeholder="—" className="h-8 text-xs"/>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Breadth (ft)</label>
            <Input type="number" min="0" step="any" inputMode="decimal" value={line.breadth || ""} onChange={(event) => updateDims(index, { breadth: event.target.value })} placeholder="—" className="h-8 text-xs"/>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Height (ft)</label>
            <Input type="number" min="0" step="any" inputMode="decimal" value={line.height || ""} onChange={(event) => updateDims(index, { height: event.target.value })} placeholder="empty = running ft" className="h-8 text-xs"/>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Wall area / length *</label>
            <Input type="number" min="0" step="any" inputMode="decimal" value={line.wall_area} onChange={(event) => updateLine(index, { wall_area: event.target.value })} placeholder="auto from L×B×H" title="Auto: 2×(L+B)×H sqft, or 2×(L+B) running ft without height. Edit to deduct doors." className="h-8 text-xs"/>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Floor / ceiling area</label>
            <Input type="number" min="0" step="any" inputMode="decimal" value={line.floor_area || ""} onChange={(event) => updateLine(index, { floor_area: event.target.value })} placeholder="auto L×B" className="h-8 text-xs"/>
          </div>
          <div className="col-span-2 sm:col-span-3"><label className="text-[10px] font-semibold uppercase text-muted-foreground">Notes</label><Input value={line.notes || ""} onChange={(event) => updateLine(index, { notes: event.target.value })} placeholder="Customer preference, finish, doors/openings or scope note" className="h-8 text-xs"/></div>
        </div>
        {duplicate && <p className="mt-2 text-[11px] text-destructive">This line duplicates an already captured scope. Edit the earlier line instead.</p>}
      </div>);
    };
    return (<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3"><div><h3 className="flex items-center gap-2 text-base font-bold"><ListChecks className="h-4 w-4 text-primary"/> Capture detailed area</h3><p className="text-[11px] text-muted-foreground">{site.name} · {workRequired.title}</p></div><button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close"><Plus className="h-4 w-4 rotate-45"/></button></div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 rd-scroll"><p className="mb-3 text-xs text-muted-foreground">This capture is locked to <strong>{site.name}</strong>. Area, Category, Subcategory, and Wall area/length are required. Length × Breadth × Height auto-fills both areas (e.g. a 5×6×10 ft bathroom → 220 sqft of wall); leave Height empty for running feet (railings). Adjust any area to deduct doors and openings.</p><EntityFilesCard entityType="workRequired" entityId={workRequired.id} title="Requirement files" manage allowDetach={false} registerBatch={registerBatch} /><div className="mt-3 space-y-2">{lines.map(renderLine)}</div><Button size="sm" variant="outline" className="mt-3 h-7 text-xs" onClick={addLine}><Plus className="mr-1 h-3.5 w-3.5"/> Add line</Button></div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3"><span className={cn("text-[11px]", canSave ? "text-muted-foreground" : "text-destructive")}>{canSave ? `${lines.length} complete line(s)` : "Complete every required field and remove duplicates to capture."}</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!canSave} onClick={() => { const saved = onSave(lines.map((line) => ({ site_id: site.id, area_id: line.area_id, area_name: line.area_name?.trim(), create_area: line.create_area, area_type: line.area_type, category_id: line.category_id!, subcategory_id: line.subcategory_id!, length_ft: Number(line.length) > 0 ? Number(line.length) : undefined, breadth_ft: Number(line.breadth) > 0 ? Number(line.breadth) : undefined, height_ft: Number(line.height) > 0 ? Number(line.height) : undefined, floor_area: Number(line.floor_area) > 0 ? Number(line.floor_area) : undefined, quantity: Number(line.wall_area), notes: line.notes?.trim() || undefined }))); if (saved) commitBatches(); }}><CheckCircle2 className="mr-1 h-3.5 w-3.5"/> Capture {lines.length} line(s)</Button></div></div>
      </div>
    </div>);
}
