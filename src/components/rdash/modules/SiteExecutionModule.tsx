"use client";
import * as React from "react";
import { Building2, CheckCircle2, ClipboardList, FileText, Gavel, MapPin, PackageCheck, Plus, ReceiptText, Ruler, ShoppingCart, Users, Wrench, Zap, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SiteFormDialog } from "@/components/rdash/SiteFormDialog";
import { WorkRequiredCreateDialog } from "@/components/rdash/WorkRequiredCreateDialog";
import { useRDashStore } from "@/lib/rdash/store";
import { formatINR, formatINRShort } from "@/lib/rdash/format";
import { EmptyState, MetricCard, SectionHeader, StatusBadge } from "../primitives";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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
function isTabId(value?: string): value is TabId {
    return !!value && TABS.some((tab) => tab.id === value);
}
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
function titleFromType(type: string) {
    return type.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
export function SiteExecutionModule({ initialTab }: {
    initialTab?: string;
}) {
    const db = useRDashStore((state) => state.db);
    const addArea = useRDashStore((state) => state.addArea);
    const addQuotation = useRDashStore((state) => state.addQuotation);
    const updateQuotation = useRDashStore((state) => state.updateQuotation);
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
    const [selectedSiteId, setSelectedSiteId] = React.useState<string>(() => activeSites[0]?.id || "");
    const [tab, setTab] = React.useState<TabId>(() => isTabId(initialTab) ? initialTab : "overview");
    const [newSiteOpen, setNewSiteOpen] = React.useState(false);
    const [editSiteOpen, setEditSiteOpen] = React.useState(false);
    const [newAreaOpen, setNewAreaOpen] = React.useState(false);
    const [newWorkOpen, setNewWorkOpen] = React.useState(false);
    const [newWorkAreaId, setNewWorkAreaId] = React.useState<string | null>(null);
    const [vendorBidRfqId, setVendorBidRfqId] = React.useState<string | null>(null);
    const [vendorBidVendorId, setVendorBidVendorId] = React.useState("");
    const [vendorBidRates, setVendorBidRates] = React.useState<Record<string, string>>({});
    const [vendorBidDeliveryDays, setVendorBidDeliveryDays] = React.useState("");
    const [areaName, setAreaName] = React.useState("");
    const [areaType, setAreaType] = React.useState("bedroom");
    // CV-1: Bid entry dialog state — replaces the silent placeholder bid (quote_amount: 0)
    const [bidScopeId, setBidScopeId] = React.useState<string | null>(null);
    const [bidContractorId, setBidContractorId] = React.useState("");
    const [bidQuoteAmount, setBidQuoteAmount] = React.useState("");
    const [bidEstimatedDays, setBidEstimatedDays] = React.useState("7");
    const [bidWithMaterial, setBidWithMaterial] = React.useState(false);
    const [bidScopeNotes, setBidScopeNotes] = React.useState("");
    // Direct award contractor dialog state — audited exception path that skips formal bidding.
    const [directAwardScopeId, setDirectAwardScopeId] = React.useState<string | null>(null);
    const [directAwardContractorId, setDirectAwardContractorId] = React.useState("");
    const [directAwardAmount, setDirectAwardAmount] = React.useState("");
    const [directAwardDays, setDirectAwardDays] = React.useState("7");
    const [directAwardWithMaterial, setDirectAwardWithMaterial] = React.useState(false);
    const [directAwardReason, setDirectAwardReason] = React.useState("");
    const [directAwardNote, setDirectAwardNote] = React.useState("");
    React.useEffect(() => {
        if (!selectedSiteId || !activeSites.some((site) => site.id === selectedSiteId))
            setSelectedSiteId(activeSites[0]?.id || "");
    }, [activeSites, selectedSiteId]);
    React.useEffect(() => {
        if (isTabId(initialTab))
            setTab(initialTab);
    }, [initialTab]);
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
    const customerPayments = db.payments.filter((payment) => payment.site_id === selectedSiteId);
    const customerReceipts = db.customerReceipts.filter((receipt) => receipt.site_id === selectedSiteId);
    const customerInvoices = db.invoices.filter((invoice) => invoice.site_id === selectedSiteId && invoice.status !== "cancelled");
    const contractorBills = db.contractorBills.filter((bill) => workOrders.some((workOrder) => workOrder.id === bill.work_order_id));
    const bids = db.contractorBids.filter((bid) => bid.site_id === selectedSiteId);
    const scopeMeta = (work: (typeof workRequired)[number]) => {
        const category = db.master.workCategories.find((row) => row.id === work.work_category_id);
        const subcategory = db.master.workSubcategories.find((row) => row.id === work.work_subcategory_id);
        return {
            categoryName: category?.name || work.title,
            subcategoryName: subcategory?.name,
            label: [category?.name || work.title, subcategory?.name].filter(Boolean).join(" · "),
        };
    };
    const activeQuotationForWork = (workId: string) => quotations.find((quotation) =>
        quotation.status !== "cancelled" &&
        quotation.coverage.some((coverage) => coverage.work_required_id === workId)
    );
    const activeMeasurementVisitForWork = (workId: string) => db.visits.find((visit) =>
        visit.visit_type === "measurement" &&
        visit.site_id === selectedSiteId &&
        visit.work_required_id === workId &&
        !visit.report_filed &&
        !["cancelled", "completed", "missed"].includes(visit.status)
    );
    const hasVerifiedMeasurement = (workId: string, areaId?: string) => db.measurementRevisions.some((revision) =>
        revision.site_id === selectedSiteId &&
        revision.work_required_id === workId &&
        (!areaId || revision.area_id === areaId) &&
        revision.status === "verified"
    );
    const createArea = () => {
        if (!selectedSite || !areaName.trim())
            return;
        addArea({ site_id: selectedSite.id, name: areaName.trim(), area_type: areaType as never, stage: "unmeasured" });
        setAreaName("");
        setNewAreaOpen(false);
    };
    const openWorkForArea = (areaId: string) => {
        setNewWorkAreaId(areaId);
        setNewWorkOpen(true);
    };
    const scheduleMeasurement = (workId: string) => {
        if (!selectedSite)
            return;
        const work = workRequired.find((row) => row.id === workId);
        if (!work) {
            toast.error("Select an Area and define its Work Required before scheduling measurement.");
            return;
        }
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
    const createQuotationForWork = (workId: string) => {
        const work = db.workRequired.find((row) => row.id === workId);
        if (!selectedSite || !work)
            return;
        const existingQuotation = activeQuotationForWork(work.id);
        if (existingQuotation) {
            toast.info(`${existingQuotation.quotation_no} already covers this scope.`);
            openDetail("quotation", existingQuotation.id);
            return existingQuotation.id;
        }
        const verifiedRevisions = db.measurementRevisions.filter((revision) =>
            revision.site_id === selectedSite.id &&
            revision.work_required_id === work.id &&
            work.area_ids.includes(revision.area_id) &&
            revision.status === "verified"
        );
        const measuredAreaIds = new Set(verifiedRevisions.map((revision) => revision.area_id));
        const missingArea = work.area_ids.find((areaId) => !measuredAreaIds.has(areaId));
        if (missingArea) {
            toast.error("Complete a verified Measurement Visit for every covered Area before preparing a quotation.");
            scheduleMeasurement(work.id);
            return;
        }
        const id = addQuotation({
            customer_id: selectedSite.customer_id,
            site_id: selectedSite.id,
            title: `${selectedSite.name} · ${scopeMeta(work).label}`,
            status: "draft",
            coverage: [{
                    id: `coverage-${Date.now().toString(36)}`,
                    work_required_id: work.id,
                    area_ids: work.area_ids,
                    measurement_revision_ids: verifiedRevisions.map((revision) => revision.id),
                    coverage_label: scopeMeta(work).label,
                    status: "proposed",
                }],
        });
        openDetail("quotation", id);
        return id;
    };
    // CV-1: Open a real bid-entry dialog instead of silently creating a quote_amount: 0 placeholder.
    // The placeholder broke the entire contractor payment chain (award → RA bill → payment) because
    // contractor_award_amount became 0 and createContractorRABill threw on every positive amount.
    const inviteBid = (scopeId: string) => {
        if (!db.master.contractors.length) {
            toast.error("Add at least one contractor in Master Setup before inviting a bid.");
            return;
        }
        setBidScopeId(scopeId);
        setBidContractorId(db.master.contractors[0]?.id || "");
        setBidQuoteAmount("");
        setBidEstimatedDays("7");
        setBidWithMaterial(false);
        setBidScopeNotes("");
    };
    const cancelBidDialog = () => setBidScopeId(null);
    const saveBid = () => {
        if (!bidScopeId) return;
        if (!bidContractorId) {
            toast.error("Select a contractor for this bid.");
            return;
        }
        const quote = Number(bidQuoteAmount);
        if (!Number.isFinite(quote) || quote <= 0) {
            toast.error("Enter the contractor's actual quote amount (must be greater than 0). The bid cannot be awarded without it.");
            return;
        }
        const days = Number(bidEstimatedDays);
        const estimated_days = Number.isFinite(days) && days > 0 ? days : undefined;
        const id = addContractorBid({
            accepted_scope_id: bidScopeId,
            contractor_id: bidContractorId,
            quote_amount: quote,
            estimated_days,
            with_material: bidWithMaterial,
            evaluation_notes: bidScopeNotes.trim() || undefined,
        });
        if (!id) {
            toast.error("Bid could not be recorded. Ensure the scope and contractor are valid.");
            return;
        }
        toast.success(`Bid recorded for ${formatINRShort(quote)} — ready to award.`);
        setBidScopeId(null);
    };
    // Direct award contractor — opens the dialog for awarding without a formal bid round.
    const openDirectAward = (scopeId: string) => {
        if (!db.master.contractors.length) {
            toast.error("Add at least one contractor in Master Setup before direct-awarding.");
            return;
        }
        const scope = acceptedScopes.find((s) => s.id === scopeId);
        setDirectAwardScopeId(scopeId);
        setDirectAwardContractorId(db.master.contractors[0]?.id || "");
        setDirectAwardAmount(scope ? String(scope.accepted_value) : "");
        setDirectAwardDays("7");
        setDirectAwardWithMaterial(false);
        setDirectAwardReason("");
        setDirectAwardNote("");
    };
    const saveDirectAward = () => {
        if (!directAwardScopeId) return;
        if (!directAwardContractorId) {
            toast.error("Select a contractor for the direct award.");
            return;
        }
        if (!directAwardReason.trim()) {
            toast.error("A reason is required for a direct award (audit trail).");
            return;
        }
        const amount = Number(directAwardAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            toast.error("Enter a valid award amount.");
            return;
        }
        const days = Number(directAwardDays);
        const estimated_days = Number.isFinite(days) && days > 0 ? days : undefined;
        try {
            const woId = directAwardContractor({
                accepted_scope_id: directAwardScopeId,
                contractor_id: directAwardContractorId,
                award_amount: amount,
                with_material: directAwardWithMaterial,
                estimated_days,
                award_reason: directAwardReason.trim(),
                note: directAwardNote.trim() || undefined,
            });
            if (woId) {
                toast.success(`Direct-award Work Order created — reason recorded in audit log.`);
                setDirectAwardScopeId(null);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Direct award failed.");
        }
    };
    const issueVendorRFQ = (workOrderId: string) => {
        const id = createVendorRFQ(workOrderId);
        if (!id) {
            toast.error("Approve the BOQ first and confirm this is company-supplied material before issuing a vendor RFQ");
            return;
        }
        toast.success("Vendor RFQ issued for the approved BOQ lines");
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
        if (!vendorBidRfqId || !vendorBidVendorId) {
            toast.error("Select a vendor for this RFQ");
            return;
        }
        const rfq = db.vendorRfqs.find((entry) => entry.id === vendorBidRfqId);
        const boq = rfq ? db.boqs.find((entry) => entry.id === rfq.boq_id) : undefined;
        if (!rfq || !boq) {
            toast.error("The RFQ or its approved BOQ is unavailable");
            return;
        }
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
        if (!lines.length || lines.some((line) => !Number.isFinite(line.rate) || line.rate <= 0)) {
            toast.error("Enter an actual vendor rate for every requested BOQ article");
            return;
        }
        const days = vendorBidDeliveryDays.trim() ? Number(vendorBidDeliveryDays) : undefined;
        const id = addVendorBid({
            rfq_id: vendorBidRfqId,
            vendor_id: vendorBidVendorId,
            lines,
            delivery_days: days && Number.isFinite(days) ? days : undefined,
        });
        if (!id) {
            toast.error("Vendor bid could not be recorded");
            return;
        }
        toast.success("Vendor bid recorded for comparison");
        setVendorBidRfqId(null);
    };
    const awardVendorBid = (bidId: string) => {
        selectVendorBid(bidId);
        toast.success("Vendor selected. Create the procurement order when ready.");
    };
    const createProcurementOrder = (bidId: string) => {
        const poId = createPOFromVendorBid(bidId);
        if (!poId) {
            toast.error("Procurement order could not be created from this vendor selection");
            return;
        }
        toast.success("Procurement order created from the selected vendor bid");
        setActiveModule("procurementInventory");
    };
    if (!selectedSite) {
        return (<EmptyState icon={<Building2 className="h-6 w-6"/>} title="Create the first site" description="A site belongs to a customer and becomes the operating context for areas, work, quotations, contractor bidding, BOQ, procurement and finance." action={<Button onClick={() => setNewSiteOpen(true)}><Plus className="mr-1.5 h-4 w-4"/> Add Site</Button>}/>);
    }
    return (<div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold">Customer Sites</p>
              <p className="text-xs text-muted-foreground">Independent apartment, office and commercial contexts</p>
            </div>
            <Button size="icon" variant="outline" onClick={() => setNewSiteOpen(true)} aria-label="Add site"><Plus className="h-4 w-4"/></Button>
          </div>
          <div className="space-y-2">
            {activeSites.map((site) => {
            const customer = db.customers.find((customer) => customer.id === site.customer_id);
            return (<button key={site.id} type="button" onClick={() => setSelectedSiteId(site.id)} className={cn("w-full rounded-lg border p-3 text-left transition-colors", selectedSiteId === site.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-semibold leading-snug line-clamp-2" title={site.name}>{site.name}</p>
                    <StatusBadge label={site.stage} className={cn("shrink-0", siteStageStyle[site.stage])}/>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{customer?.name || "Unknown customer"} · {titleFromType(site.site_type)}</p>
                  {site.locality && <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3"/>{site.locality}</p>}
                </button>);
        })}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{selectedCustomer?.name || "Customer"} · {titleFromType(selectedSite.site_type)}</p>
                <h1 className="mt-1 text-xl font-bold">{selectedSite.name}</h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{selectedSite.address || selectedSite.notes || "Add site address, areas and measurements before quoting."}</p>
              </div>
              <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => setEditSiteOpen(true)}>Edit site profile</Button><StatusBadge label={selectedSite.stage} className={siteStageStyle[selectedSite.stage]}/></div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard label="Areas" value={areas.length} tone="primary"/>
              <MetricCard label="Work Required" value={workRequired.length} tone="primary"/>
              <MetricCard label="Quotes" value={quotations.length} tone="default"/>
              <MetricCard label="Bidding" value={acceptedScopes.filter((scope) => scope.status === "contractor_bidding").length} tone="warning"/>
              <MetricCard label="Work Orders" value={workOrders.length} tone="success"/>
            </div>
          </div>

          <div className="flex overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-card">
            {TABS.map((entry) => {
            const Icon = entry.icon;
            return <button key={entry.id} type="button" onClick={() => setTab(entry.id)} className={cn("flex shrink-0 min-h-[40px] items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold", tab === entry.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="h-3.5 w-3.5"/>{entry.label}</button>;
        })}
          </div>

          {tab === "overview" && (<div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,.75fr)]">
              <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
                <SectionHeader title="Site progression"/>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "1 · Site setup", detail: `${areas.length} Area${areas.length === 1 ? "" : "s"} defined`, ready: areas.length > 0 },
                    { label: "2 · Survey & scope", detail: `${workRequired.length} scoped item${workRequired.length === 1 ? "" : "s"}`, ready: workRequired.length > 0 && workRequired.every((work) => work.area_ids.every((areaId) => hasVerifiedMeasurement(work.id, areaId))) },
                    { label: "3 · Commercial", detail: `${quotations.length} quotation${quotations.length === 1 ? "" : "s"}`, ready: quotations.some((quotation) => quotation.status === "accepted") },
                    { label: "4 · Delivery", detail: `${workOrders.length} work order${workOrders.length === 1 ? "" : "s"}`, ready: workOrders.length > 0 },
                  ].map((phase) => <div key={phase.label} className={cn("rounded-lg border p-3", phase.ready ? "border-success/30 bg-success/[0.05]" : "border-border bg-muted/20")}><p className="text-xs font-bold">{phase.label}</p><p className="mt-1 text-[11px] text-muted-foreground">{phase.detail}</p></div>)}
                </div>
                <div className="mt-4 space-y-2">
                  {workRequired.length === 0 ? <EmptyState title={areas.length ? "Define work inside an Area" : "Start by defining the Site Areas"} description={areas.length ? "Open Areas & Scope and add the exact category and subcategory for an Area." : "Create the rooms or operational Areas before defining work, visits, measurements, or quotations."} action={<Button size="sm" onClick={() => setTab("areas")}><Plus className="mr-1 h-3.5 w-3.5"/>{areas.length ? "Open Areas & Scope" : "Add first Area"}</Button>}/> : workRequired.slice(0, 4).map((work) => {
                    const existingQuotation = activeQuotationForWork(work.id);
                    const existingVisit = activeMeasurementVisitForWork(work.id);
                    return <div key={work.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"><div><p className="text-sm font-semibold">{scopeMeta(work).label}</p><p className="text-xs text-muted-foreground">{work.area_ids.map((id) => areas.find((area) => area.id === id)?.name).filter(Boolean).join(", ") || "Area not selected"}</p></div><div className="flex items-center gap-2"><StatusBadge label={work.status} className={workStatusStyle[work.status] || ""}/><Button size="sm" variant="outline" onClick={() => existingQuotation ? openDetail("quotation", existingQuotation.id) : hasVerifiedMeasurement(work.id) ? createQuotationForWork(work.id) : existingVisit ? setActiveModule("siteMeasurement") : scheduleMeasurement(work.id)}>{existingQuotation ? "Open quotation" : hasVerifiedMeasurement(work.id) ? "Prepare quotation" : existingVisit ? "Open measurement visit" : "Schedule measurement"}</Button></div></div>;
                  })}
                </div>
              </div>
              <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
                <SectionHeader title="Immediate actions"/>
                <div className="mt-3 grid gap-2">
                  <Button variant="outline" className="justify-start" onClick={() => setNewAreaOpen(true)}><Ruler className="mr-2 h-4 w-4"/>Add area</Button>
                  <Button variant="outline" className="justify-start" onClick={() => setTab("areas")}><Wrench className="mr-2 h-4 w-4"/>Open areas & scope</Button>
                  <Button variant="outline" className="justify-start" onClick={() => setTab("quotations")}><FileText className="mr-2 h-4 w-4"/>Review quotations</Button>
                  <Button variant="outline" className="justify-start" onClick={() => openCreateDialog({ kind: "visit", customerId: selectedSite.customer_id, siteId: selectedSite.id, visitType: "measurement" })}><Users className="mr-2 h-4 w-4"/>Schedule measurement visit</Button>
                </div>
              </div>
            </div>)}

          {tab === "areas" && (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
              <SectionHeader title="Areas & Scope" count={areas.length} action={<Button size="sm" onClick={() => setNewAreaOpen(true)}><Plus className="mr-1 h-3.5 w-3.5"/>Add Area</Button>}/>
              {areas.length === 0 ? <div className="mt-3"><EmptyState title="No Areas defined" description="Create the first room or operational Area before adding work, scheduling measurement, or preparing a quotation." action={<Button size="sm" onClick={() => setNewAreaOpen(true)}><Plus className="mr-1 h-3.5 w-3.5"/>Add first Area</Button>}/></div> : <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {areas.map((area) => {
                  const areaWork = workRequired.filter((work) => work.area_ids.includes(area.id));
                  return <div key={area.id} className="rounded-xl border border-border bg-muted/10 p-3">
                    <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{area.name}</p><p className="text-xs text-muted-foreground">{titleFromType(area.area_type)} · {area.length && area.width ? `${area.length} × ${area.width} ${area.unit || "ft"}` : "Measurement pending"}</p></div><StatusBadge label={area.stage} className={area.stage === "measured" ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}/></div>
                    <div className="mt-3 rounded-lg border border-border bg-card p-2.5">
                      <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Work required · {areaWork.length}</p><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openWorkForArea(area.id)}><Plus className="mr-1 h-3 w-3"/>Add work</Button></div>
                      {areaWork.length ? <div className="mt-2 space-y-2">{areaWork.map((work) => {
                        const quote = activeQuotationForWork(work.id);
                        const measured = hasVerifiedMeasurement(work.id, area.id);
                        const existingVisit = activeMeasurementVisitForWork(work.id);
                        return <div key={work.id} className="rounded-md border border-border bg-background p-2.5"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-semibold">{scopeMeta(work).label}</p>{work.system_name && <p className="text-[11px] text-muted-foreground">{work.system_name}</p>}<p className="mt-1 text-[10px] text-muted-foreground">{measured ? "Verified measurement linked" : existingVisit ? `Measurement visit ${existingVisit.status.replaceAll("_", " ")}` : "Measurement visit required"}{work.area_ids.length > 1 ? ` · shared across ${work.area_ids.length} Areas` : ""}</p></div><StatusBadge label={work.status} className={workStatusStyle[work.status] || ""}/></div><div className="mt-2 flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" onClick={() => quote ? openDetail("quotation", quote.id) : measured ? createQuotationForWork(work.id) : existingVisit ? setActiveModule("siteMeasurement") : scheduleMeasurement(work.id)}>{quote ? "Open quotation" : measured ? "Prepare quotation" : existingVisit ? "Open measurement visit" : "Schedule measurement"}</Button></div></div>;
                      })}</div> : <p className="mt-2 rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">No work has been defined for this Area.</p>}
                    </div>
                  </div>;
                })}
              </div>}
            </div>)}

          {tab === "work" && (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
              <SectionHeader title="Scope Register" count={workRequired.length} action={<Button size="sm" onClick={() => setNewAreaOpen(true)}><Plus className="mr-1 h-3.5 w-3.5"/>Add Area</Button>}/>
              <p className="mt-2 text-xs text-muted-foreground">Scope is Area-first. Add work from its Area in Areas & Scope so category, subcategory, measurement and quotation remain unambiguous.</p>
              <div className="mt-3 space-y-3">
                {areas.map((area) => {
                  const areaWork = workRequired.filter((work) => work.area_ids.includes(area.id));
                  if (!areaWork.length) return null;
                  return <div key={area.id} className="rounded-lg border border-border p-3"><div className="mb-2 flex items-center justify-between"><div><p className="font-semibold">{area.name}</p><p className="text-xs text-muted-foreground">{titleFromType(area.area_type)}</p></div><Button size="sm" variant="outline" onClick={() => openWorkForArea(area.id)}><Plus className="mr-1 h-3 w-3"/>Add work</Button></div><div className="space-y-2">{areaWork.map((work) => {
                    const quote = activeQuotationForWork(work.id);
                    const measured = hasVerifiedMeasurement(work.id, area.id);
                    const existingVisit = activeMeasurementVisitForWork(work.id);
                    return <div key={work.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/20 p-2.5"><div><p className="text-sm font-semibold">{scopeMeta(work).label}</p><p className="text-[11px] text-muted-foreground">{work.system_name || work.specification || "Specification pending"}{work.area_ids.length > 1 ? ` · ${work.area_ids.length} Areas` : ""}</p></div><div className="flex flex-wrap items-center gap-2"><StatusBadge label={work.status} className={workStatusStyle[work.status] || ""}/><Button size="sm" variant="outline" onClick={() => quote ? openDetail("quotation", quote.id) : measured ? createQuotationForWork(work.id) : existingVisit ? setActiveModule("siteMeasurement") : scheduleMeasurement(work.id)}>{quote ? "Open quotation" : measured ? "Prepare quotation" : existingVisit ? "Open measurement visit" : "Schedule measurement"}</Button></div></div>;
                  })}</div></div>;
                })}
                {!areas.length && <EmptyState title="No Areas defined" description="Add an Area before defining scope."/>}
                {areas.length > 0 && !workRequired.length && <EmptyState title="No work required yet" description="Open an Area and add its exact category and subcategory." action={<Button size="sm" onClick={() => setTab("areas")}>Open Areas & Scope</Button>}/>} 
              </div>
            </div>)}

          {tab === "quotations" && (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
              <SectionHeader title="Customer quotations" count={quotations.length}/>
              <div className="mt-3 space-y-2">
                {quotations.map((quotation) => <div key={quotation.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{quotation.quotation_no} · {quotation.title}</p><p className="mt-1 text-xs text-muted-foreground">{quotation.coverage.map((coverage) => coverage.coverage_label).join(" · ") || "Coverage not selected"}</p><p className="mt-1 text-xs text-muted-foreground">{formatINRShort(quotation.total_amount)} · Rev {quotation.revision_no + 1}</p></div><div className="flex items-center gap-2"><StatusBadge label={quotation.status} className={quotation.status === "accepted" ? "bg-success/10 text-success border-success/20" : quotation.status === "sent" ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border"}/>{quotation.status === "draft" && <Button size="sm" variant="outline" onClick={() => updateQuotation(quotation.id, { status: "sent" })}>Mark sent</Button>}{["draft", "sent", "rejected", "expired", "accepted"].includes(quotation.status) && quotation.work_order_ids.length === 0 && <Button size="sm" onClick={() => openQuotationAcceptanceDialog(quotation.id)}>Accept scope</Button>}{quotation.status === "accepted" && <Button size="sm" variant="outline" onClick={() => setTab("bids")}>Open bidding</Button>}</div></div></div>)}
                {!quotations.length && <EmptyState title="No quotation for this site" description="Create a quotation only from a selected work requirement, so room and site coverage remains clear."/>}
              </div>
            </div>)}

          {tab === "bids" && (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
              <SectionHeader title="Contractor bidding" count={acceptedScopes.filter((scope) => scope.status === "contractor_bidding" || scope.status === "in_work_order").length}/>
              <div className="mt-3 space-y-3">
                {acceptedScopes.map((scope) => {
                const scopeBids = bids.filter((bid) => bid.accepted_scope_id === scope.id);
                return <div key={scope.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{scope.label}</p><p className="mt-1 text-xs text-muted-foreground">Accepted value {formatINRShort(scope.accepted_value)} · {scope.status.replaceAll("_", " ")}</p></div>{scope.status === "contractor_bidding" && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => inviteBid(scope.id)}><Plus className="mr-1 h-3.5 w-3.5"/>Invite bid</Button><Button size="sm" variant="outline" className="border-warning/40 text-warning hover:bg-warning/10" onClick={() => openDirectAward(scope.id)}><Zap className="mr-1 h-3.5 w-3.5"/>Direct Award</Button></div>}</div><div className="mt-3 space-y-2">{scopeBids.map((bid) => <div key={bid.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"><div><p className="text-sm font-semibold">{bid.contractor_name}</p><p className="text-xs text-muted-foreground">{bid.quote_amount ? formatINRShort(bid.quote_amount) : "Rate pending"} · {bid.estimated_days || "—"} days · {bid.with_material ? "With material" : "Labour only"}</p></div>{bid.status === "submitted" && scope.status === "contractor_bidding" ? <Button size="sm" onClick={() => selectContractorBid(bid.id)}>Award contractor</Button> : <StatusBadge label={bid.status} className={bid.status === "selected" ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}/>}</div>)}{!scopeBids.length && <p className="text-xs text-muted-foreground">No contractor bid yet. Invite an eligible contractor to start comparison, or use Direct Award for a trusted contractor.</p>}</div></div>;
            })}
                {!acceptedScopes.length && <EmptyState title="No accepted quotation scope" description="Accept a customer quotation first. Only accepted site work can enter contractor bidding."/>}
              </div>
            </div>)}

          {tab === "orders" && (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Awarded work orders" count={workOrders.length}/><div className="mt-3 space-y-2">{workOrders.map((workOrder) => <div key={workOrder.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{workOrder.work_order_no} · {workOrder.title}</p><p className="mt-1 text-xs text-muted-foreground">{workOrder.contractor_name || "Contractor pending"} · {workOrder.area_ids.map((id) => areas.find((area) => area.id === id)?.name).filter(Boolean).join(", ")} · Customer value {formatINRShort(workOrder.value)}{workOrder.contractor_award_amount != null ? ` · Contractor award ${formatINRShort(workOrder.contractor_award_amount)}` : ""}</p></div><div className="flex items-center gap-2"><StatusBadge label={workOrder.status} className={workOrder.status === "completed" ? "bg-success/10 text-success border-success/20" : "bg-primary/10 text-primary border-primary/20"}/>{workOrder.status === "scheduled" && <Button size="sm" variant="outline" onClick={() => updateJob(workOrder.id, { status: "in_progress" })}>Start work</Button>}{workOrder.status === "in_progress" && <Button size="sm" variant="outline" disabled={workOrder.progress < 100} title={workOrder.progress < 100 ? "Complete verified progress to 100% before closing" : "Close work order"} onClick={() => updateJob(workOrder.id, { status: "completed" })}>Complete</Button>}</div></div></div>)}{!workOrders.length && <EmptyState title="No work order yet" description="Award a contractor bid to create a work order. A customer acceptance alone does not create execution work."/>}</div></div>)}

          {tab === "boq" && (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Execution BOQ" count={boqs.length}/><div className="mt-3 space-y-2">{workOrders.map((workOrder) => { const boq = boqs.find((row) => row.work_order_id === workOrder.id); return <div key={workOrder.id} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{workOrder.work_order_no} · {workOrder.title}</p><p className="text-xs text-muted-foreground">{boq ? `${boq.items.length} article lines · ${formatINRShort(boq.total_amount)}` : "Material plan not created"}</p></div>{boq ? <StatusBadge label={boq.status} className="bg-primary/10 text-primary border-primary/20"/> : <Button size="sm" onClick={() => createBOQ(workOrder.id)}>Create BOQ</Button>}</div></div>; })}{!workOrders.length && <EmptyState title="BOQ starts after contractor award" description="The BOQ belongs to the awarded work order, not directly to a customer or a generic quote."/>}</div></div>)}

          {tab === "procurement" && (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
              <SectionHeader title="Vendor procurement"/>
              <div className="mt-3 grid gap-3 md:grid-cols-3"><MetricCard label="Vendor RFQs" value={rfqs.length} tone="primary"/><MetricCard label="Purchase Orders" value={pos.length} tone="warning"/><MetricCard label="GRNs" value={grns.length} tone="success"/></div>
              <div className="mt-4 space-y-3">
                {workOrders.map((workOrder) => {
                const boq = boqs.find((entry) => entry.work_order_id === workOrder.id);
                const rfq = rfqs.find((entry) => entry.work_order_id === workOrder.id);
                const rfqBids = rfq ? db.vendorBids.filter((bid) => bid.rfq_id === rfq.id) : [];
                const selectedVendorBid = rfqBids.find((bid) => bid.status === "selected");
                const procurementOrder = rfq ? pos.find((po) => po.rfq_id === rfq.id) : undefined;
                return <div key={workOrder.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><p className="font-semibold">{workOrder.work_order_no} · {workOrder.title}</p><p className="mt-1 text-xs text-muted-foreground">{workOrder.material_responsibility === "contractor" || workOrder.with_material ? "Contractor supplies material — vendor procurement not required" : workOrder.material_responsibility === "customer" ? "Customer supplies material — vendor procurement not required" : boq ? `${boq.items.filter((item) => (item.supply_responsibility || "company") === "company").length} company-procured BOQ article line(s) · ${boq.status}` : "Create and approve BOQ before vendor RFQ"}</p></div>
                      {(workOrder.material_responsibility || (workOrder.with_material ? "contractor" : "company")) === "company" && !rfq && <Button size="sm" disabled={!boq || boq.status !== "approved"} onClick={() => issueVendorRFQ(workOrder.id)}><ShoppingCart className="mr-1.5 h-3.5 w-3.5"/>Issue vendor RFQ</Button>}
                    </div>
                    {rfq && <div className="mt-3 rounded-md bg-muted/40 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{rfq.rfq_no}</p><p className="text-xs text-muted-foreground">{rfq.vendor_ids.length} invited vendor(s) · {rfq.status.replaceAll("_", " ")}</p></div>{rfq.status !== "awarded" && <Button size="sm" variant="outline" onClick={() => openVendorBid(rfq.id)}><Plus className="mr-1 h-3.5 w-3.5"/>Record vendor bid</Button>}</div><div className="mt-3 space-y-2">{rfqBids.map((bid) => <div key={bid.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"><div><p className="text-sm font-semibold">{bid.vendor_name}</p><p className="text-xs text-muted-foreground">{formatINRShort(bid.quoted_amount)} · {bid.delivery_days || "—"} delivery days</p></div>{bid.status === "received" && rfq.status !== "awarded" ? <Button size="sm" onClick={() => awardVendorBid(bid.id)}>Select vendor</Button> : bid.status === "selected" ? <div className="flex items-center gap-2"><StatusBadge label="selected" className="bg-success/10 text-success border-success/20"/>{!procurementOrder && <Button size="sm" variant="outline" onClick={() => createProcurementOrder(bid.id)}>Create PO</Button>}{procurementOrder && <StatusBadge label={procurementOrder.status} className="bg-primary/10 text-primary border-primary/20"/>}</div> : <StatusBadge label={bid.status} className="bg-muted text-muted-foreground border-border"/>}</div>)}{!rfqBids.length && <p className="text-xs text-muted-foreground">No vendor response recorded yet.</p>}</div></div>}
                  </div>;
            })}
                {!workOrders.length && <EmptyState title="Procurement starts from an awarded work order" description="Award the contractor, create the work-order BOQ, approve it, then issue vendor RFQs for company-supplied articles."/>}
              </div>
            </div>)}

          {tab === "finance" && (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><SectionHeader title="Site finance"/><div className="mt-3 grid gap-3 md:grid-cols-3"><MetricCard label="Customer collections" value={formatINRShort(customerReceipts.reduce((sum, receipt) => sum + receipt.amount, 0))} tone="success"/><MetricCard label="Customer receivable" value={formatINRShort(customerInvoices.reduce((sum, invoice) => sum + invoice.balance_amount, 0))} tone="warning"/><MetricCard label="Contractor bills" value={contractorBills.length} tone="primary"/></div><div className="mt-4 rounded-lg border border-dashed border-border p-4"><p className="text-sm font-semibold">Separate finance paths</p><p className="mt-1 text-xs text-muted-foreground">Customer collections, vendor bills/payments and contractor bills/payments remain separate, while all are reported against this Site.</p><Button className="mt-3" variant="outline" onClick={() => setActiveModule("financeDesk")}>Open Finance</Button></div></div>)}
        </section>
      </div>

      <SiteFormDialog open={newSiteOpen} onClose={() => setNewSiteOpen(false)} onSaved={(id) => { setSelectedSiteId(id); setNewSiteOpen(false); }}/>
      <SiteFormDialog open={editSiteOpen} customerId={selectedSite.customer_id} siteId={selectedSite.id} onClose={() => setEditSiteOpen(false)} onSaved={() => setEditSiteOpen(false)}/>
      {newAreaOpen && <Modal title={`Add Area · ${selectedSite.name}`} onClose={() => setNewAreaOpen(false)}><div className="space-y-3"><Field label="Area name"><Input value={areaName} onChange={(event) => setAreaName(event.target.value)} placeholder="Master Bedroom"/></Field><Field label="Area type"><select value={areaType} onChange={(event) => setAreaType(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{["bedroom", "guest_room", "living_room", "kitchen", "bathroom", "balcony", "staircase", "rooftop", "office_cabin", "reception", "meeting_room", "pantry", "facade", "common_area", "other"].map((type) => <option key={type} value={type}>{titleFromType(type)}</option>)}</select></Field><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setNewAreaOpen(false)}>Cancel</Button><Button onClick={createArea}>Add Area</Button></div></div></Modal>}
      {vendorBidRfqId && (() => { const rfq = db.vendorRfqs.find((entry) => entry.id === vendorBidRfqId); const boq = rfq ? db.boqs.find((entry) => entry.id === rfq.boq_id) : undefined; const bidItems = (boq?.items || []).filter((item) => rfq?.item_ids.includes(item.id)); const total = bidItems.reduce((sum, item) => sum + item.quantity * (Number(vendorBidRates[item.id]) || 0), 0); return <Modal title="Record Article-wise Vendor Bid" onClose={() => setVendorBidRfqId(null)}><div className="space-y-3"><Field label="Vendor"><select value={vendorBidVendorId} onChange={(event) => setVendorBidVendorId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select vendor</option>{rfq?.vendor_ids.map((id) => db.master.vendors.find((vendor) => vendor.id === id)).filter(Boolean).map((vendor) => <option key={vendor!.id} value={vendor!.id}>{vendor!.name}</option>)}</select></Field><div className="rounded-md border border-border"><div className="grid grid-cols-[1fr_72px_92px_92px] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground"><span>BOQ article</span><span className="text-right">Qty</span><span className="text-right">Bid rate</span><span className="text-right">Amount</span></div>{bidItems.map((item) => <div key={item.id} className="grid grid-cols-[1fr_72px_92px_92px] items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-0"><span className="truncate font-medium">{item.title}</span><span className="text-right font-mono">{item.quantity} {item.unit_name || ""}</span><Input inputMode="decimal" value={vendorBidRates[item.id] || ""} onChange={(event) => setVendorBidRates((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="0" className="h-8 text-right font-mono"/><span className="text-right font-mono">{formatINRShort(item.quantity * (Number(vendorBidRates[item.id]) || 0))}</span></div>)}</div><div className="grid grid-cols-2 gap-3"><Field label="Delivery days"><Input inputMode="numeric" value={vendorBidDeliveryDays} onChange={(event) => setVendorBidDeliveryDays(event.target.value)} placeholder="e.g. 3"/></Field><div className="rounded-md bg-muted/40 px-3 py-2"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Bid total</p><p className="font-mono text-sm font-bold">{formatINRShort(total)}</p></div></div><p className="text-[11px] text-muted-foreground">Each requested BOQ article needs the vendor's actual rate. No reference or fallback rate can create a project PO.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setVendorBidRfqId(null)}>Cancel</Button><Button onClick={saveVendorBid}>Record bid</Button></div></div></Modal>; })()}
      {newWorkOpen && selectedSite && <WorkRequiredCreateDialog open customerId={selectedSite.customer_id} site={selectedSite} initialAreaIds={newWorkAreaId ? [newWorkAreaId] : []} onOpenChange={(next) => { if (!next) {
            setNewWorkOpen(false);
            setNewWorkAreaId(null);
        } }}/>} 
      {bidScopeId && (() => { const scope = acceptedScopes.find((s) => s.id === bidScopeId); return <Modal title={`Invite contractor bid · ${scope?.label || "Scope"}`} onClose={cancelBidDialog}><div className="space-y-3"><Field label="Contractor *"><select value={bidContractorId} onChange={(event) => setBidContractorId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select contractor</option>{db.master.contractors.map((c) => <option key={c.id} value={c.id}>{c.name}{c.trade ? ` · ${c.trade}` : ""}</option>)}</select></Field><Field label="Quote amount (INR) *"><Input inputMode="decimal" value={bidQuoteAmount} onChange={(event) => setBidQuoteAmount(event.target.value)} placeholder="e.g. 45000"/></Field><p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">The contractor's actual quote is required to award the bid and create RA bills later. A zero/blank quote will permanently block the contractor payment chain.</p><div className="grid grid-cols-2 gap-3"><Field label="Estimated days"><Input inputMode="numeric" value={bidEstimatedDays} onChange={(event) => setBidEstimatedDays(event.target.value)} placeholder="e.g. 7"/></Field><label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={bidWithMaterial} onChange={(event) => setBidWithMaterial(event.target.checked)} className="h-4 w-4 rounded border-input"/>With material</label></div><Field label="Scope notes (optional)"><Input value={bidScopeNotes} onChange={(event) => setBidScopeNotes(event.target.value)} placeholder="Inclusions, exclusions, reference images…"/></Field><div className="flex justify-end gap-2"><Button variant="outline" onClick={cancelBidDialog}>Cancel</Button><Button onClick={saveBid}>Record bid</Button></div></div></Modal>; })()}

      {/* Direct Award Contractor Dialog — audited exception path that skips formal bidding */}
      {directAwardScopeId && (() => { const scope = acceptedScopes.find((s) => s.id === directAwardScopeId); return <Modal title={`Direct Award Contractor · ${scope?.label || "Scope"}`} onClose={() => setDirectAwardScopeId(null)}><div className="space-y-3"><div className="rounded-md border border-warning/40 bg-warning/[0.06] p-3"><p className="flex items-center gap-1.5 text-xs font-bold text-warning"><Zap className="h-3.5 w-3.5"/>Direct Award (no formal bid round)</p><p className="mt-1 text-[11px] text-muted-foreground">Award straight to a trusted contractor without running a formal bidding round. A reason is <strong>required</strong> so the exception is recorded in the audit log.</p></div><Field label="Contractor *"><select value={directAwardContractorId} onChange={(event) => setDirectAwardContractorId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select contractor</option>{db.master.contractors.map((c) => <option key={c.id} value={c.id}>{c.name}{c.trade ? ` · ${c.trade}` : ""}</option>)}</select></Field><div className="grid grid-cols-2 gap-3"><Field label="Award amount (INR) *"><Input inputMode="decimal" value={directAwardAmount} onChange={(event) => setDirectAwardAmount(event.target.value)} placeholder="e.g. 45000"/></Field><Field label="Estimated days"><Input inputMode="numeric" value={directAwardDays} onChange={(event) => setDirectAwardDays(event.target.value)} placeholder="e.g. 7"/></Field></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={directAwardWithMaterial} onChange={(event) => setDirectAwardWithMaterial(event.target.checked)} className="h-4 w-4 rounded border-input"/>With material (contractor supplies)</label><Field label="Reason (required for audit trail)"><Textarea value={directAwardReason} onChange={(event) => setDirectAwardReason(event.target.value)} placeholder="e.g. Trusted contractor with established track record on similar jobs; urgent start required; repeat award from prior successful job." rows={3}/></Field><Field label="Note (optional)"><Textarea value={directAwardNote} onChange={(event) => setDirectAwardNote(event.target.value)} placeholder="Any additional context for the work order thread." rows={2}/></Field><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDirectAwardScopeId(null)}>Cancel</Button><Button onClick={saveDirectAward} disabled={!directAwardReason.trim()} className="gap-1.5"><Zap className="h-3.5 w-3.5"/>Create direct-award Work Order</Button></div></div></Modal>; })()}
    </div>);
}
function Field({ label, children }: {
    label: string;
    children: React.ReactNode;
}) {
    return <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>;
}
function Modal({ title, onClose, children }: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-bold">{title}</h2><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>{children}</div></div>;
}
