"use client";

import * as React from "react";
import {
  Building2,
  ClipboardList,
  FileText,
  Gavel,
  MapPin,
  PackageCheck,
  Plus,
  ReceiptText,
  Ruler,
  ShoppingCart,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CustomerSitesDialog } from "@/components/rdash/CustomerSitesDialog";
import { WorkRequiredCreateDialog } from "@/components/rdash/WorkRequiredCreateDialog";
import { CustomerWorkCaptureDialog } from "@/components/rdash/customer/CustomerWorkCaptureDialog";
import {
  activeQuotationForWork,
  verifiedMeasurementRevisionIds,
} from "@/components/rdash/customer/CustomerQuotationDialog";
import { useRDashStore } from "@/lib/rdash/store";
import { formatINRShort } from "@/lib/rdash/format";
import { workRequiredDisplayTitle } from "@/lib/rdash/work-types";
import { EmptyState, MetricCard, SectionHeader, StatusBadge } from "../primitives";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useActiveTabScroll } from "@/components/rdash/use-active-tab-scroll";

const TABS = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "areas", label: "Areas & Scope", icon: Ruler },
  { id: "work", label: "Scope Register", icon: Wrench },
  { id: "quotations", label: "Commercial", icon: FileText },
  { id: "bids", label: "Bidding", icon: Gavel },
  { id: "orders", label: "Execution", icon: ClipboardList },
  { id: "boq", label: "BOQ", icon: PackageCheck },
  { id: "procurement", label: "Procurement", icon: ShoppingCart },
  { id: "finance", label: "Finance", icon: ReceiptText },
] as const;

type TabId = (typeof TABS)[number]["id"];
const isTabId = (value?: string): value is TabId => !!value && TABS.some((tab) => tab.id === value);
const titleFromType = (type: string) => type.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

const siteStageStyle: Record<string, string> = {
  enquiry: "bg-muted text-muted-foreground border-border",
  planning: "bg-warning/10 text-warning border-warning/20",
  quoted: "bg-primary/10 text-primary border-primary/20",
  awarded: "bg-success/10 text-success border-success/20",
  execution: "bg-success/10 text-success border-success/20",
  on_hold: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-success/10 text-success border-success/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const workStatusStyle: Record<string, string> = {
  new: "bg-muted text-muted-foreground border-border",
  measurement_done: "bg-primary/10 text-primary border-primary/20",
  quotation_sent: "bg-warning/10 text-warning border-warning/20",
  negotiation: "bg-warning/10 text-warning border-warning/20",
  accepted: "bg-success/10 text-success border-success/20",
  contractor_bidding: "bg-primary/10 text-primary border-primary/20",
  awarded: "bg-success/10 text-success border-success/20",
  in_progress: "bg-success/10 text-success border-success/20",
  completed: "bg-success/10 text-success border-success/20",
  on_hold: "bg-destructive/10 text-destructive border-destructive/20",
  lost: "bg-muted text-muted-foreground border-border",
};

/**
 * Site Execution is an operating view over Customer-owned Sites / Areas /
 * Work Required / Quotation workflows. It can launch them with Site context,
 * but it deliberately does not create Areas, Work Required lines or quotation
 * payloads by itself.
 */
export function SiteExecutionModule({ initialTab }: { initialTab?: string }) {
  const db = useRDashStore((state) => state.db);
  const openQuotationAcceptanceDialog = useRDashStore((state) => state.openQuotationAcceptanceDialog);
  const addContractorBid = useRDashStore((state) => state.addContractorBid);
  const selectContractorBid = useRDashStore((state) => state.selectContractorBid);
  const directAwardContractor = useRDashStore((state) => state.directAwardContractor);
  const updateJob = useRDashStore((state) => state.updateJob);
  const createBOQ = useRDashStore((state) => state.createBOQ);
  const createVendorRFQ = useRDashStore((state) => state.createVendorRFQ);
  const addVendorBid = useRDashStore((state) => state.addVendorBid);
  const selectVendorBid = useRDashStore((state) => state.selectVendorBid);
  const createPOFromVendorBid = useRDashStore((state) => state.createPOFromVendorBid);
  const setActiveModule = useRDashStore((state) => state.setActiveModule);
  const openCreateDialog = useRDashStore((state) => state.openCreateDialog);
  const openDetail = useRDashStore((state) => state.openDetail);

  const activeSites = db.sites.filter((site) => !site.is_archived);
  const [selectedSiteId, setSelectedSiteId] = React.useState(() => activeSites[0]?.id || "");
  const [tab, setTab] = React.useState<TabId>(() => isTabId(initialTab) ? initialTab : "overview");
  const { stripRef, bindActiveTab } = useActiveTabScroll(tab);
  const [newSiteOpen, setNewSiteOpen] = React.useState(false);
  const [editSiteOpen, setEditSiteOpen] = React.useState(false);
  const [newWorkOpen, setNewWorkOpen] = React.useState(false);
  const [newWorkAreaId, setNewWorkAreaId] = React.useState<string | null>(null);
  const [captureWorkId, setCaptureWorkId] = React.useState<string | null>(null);

  const [bidScopeId, setBidScopeId] = React.useState<string | null>(null);
  const [bidContractorId, setBidContractorId] = React.useState("");
  const [bidQuoteAmount, setBidQuoteAmount] = React.useState("");
  const [bidEstimatedDays, setBidEstimatedDays] = React.useState("7");
  const [bidWithMaterial, setBidWithMaterial] = React.useState(false);
  const [bidScopeNotes, setBidScopeNotes] = React.useState("");

  const [directAwardScopeId, setDirectAwardScopeId] = React.useState<string | null>(null);
  const [directAwardContractorId, setDirectAwardContractorId] = React.useState("");
  const [directAwardAmount, setDirectAwardAmount] = React.useState("");
  const [directAwardDays, setDirectAwardDays] = React.useState("7");
  const [directAwardWithMaterial, setDirectAwardWithMaterial] = React.useState(false);
  const [directAwardReason, setDirectAwardReason] = React.useState("");
  const [directAwardNote, setDirectAwardNote] = React.useState("");

  const [vendorBidRfqId, setVendorBidRfqId] = React.useState<string | null>(null);
  const [vendorBidVendorId, setVendorBidVendorId] = React.useState("");
  const [vendorBidRates, setVendorBidRates] = React.useState<Record<string, string>>({});
  const [vendorBidDeliveryDays, setVendorBidDeliveryDays] = React.useState("");

  React.useEffect(() => {
    if (!selectedSiteId || !activeSites.some((site) => site.id === selectedSiteId)) setSelectedSiteId(activeSites[0]?.id || "");
  }, [activeSites, selectedSiteId]);
  React.useEffect(() => { if (isTabId(initialTab)) setTab(initialTab); }, [initialTab]);

  const selectedSite = activeSites.find((site) => site.id === selectedSiteId);
  const selectedCustomer = db.customers.find((customer) => customer.id === selectedSite?.customer_id);
  const areas = db.areas.filter((area) => area.site_id === selectedSiteId && !area.is_archived);
  const workRequired = db.workRequired.filter((work) => work.site_id === selectedSiteId);
  const quotations = db.quotations.filter((quotation) => quotation.site_id === selectedSiteId);
  const acceptedScopes = db.acceptedScopes.filter((scope) => scope.site_id === selectedSiteId);
  const workOrders = db.workOrders.filter((workOrder) => workOrder.site_id === selectedSiteId);
  const boqs = db.boqs.filter((boq) => workOrders.some((workOrder) => workOrder.id === boq.work_order_id));
  const rfqs = db.vendorRfqs.filter((rfq) => rfq.site_id === selectedSiteId);
  const pos = db.purchaseOrders.filter((purchaseOrder) => purchaseOrder.site_id === selectedSiteId || workOrders.some((workOrder) => workOrder.id === purchaseOrder.work_order_id));
  const grns = db.grns.filter((grn) => workOrders.some((workOrder) => workOrder.id === grn.work_order_id));
  const customerReceipts = db.customerReceipts.filter((receipt) => receipt.site_id === selectedSiteId);
  const customerInvoices = db.invoices.filter((invoice) => invoice.site_id === selectedSiteId && invoice.status !== "cancelled");
  const contractorBills = db.contractorBills.filter((bill) => workOrders.some((workOrder) => workOrder.id === bill.work_order_id));
  const bids = db.contractorBids.filter((bid) => bid.site_id === selectedSiteId);

  const activeMeasurementVisitForWork = (workId: string) => db.visits.find((visit) =>
    visit.visit_type === "measurement"
    && visit.site_id === selectedSiteId
    && visit.work_required_id === workId
    && !visit.report_filed
    && !["cancelled", "completed", "missed"].includes(visit.status),
  );

  const workHasVerifiedMeasurement = (work: (typeof workRequired)[number]) => {
    if (!selectedSite) return false;
    const ids = verifiedMeasurementRevisionIds(db, selectedSite.id, work);
    const measuredAreas = new Set(
      db.measurementRevisions.filter((revision) => ids.includes(revision.id)).map((revision) => revision.area_id),
    );
    return work.area_ids.every((areaId) => measuredAreas.has(areaId));
  };

  const openWorkForArea = (areaId?: string) => {
    setNewWorkAreaId(areaId || null);
    setNewWorkOpen(true);
  };

  const scheduleMeasurement = (workId: string) => {
    if (!selectedSite) return;
    const work = workRequired.find((row) => row.id === workId);
    if (!work) return toast.error("Select a valid Work Required record first.");
    const existingVisit = activeMeasurementVisitForWork(work.id);
    if (existingVisit) {
      toast.info(`A Measurement Visit is already ${existingVisit.status.replaceAll("_", " ")} for this Work Required.`);
      setActiveModule("siteMeasurement");
      return;
    }
    openCreateDialog({
      kind: "visit",
      customerId: selectedSite.customer_id,
      siteId: selectedSite.id,
      workRequiredId: work.id,
      visitType: "measurement",
    });
  };

  const prepareQuotation = (workId: string) => {
    if (!selectedSite) return;
    const work = workRequired.find((row) => row.id === workId);
    if (!work) return;
    const existing = activeQuotationForWork(db, work.id);
    if (existing) {
      openDetail("quotation", existing.id);
      return;
    }
    // CustomerQuotationDialog owns all measurement validation and coverage
    // serialization. Site Execution passes context only.
    openCreateDialog({
      kind: "quotation",
      customerId: selectedSite.customer_id,
      siteId: selectedSite.id,
      workRequiredId: work.id,
    });
  };

  const openBid = (scopeId: string) => {
    if (!db.master.contractors.length) return toast.error("Add at least one contractor in Master Setup before inviting a bid.");
    setBidScopeId(scopeId);
    setBidContractorId(db.master.contractors[0]?.id || "");
    setBidQuoteAmount("");
    setBidEstimatedDays("7");
    setBidWithMaterial(false);
    setBidScopeNotes("");
  };

  const saveBid = () => {
    if (!bidScopeId || !bidContractorId) return toast.error("Select a contractor for this bid.");
    const quote = Number(bidQuoteAmount);
    if (!Number.isFinite(quote) || quote <= 0) return toast.error("Enter the contractor's actual quote amount above zero.");
    const days = Number(bidEstimatedDays);
    const id = addContractorBid({
      accepted_scope_id: bidScopeId,
      contractor_id: bidContractorId,
      quote_amount: quote,
      estimated_days: Number.isFinite(days) && days > 0 ? days : undefined,
      with_material: bidWithMaterial,
      evaluation_notes: bidScopeNotes.trim() || undefined,
    });
    if (!id) return toast.error("Bid could not be recorded.");
    toast.success(`Bid recorded for ${formatINRShort(quote)}.`);
    setBidScopeId(null);
  };

  const openDirectAward = (scopeId: string) => {
    if (!db.master.contractors.length) return toast.error("Add at least one contractor in Master Setup before direct-awarding.");
    const scope = acceptedScopes.find((row) => row.id === scopeId);
    setDirectAwardScopeId(scopeId);
    setDirectAwardContractorId(db.master.contractors[0]?.id || "");
    setDirectAwardAmount(scope ? String(scope.accepted_value) : "");
    setDirectAwardDays("7");
    setDirectAwardWithMaterial(false);
    setDirectAwardReason("");
    setDirectAwardNote("");
  };

  const saveDirectAward = () => {
    if (!directAwardScopeId || !directAwardContractorId) return toast.error("Select a contractor for the direct award.");
    if (!directAwardReason.trim()) return toast.error("A reason is required for a direct award.");
    const amount = Number(directAwardAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter a valid award amount.");
    const days = Number(directAwardDays);
    try {
      const workOrderId = directAwardContractor({
        accepted_scope_id: directAwardScopeId,
        contractor_id: directAwardContractorId,
        award_amount: amount,
        with_material: directAwardWithMaterial,
        estimated_days: Number.isFinite(days) && days > 0 ? days : undefined,
        award_reason: directAwardReason.trim(),
        note: directAwardNote.trim() || undefined,
      });
      if (workOrderId) {
        toast.success("Direct-award Work Order created; reason recorded in the audit log.");
        setDirectAwardScopeId(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Direct award failed.");
    }
  };

  const issueVendorRFQ = (workOrderId: string) => {
    const id = createVendorRFQ(workOrderId);
    if (!id) return toast.error("Approve the BOQ and confirm company-supplied material before issuing a vendor RFQ.");
    toast.success("Vendor RFQ issued for approved BOQ lines.");
  };

  const openVendorBid = (rfqId: string) => {
    const rfq = db.vendorRfqs.find((entry) => entry.id === rfqId);
    const firstVendor = rfq?.vendor_ids.find((id) => !db.vendorBids.some((bid) => bid.rfq_id === rfqId && bid.vendor_id === id)) || "";
    setVendorBidRfqId(rfqId);
    setVendorBidVendorId(firstVendor);
    const boq = rfq ? db.boqs.find((entry) => entry.id === rfq.boq_id) : undefined;
    setVendorBidRates(Object.fromEntries((boq?.items || []).filter((item) => rfq?.item_ids.includes(item.id)).map((item) => [item.id, ""])));
    setVendorBidDeliveryDays("");
  };

  const saveVendorBid = () => {
    if (!vendorBidRfqId || !vendorBidVendorId) return toast.error("Select a vendor for this RFQ.");
    const rfq = db.vendorRfqs.find((entry) => entry.id === vendorBidRfqId);
    const boq = rfq ? db.boqs.find((entry) => entry.id === rfq.boq_id) : undefined;
    if (!rfq || !boq) return toast.error("The RFQ or approved BOQ is unavailable.");
    const lines = boq.items
      .filter((item) => rfq.item_ids.includes(item.id))
      .map((item) => ({
        boq_item_id: item.id,
        article_id: item.article_id,
        title: item.title,
        quantity: item.quantity,
        unit_id: item.unit_id,
        unit_name: item.unit_name,
        rate: Number(vendorBidRates[item.id]),
        amount: Math.round(item.quantity * Number(vendorBidRates[item.id])),
        tax_rate: item.tax_rate,
      }));
    if (!lines.length || lines.some((line) => !Number.isFinite(line.rate) || line.rate <= 0)) return toast.error("Enter an actual vendor rate for every requested BOQ article.");
    const days = vendorBidDeliveryDays.trim() ? Number(vendorBidDeliveryDays) : undefined;
    const id = addVendorBid({
      rfq_id: vendorBidRfqId,
      vendor_id: vendorBidVendorId,
      lines,
      delivery_days: days && Number.isFinite(days) ? days : undefined,
    });
    if (!id) return toast.error("Vendor bid could not be recorded.");
    toast.success("Vendor bid recorded for comparison.");
    setVendorBidRfqId(null);
  };

  const createProcurementOrder = (bidId: string) => {
    selectVendorBid(bidId);
    const poId = createPOFromVendorBid(bidId);
    if (!poId) return toast.error("Procurement order could not be created from this vendor selection.");
    toast.success("Procurement order created from the selected vendor bid.");
    setActiveModule("procurementInventory");
  };

  if (!selectedSite) {
    return <>
      <EmptyState icon={<Building2 className="h-6 w-6" />} title="Create the first site" description="Sites are Customer-owned operating contexts for Areas, Work Required, quotations and execution." action={<Button onClick={() => setNewSiteOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Add Customer & Site</Button>} />
      <CustomerSitesDialog open={newSiteOpen} autoAddSite onClose={() => setNewSiteOpen(false)} />
    </>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-sm font-bold">Customer Sites</p><p className="text-xs text-muted-foreground">Same Customer Site records used everywhere</p></div><Button size="icon" variant="outline" onClick={() => setNewSiteOpen(true)} aria-label="Add site"><Plus className="h-4 w-4" /></Button></div>
          <div className="space-y-2">
            {activeSites.map((site) => {
              const customer = db.customers.find((row) => row.id === site.customer_id);
              return <button key={site.id} type="button" onClick={() => setSelectedSiteId(site.id)} className={cn("w-full rounded-lg border p-3 text-left transition-colors", selectedSiteId === site.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                <div className="flex items-start justify-between gap-2"><p className="min-w-0 text-sm font-semibold leading-snug line-clamp-2">{site.name}</p><StatusBadge label={site.stage} className={cn("shrink-0", siteStageStyle[site.stage])} /></div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{customer?.name || "Unknown Customer"} · {titleFromType(site.site_type)}</p>
                {site.locality && <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3" />{site.locality}</p>}
              </button>;
            })}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{selectedCustomer?.name || "Customer"} · {titleFromType(selectedSite.site_type)}</p><h1 className="mt-1 text-xl font-bold">{selectedSite.name}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{selectedSite.address || selectedSite.notes || "Define Area and Work Required through the Customer workflow before quoting."}</p></div><div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => setEditSiteOpen(true)}>Edit site profile</Button><StatusBadge label={selectedSite.stage} className={siteStageStyle[selectedSite.stage]} /></div></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><MetricCard label="Areas" value={areas.length} tone="primary" /><MetricCard label="Work Required" value={workRequired.length} tone="primary" /><MetricCard label="Quotes" value={quotations.length} tone="default" /><MetricCard label="Bidding" value={acceptedScopes.filter((scope) => scope.status === "contractor_bidding").length} tone="warning" /><MetricCard label="Work Orders" value={workOrders.length} tone="success" /></div>
          </div>

          <div ref={stripRef} className="flex overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-card">
            {TABS.map((entry) => { const Icon = entry.icon; return <button key={entry.id} ref={bindActiveTab(entry.id)} type="button" onClick={() => setTab(entry.id)} className={cn("flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold", tab === entry.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="h-3.5 w-3.5" />{entry.label}</button>; })}
          </div>

          {tab === "overview" && <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,.75fr)]">
            <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
              <SectionHeader title="Site progression" />
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "1 · Customer Site", detail: `${areas.length} Area${areas.length === 1 ? "" : "s"}`, ready: areas.length > 0 },
                  { label: "2 · Scope & measurement", detail: `${workRequired.length} Work Required`, ready: workRequired.length > 0 && workRequired.every(workHasVerifiedMeasurement) },
                  { label: "3 · Commercial", detail: `${quotations.length} quotation${quotations.length === 1 ? "" : "s"}`, ready: quotations.some((quotation) => quotation.status === "accepted") },
                  { label: "4 · Delivery", detail: `${workOrders.length} work order${workOrders.length === 1 ? "" : "s"}`, ready: workOrders.length > 0 },
                ].map((phase) => <div key={phase.label} className={cn("rounded-lg border p-3", phase.ready ? "border-success/30 bg-success/[0.05]" : "border-border bg-muted/20")}><p className="text-xs font-bold">{phase.label}</p><p className="mt-1 text-[11px] text-muted-foreground">{phase.detail}</p></div>)}
              </div>
              <div className="mt-4 space-y-2">{workRequired.length ? workRequired.slice(0, 5).map((work) => <WorkRow key={work.id} work={work} areas={areas} measured={workHasVerifiedMeasurement(work)} existingVisit={activeMeasurementVisitForWork(work.id)} existingQuotation={activeQuotationForWork(db, work.id)} onCapture={() => setCaptureWorkId(work.id)} onMeasure={() => scheduleMeasurement(work.id)} onOpenMeasurement={() => setActiveModule("siteMeasurement")} onQuotation={() => prepareQuotation(work.id)} onOpenQuotation={(id) => openDetail("quotation", id)} />) : <EmptyState title="Define Area + Work Required" description="Use the Customer-owned Work Required form; it creates/chooses the Area and work taxonomy in one canonical path." action={<Button size="sm" onClick={() => openWorkForArea()}><Plus className="mr-1 h-3.5 w-3.5" />Add Area & Work</Button>} />}</div>
            </div>
            <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Immediate actions" /><div className="mt-3 grid gap-2"><Button variant="outline" className="justify-start" onClick={() => openWorkForArea()}><Ruler className="mr-2 h-4 w-4" />Add Area & Work Required</Button><Button variant="outline" className="justify-start" onClick={() => setTab("areas")}><Wrench className="mr-2 h-4 w-4" />Open Areas & Scope</Button><Button variant="outline" className="justify-start" onClick={() => setTab("quotations")}><FileText className="mr-2 h-4 w-4" />Review quotations</Button><Button variant="outline" className="justify-start" onClick={() => openCreateDialog({ kind: "visit", customerId: selectedSite.customer_id, siteId: selectedSite.id, visitType: "measurement" })}><Users className="mr-2 h-4 w-4" />Schedule measurement visit</Button></div></div>
          </div>}

          {tab === "areas" && <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <SectionHeader title="Areas & Scope" count={areas.length} action={<Button size="sm" onClick={() => openWorkForArea()}><Plus className="mr-1 h-3.5 w-3.5" />Add Area & Work</Button>} />
            {areas.length ? <div className="mt-3 grid gap-3 xl:grid-cols-2">{areas.map((area) => {
              const areaWork = workRequired.filter((work) => work.area_ids.includes(area.id));
              return <div key={area.id} className="rounded-xl border border-border bg-muted/10 p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{area.name}</p><p className="text-xs text-muted-foreground">{titleFromType(area.area_type)} · {area.length && area.width ? `${area.length} × ${area.width} ${area.unit || "ft"}` : "Measurement pending"}</p></div><StatusBadge label={area.stage} className={area.stage === "measured" ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"} /></div><div className="mt-3 rounded-lg border border-border bg-card p-2.5"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Work Required · {areaWork.length}</p><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openWorkForArea(area.id)}><Plus className="mr-1 h-3 w-3" />Add work</Button></div><div className="mt-2 space-y-2">{areaWork.map((work) => <WorkRow key={work.id} work={work} areas={areas} measured={workHasVerifiedMeasurement(work)} existingVisit={activeMeasurementVisitForWork(work.id)} existingQuotation={activeQuotationForWork(db, work.id)} onCapture={() => setCaptureWorkId(work.id)} onMeasure={() => scheduleMeasurement(work.id)} onOpenMeasurement={() => setActiveModule("siteMeasurement")} onQuotation={() => prepareQuotation(work.id)} onOpenQuotation={(id) => openDetail("quotation", id)} />)}{!areaWork.length && <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No work defined in this Area.</p>}</div></div></div>;
            })}</div> : <div className="mt-3"><EmptyState title="No Areas defined" description="The Customer Work Required form is the only Area-creation path here." action={<Button size="sm" onClick={() => openWorkForArea()}><Plus className="mr-1 h-3.5 w-3.5" />Add Area & Work Required</Button>} /></div>}
          </div>}

          {tab === "work" && <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Scope Register" count={workRequired.length} action={<Button size="sm" onClick={() => openWorkForArea()}><Plus className="mr-1 h-3.5 w-3.5" />Add Area & Work</Button>} /><p className="mt-2 text-xs text-muted-foreground">This is a Site-context view of the same Customer Work Required records. Creation, taxonomy, dimensions and detailed capture stay in the Customer-owned workflows.</p><div className="mt-3 space-y-2">{workRequired.map((work) => <WorkRow key={work.id} work={work} areas={areas} measured={workHasVerifiedMeasurement(work)} existingVisit={activeMeasurementVisitForWork(work.id)} existingQuotation={activeQuotationForWork(db, work.id)} onCapture={() => setCaptureWorkId(work.id)} onMeasure={() => scheduleMeasurement(work.id)} onOpenMeasurement={() => setActiveModule("siteMeasurement")} onQuotation={() => prepareQuotation(work.id)} onOpenQuotation={(id) => openDetail("quotation", id)} />)}{!workRequired.length && <EmptyState title="No Work Required" description="Add Area and Work Required through the Customer workflow." />}</div></div>}

          {tab === "quotations" && <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Customer quotations" count={quotations.length} action={<Button size="sm" onClick={() => openCreateDialog({ kind: "quotation", customerId: selectedSite.customer_id, siteId: selectedSite.id })}><Plus className="mr-1 h-3.5 w-3.5" />New quotation</Button>} /><p className="mt-2 text-xs text-muted-foreground">Every quotation here is created by the same Customer quotation dialog used by Customer Desk and Quotation Desk.</p><div className="mt-3 space-y-2">{quotations.map((quotation) => <button key={quotation.id} type="button" onClick={() => openDetail("quotation", quotation.id)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent/20"><div><p className="font-semibold">{quotation.quotation_no} · {quotation.title}</p><p className="mt-1 text-xs text-muted-foreground">{quotation.coverage.map((coverage) => coverage.coverage_label).join(" · ") || "Customer-level draft"} · {formatINRShort(quotation.total_amount)}</p></div><div className="flex items-center gap-2"><StatusBadge label={quotation.status} className={quotation.status === "accepted" ? "bg-success/10 text-success border-success/20" : quotation.status === "sent" ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border"} />{["draft", "sent", "rejected", "expired", "accepted"].includes(quotation.status) && quotation.work_order_ids.length === 0 && <Button size="sm" onClick={(event) => { event.stopPropagation(); openQuotationAcceptanceDialog(quotation.id); }}>Accept scope</Button>}</div></button>)}{!quotations.length && <EmptyState title="No quotation for this Site" description="Create it through the canonical Customer quotation workflow." />}</div></div>}

          {tab === "bids" && <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Contractor bidding" count={acceptedScopes.length} /><div className="mt-3 space-y-3">{acceptedScopes.map((scope) => { const scopeBids = bids.filter((bid) => bid.accepted_scope_id === scope.id); return <div key={scope.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{scope.label}</p><p className="mt-1 text-xs text-muted-foreground">Accepted {formatINRShort(scope.accepted_value)} · {scope.status.replaceAll("_", " ")}</p></div>{scope.status === "contractor_bidding" && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openBid(scope.id)}><Plus className="mr-1 h-3.5 w-3.5" />Invite bid</Button><Button size="sm" variant="outline" className="border-warning/40 text-warning" onClick={() => openDirectAward(scope.id)}><Zap className="mr-1 h-3.5 w-3.5" />Direct award</Button></div>}</div><div className="mt-3 space-y-2">{scopeBids.map((bid) => <div key={bid.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"><div><p className="text-sm font-semibold">{bid.contractor_name}</p><p className="text-xs text-muted-foreground">{bid.quote_amount ? formatINRShort(bid.quote_amount) : "Rate pending"} · {bid.estimated_days || "—"} days</p></div>{bid.status === "submitted" && scope.status === "contractor_bidding" ? <Button size="sm" onClick={() => selectContractorBid(bid.id)}>Award contractor</Button> : <StatusBadge label={bid.status} className={bid.status === "selected" ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"} />}</div>)}{!scopeBids.length && <p className="text-xs text-muted-foreground">No contractor bid yet.</p>}</div></div>; })}{!acceptedScopes.length && <EmptyState title="No accepted quotation scope" description="Accept a Customer quotation first." />}</div></div>}

          {tab === "orders" && <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Awarded work orders" count={workOrders.length} /><div className="mt-3 space-y-2">{workOrders.map((workOrder) => <div key={workOrder.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{workOrder.work_order_no} · {workOrder.title}</p><p className="mt-1 text-xs text-muted-foreground">{workOrder.contractor_name || "Contractor pending"} · Customer value {formatINRShort(workOrder.value)}</p></div><div className="flex items-center gap-2"><StatusBadge label={workOrder.status} className={workOrder.status === "completed" ? "bg-success/10 text-success border-success/20" : "bg-primary/10 text-primary border-primary/20"} />{workOrder.status === "scheduled" && <Button size="sm" variant="outline" onClick={() => updateJob(workOrder.id, { status: "in_progress" })}>Start work</Button>}{workOrder.status === "in_progress" && <Button size="sm" variant="outline" disabled={workOrder.progress < 100} onClick={() => updateJob(workOrder.id, { status: "completed" })}>Complete</Button>}</div></div></div>)}{!workOrders.length && <EmptyState title="No work order yet" description="Award a contractor bid to create a Work Order." />}</div></div>}

          {tab === "boq" && <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Execution BOQ" count={boqs.length} /><div className="mt-3 space-y-2">{workOrders.map((workOrder) => { const boq = boqs.find((row) => row.work_order_id === workOrder.id); return <div key={workOrder.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{workOrder.work_order_no} · {workOrder.title}</p><p className="text-xs text-muted-foreground">{boq ? `${boq.items.length} article lines · ${formatINRShort(boq.total_amount)}` : "Material plan not created"}</p></div>{boq ? <StatusBadge label={boq.status} className="bg-primary/10 text-primary border-primary/20" /> : <Button size="sm" onClick={() => createBOQ(workOrder.id)}>Create BOQ</Button>}</div></div>; })}{!workOrders.length && <EmptyState title="BOQ starts after contractor award" description="Award a contractor first." />}</div></div>}

          {tab === "procurement" && <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Vendor procurement" /><div className="mt-3 grid gap-3 md:grid-cols-3"><MetricCard label="Vendor RFQs" value={rfqs.length} tone="primary" /><MetricCard label="Purchase Orders" value={pos.length} tone="warning" /><MetricCard label="GRNs" value={grns.length} tone="success" /></div><div className="mt-4 space-y-3">{workOrders.map((workOrder) => { const boq = boqs.find((entry) => entry.work_order_id === workOrder.id); const rfq = rfqs.find((entry) => entry.work_order_id === workOrder.id); const rfqBids = rfq ? db.vendorBids.filter((bid) => bid.rfq_id === rfq.id) : []; const procurementOrder = rfq ? pos.find((po) => po.rfq_id === rfq.id) : undefined; return <div key={workOrder.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{workOrder.work_order_no} · {workOrder.title}</p><p className="mt-1 text-xs text-muted-foreground">{workOrder.material_responsibility === "contractor" || workOrder.with_material ? "Contractor supplies material" : boq ? `${boq.items.filter((item) => (item.supply_responsibility || "company") === "company").length} company BOQ line(s) · ${boq.status}` : "Create and approve BOQ first"}</p></div>{(workOrder.material_responsibility || (workOrder.with_material ? "contractor" : "company")) === "company" && !rfq && <Button size="sm" disabled={!boq || boq.status !== "approved"} onClick={() => issueVendorRFQ(workOrder.id)}><ShoppingCart className="mr-1.5 h-3.5 w-3.5" />Issue vendor RFQ</Button>}</div>{rfq && <div className="mt-3 rounded-md bg-muted/40 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{rfq.rfq_no}</p><p className="text-xs text-muted-foreground">{rfq.vendor_ids.length} invited · {rfq.status.replaceAll("_", " ")}</p></div>{rfq.status !== "awarded" && <Button size="sm" variant="outline" onClick={() => openVendorBid(rfq.id)}><Plus className="mr-1 h-3.5 w-3.5" />Record vendor bid</Button>}</div><div className="mt-3 space-y-2">{rfqBids.map((bid) => <div key={bid.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"><div><p className="text-sm font-semibold">{bid.vendor_name}</p><p className="text-xs text-muted-foreground">{formatINRShort(bid.quoted_amount)} · {bid.delivery_days || "—"} delivery days</p></div>{bid.status === "received" && rfq.status !== "awarded" ? <Button size="sm" onClick={() => createProcurementOrder(bid.id)}>Select & create PO</Button> : bid.status === "selected" ? <div className="flex items-center gap-2"><StatusBadge label="selected" className="bg-success/10 text-success border-success/20" />{procurementOrder && <StatusBadge label={procurementOrder.status} className="bg-primary/10 text-primary border-primary/20" />}</div> : <StatusBadge label={bid.status} className="bg-muted text-muted-foreground border-border" />}</div>)}{!rfqBids.length && <p className="text-xs text-muted-foreground">No vendor response recorded yet.</p>}</div></div>}</div>; })}</div></div>}

          {tab === "finance" && <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Site finance" /><div className="mt-3 grid gap-3 md:grid-cols-3"><MetricCard label="Customer collections" value={formatINRShort(customerReceipts.reduce((sum, receipt) => sum + receipt.amount, 0))} tone="success" /><MetricCard label="Customer receivable" value={formatINRShort(customerInvoices.reduce((sum, invoice) => sum + invoice.balance_amount, 0))} tone="warning" /><MetricCard label="Contractor bills" value={contractorBills.length} tone="primary" /></div><div className="mt-4 rounded-lg border border-dashed border-border p-4"><p className="text-sm font-semibold">Finance stays canonical in Finance</p><p className="mt-1 text-xs text-muted-foreground">This Site only summarizes Customer, vendor and contractor finance records.</p><Button className="mt-3" variant="outline" onClick={() => setActiveModule("financeDesk")}>Open Finance</Button></div></div>}
        </section>
      </div>

      <CustomerSitesDialog open={newSiteOpen} autoAddSite onClose={() => setNewSiteOpen(false)} />
      <CustomerSitesDialog editId={selectedSite.customer_id} open={editSiteOpen} expandSiteId={selectedSite.id} onClose={() => setEditSiteOpen(false)} />
      {newWorkOpen && <WorkRequiredCreateDialog open customerId={selectedSite.customer_id} site={selectedSite} initialAreaIds={newWorkAreaId ? [newWorkAreaId] : []} onOpenChange={(next) => { if (!next) { setNewWorkOpen(false); setNewWorkAreaId(null); } }} onCreated={(id) => setCaptureWorkId(id)} />}
      {captureWorkId && (() => { const work = workRequired.find((row) => row.id === captureWorkId); return work ? <CustomerWorkCaptureDialog workRequired={work} site={selectedSite} areas={areas} onClose={() => setCaptureWorkId(null)} /> : null; })()}

      {bidScopeId && <Modal title="Invite contractor bid" onClose={() => setBidScopeId(null)}><div className="space-y-3"><Field label="Contractor *"><select value={bidContractorId} onChange={(event) => setBidContractorId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select contractor</option>{db.master.contractors.map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.name}{contractor.trade ? ` · ${contractor.trade}` : ""}</option>)}</select></Field><Field label="Quote amount (INR) *"><Input inputMode="decimal" value={bidQuoteAmount} onChange={(event) => setBidQuoteAmount(event.target.value)} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Estimated days"><Input inputMode="numeric" value={bidEstimatedDays} onChange={(event) => setBidEstimatedDays(event.target.value)} /></Field><label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={bidWithMaterial} onChange={(event) => setBidWithMaterial(event.target.checked)} />With material</label></div><Field label="Scope notes"><Input value={bidScopeNotes} onChange={(event) => setBidScopeNotes(event.target.value)} /></Field><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setBidScopeId(null)}>Cancel</Button><Button onClick={saveBid}>Record bid</Button></div></div></Modal>}

      {directAwardScopeId && <Modal title="Direct Award Contractor" onClose={() => setDirectAwardScopeId(null)}><div className="space-y-3"><Field label="Contractor *"><select value={directAwardContractorId} onChange={(event) => setDirectAwardContractorId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select contractor</option>{db.master.contractors.map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.name}</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Award amount"><Input inputMode="decimal" value={directAwardAmount} onChange={(event) => setDirectAwardAmount(event.target.value)} /></Field><Field label="Estimated days"><Input inputMode="numeric" value={directAwardDays} onChange={(event) => setDirectAwardDays(event.target.value)} /></Field></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={directAwardWithMaterial} onChange={(event) => setDirectAwardWithMaterial(event.target.checked)} />With material</label><Field label="Reason *"><Textarea value={directAwardReason} onChange={(event) => setDirectAwardReason(event.target.value)} rows={3} /></Field><Field label="Note"><Textarea value={directAwardNote} onChange={(event) => setDirectAwardNote(event.target.value)} rows={2} /></Field><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDirectAwardScopeId(null)}>Cancel</Button><Button onClick={saveDirectAward}>Create Work Order</Button></div></div></Modal>}

      {vendorBidRfqId && (() => { const rfq = db.vendorRfqs.find((entry) => entry.id === vendorBidRfqId); const boq = rfq ? db.boqs.find((entry) => entry.id === rfq.boq_id) : undefined; const bidItems = (boq?.items || []).filter((item) => rfq?.item_ids.includes(item.id)); const total = bidItems.reduce((sum, item) => sum + item.quantity * (Number(vendorBidRates[item.id]) || 0), 0); return <Modal title="Record Article-wise Vendor Bid" onClose={() => setVendorBidRfqId(null)}><div className="space-y-3"><Field label="Vendor"><select value={vendorBidVendorId} onChange={(event) => setVendorBidVendorId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select vendor</option>{rfq?.vendor_ids.map((id) => db.master.vendors.find((vendor) => vendor.id === id)).filter(Boolean).map((vendor) => <option key={vendor!.id} value={vendor!.id}>{vendor!.name}</option>)}</select></Field><div className="rounded-md border border-border">{bidItems.map((item) => <div key={item.id} className="grid grid-cols-[1fr_92px_92px] items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-0"><span className="truncate font-medium">{item.title} · {item.quantity} {item.unit_name || ""}</span><Input inputMode="decimal" value={vendorBidRates[item.id] || ""} onChange={(event) => setVendorBidRates((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Rate" className="h-8" /><span className="text-right font-mono">{formatINRShort(item.quantity * (Number(vendorBidRates[item.id]) || 0))}</span></div>)}</div><div className="grid grid-cols-2 gap-3"><Field label="Delivery days"><Input inputMode="numeric" value={vendorBidDeliveryDays} onChange={(event) => setVendorBidDeliveryDays(event.target.value)} /></Field><div className="rounded-md bg-muted/40 px-3 py-2"><p className="text-[10px] uppercase text-muted-foreground">Bid total</p><p className="font-mono font-bold">{formatINRShort(total)}</p></div></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setVendorBidRfqId(null)}>Cancel</Button><Button onClick={saveVendorBid}>Record bid</Button></div></div></Modal>; })()}
    </div>
  );
}

function WorkRow({ work, areas, measured, existingVisit, existingQuotation, onCapture, onMeasure, onOpenMeasurement, onQuotation, onOpenQuotation }: {
  work: any;
  areas: any[];
  measured: boolean;
  existingVisit?: any;
  existingQuotation?: any;
  onCapture: () => void;
  onMeasure: () => void;
  onOpenMeasurement: () => void;
  onQuotation: () => void;
  onOpenQuotation: (id: string) => void;
}) {
  const db = useRDashStore((state) => state.db);
  return <div className="rounded-md border border-border bg-background p-2.5"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-semibold">{workRequiredDisplayTitle(db.master.workSubcategories, work)}</p><p className="mt-1 text-[10px] text-muted-foreground">{work.area_ids.map((id: string) => areas.find((area) => area.id === id)?.name).filter(Boolean).join(", ") || "Area pending"}</p></div><StatusBadge label={work.status} className={workStatusStyle[work.status] || "bg-muted text-muted-foreground border-border"} /></div><div className="mt-2 flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" onClick={onCapture}>Capture detailed area</Button><Button size="sm" variant="outline" onClick={() => existingQuotation ? onOpenQuotation(existingQuotation.id) : measured ? onQuotation() : existingVisit ? onOpenMeasurement() : onMeasure()}>{existingQuotation ? "Open quotation" : measured ? "Prepare quotation" : existingVisit ? "Open measurement visit" : "Schedule measurement"}</Button></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-bold">{title}</h2><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>{children}</div></div>;
}
