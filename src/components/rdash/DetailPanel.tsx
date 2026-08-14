"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { useFavorites } from "./FavoritesBar";
import { FilePreview } from "./FilePreview";
import { EntityFilesCard } from "./EntityFilesCard";
import { attachedFilesForIds, assetPreview } from "@/lib/rdash/file-attachments";
import { computeJobPnL, vendorBalance } from "@/lib/rdash/store";
import { ThreadView, Field, StatusPill, LineItemTable } from "./ThreadPanel";
import { Avatar, StatusBadge } from "./primitives";
import { quotationStatusStyle, paymentStatusStyle, invoiceStatusStyle, jobStatusStyle, visitStatusStyle, poStatusStyle, grnStatusStyle, dispatchStatusStyle, vendorBillStatusStyle, commissionStatusStyle, followupStatusStyle, formatINR, formatINRShort, formatDate, titleCase, } from "@/lib/rdash/format";
import { toast } from "sonner";
import { notifyCompleted } from "@/lib/rdash/notify";
import { X, MessageSquare, History, FileText, CheckCircle2, XCircle, Send, Truck, Package, Wrench, ArrowRight, Phone, MapPin, Calendar, User, Building2, AlertCircle, Wallet, Receipt, HandCoins, Download, Plus, Trash2, Gavel, HardHat, Star, Check, ChevronLeft, ChevronRight, RefreshCw, Zap, Paperclip, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { areaDependencySummary } from "@/lib/rdash/business-rules";
import { MapView, type MapPoint } from "./MapView";
import { visitToMapPoints } from "./visitMap";
import { promptDialog } from "./PromptDialog";
import { CustomerPortfolioDrawerContent } from "./modules/CustomerDesk";
import { resolveRenderer } from "@/lib/rdash/modules";
import { resolveThreadRecordEntityType } from "@/lib/rdash/entity-context";
type Tab = "overview" | "thread";
export function DetailPanel() {
    const detail = useRDashStore((s) => s.detailPanel);
    const closeDetail = useRDashStore((s) => s.closeDetail);
    const db = useRDashStore((s) => s.db);
    const setContextDetailTab = useRDashStore((s) => s.setContextDetailTab);
    const [tab, setTab] = React.useState<Tab>("overview");
    React.useEffect(() => {
        setTab((detail.panelTab || "overview") as Tab);
    }, [detail.kind, detail.recordId, detail.panelTab]);
    const setPanelTab = React.useCallback((next: Tab) => {
        setTab(next);
        if (detail.fromModule === "context")
            setContextDetailTab(next);
    }, [detail.fromModule, setContextDetailTab]);
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape")
                closeDetail();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [closeDetail]);
    if (!detail.kind || !detail.recordId || !findRecord(detail.kind, detail.recordId, db))
        return null;
    return (<>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] animate-in fade-in duration-150" onClick={closeDetail}/>
      <aside aria-label="Record context panel" className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[640px] flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200">
        <PanelHeader tab={tab} setTab={setPanelTab}/>
        <div className="flex-1 overflow-y-auto rd-scroll">
          {tab === "overview" && <OverviewBody kind={detail.kind} id={detail.recordId}/>}
          {tab === "thread" && <ThreadBody kind={detail.kind} id={detail.recordId}/>}
        </div>
      </aside>
    </>);
}

function FavoriteStarButton() {
    const detail = useRDashStore((s) => s.detailPanel);
    const { isFavorite, toggleFavorite } = useFavorites();
    if (!detail.kind || !detail.recordId) return null;
    const fav = isFavorite(detail.recordId, detail.kind);
    const label = resolveTitle(detail.kind, detail.recordId, useRDashStore.getState().db);
    return (
        <button
            type="button"
            onClick={() => toggleFavorite({ id: detail.recordId!, kind: detail.kind, label: label || "Record" })}
            className={cn("rounded-md p-1.5 transition-colors", fav
                ? "text-warning hover:bg-warning/10"
                : "text-muted-foreground hover:bg-accent hover:text-foreground")}
            aria-label={fav ? "Remove from favorites" : "Add to favorites"}
            title={fav ? "Remove from favorites" : "Add to favorites"}
        >
            <Star className={cn("h-4 w-4", fav && "fill-current")} />
        </button>
    );
}

function PanelHeader({ tab, setTab }: {
    tab: Tab;
    setTab: (t: Tab) => void;
}) {
    const detail = useRDashStore((s) => s.detailPanel);
    const closeDetail = useRDashStore((s) => s.closeDetail);
    const db = useRDashStore((s) => s.db);
    const contextHistory = useRDashStore((s) => s.contextHistory);
    const contextHistoryIndex = useRDashStore((s) => s.contextHistoryIndex);
    const navigateContextHistory = useRDashStore((s) => s.navigateContextHistory);
    const isContextNavigation = detail.fromModule === "context" && contextHistoryIndex >= 0;
    const contextRoot = React.useMemo(() => {
        if (!isContextNavigation)
            return null;
        const root = contextHistory.find((entry) => entry.kind === "customer") || contextHistory[0];
        const current = contextHistory[contextHistoryIndex];
        if (!root?.customerId)
            return null;
        let sourceLabel: string | null = null;
        if (current?.sourceModule) {
            try {
                sourceLabel = resolveRenderer(current.sourceModule).label;
            }
            catch {
                sourceLabel = titleCase(current.sourceModule);
            }
        }
        return {
            customerId: root.customerId,
            label: resolveTitle("customer", root.customerId, db),
            step: contextHistoryIndex + 1,
            total: contextHistory.length,
            sourceLabel,
        };
    }, [isContextNavigation, contextHistory, contextHistoryIndex, db]);
    const title = React.useMemo(() => {
        if (!detail.kind || !detail.recordId)
            return "";
        return resolveTitle(detail.kind, detail.recordId, db);
    }, [detail, db]);
    const threadCount = React.useMemo(() => {
        if (!detail.kind || !detail.recordId)
            return 0;
        const rec = findRecord(detail.kind, detail.recordId, db);
        if (!rec?.thread_id)
            return 0;
        return db.threads.find((t) => t.id === rec.thread_id)?.messages.length || 0;
    }, [detail, db]);
    const kindIcon = React.useMemo(() => {
        switch (detail.kind) {
            case "quotation": return <FileText className="h-4 w-4"/>;
            case "workOrder": return <Building2 className="h-4 w-4"/>;
            case "po": return <Package className="h-4 w-4"/>;
            case "grn": return <Truck className="h-4 w-4"/>;
            case "dispatch": return <Wrench className="h-4 w-4"/>;
            case "payment": return <Wallet className="h-4 w-4"/>;
            case "invoice": return <Receipt className="h-4 w-4"/>;
            case "task": return <CheckCircle2 className="h-4 w-4"/>;
            case "visit": return <MapPin className="h-4 w-4"/>;
            case "customer": return <User className="h-4 w-4"/>;
            case "site": return <Building2 className="h-4 w-4"/>;
            case "area": return <MapPin className="h-4 w-4"/>;
            case "workRequired": return <Wrench className="h-4 w-4"/>;
            case "boq": return <FileText className="h-4 w-4"/>;
            case "vendorBill": return <Receipt className="h-4 w-4"/>;
            case "vendorPayment": return <Wallet className="h-4 w-4"/>;
            case "commission": return <HandCoins className="h-4 w-4"/>;
            case "blocked": return <AlertCircle className="h-4 w-4"/>;
            case "inventory": return <Package className="h-4 w-4"/>;
            case "vendor": return <Truck className="h-4 w-4"/>;
            case "vendorRate": return <Wallet className="h-4 w-4"/>;
            case "contractor": return <HardHat className="h-4 w-4"/>;
            case "contractorBill": return <Receipt className="h-4 w-4"/>;
            case "contractorPayment": return <Wallet className="h-4 w-4"/>;
            case "staff": return <User className="h-4 w-4"/>;
            case "audit": return <History className="h-4 w-4"/>;
            case "media": return <FileText className="h-4 w-4"/>;
            default: return <FileText className="h-4 w-4"/>;
        }
    }, [detail.kind]);
    const tabs: {
        id: Tab;
        label: string;
        icon: React.ReactNode;
        badge?: number;
    }[] = [
        { id: "overview", label: "Overview", icon: <FileText className="h-3.5 w-3.5"/> },
        { id: "thread", label: "Thread", icon: <MessageSquare className="h-3.5 w-3.5"/>, badge: threadCount },
    ];
    return (<div className="flex shrink-0 flex-col gap-2 border-b border-border bg-gradient-to-b from-card to-muted/30 px-4 pb-2 pt-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          {isContextNavigation && (<div className="mt-0.5 flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-background p-0.5" aria-label="Context navigation history">
              <button type="button" aria-label="Back in context" title="Back" disabled={contextHistoryIndex <= 0} onClick={() => navigateContextHistory(-1)} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35">
                <ChevronLeft className="h-4 w-4"/>
              </button>
              <button type="button" aria-label="Forward in context" title="Forward" disabled={contextHistoryIndex >= contextHistory.length - 1} onClick={() => navigateContextHistory(1)} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35">
                <ChevronRight className="h-4 w-4"/>
              </button>
            </div>)}
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{kindIcon}</span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {detail.kind === "workRequired" ? "Work Required" : detail.kind ? titleCase(detail.kind) : ""}
            </p>
            <h3 className="truncate text-sm font-bold text-foreground">{title}</h3>
            {contextRoot && (<p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">
              Customer context: <span className="text-foreground">{contextRoot.label}</span> · {contextRoot.step}/{contextRoot.total}
              {contextRoot.sourceLabel ? <> · From {contextRoot.sourceLabel}</> : null}
            </p>)}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {/* CRON-5: Favorite/pin button */}
          <FavoriteStarButton />
          <button type="button" onClick={closeDetail} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label="Close panel">
            <X className="h-4 w-4"/>
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto rd-scroll rd-scroll-fade pb-1">
        {tabs.map((t) => (<button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap", tab === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {t.icon}
            {t.label}
            {t.badge != null && t.badge > 0 && (<span className={cn("rounded-full px-1.5 text-[10px] font-bold", tab === t.id ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>{t.badge}</span>)}
          </button>))}
      </div>
    </div>);
}
function ThreadBody({ kind, id }: {
    kind: string;
    id: string;
}) {
    const db = useRDashStore((s) => s.db);
    const rec = findRecord(kind, id, db);
    // Universal Conversation Graph: every entity has a thread.
    // First check if the record has a thread_id directly.
    let threadId = rec?.thread_id;
    // If not, find the thread by record_type + record_id (for entities that
    // don't store thread_id on their record — customer, site, vendor, etc.).
    if (!threadId) {
        const threadKind = mapDetailKindToThreadKind(kind);
        if (threadKind) {
            const thread = db.threads.find((t: any) => t.record_type === threadKind && t.record_id === id);
            threadId = thread?.id;
        }
    }
    // Also check for a "generic" thread keyed by the entity (e.g. customer-conversation:<id>).
    if (!threadId) {
        const genericThread = db.threads.find((t: any) =>
            t.kind === "generic" && (t.record_id === id || t.record_id === `${kind}-conversation:${id}`));
        threadId = genericThread?.id;
    }
    if (!threadId) {
        return (<div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
        <MessageSquare className="h-8 w-8"/>
        <p className="text-sm">No thread yet for this record.</p>
        <p className="text-[10px]">Thread events will appear here automatically as actions occur.</p>
      </div>);
    }
    return <ThreadView threadId={threadId}/>;
}

/** Maps a DetailPanelKind to the corresponding ThreadKind for thread lookup. */
function mapDetailKindToThreadKind(kind: string): string | null {
    const map: Record<string, string> = {
        quotation: "quotation",
        workOrder: "workOrder",
        task: "task",
        followup: "followup",
        visit: "visit",
        payment: "payment",
        invoice: "invoice",
        po: "po",
        grn: "grn",
        dispatch: "dispatch",
        boq: "generic",
        vendorBill: "vendor_bill",
        vendorPayment: "vendor_bill",
        commission: "commission",
        blocked: "blocked",
        customer: "generic",
        site: "site",
        area: "generic",
        workRequired: "workRequired",
        inventory: "inventory",
        vendor: "generic",
        vendorRate: "generic",
        contractor: "generic",
        contractorBill: "generic",
        contractorPayment: "generic",
        staff: "generic",
        audit: "generic",
        media: "generic",
    };
    return map[kind] || null;
}
function OverviewBody({ kind, id }: {
    kind: string;
    id: string;
}) {
    const db = useRDashStore((s) => s.db);
    const rec = findRecord(kind, id, db);
    if (!rec) {
        return <div className="p-6 text-sm text-muted-foreground">Record not found.</div>;
    }
    switch (kind) {
        case "quotation":
            return <QuotationOverview q={rec as any}/>;
        case "workOrder":
            return <JobOverview j={rec as any}/>;
        case "po":
            return <POOverview po={rec as any}/>;
        case "grn":
            return <GRNOverview grn={rec as any}/>;
        case "dispatch":
            return <DispatchOverview d={rec as any}/>;
        case "payment":
            return <PaymentOverview p={rec as any}/>;
        case "invoice":
            return <InvoiceOverview invoice={rec as any}/>;
        case "task":
            return <TaskOverview t={rec as any}/>;
        case "visit":
            return <VisitOverview v={rec as any}/>;
        case "customer":
            return <CustomerPortfolioDrawerContent customerId={id}/>;
        case "site":
            return <SiteOverview site={rec as any}/>;
        case "area":
            return <AreaOverview area={rec as any}/>;
        case "workRequired":
            return <WorkRequiredOverview work={rec as any}/>;
        case "boq":
            return <BOQOverview b={rec as any}/>;
        case "vendorBill":
            return <VendorBillOverview b={rec as any}/>;
        case "vendorPayment":
            return <VendorPaymentEntityOverview payment={rec as any}/>;
        case "commission":
            return <CommissionOverview c={rec as any}/>;
        case "blocked":
            return <BlockedOverview b={rec as any}/>;
        case "followup":
            return <FollowupOverview f={rec as any}/>;
        case "inventory":
            return <InventoryOverview inv={rec as any}/>;
        case "vendor":
            return <VendorEntityOverview vendor={rec as any}/>;
        case "vendorRate":
            return <VendorRateEntityOverview rate={rec as any}/>;
        case "contractor":
            return <ContractorEntityOverview contractor={rec as any}/>;
        case "contractorBill":
            return <ContractorBillEntityOverview bill={rec as any}/>;
        case "contractorPayment":
            return <ContractorPaymentEntityOverview payment={rec as any}/>;
        case "staff":
            return <StaffEntityOverview staff={rec as any}/>;
        case "audit":
            return <AuditEntityOverview event={rec as any}/>;
        case "media":
            return <MediaEntityOverview file={rec as any}/>;
        default:
            return <div className="p-6 text-sm text-muted-foreground">No overview for {kind}.</div>;
    }
}
function findRecord(kind: string, id: string, db: any): any {
    switch (kind) {
        case "quotation": return db.quotations.find((x: any) => x.id === id);
        case "workOrder": return db.workOrders.find((x: any) => x.id === id);
        case "po": return db.purchaseOrders.find((x: any) => x.id === id);
        case "grn": return db.grns.find((x: any) => x.id === id);
        case "dispatch": return db.dispatches.find((x: any) => x.id === id);
        case "payment": return db.payments.find((x: any) => x.id === id);
        case "invoice": return db.invoices.find((x: any) => x.id === id);
        case "task": return db.tasks.find((x: any) => x.id === id);
        case "followup": return db.followups.find((x: any) => x.id === id);
        case "visit": return db.visits.find((x: any) => x.id === id);
        case "customer": return db.customers.find((x: any) => x.id === id);
        case "site": return db.sites.find((x: any) => x.id === id);
        case "area": return db.areas.find((x: any) => x.id === id);
        case "workRequired": return db.workRequired.find((x: any) => x.id === id);
        case "boq": return db.boqs.find((x: any) => x.id === id);
        case "vendorBill": return db.vendorBills.find((x: any) => x.id === id);
        case "vendorPayment": return db.vendorPayments.find((x: any) => x.id === id);
        case "commission": return db.commissions.find((x: any) => x.id === id);
        case "blocked": return db.blocked.find((x: any) => x.id === id);
        case "inventory": return db.inventory.find((x: any) => x.id === id);
        case "vendor": return db.master.vendors.find((x: any) => x.id === id);
        case "vendorRate": return db.master.vendorRates.find((x: any) => x.id === id);
        case "contractor": return db.master.contractors.find((x: any) => x.id === id);
        case "contractorBill": return db.contractorBills.find((x: any) => x.id === id);
        case "contractorPayment": return db.contractorPayments.find((x: any) => x.id === id);
        case "staff": return db.master.staff.find((x: any) => x.id === id);
        case "audit": return db.auditLog.find((x: any) => x.id === id);
        case "media": return db.master.fileAssets.find((x: any) => x.id === id);
        default: return null;
    }
}
function resolveTitle(kind: string, id: string, db: any): string {
    const r = findRecord(kind, id, db);
    if (!r)
        return titleCase(kind);
    switch (kind) {
        case "quotation": return `${r.quotation_no} · ${r.title}`;
        case "workOrder": return `${r.work_order_no} · ${r.title}`;
        case "po": return `${r.po_no} · ${r.vendor_name}`;
        case "grn": return `${r.grn_no} · ${r.vendor_name}`;
        case "dispatch": return `${r.dispatch_no} · ${(r.customer_name || "Customer")}`;
        case "payment": return `${formatINR(r.amount)} · ${(r.customer_name || "Customer")}`;
        case "invoice": return `${r.invoice_no} - ${(r.customer_name || "Customer")}`;
        case "task": return r.title;
        case "visit": return `${titleCase(r.visit_type)} · ${r.location_name}`;
        case "customer": return r.name;
        case "site": return r.name;
        case "area": {
            const site = db.sites.find((x: any) => x.id === r.site_id);
            return `${site?.name || "Site"} · ${r.name}`;
        }
        case "workRequired": return r.title;
        case "boq": return `BOQ · ${r.title}`;
        case "vendorBill": return `${r.bill_no} · ${r.vendor_name}`;
        case "vendorPayment": return `${r.payment_no || "Vendor payment"} · ${r.vendor_name || "Vendor"}`;
        case "commission": return `${r.commission_no} · ${r.source_partner_name}`;
        case "blocked": return r.title;
        case "inventory": return `${r.article_name || "Inventory"} · ${r.location_name || "Stock"}`;
        case "vendor": return r.name;
        case "vendorRate": return `${r.article_name || "Vendor rate"} · ${formatINR(r.rate || 0)}`;
        case "contractor": return r.name;
        case "contractorBill": return `${r.bill_no || "Contractor bill"} · ${r.contractor_name || "Contractor"}`;
        case "contractorPayment": return `${r.payment_no || "Contractor payment"} · ${r.contractor_name || "Contractor"}`;
        case "staff": return r.name;
        case "audit": return `${titleCase(r.kind || "event")} · ${r.entity_label || r.entity_type || "Audit"}`;
        case "media": return r.file_name;
        default: return titleCase(kind);
    }
}

function entityTypeToPanelKind(entityType?: string): any {
    const normalized = (entityType || "").replaceAll("-", "_");
    const map: Record<string, string> = {
        customer: "customer",
        site: "site",
        room: "area",
        area: "area",
        workRequired: "workRequired",
        work_required: "workRequired",
        quotation: "quotation",
        workOrder: "workOrder",
        work_order: "workOrder",
        boq: "boq",
        purchase_order: "po",
        po: "po",
        grn: "grn",
        dispatch: "dispatch",
        inventory: "inventory",
        vendor_bill: "vendorBill",
        vendorBill: "vendorBill",
        vendor_payment: "vendorPayment",
        vendorPayment: "vendorPayment",
        contractor_bill: "contractorBill",
        contractor_payment: "contractorPayment",
        payment: "payment",
        invoice: "invoice",
        task: "task",
        followup: "followup",
        visit: "visit",
        commission: "commission",
        blocked: "blocked",
        vendor: "vendor",
        vendor_rate: "vendorRate",
        vendorRate: "vendorRate",
        contractor: "contractor",
        staff: "staff",
        media: "media",
        file_asset: "media",
        audit: "audit",
    };
    return map[entityType || ""] || map[normalized];
}
type AttachmentOwnerPanelTarget = { kind: Exclude<import("@/lib/rdash/store/ui-types").DetailPanelKind, null>; id: string };

function attachmentOwnerPanelTarget(db: any, entityType?: string, entityId?: string): AttachmentOwnerPanelTarget | undefined {
    if (!entityType || !entityId) return undefined;
    const direct = entityTypeToPanelKind(entityType);
    if (direct && findRecord(direct, entityId, db)) return { kind: direct, id: entityId };
    const normalized = entityType.replaceAll("-", "_");
    switch (normalized) {
        case "measurement_revision": {
            const row = db.measurementRevisions.find((item: any) => item.id === entityId);
            return row?.area_id ? { kind: "area", id: row.area_id } : undefined;
        }
        case "quotation_item": {
            const quotation = db.quotations.find((row: any) => row.scope_lines?.some((item: any) => item.id === entityId));
            return quotation ? { kind: "quotation", id: quotation.id } : undefined;
        }
        case "accepted_scope": {
            const scope = db.acceptedScopes.find((row: any) => row.id === entityId);
            return scope?.quotation_id ? { kind: "quotation", id: scope.quotation_id } : undefined;
        }
        case "variation_request": {
            const variation = db.variationRequests.find((row: any) => row.id === entityId);
            return variation?.work_order_id ? { kind: "workOrder", id: variation.work_order_id } : undefined;
        }
        case "vendor_rfq": {
            const rfq = db.vendorRfqs.find((row: any) => row.id === entityId);
            return rfq?.work_order_id ? { kind: "workOrder", id: rfq.work_order_id } : undefined;
        }
        case "vendor_bid": {
            const bid = db.vendorBids.find((row: any) => row.id === entityId);
            const rfq = bid ? db.vendorRfqs.find((row: any) => row.id === bid.rfq_id) : undefined;
            return rfq?.work_order_id ? { kind: "workOrder", id: rfq.work_order_id } : undefined;
        }
        case "stock_movement": {
            const movement = db.stockMovements.find((row: any) => row.id === entityId);
            return movement?.inventory_id ? { kind: "inventory", id: movement.inventory_id } : undefined;
        }
        case "customer_receipt": {
            const receipt = db.customerReceipts.find((row: any) => row.id === entityId);
            return receipt?.invoice_id ? { kind: "invoice", id: receipt.invoice_id } : undefined;
        }
        case "contractor_bid": {
            const bid = db.contractorBids.find((row: any) => row.id === entityId);
            if (bid?.work_order_id) return { kind: "workOrder", id: bid.work_order_id };
            return bid?.contractor_id ? { kind: "contractor", id: bid.contractor_id } : undefined;
        }
        case "contractor_settlement": {
            const settlement = db.contractorSettlements.find((row: any) => row.id === entityId);
            return settlement?.work_order_id ? { kind: "workOrder", id: settlement.work_order_id } : undefined;
        }
        case "drawing": {
            const drawing = db.drawings.find((row: any) => row.id === entityId);
            if (drawing?.work_order_id) return { kind: "workOrder", id: drawing.work_order_id };
            return drawing?.site_id ? { kind: "site", id: drawing.site_id } : undefined;
        }
        case "execution_log": {
            const log = db.executionLogs.find((row: any) => row.id === entityId);
            return log?.work_order_id ? { kind: "workOrder", id: log.work_order_id } : undefined;
        }
        case "boq_item": {
            const boq = db.boqs.find((row: any) => row.items?.some((item: any) => item.id === entityId));
            return boq ? { kind: "boq", id: boq.id } : undefined;
        }
        case "communication": {
            const send = db.commSends.find((row: any) => row.id === entityId);
            if (send?.quotation_id) return { kind: "quotation", id: send.quotation_id };
            if (send?.work_order_id) return { kind: "workOrder", id: send.work_order_id };
            return send?.customer_id ? { kind: "customer", id: send.customer_id } : undefined;
        }
        case "thread_message": {
            const thread = db.threads.find((row: any) => row.messages?.some((message: any) => message.id === entityId));
            if (!thread) return undefined;
            const ownerType = resolveThreadRecordEntityType(db, thread.record_type, thread.record_id);
            return ownerType ? attachmentOwnerPanelTarget(db, ownerType, thread.record_id) : undefined;
        }
        default:
            return undefined;
    }
}

function asUnitLabel(db: any, unitId?: string) {
    const unit = db.master.units.find((entry: any) => entry.id === unitId);
    return unit ? `${unit.symbol} · ${unit.name}` : unitId || "—";
}
function SectionTitle({ label, count }: { label: string; count?: number }) {
    return <div className="mb-2 mt-4 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>{count != null ? <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{count}</span> : null}</div>;
}
function EntityStat({ label, value }: { label: string; value: React.ReactNode }) {
    return <div className="rounded-lg border border-border bg-muted/30 p-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-bold text-foreground">{value}</p></div>;
}
function EntityTabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
    return <div className="mb-3 flex gap-1 overflow-x-auto rd-scroll-fade rounded-lg border border-border bg-muted/30 p-1">
      {tabs.map((item) => <button key={item} type="button" onClick={() => onChange(item)} className={cn("whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors", active === item ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground")}>{titleCase(item)}</button>)}
    </div>;
}
function AuditChangeRows({ changes }: { changes: any[] }) {
    if (!changes.length) return <EmptyContext label="No field-level before/after payload was recorded for this event."/>;
    return <div className="space-y-2">{changes.map((change, index) => {
      const field = change.field_path || change.field || `change_${index + 1}`;
      const beforeValue = change.before === undefined ? "—" : typeof change.before === "string" ? change.before : JSON.stringify(change.before, null, 2);
      const afterValue = change.after === undefined ? "—" : typeof change.after === "string" ? change.after : JSON.stringify(change.after, null, 2);
      return <div key={change.id || field} className="rounded-md border border-border bg-muted/20 p-2 text-xs">
        <p className="font-semibold">{String(field)}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2"><pre className="max-h-36 overflow-auto rounded bg-background p-2 text-[10px] text-destructive/90">{beforeValue}</pre><pre className="max-h-36 overflow-auto rounded bg-background p-2 text-[10px] text-success/90">{afterValue}</pre></div>
      </div>;
    })}</div>;
}
function VendorEntityOverview({ vendor }: { vendor: any }) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const updateVendor = useRDashStore((s) => s.updateVendor);
    const [entityTab, setEntityTab] = React.useState("overview");
    const rates = db.master.vendorRates.filter((rate: any) => rate.vendor_id === vendor.id);
    const histories = db.master.vendorRateHistories.filter((history: any) => history.vendor_id === vendor.id);
    const pos = db.purchaseOrders.filter((po: any) => po.vendor_id === vendor.id);
    const grns = db.grns.filter((grn: any) => grn.vendor_id === vendor.id);
    const bills = db.vendorBills.filter((bill: any) => bill.vendor_id === vendor.id);
    const payments = db.vendorPayments.filter((payment: any) => payment.vendor_id === vendor.id);
    const unpaidBills = bills.filter((bill: any) => bill.status !== "paid");
    const categories = new Set(rates.map((rate: any) => {
        const scope = db.master.subcategoryArticleMap.find((row: any) => row.id === rate.work_required_article_id);
        const work = db.master.workSubcategories.find((row: any) => row.id === scope?.work_required_id);
        return work ? db.master.workCategories.find((row: any) => row.id === work.category_id)?.name : undefined;
    }).filter(Boolean));
    return <div className="h-full overflow-y-auto p-4 rd-scroll">
      <EntityTabs tabs={["overview", "rates", "po/grn", "bills", "files", "actions"]} active={entityTab} onChange={setEntityTab}/>
      {entityTab === "overview" && <>
        <div className="grid gap-3 sm:grid-cols-3"><EntityStat label="Rate coverage" value={rates.length}/><EntityStat label="Open POs" value={pos.filter((po: any) => po.status !== "cancelled" && po.status !== "received").length}/><EntityStat label="Unpaid bills" value={unpaidBills.length}/></div>
        <div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs"><p className="text-sm font-bold">{vendor.name}</p><p className="mt-1 text-muted-foreground">{vendor.phone || "No phone"} · {vendor.locality || "—"} · {vendor.city || "—"}</p><p className="mt-1 text-muted-foreground">Reliability {vendor.reliability_score || "—"}/100 · On-time {vendor.on_time_pct || "—"}% · Supplies {categories.size || "—"} categories</p>{vendor.address ? <p className="mt-2 text-muted-foreground">{vendor.address}</p> : null}</div>
        <EntityFilesCard entityType="vendor" entityId={vendor.id} title="Vendor documents" />
      </>}
      {entityTab === "rates" && <><SectionTitle label="Current vendor rates" count={rates.length}/><div className="space-y-2">{rates.slice(0, 25).map((rate: any) => <LinkedRow key={rate.id} icon={<Wallet className="h-3.5 w-3.5"/>} label={rate.article_name} value={`${formatINR(rate.rate)} · ${asUnitLabel(db, rate.unit_id)}`} onClick={() => { openDetail("vendorRate" as any, rate.id); }}/>)}{!rates.length ? <EmptyContext label="No vendor prices are linked to this vendor yet."/> : null}</div><SectionTitle label="Rate history" count={histories.length}/><div className="space-y-2">{histories.slice(0, 10).map((history: any) => <div key={history.id} className="rounded-md border border-border bg-muted/20 p-2 text-xs"><div className="flex justify-between gap-2"><span className="font-semibold">{history.article_name}</span><span className="font-mono">{formatINR(history.new_rate)}</span></div><p className="mt-1 text-[10px] text-muted-foreground">{history.source_type} · {history.source_no || history.source_id || "Manual"} · {formatDate(history.created_at)}</p></div>)}</div></>}
      {entityTab === "po/grn" && <div className="space-y-2">{pos.map((po: any) => <LinkedRow key={po.id} icon={<Package className="h-3.5 w-3.5"/>} label={po.po_no} value={`${titleCase(po.status)} · ${formatINR(po.total_amount || 0)}`} onClick={() => { openDetail("po", po.id); }}/>)}{grns.map((grn: any) => <LinkedRow key={grn.id} icon={<Truck className="h-3.5 w-3.5"/>} label={grn.grn_no} value={`${titleCase(grn.status)} · ${formatDate(grn.received_at || grn.date || grn.created_at)}`} onClick={() => { openDetail("grn", grn.id); }}/>)}{!pos.length && !grns.length ? <EmptyContext label="No PO or GRN trail for this vendor yet."/> : null}</div>}
      {entityTab === "bills" && <div className="space-y-2">{bills.map((bill: any) => <LinkedRow key={bill.id} icon={<Receipt className="h-3.5 w-3.5"/>} label={bill.bill_no} value={`${titleCase(bill.status)} · ${formatINR(bill.total_amount || 0)}`} onClick={() => { openDetail("vendorBill", bill.id); }}/>)}{payments.map((payment: any) => <LinkedRow key={payment.id} icon={<Wallet className="h-3.5 w-3.5"/>} label={payment.payment_no || "Vendor payment"} value={`${titleCase(payment.status || "pending")} · ${formatINR(payment.amount || 0)}`} onClick={() => openDetail("vendorPayment", payment.id)}/>)}{!bills.length && !payments.length ? <EmptyContext label="No vendor bill/payment trail yet."/> : null}</div>}
      {entityTab === "files" && <EntityFilesCard entityType="vendor" entityId={vendor.id} title="Vendor documents" manage showEmpty />}
      {entityTab === "actions" && <div className="grid gap-2 sm:grid-cols-2"><Button size="sm" onClick={() => setActiveModule("procurementInventory")}><Package className="mr-1.5 h-3.5 w-3.5"/>Create PO</Button><Button size="sm" variant="outline" onClick={() => setActiveModule("vendorRates")}><Wallet className="mr-1.5 h-3.5 w-3.5"/>Update rate matrix</Button><Button size="sm" variant="outline" onClick={() => setActiveModule("vendorBills")}><Receipt className="mr-1.5 h-3.5 w-3.5"/>Open bills/payment</Button><Button size="sm" variant="outline" onClick={() => { updateVendor(vendor.id, { status: vendor.status === "blacklisted" ? "active" : "blacklisted" } as any); toast.success(vendor.status === "blacklisted" ? "Vendor restored" : "Vendor blacklisted/held"); }}><XCircle className="mr-1.5 h-3.5 w-3.5"/>{vendor.status === "blacklisted" ? "Restore vendor" : "Blacklist / hold"}</Button></div>}
    </div>;
}

function VendorRateEntityOverview({ rate }: { rate: any }) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const [entityTab, setEntityTab] = React.useState("overview");
    const vendor = db.master.vendors.find((row: any) => row.id === rate.vendor_id);
    const scope = db.master.subcategoryArticleMap.find((row: any) => row.id === rate.work_required_article_id);
    const work = db.master.workSubcategories.find((row: any) => row.id === scope?.work_required_id);
    const category = db.master.workCategories.find((row: any) => row.id === work?.category_id);
    const variant = db.master.articleVariants.find((row: any) => row.id === rate.variant_id);
    const history = db.master.vendorRateHistories.filter((row: any) => row.vendor_rate_id === rate.id || (row.vendor_id === rate.vendor_id && row.work_required_article_id === rate.work_required_article_id && (row.variant_id || "") === (rate.variant_id || ""))).sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
    const sourceKind = entityTypeToPanelKind(rate.current_source_type === "PO" ? "po" : rate.current_source_type === "VENDOR_BILL" ? "vendorBill" : undefined);
    return <div className="h-full overflow-y-auto p-4 rd-scroll">
      <EntityTabs tabs={["overview", "history", "source", "actions"]} active={entityTab} onChange={setEntityTab}/>
      {entityTab === "overview" && <><div className="grid gap-3 sm:grid-cols-3"><EntityStat label="Active rate" value={formatINR(rate.rate || 0)}/><EntityStat label="Reference" value={formatINR(scope?.reference_rate || 0)}/><EntityStat label="History" value={history.length}/></div><div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs"><p className="text-sm font-bold">{rate.article_name}</p><p className="mt-1 text-muted-foreground">{category?.name || "Category"} · {work?.name || "Work item"} · {variant?.name || "Standard"}</p><p className="mt-1 text-muted-foreground">Unit: {asUnitLabel(db, rate.unit_id || scope?.unit_id)} · MOQ {rate.moq || 0} · Delivery {rate.delivery_days || 0} days</p></div>{vendor ? <LinkedRow icon={<Truck className="h-3.5 w-3.5"/>} label="Vendor profile" value={`${vendor.name} · ${vendor.city || "—"}`} onClick={() => openDetail("vendor" as any, vendor.id)}/> : null}<EntityFilesCard entityType="vendor_rate" entityId={rate.id} title="Rate source files" manage showEmpty /></>}
      {entityTab === "history" && <div className="space-y-2">{history.map((row: any) => <div key={row.id} className="rounded-md border border-border bg-muted/20 p-2 text-xs"><div className="flex justify-between gap-2"><span className="font-semibold">{row.source_type} · {row.status}</span><span className="font-mono">{row.old_rate ? `${formatINR(row.old_rate)} → ` : ""}{formatINR(row.new_rate)}</span></div><p className="mt-1 text-[10px] text-muted-foreground">{row.changed_by || "System"} · {formatDate(row.created_at)} · {row.notes || "No notes"}</p></div>)}{!history.length ? <EmptyContext label="No rate history found."/> : null}</div>}
      {entityTab === "source" && <div className="space-y-2">{sourceKind && rate.current_source_id ? <LinkedRow icon={<History className="h-3.5 w-3.5"/>} label="Last source" value={`${rate.current_source_type} · ${rate.current_source_no || rate.current_source_id}`} onClick={() => openDetail(sourceKind, rate.current_source_id)}/> : <EmptyContext label="This rate was not created from a PO or vendor bill."/>}</div>}
      {entityTab === "actions" && <div className="grid gap-2 sm:grid-cols-2"><Button size="sm" onClick={() => setActiveModule("procurementInventory")}><Package className="mr-1.5 h-3.5 w-3.5"/>Create PO using rate</Button><Button size="sm" variant="outline" onClick={() => setActiveModule("vendorRates")}><Wallet className="mr-1.5 h-3.5 w-3.5"/>Update rate</Button>{vendor ? <Button size="sm" variant="outline" onClick={() => openDetail("vendor" as any, vendor.id)}><Truck className="mr-1.5 h-3.5 w-3.5"/>Open vendor</Button> : null}</div>}
    </div>;
}

function ContractorEntityOverview({ contractor }: { contractor: any }) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    // FIX-CONTRACTOR-BATCH2 / F.13: wire the previously-dead "Blacklist /
    // hold" button to the new deactivateContractor / activateContractor
    // store actions. Soft-delete (status="inactive") is safer than hard
    // delete — preserves referential integrity with bids / bills / payments /
    // settlements / work orders.
    const deactivateContractor = useRDashStore((s) => s.deactivateContractor);
    const activateContractor = useRDashStore((s) => s.activateContractor);
    const [entityTab, setEntityTab] = React.useState("overview");
    const workOrders = db.workOrders.filter((row: any) => row.contractor_id === contractor.id || row.abandoned_contractor_id === contractor.id);
    const rates = db.master.contractorRates.filter((row: any) => row.contractor_id === contractor.id);
    const bills = db.contractorBills.filter((row: any) => row.contractor_id === contractor.id);
    const payments = db.contractorPayments.filter((row: any) => row.contractor_id === contractor.id);
    const contractorStatus: string = contractor.status || "active";
    const handleToggleStatus = () => {
        try {
            if (contractorStatus === "active") {
                deactivateContractor(contractor.id, "Deactivated from contractor detail panel");
                toast.success(`${contractor.name} deactivated — hidden from bid/direct-award dropdowns.`);
            }
            else {
                activateContractor(contractor.id);
                toast.success(`${contractor.name} re-activated.`);
            }
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not change contractor status");
        }
    };
    return <div className="h-full overflow-y-auto p-4 rd-scroll">
      <EntityTabs tabs={["overview", "work", "rates", "finance", "files", "actions"]} active={entityTab} onChange={setEntityTab}/>
      {entityTab === "overview" && <><div className="grid gap-3 sm:grid-cols-3"><EntityStat label="Work orders" value={workOrders.length}/><EntityStat label="Bills" value={bills.length}/><EntityStat label="Outstanding" value={formatINRShort(contractor.outstanding || 0)}/></div><div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs"><p className="text-sm font-bold">{contractor.name}{contractorStatus !== "active" ? <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{contractorStatus}</span> : null}</p><p className="mt-1 text-muted-foreground">{contractor.phone || "No phone"} · {contractor.trade || "Trade"} · {contractor.city || "—"}</p><p className="mt-1 text-muted-foreground">Rating {contractor.rating || "—"} · Reliability {contractor.reliability_score || "—"}/100 · Worker range {contractor.worker_count_range || "—"}</p>{(contractor.business_gst || contractor.pan || contractor.bank_account) && <p className="mt-1 text-muted-foreground">GST {contractor.business_gst || "—"} · PAN {contractor.pan || "—"} · Bank {contractor.bank_account || "—"}{contractor.ifsc ? ` (${contractor.ifsc})` : ""}</p>}</div><EntityFilesCard entityType="contractor" entityId={contractor.id} title="Contractor documents" /></>}
      {entityTab === "work" && <div className="space-y-2">{workOrders.map((job: any) => <LinkedRow key={job.id} icon={<Building2 className="h-3.5 w-3.5"/>} label={job.work_order_no} value={`${titleCase(job.status)} · ${formatINR(job.value || 0)}`} onClick={() => openDetail("workOrder", job.id)}/>)}{!workOrders.length ? <EmptyContext label="No work order has been assigned to this contractor."/> : null}</div>}
      {entityTab === "rates" && <div className="space-y-2">{rates.map((row: any) => <div key={row.id} className="rounded-md border border-border bg-muted/20 p-2 text-xs"><div className="flex justify-between"><span>{row.trade}</span><span className="font-mono">{formatINR(row.rate)}</span></div></div>)}{!rates.length ? <EmptyContext label="No contractor rates recorded."/> : null}</div>}
      {entityTab === "finance" && <div className="space-y-2">{bills.map((bill: any) => <LinkedRow key={bill.id} icon={<Receipt className="h-3.5 w-3.5"/>} label={bill.bill_no || "Contractor bill"} value={`${titleCase(bill.status || "pending")} · ${formatINR(bill.total_amount || bill.amount || 0)}`} onClick={() => openDetail("contractorBill" as any, bill.id)}/>)}{payments.map((payment: any) => <LinkedRow key={payment.id} icon={<Wallet className="h-3.5 w-3.5"/>} label={payment.payment_no || "Contractor payment"} value={`${titleCase(payment.status || "pending")} · ${formatINR(payment.amount || 0)}`} onClick={() => openDetail("contractorPayment" as any, payment.id)}/>)}{!bills.length && !payments.length ? <EmptyContext label="No contractor bill/payment trail."/> : null}</div>}
      {entityTab === "files" && <EntityFilesCard entityType="contractor" entityId={contractor.id} title="Contractor documents" manage showEmpty />}
      {entityTab === "actions" && <div className="grid gap-2 sm:grid-cols-2"><Button size="sm" onClick={() => setActiveModule("siteExecution")}><HardHat className="mr-1.5 h-3.5 w-3.5"/>Assign / match contractor</Button><Button size="sm" variant="outline" onClick={() => setActiveModule("contractorPayments")}><Receipt className="mr-1.5 h-3.5 w-3.5"/>Open bills/payment</Button><Button size="sm" variant={contractorStatus === "active" ? "destructive" : "outline"} onClick={handleToggleStatus} title={contractorStatus === "active" ? "Deactivate this contractor — they will be hidden from bid/direct-award dropdowns but their historical records are preserved." : "Re-activate this contractor"}>{contractorStatus === "active" ? <><XCircle className="mr-1.5 h-3.5 w-3.5"/>Deactivate</> : <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/>Activate</>}</Button></div>}
    </div>;
}

function VendorPaymentEntityOverview({ payment }: { payment: import("@/lib/rdash/types").VendorPayment }) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const bill = db.vendorBills.find((row) => row.id === payment.vendor_bill_id);
    const po = bill?.po_id ? db.purchaseOrders.find((row) => row.id === bill.po_id) : undefined;
    const workOrderId = payment.work_order_id || bill?.work_order_id;
    const workOrder = workOrderId ? db.workOrders.find((row) => row.id === workOrderId) : undefined;
    const vendor = db.master.vendors.find((row) => row.id === payment.vendor_id);
    return <div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="grid gap-3 sm:grid-cols-3"><EntityStat label="Amount" value={formatINR(payment.amount || 0)}/><EntityStat label="Mode" value={titleCase(String(payment.mode || "—").replaceAll("_", " "))}/><EntityStat label="Status" value={titleCase(payment.status || "—")}/></div>
      <div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs"><p className="text-sm font-bold">{payment.payment_no}</p><p className="mt-1 text-muted-foreground">{payment.vendor_name || vendor?.name || "Vendor"}{po ? ` · ${po.po_no}` : ""}{workOrder ? ` · ${workOrder.work_order_no}` : ""}</p><p className="mt-1 text-muted-foreground">Reference: <span className="font-mono">{payment.reference || "—"}</span></p>{payment.paid_at ? <p className="mt-1 text-muted-foreground">Paid {formatDate(payment.paid_at)}</p> : null}{payment.approved_by ? <p className="mt-1 text-muted-foreground">Approved by {payment.approved_by}</p> : null}</div>
      <EntityFilesCard entityType="vendor_payment" entityId={payment.id} title="Payment proof" manage showEmpty />
      <div className="mt-4 flex flex-wrap gap-2">{bill ? <Button size="sm" variant="outline" onClick={() => openDetail("vendorBill", bill.id)}><Receipt className="mr-1.5 h-3.5 w-3.5"/>Open bill</Button> : null}{workOrder ? <Button size="sm" variant="outline" onClick={() => openDetail("workOrder", workOrder.id)}><Building2 className="mr-1.5 h-3.5 w-3.5"/>Open work order</Button> : null}{vendor ? <Button size="sm" variant="outline" onClick={() => openDetail("vendor", vendor.id)}><Truck className="mr-1.5 h-3.5 w-3.5"/>Open vendor</Button> : null}</div>
    </div>;
}

// FIX-CONTRACTOR-BATCH2 / F.15: DetailPanel drill-through for contractor
// bills. Previously the ContractorPaymentsModule set detailKind="workOrder"
// on every bill row — clicking opened the work order, not the bill, so the
// user could not see the bill's description / progress_pct / verified_at /
// verified_by / due_date / dispute fields. Now the module sets
// detailKind="contractorBill" (F.23) and this overview renders the full
// bill context.
function ContractorBillEntityOverview({ bill }: { bill: any }) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const disputeContractorBill = useRDashStore((s) => s.disputeContractorBill);
    const resolveContractorBillDispute = useRDashStore((s) => s.resolveContractorBillDispute);
    const [entityTab, setEntityTab] = React.useState("overview");
    const workOrder = db.workOrders.find((row: any) => row.id === bill.work_order_id);
    const site = db.sites.find((row: any) => row.id === bill.site_id);
    const contractor = db.master.contractors.find((row: any) => row.id === bill.contractor_id);
    const customer = db.customers.find((row: any) => row.id === bill.customer_id);
    const payments = db.contractorPayments.filter((row: any) => row.contractor_bill_id === bill.id);
    const [disputeReason, setDisputeReason] = React.useState("");
    const [disputeOpen, setDisputeOpen] = React.useState(false);
    const handleDispute = () => {
        try {
            disputeContractorBill(bill.id, disputeReason.trim() || "Disputed from contractor bill detail panel");
            toast.success(`Bill ${bill.bill_no} marked as disputed.`);
            setDisputeOpen(false);
            setDisputeReason("");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not dispute bill");
        }
    };
    const handleResolve = () => {
        try {
            resolveContractorBillDispute(bill.id);
            toast.success(`Dispute resolved on ${bill.bill_no}.`);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not resolve dispute");
        }
    };
    return <div className="h-full overflow-y-auto p-4 rd-scroll">
      <EntityTabs tabs={["overview", "payments", "actions"]} active={entityTab} onChange={setEntityTab}/>
      {entityTab === "overview" && <><div className="grid gap-3 sm:grid-cols-3"><EntityStat label="Bill amount" value={formatINR(bill.amount || 0)}/><EntityStat label="Paid" value={formatINR(bill.paid_amount || 0)}/><EntityStat label="Balance" value={formatINR(bill.balance_amount || 0)}/></div><div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs"><p className="text-sm font-bold">{bill.bill_no}{bill.ra_no ? ` · ${bill.ra_no}` : ""}</p><p className="mt-1 text-muted-foreground">{bill.contractor_name || "Contractor"} · {workOrder?.work_order_no || "—"} · {site?.name || "—"}</p><p className="mt-1 text-muted-foreground">Status: <span className="font-semibold">{titleCase(bill.status || "—")}</span> · Progress {bill.progress_pct ?? "—"}% · Due {bill.due_date ? formatDate(bill.due_date) : "—"}</p>{bill.verified_at && <p className="mt-1 text-muted-foreground">Verified {formatDate(bill.verified_at)} by {bill.verified_by || "—"}</p>}{bill.status === "disputed" && bill.disputed_at && <p className="mt-1 text-destructive">Disputed {formatDate(bill.disputed_at)} by {bill.disputed_by || "—"}{bill.dispute_reason ? ` — ${bill.dispute_reason}` : ""}</p>}{bill.description && <p className="mt-2 text-foreground/80">{bill.description}</p>}</div><EntityFilesCard entityType="contractor_bill" entityId={bill.id} title="Contractor bill files" manage showEmpty /></>}
      {entityTab === "payments" && <div className="space-y-2">{payments.map((payment: any) => <LinkedRow key={payment.id} icon={<Wallet className="h-3.5 w-3.5"/>} label={payment.payment_no || "Payment"} value={`${titleCase(payment.status || "—")} · ${formatINR(payment.amount || 0)}`} onClick={() => openDetail("contractorPayment" as any, payment.id)}/>)}{!payments.length ? <EmptyContext label="No payments recorded against this bill yet."/> : null}</div>}
      {entityTab === "actions" && <div className="grid gap-2 sm:grid-cols-2">{customer && <Button size="sm" variant="outline" onClick={() => openDetail("customer" as any, customer.id)}><User className="mr-1.5 h-3.5 w-3.5"/>Open customer</Button>}{workOrder && <Button size="sm" variant="outline" onClick={() => openDetail("workOrder", workOrder.id)}><Building2 className="mr-1.5 h-3.5 w-3.5"/>Open work order</Button>}{contractor && <Button size="sm" variant="outline" onClick={() => openDetail("contractor" as any, contractor.id)}><HardHat className="mr-1.5 h-3.5 w-3.5"/>Open contractor</Button>}{bill.status === "disputed" ? <Button size="sm" variant="outline" onClick={handleResolve} title="Restore the bill to verified status so it can re-enter the payment release flow."><CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/>Resolve dispute</Button> : <Button size="sm" variant="destructive" onClick={() => setDisputeOpen((v) => !v)} title="Mark this bill as disputed — payment release will be frozen until the dispute is resolved."><AlertCircle className="mr-1.5 h-3.5 w-3.5"/>Dispute bill</Button>}{disputeOpen && bill.status !== "disputed" && <div className="sm:col-span-2 rounded-md border border-destructive/30 bg-destructive/[0.04] p-2"><label className="text-[10px] font-semibold uppercase text-muted-foreground">Dispute reason</label><Input value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="e.g. Rate mismatch on line 3 — re-measurement required." className="h-8 text-xs"/><div className="mt-1 flex gap-2"><Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleDispute}>Confirm dispute</Button></div></div>}</div>}
    </div>;
}

// FIX-CONTRACTOR-BATCH2 / F.15: DetailPanel drill-through for contractor
// payments. Mirrors the bill overview — shows mode/reference/approved_at/
// approved_by, links to the parent bill + work order + contractor, and
// exposes the F.8 hold/cancel actions (pending/approved payments only).
function ContractorPaymentEntityOverview({ payment }: { payment: any }) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const holdContractorPayment = useRDashStore((s) => s.holdContractorPayment);
    const cancelContractorPayment = useRDashStore((s) => s.cancelContractorPayment);
    const [entityTab, setEntityTab] = React.useState("overview");
    const bill = db.contractorBills.find((row: any) => row.id === payment.contractor_bill_id);
    const workOrder = db.workOrders.find((row: any) => row.id === payment.work_order_id);
    const site = db.sites.find((row: any) => row.id === payment.site_id);
    const contractor = db.master.contractors.find((row: any) => row.id === payment.contractor_id);
    const [actionReason, setActionReason] = React.useState("");
    const [actionOpen, setActionOpen] = React.useState<null | "hold" | "cancel">(null);
    const canActOnPayment = payment.status === "pending" || payment.status === "approved";
    const handleHold = () => {
        try {
            holdContractorPayment(payment.id, actionReason.trim() || "Held from contractor payment detail panel");
            toast.success(`Payment ${payment.payment_no} held.`);
            setActionOpen(null);
            setActionReason("");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not hold payment");
        }
    };
    const handleCancel = () => {
        try {
            cancelContractorPayment(payment.id, actionReason.trim() || "Cancelled from contractor payment detail panel");
            toast.success(`Payment ${payment.payment_no} cancelled.`);
            setActionOpen(null);
            setActionReason("");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not cancel payment");
        }
    };
    return <div className="h-full overflow-y-auto p-4 rd-scroll">
      <EntityTabs tabs={["overview", "actions"]} active={entityTab} onChange={setEntityTab}/>
      {entityTab === "overview" && <><div className="grid gap-3 sm:grid-cols-3"><EntityStat label="Amount" value={formatINR(payment.amount || 0)}/><EntityStat label="Mode" value={titleCase(String(payment.mode || "—").replaceAll("_", " "))}/><EntityStat label="Status" value={titleCase(payment.status || "—")}/></div><div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs"><p className="text-sm font-bold">{payment.payment_no}</p><p className="mt-1 text-muted-foreground">{payment.contractor_name || "Contractor"} · {workOrder?.work_order_no || "—"} · {site?.name || "—"}</p><p className="mt-1 text-muted-foreground">Reference: <span className="font-mono">{payment.reference || "—"}</span></p>{payment.approved_at && <p className="mt-1 text-muted-foreground">Approved {formatDate(payment.approved_at)} by {payment.approved_by || "—"}</p>}{payment.paid_at && <p className="mt-1 text-muted-foreground">Paid {formatDate(payment.paid_at)}</p>}{payment.status === "held" && payment.held_at && <p className="mt-1 text-warning">Held {formatDate(payment.held_at)} by {payment.held_by || "—"}{payment.hold_reason ? ` — ${payment.hold_reason}` : ""}</p>}{payment.status === "cancelled" && payment.cancelled_at && <p className="mt-1 text-destructive">Cancelled {formatDate(payment.cancelled_at)} by {payment.cancelled_by || "—"}{payment.cancel_reason ? ` — ${payment.cancel_reason}` : ""}</p>}</div><EntityFilesCard entityType="contractor_payment" entityId={payment.id} title="Payment proof" manage showEmpty /></>}
      {entityTab === "actions" && <div className="grid gap-2 sm:grid-cols-2">{bill && <Button size="sm" variant="outline" onClick={() => openDetail("contractorBill" as any, bill.id)}><Receipt className="mr-1.5 h-3.5 w-3.5"/>Open bill</Button>}{workOrder && <Button size="sm" variant="outline" onClick={() => openDetail("workOrder", workOrder.id)}><Building2 className="mr-1.5 h-3.5 w-3.5"/>Open work order</Button>}{contractor && <Button size="sm" variant="outline" onClick={() => openDetail("contractor" as any, contractor.id)}><HardHat className="mr-1.5 h-3.5 w-3.5"/>Open contractor</Button>}{canActOnPayment && <Button size="sm" variant="outline" onClick={() => setActionOpen(actionOpen === "hold" ? null : "hold")} title="Freeze this payment pending investigation."><AlertCircle className="mr-1.5 h-3.5 w-3.5"/>Hold payment</Button>}{canActOnPayment && <Button size="sm" variant="destructive" onClick={() => setActionOpen(actionOpen === "cancel" ? null : "cancel")} title="Void this payment entirely."><XCircle className="mr-1.5 h-3.5 w-3.5"/>Cancel payment</Button>}{actionOpen && <div className="sm:col-span-2 rounded-md border border-destructive/30 bg-destructive/[0.04] p-2"><label className="text-[10px] font-semibold uppercase text-muted-foreground">{actionOpen === "hold" ? "Hold reason" : "Cancel reason"}</label><Input value={actionReason} onChange={(e) => setActionReason(e.target.value)} placeholder={actionOpen === "hold" ? "e.g. Awaiting invoice reconciliation." : "e.g. Duplicate payment — entered in error."} className="h-8 text-xs"/><div className="mt-1 flex gap-2"><Button size="sm" variant={actionOpen === "hold" ? "outline" : "destructive"} className="h-7 text-xs" onClick={actionOpen === "hold" ? handleHold : handleCancel}>Confirm {actionOpen}</Button></div></div>}{!canActOnPayment && <EmptyContext label={`No hold/cancel actions available — payment is already ${payment.status}.`}/>}</div>}
    </div>;
}

function StaffEntityOverview({ staff }: { staff: any }) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const updateStaffDocument = useRDashStore((s) => s.updateStaffDocument);
    const [entityTab, setEntityTab] = React.useState("profile");
    const permissions = (db.staffRolePermissions || []).filter((row: any) => row.role_key === (staff.role_key || staff.role));
    const auth = (db.staffAuthUsers || []).find((row: any) => row.staff_id === staff.id);
    const attendance = db.attendance.filter((row: any) => row.staff_id === staff.id).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
    const pings = (db.staffLocationPings || []).filter((row: any) => row.staff_id === staff.id).sort((a: any, b: any) => String(b.captured_at).localeCompare(String(a.captured_at)));
    const visits = db.visits.filter((row: any) => row.staff_id === staff.id);
    const tasks = db.tasks.filter((row: any) => row.assignee_id === staff.id || row.assigned_to_staff_id === staff.id);
    const payroll = (db.payrollLines || []).filter((row: any) => row.staff_id === staff.id);
    const docs = (db.staffDocuments || []).filter((row: any) => row.staff_id === staff.id);
    return <div className="h-full overflow-y-auto p-4 rd-scroll">
      <EntityTabs tabs={["profile", "login", "permissions", "attendance", "gps", "payroll", "documents"]} active={entityTab} onChange={setEntityTab}/>
      {entityTab === "profile" && <><div className="grid gap-3 sm:grid-cols-3"><EntityStat label="Today" value={attendance[0]?.status ? titleCase(attendance[0].status) : "—"}/><EntityStat label="Tasks" value={tasks.length}/><EntityStat label="Payroll" value={payroll[0] ? formatINR(payroll[0].net_payable || 0) : "—"}/></div><div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs"><p className="text-sm font-bold">{staff.name}</p><p className="mt-1 text-muted-foreground">{staff.code || "—"} · {staff.role} · {staff.department || "Team"} · {staff.status || "active"}</p><p className="mt-1 text-muted-foreground">Phone {staff.phone || "—"} · Salary {staff.monthly_salary ? `${formatINR(staff.monthly_salary)}/mo` : staff.daily_wage ? `${formatINR(staff.daily_wage)}/day` : "—"}</p></div></>}
      {entityTab === "login" && <div className="rounded-lg border border-border bg-background p-3 text-xs"><p className="font-bold">Login access</p><p className="mt-1 text-muted-foreground">{auth?.email || staff.login_email || "Not enabled"}</p><p className="mt-1 text-muted-foreground">Role key: {auth?.role_key || staff.role_key || "—"} · Force password change: {auth?.force_password_change ? "yes" : "no"}</p></div>}
      {entityTab === "permissions" && <div className="space-y-2">{permissions.map((p: any) => <div key={p.id} className="rounded-md border border-border bg-muted/20 p-2 text-xs"><div className="flex justify-between"><span className="font-semibold">{p.module_label}</span><span className="text-muted-foreground">{[p.can_view && "view", p.can_create && "create", p.can_update && "update", p.can_approve && "approve", p.can_delete && "delete"].filter(Boolean).join(" / ") || "none"}</span></div></div>)}{!permissions.length ? <EmptyContext label="No role permissions found."/> : null}</div>}
      {entityTab === "attendance" && <div className="space-y-2">{attendance.slice(0, 15).map((row: any) => <div key={row.id} className="rounded-md border border-border bg-muted/20 p-2 text-xs"><div className="flex justify-between"><span className="font-semibold">{formatDate(row.date)}</span><span>{titleCase(row.status)}</span></div><p className="mt-1 text-[10px] text-muted-foreground">{row.check_in || "—"} → {row.check_out || "—"} · late {row.late_minutes || 0} min · {row.deduction_reason || "no deduction"}</p></div>)}{!attendance.length ? <EmptyContext label="No attendance rows found."/> : null}</div>}
      {entityTab === "gps" && <div className="space-y-2">{pings.slice(0, 20).map((ping: any) => <div key={ping.id} className="rounded-md border border-border bg-muted/20 p-2 text-xs"><p className="font-semibold">GPS ping · {formatDate(ping.captured_at)}</p><p className="text-[10px] text-muted-foreground">{ping.latitude}, {ping.longitude} · accuracy {ping.accuracy_m || "—"}m</p></div>)}{!pings.length ? <EmptyContext label="No GPS pings found."/> : null}</div>}
      {entityTab === "payroll" && <div className="space-y-2">{payroll.map((line: any) => <div key={line.id} className="rounded-md border border-border bg-muted/20 p-2 text-xs"><div className="flex justify-between"><span className="font-semibold">Payroll {line.payment_status}</span><span className="font-mono">{formatINR(line.net_payable || 0)}</span></div><p className="mt-1 text-[10px] text-muted-foreground">{line.deduction_explanation || "No salary reduction reason."}</p></div>)}{!payroll.length ? <EmptyContext label="No payroll generated."/> : null}</div>}
      {entityTab === "documents" && <div className="space-y-2">{docs.map((doc: any) => { const file = doc.file_asset_id ? db.master.fileAssets.find((row: any) => row.id === doc.file_asset_id) : undefined; return <div key={doc.id} className="rounded-md border border-border bg-muted/20 p-2 text-xs"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{titleCase(String(doc.document_type).replaceAll("_", " "))}</p><p className="mt-1 text-[10px] text-muted-foreground">{doc.document_no || "No number"} · {titleCase(doc.status)}</p></div><div className="flex gap-1">{file && <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => openDetail("media" as any, file.id)}>Open file</Button>}<Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateStaffDocument(doc.id, { status: "verified" })}>Verify</Button><Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => updateStaffDocument(doc.id, { status: "rejected" })}>Reject</Button></div></div></div>; })}{!docs.length ? <EmptyContext label="No staff documents linked."/> : null}</div>}
    </div>;
}

function AuditEntityOverview({ event }: { event: any }) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [entityTab, setEntityTab] = React.useState("summary");
    const target = attachmentOwnerPanelTarget(db, event.entity_type, event.entity_id);
    const changes = Array.isArray(event.changes) ? event.changes : [];
    const beforeAfter = !changes.length && (event.before !== undefined || event.after !== undefined)
      ? [{ field_path: "record", before: event.before, after: event.after }]
      : changes;
    return <div className="h-full overflow-y-auto p-4 rd-scroll">
      <EntityTabs tabs={["summary", "before/after", "linked record", "actor", "recovery"]} active={entityTab} onChange={setEntityTab}/>
      {entityTab === "summary" && <><div className="grid gap-3 sm:grid-cols-3"><EntityStat label="Kind" value={titleCase(event.kind)}/><EntityStat label="Actor" value={event.actor}/><EntityStat label="Changes" value={beforeAfter.length}/></div><div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs"><p className="text-sm font-bold">{event.action}</p><p className="mt-1 text-muted-foreground">{event.actor_role || "System"} · {formatDate(event.timestamp)} · {event.source_module || "unknown module"}</p><p className="mt-2 text-muted-foreground">Entity: {event.entity_label || event.entity_type || "—"}</p>{event.reason ? <p className="mt-2 text-muted-foreground">Reason: {event.reason}</p> : null}</div></>}
      {entityTab === "before/after" && <AuditChangeRows changes={beforeAfter}/>}      
      {entityTab === "linked record" && (target ? <LinkedRow icon={<ArrowRight className="h-3.5 w-3.5"/>} label="Open affected record" value={`${titleCase(String(target.kind))} · ${event.entity_label || event.entity_id}`} onClick={() => openDetail(target.kind, target.id)}/> : <EmptyContext label="This audit event does not point to an openable record."/>)}
      {entityTab === "actor" && <div className="rounded-lg border border-border bg-background p-3 text-xs"><p className="font-bold">{event.actor}</p><p className="mt-1 text-muted-foreground">Role: {event.actor_role || "System"}</p><p className="mt-1 text-muted-foreground">Thread: {event.thread_id || "—"}</p><p className="mt-1 text-muted-foreground">Source module: {event.source_module || "—"}</p></div>}
      {entityTab === "recovery" && <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs"><p className="font-bold text-warning">Recovery / reversal</p><p className="mt-1 text-muted-foreground">This panel shows exactly what changed. Safe rollback should be implemented per domain action, not as a blind JSON restore.</p><Button size="sm" variant="outline" className="mt-3" disabled>Rollback requires domain-specific approval</Button></div>}
    </div>;
}

function MediaEntityOverview({ file }: { file: any }) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [entityTab, setEntityTab] = React.useState("preview");
    const attachments = (db.entityFileAttachments || []).filter((row: any) => row.file_asset_id === file.id);
    const catalogue = (db.master.catalogues || []).find((row: any) => row.drive_asset_id === file.id);
    const reference = (db.master.referenceMedia || []).find((row: any) => row.drive_asset_id === file.id);
    const staffDocs = (db.staffDocuments || []).filter((row: any) => row.file_asset_id === file.id);
    const usageCount = attachments.length + staffDocs.length + (catalogue ? 1 : 0) + (reference ? 1 : 0);
    return <div className="h-full overflow-y-auto p-4 rd-scroll">
      <EntityTabs tabs={["preview", "links", "catalogue", "actions"]} active={entityTab} onChange={setEntityTab}/>
      {entityTab === "preview" && <><FilePreview file={{ fileName: file.file_name, mimeType: file.mime_type, googleFileId: file.google_file_id, url: file.web_view_link, thumbnailUrl: file.thumbnail_url }} controls className="mb-3"/><div className="grid gap-3 sm:grid-cols-3"><EntityStat label="Business links" value={usageCount}/><EntityStat label="Kind" value={titleCase(file.kind || "file")}/><EntityStat label="Status" value={titleCase(file.status || "active")}/></div><div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs"><p className="text-sm font-bold">{file.file_name}</p><p className="mt-1 text-muted-foreground">{file.storage_mode?.replaceAll("_", " ")} · {file.mime_type || "unknown type"} · {file.tags?.join(", ") || "no tags"}</p>{file.web_view_link ? <a className="mt-2 inline-flex text-primary hover:underline" href={file.web_view_link} target="_blank" rel="noreferrer">Open original Drive file</a> : null}</div></>}
      {entityTab === "links" && <div className="space-y-2">{attachments.map((link: any) => { const target = attachmentOwnerPanelTarget(db, link.entity_type, link.entity_id); return <LinkedRow key={link.id} icon={<FileText className="h-3.5 w-3.5"/>} label={link.entity_label || titleCase(link.entity_type)} value={`${titleCase(link.role)} · ${titleCase(link.visibility)}`} onClick={target ? () => { openDetail(target.kind, target.id); } : undefined}/>; })}{staffDocs.map((doc: any) => { const staff = db.master.staff.find((row: any) => row.id === doc.staff_id); return <LinkedRow key={doc.id} icon={<User className="h-3.5 w-3.5"/>} label={`${staff?.name || doc.staff_id} · ${titleCase(doc.document_type.replaceAll("_", " "))}`} value={titleCase(doc.status)} onClick={() => { openDetail("staff" as any, doc.staff_id); }}/>; })}{!attachments.length && !staffDocs.length ? <EmptyContext label="No direct entity attachments found."/> : null}</div>}
      {entityTab === "catalogue" && <div className="space-y-2">{catalogue ? <div className="rounded-md border border-border bg-muted/20 p-2 text-xs"><p className="font-semibold">Catalogue: {catalogue.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{catalogue.catalog_type || "catalogue"} · customer sendable {catalogue.sendable_to_customer ? "yes" : "no"}</p></div> : null}{reference ? <div className="rounded-md border border-border bg-muted/20 p-2 text-xs"><p className="font-semibold">Reference media: {reference.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{reference.tags?.join(", ") || "No tags"}</p></div> : null}{!catalogue && !reference ? <EmptyContext label="This media is not registered as a catalogue/reference resource."/> : null}</div>}
      {entityTab === "actions" && <div className="grid gap-2 sm:grid-cols-2"><Button size="sm" variant="outline" onClick={() => window.open(file.web_view_link, "_blank", "noopener,noreferrer")}><FileText className="mr-1.5 h-3.5 w-3.5"/>Open Drive file</Button><Button size="sm" variant="outline" onClick={() => toast.info("Verification/archival should be done from the owning media module") }><Check className="mr-1.5 h-3.5 w-3.5"/>Verify usage</Button></div>}
    </div>;
}

function QuotationOverview({ q }: {
    q: import("@/lib/rdash/types").Quotation;
}) {
    const updateQuotation = useRDashStore((s) => s.updateQuotation);
    const openQuotationAcceptanceDialog = useRDashStore((s) => s.openQuotationAcceptanceDialog);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const reviseQuotationWithHolds = useRDashStore((s) => s.reviseQuotationWithHolds);
    const renegotiateQuotation = useRDashStore((s) => s.renegotiateQuotation);
    const openDetail = useRDashStore((s) => s.openDetail);
    const db = useRDashStore((s) => s.db);
    const st = quotationStatusStyle(q.status);
    const isEditable = q.status === "draft";
    const [reviseOpen, setReviseOpen] = React.useState(false);
    const [heldIds, setHeldIds] = React.useState<Set<string>>(new Set());
    const [holdReason, setHoldReason] = React.useState("");
    const [renegotiateOpen, setRenegotiateOpen] = React.useState(false);
    const [renegotiateReason, setRenegotiateReason] = React.useState("");
    const [renegotiateHeldIds, setRenegotiateHeldIds] = React.useState<Set<string>>(new Set());
    const site = q.site_id ? db.sites.find((s) => s.id === q.site_id) : undefined;
    const handleCreateRevision = () => {
        let newId = "";
        try {
            newId = reviseQuotationWithHolds(q.id, Array.from(heldIds), holdReason || undefined);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Revision could not be created");
            return;
        }
        if (newId) {
            toast.success(`Revision created — ${heldIds.size} item(s) held`);
            openDetail("quotation", newId);
            setReviseOpen(false);
            setHeldIds(new Set());
            setHoldReason("");
        }
    };
    const handleRenegotiate = () => {
        let newId = "";
        try {
            newId = renegotiateQuotation(q.id, renegotiateReason, { heldItemIds: Array.from(renegotiateHeldIds) });
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Renegotiation could not be created");
            return;
        }
        if (newId) {
            const isVariation = q.work_order_ids.length > 0;
            toast.success(`${isVariation ? "Variation" : "Renegotiation"} created — original retained as history`);
            openDetail("quotation", newId);
            setRenegotiateOpen(false);
            setRenegotiateReason("");
            setRenegotiateHeldIds(new Set());
        }
    };
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={(q.customer_name || "Customer")} size={42}/>
          <div>
            <p className="text-base font-bold">{(q.customer_name || "Customer")}</p>
            <p className="text-xs text-muted-foreground">{q.quotation_no} · Rev {q.revision_no}{q.parent_quotation_id ? ` · revision of ${db.quotations.find((x) => x.id === q.parent_quotation_id)?.quotation_no || ""}` : ""}</p>
          </div>
        </div>
        <StatusBadge label={st.label} className={st.className}/>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Total value" value={formatINR(q.total_amount)} mono/>
        <Field label="Valid until" value={formatDate(q.valid_until)}/>
        <Field label="Subtotal" value={formatINR(q.subtotal)} mono/>
        <Field label="Tax (18%)" value={formatINR(q.tax_amount)} mono/>
        {site && <Field label="Site" value={site.name}/>}
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Line items</p>
          {isEditable && <span className="text-[10px] text-muted-foreground">Draft · editable</span>}
        </div>
        {isEditable ? (<QuotationLineItemEditor quotationId={q.id} items={q.scope_lines} articles={db.master.articles}/>) : (<LineItemTable items={q.scope_lines}/>)}
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment milestones</p>
          {isEditable && <span className="text-[10px] text-muted-foreground">{q.payment_terms.reduce((n, pt) => n + pt.percentage, 0)}% allocated</span>}
        </div>
        {isEditable ? (<QuotationMilestoneEditor quotationId={q.id} milestones={q.payment_terms} totalAmount={q.total_amount}/>) : (<div className="flex flex-wrap gap-2">
            {q.payment_terms.map((pt) => (<span key={pt.id} className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs">
                {pt.label} {pt.percentage}% · {pt.due_event.replace(/_/g, " ")}
              </span>))}
          </div>)}
      </div>
      <EntityFilesCard entityType="quotation" entityId={q.id} title="Quotation files & approvals" manage showEmpty />
      <div className="mt-5 flex flex-wrap gap-2">
        {q.status === "draft" && (<Button size="sm" onClick={() => { updateQuotation(q.id, { status: "sent" }); toast.success("Quotation sent to customer"); }}>
            <Send className="mr-1.5 h-3.5 w-3.5"/> Mark as Sent
          </Button>)}
        {q.status !== "cancelled" && q.work_order_ids.length === 0 && (<Button size="sm" onClick={() => openQuotationAcceptanceDialog(q.id)}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Accept selected scope
          </Button>)}
        {q.status === "accepted" && q.work_order_ids.length === 0 && (<Button size="sm" onClick={() => setActiveModule("siteExecution")}>
            <ArrowRight className="mr-1.5 h-3.5 w-3.5"/> Open contractor bidding
          </Button>)}
        {q.work_order_ids.length > 0 && (<Button size="sm" variant="outline" onClick={() => openDetail("workOrder", q.work_order_ids[0])}>
            <ArrowRight className="mr-1.5 h-3.5 w-3.5"/> Go to WorkOrder
          </Button>)}
        {q.status !== "draft" && q.status !== "cancelled" && q.work_order_ids.length === 0 && (<Button size="sm" variant="outline" onClick={() => setReviseOpen((v) => !v)}>
            <FileText className="mr-1.5 h-3.5 w-3.5"/> Create editable revision
          </Button>)}
        {q.status !== "draft" && q.status !== "cancelled" && q.work_order_ids.length > 0 && (<Button size="sm" variant="outline" onClick={() => setRenegotiateOpen((v) => !v)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5"/> Renegotiate / Variation
          </Button>)}
        <Button size="sm" variant="outline" onClick={() => { toast.info("Opening print view…"); setTimeout(() => window.print(), 300); }} className="no-print">
          <Download className="mr-1.5 h-3.5 w-3.5"/> Print / PDF
        </Button>
      </div>
      {reviseOpen && (<div className="mt-4 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
          <p className="mb-2 text-xs font-semibold">Create editable revision</p>
          <p className="mb-2 text-[11px] text-muted-foreground">
            The earlier commercial version remains visible as <strong>Cancelled</strong>. The successor becomes the only editable <strong>Draft</strong>. Holding lines is optional.
          </p>
          <div className="flex flex-col gap-1">
            {q.scope_lines.map((it) => {
                const checked = heldIds.has(it.id);
                return (<label key={it.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs", checked ? "border-warning/40 bg-warning/10" : "border-border bg-background")}>
                  <input type="checkbox" checked={checked} onChange={(e) => setHeldIds((s) => {
                        const next = new Set(s);
                        if (e.target.checked)
                            next.add(it.id);
                        else
                            next.delete(it.id);
                        return next;
                    })}/>
                  <span className="flex-1 truncate">{it.title}{it.area_name ? ` · ${it.area_name}` : ""}</span>
                  <span className="font-mono text-muted-foreground">{formatINR(it.amount)}</span>
                </label>);
            })}
          </div>
          <div className="mt-2">
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Hold reason (optional)</label>
            <Textarea value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="e.g. Customer will decide later on bathroom tiles and hall gypsum ceiling" rows={2} className="text-sm"/>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleCreateRevision}>
              Create revision{heldIds.size ? ` (${heldIds.size} held)` : ""}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setReviseOpen(false); setHeldIds(new Set()); setHoldReason(""); }}>Cancel</Button>
          </div>
        </div>)}
      {renegotiateOpen && (<div className="mt-4 rounded-lg border border-warning/40 bg-warning/[0.06] p-3">
          <p className="mb-1 text-xs font-semibold">Renegotiate / Create Variation</p>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {q.work_order_ids.length > 0
              ? <>This quotation is linked to a Work Order. A <strong>Variation</strong> will be created as a new draft revision — the original stays as history (not cancelled), and the change is recorded in the audit log with your reason.</>
              : <>A <strong>Renegotiation</strong> will be created as a new draft revision — the original stays as history (not cancelled), and the change is recorded in the audit log with your reason.</>}
          </p>
          <div className="mb-2">
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Reason (required for audit trail)</label>
            <Textarea value={renegotiateReason} onChange={(e) => setRenegotiateReason(e.target.value)} placeholder={q.work_order_ids.length > 0 ? "e.g. Customer upgraded kitchen counter to granite; scope + price adjusted after Work Order started." : "e.g. Customer renegotiated material from acrylic to plywood after acceptance; price reduced 12%."} rows={2} className="text-sm"/>
          </div>
          <div className="mb-2 flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Hold lines (optional)</p>
            {q.scope_lines.map((it) => {
                const checked = renegotiateHeldIds.has(it.id);
                return (<label key={it.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs", checked ? "border-warning/40 bg-warning/10" : "border-border bg-background")}>
                  <input type="checkbox" checked={checked} onChange={(e) => setRenegotiateHeldIds((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(it.id); else next.delete(it.id);
                        return next;
                    })}/>
                  <span className="flex-1 truncate">{it.title}{it.area_name ? ` · ${it.area_name}` : ""}</span>
                  <span className="font-mono text-muted-foreground">{formatINR(it.amount)}</span>
                </label>);
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleRenegotiate} disabled={!renegotiateReason.trim()}>
              {q.work_order_ids.length > 0 ? "Create variation" : "Create renegotiation"}{renegotiateHeldIds.size ? ` (${renegotiateHeldIds.size} held)` : ""}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setRenegotiateOpen(false); setRenegotiateReason(""); setRenegotiateHeldIds(new Set()); }}>Cancel</Button>
          </div>
        </div>)}
    </div>);
}
function QuotationLineItemEditor({ quotationId, items, articles, }: {
    quotationId: string;
    items: import("@/lib/rdash/types").LineItem[];
    articles: import("@/lib/rdash/types").Article[];
}) {
    const addQuotationItem = useRDashStore((s) => s.addQuotationItem);
    const updateQuotationItem = useRDashStore((s) => s.updateQuotationItem);
    const removeQuotationItem = useRDashStore((s) => s.removeQuotationItem);
    const units = useRDashStore((s) => s.db.master.units);
    const categories = useRDashStore((s) => s.db.master.workCategories);
    const [adding, setAdding] = React.useState(false);
    const [newTitle, setNewTitle] = React.useState("");
    const [newQty, setNewQty] = React.useState("1");
    const [newRate, setNewRate] = React.useState("0");
    const [newUnit, setNewUnit] = React.useState("nos");
    const [suggestIdx, setSuggestIdx] = React.useState(-1);
    const [showSuggest, setShowSuggest] = React.useState(false);
    const [itemFilesId, setItemFilesId] = React.useState<string | null>(null);
    const titleWrapRef = React.useRef<HTMLDivElement>(null);
    const total = items.reduce((n, i) => n + i.amount, 0);
    const suggestions = React.useMemo(() => {
        const q = newTitle.trim().toLowerCase();
        if (!q || !showSuggest)
            return [];
        return articles
            .filter((a) => a.name.toLowerCase().includes(q))
            .slice(0, 6)
            .map((a) => {
            const unit = a.unit_id ? units.find((u) => u.id === a.unit_id)?.symbol : null;
            const cat = a.category_id ? categories.find((c) => c.id === a.category_id)?.name : null;
            return { article: a, unitName: unit, categoryName: cat };
        });
    }, [articles, newTitle, showSuggest, units, categories]);
    React.useEffect(() => {
        if (!showSuggest)
            return;
        const onClick = (e: MouseEvent) => {
            if (titleWrapRef.current && !titleWrapRef.current.contains(e.target as Node)) {
                setShowSuggest(false);
            }
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [showSuggest]);
    const applySuggestion = (s: {
        article: import("@/lib/rdash/types").Article;
        unitName: string | null | undefined;
    }) => {
        setNewTitle(s.article.name);
        if (s.article.base_rate)
            setNewRate(String(s.article.base_rate));
        if (s.unitName)
            setNewUnit(s.unitName);
        setShowSuggest(false);
        setSuggestIdx(-1);
    };
    const handleAdd = () => {
        if (!newTitle.trim()) {
            toast.error("Item title is required");
            return;
        }
        const qty = parseFloat(newQty) || 1;
        const rate = parseFloat(newRate) || 0;
        const match = articles.find((a) => a.name.toLowerCase() === newTitle.trim().toLowerCase());
        const matchedUnit = match?.unit_id ? units.find((u) => u.id === match.unit_id)?.symbol : null;
        try {
            addQuotationItem(quotationId, {
                title: newTitle.trim(),
                quantity: qty,
                rate: match?.base_rate ?? rate,
                unit_id: match?.unit_id,
                unit_name: matchedUnit ?? newUnit,
                article_id: match?.id,
                category_id: match?.category_id,
            });
            toast.success(`Added "${newTitle.trim()}"`);
            setNewTitle("");
            setNewQty("1");
            setNewRate("0");
            setNewUnit("nos");
            setShowSuggest(false);
            setSuggestIdx(-1);
            setAdding(false);
        }
        catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not add the line item.");
        }
    };
    return (<div className="overflow-hidden rounded-lg border border-border">

      <div className="grid grid-cols-[1.6fr_0.5fr_0.6fr_0.6fr_0.3fr] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>Item</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Amount</span>
        <span></span>
      </div>

      {items.length === 0 ? (<div className="px-3 py-6 text-center text-xs text-muted-foreground">
          No line items yet. Click "Add item" to build the quotation.
        </div>) : (items.map((it) => (<div key={it.id} className="group grid grid-cols-[1.6fr_0.5fr_0.6fr_0.6fr_0.3fr] gap-2 border-b border-border px-3 py-1.5 text-xs last:border-0 hover:bg-accent/20">
            <input type="text" defaultValue={it.title} onBlur={(e) => { if (e.target.value !== it.title)
            updateQuotationItem(quotationId, it.id, { title: e.target.value }); }} className="min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 font-medium text-foreground hover:border-border focus:border-primary focus:bg-card focus:outline-none"/>
            <input type="number" defaultValue={it.quantity} min="0" step="0.01" onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== it.quantity)
            updateQuotationItem(quotationId, it.id, { quantity: v }); }} className="rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono hover:border-border focus:border-primary focus:bg-card focus:outline-none"/>
            <input type="number" defaultValue={it.rate} min="0" step="1" onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== it.rate)
            updateQuotationItem(quotationId, it.id, { rate: v }); }} className="rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-muted-foreground hover:border-border focus:border-primary focus:bg-card focus:outline-none"/>
            <span className="py-0.5 text-right font-mono font-semibold text-foreground">{formatINR(it.amount)}</span>
            <div className="flex items-center justify-center gap-0.5">
              <button type="button" onClick={() => setItemFilesId(it.id)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Files for ${it.title}`} title="Line-item files"><Paperclip className="h-3 w-3"/></button>
              <button type="button" onClick={() => { removeQuotationItem(quotationId, it.id); toast.success("Item removed"); }} className="flex items-center justify-center rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove ${it.title}`}>
                <Trash2 className="h-3.5 w-3.5"/>
              </button>
            </div>
          </div>)))}

      <div className="grid grid-cols-[1.6fr_0.5fr_0.6fr_0.6fr_0.3fr] gap-2 bg-muted/30 px-3 py-2 text-xs font-bold">
        <span>Subtotal</span>
        <span />
        <span />
        <span className="text-right font-mono text-primary">{formatINR(total)}</span>
        <span />
      </div>

      {adding ? (<div className="grid grid-cols-[1.6fr_0.5fr_0.6fr_0.6fr_0.3fr] gap-2 border-t border-border bg-primary/[0.03] px-3 py-2 text-xs">
          <div ref={titleWrapRef} className="relative min-w-0">
            <input type="text" value={newTitle} onChange={(e) => { setNewTitle(e.target.value); setShowSuggest(true); setSuggestIdx(-1); }} onKeyDown={(e) => {
                if (e.key === "Enter") {
                    if (suggestIdx >= 0 && suggestions[suggestIdx]) {
                        e.preventDefault();
                        applySuggestion(suggestions[suggestIdx]);
                        return;
                    }
                    handleAdd();
                }
                if (e.key === "Escape") {
                    if (showSuggest) {
                        setShowSuggest(false);
                    }
                    else {
                        setAdding(false);
                    }
                }
                if (e.key === "ArrowDown" && suggestions.length > 0) {
                    e.preventDefault();
                    setShowSuggest(true);
                    setSuggestIdx((i) => Math.min(i + 1, suggestions.length - 1));
                }
                if (e.key === "ArrowUp" && suggestions.length > 0) {
                    e.preventDefault();
                    setSuggestIdx((i) => Math.max(i - 1, 0));
                }
            }} onFocus={() => setShowSuggest(true)} placeholder="Type to search articles…" autoFocus className="min-w-0 w-full rounded border border-border bg-card px-1.5 py-1 text-foreground outline-none focus:border-primary" role="combobox" aria-expanded={showSuggest && suggestions.length > 0} aria-controls="article-suggest-list" aria-activedescendant={suggestIdx >= 0 ? `article-suggest-${suggestIdx}` : undefined}/>
            {showSuggest && suggestions.length > 0 && (<div id="article-suggest-list" role="listbox" className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-md border border-border bg-card shadow-popover animate-scale-in">
                <div className="border-b border-border bg-muted/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Articles</div>
                {suggestions.map((s, i) => (<button key={s.article.id} id={`article-suggest-${i}`} role="option" aria-selected={i === suggestIdx} type="button" onMouseEnter={() => setSuggestIdx(i)} onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }} className={cn("flex w-full items-center justify-between gap-2 border-b border-border px-2 py-1.5 text-left last:border-0 transition-colors", i === suggestIdx ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-xs font-medium", i === suggestIdx ? "text-primary-foreground" : "text-foreground")}>{s.article.name}</p>
                      <p className={cn("truncate text-[10px]", i === suggestIdx ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {s.categoryName || "Uncategorized"}{s.unitName ? ` · ${s.unitName}` : ""}
                      </p>
                    </div>
                    {s.article.base_rate != null && (<span className={cn("shrink-0 font-mono text-[10px] font-semibold", i === suggestIdx ? "text-primary-foreground" : "text-primary")}>{formatINR(s.article.base_rate)}</span>)}
                  </button>))}
              </div>)}
          </div>
          <input type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter")
            handleAdd(); if (e.key === "Escape")
            setAdding(false); }} min="0" step="0.01" className="rounded border border-border bg-card px-1.5 py-1 text-right font-mono outline-none focus:border-primary"/>
          <input type="number" value={newRate} onChange={(e) => setNewRate(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter")
            handleAdd(); if (e.key === "Escape")
            setAdding(false); }} min="0" step="1" placeholder="auto" className="rounded border border-border bg-card px-1.5 py-1 text-right font-mono outline-none focus:border-primary"/>
          <span className="py-1 text-right font-mono text-muted-foreground">—</span>
          <div className="flex items-center justify-center gap-0.5">
            <button type="button" onClick={handleAdd} className="rounded p-1 text-primary hover:bg-primary/10" aria-label="Confirm add"><Plus className="h-3.5 w-3.5"/></button>
            <button type="button" onClick={() => setAdding(false)} className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Cancel add"><X className="h-3.5 w-3.5"/></button>
          </div>
        </div>) : (<button type="button" onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-1.5 border-t border-dashed border-border py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground">
          <Plus className="h-3.5 w-3.5"/> Add item
        </button>)}
      <Dialog open={Boolean(itemFilesId)} onOpenChange={(open) => { if (!open) setItemFilesId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Quotation line files</DialogTitle><DialogDescription>Attach only documents or approvals that apply specifically to this line item.</DialogDescription></DialogHeader>
          {itemFilesId ? <EntityFilesCard entityType="quotation_item" entityId={itemFilesId} title="Line-item files" manage showEmpty /> : null}
        </DialogContent>
      </Dialog>
    </div>);
}
const DUE_EVENTS = [
    { value: "on_acceptance", label: "On acceptance" },
    { value: "on_order", label: "On order" },
    { value: "on_delivery", label: "On delivery" },
    { value: "on_installation", label: "On installation" },
    { value: "on_handover", label: "On handover" },
    { value: "on_completion", label: "On completion" },
];
function QuotationMilestoneEditor({ quotationId, milestones, totalAmount, }: {
    quotationId: string;
    milestones: import("@/lib/rdash/types").PaymentTerm[];
    totalAmount: number;
}) {
    const addMilestone = useRDashStore((s) => s.addQuotationMilestone);
    const updateMilestone = useRDashStore((s) => s.updateQuotationMilestone);
    const removeMilestone = useRDashStore((s) => s.removeQuotationMilestone);
    const [adding, setAdding] = React.useState(false);
    const [newLabel, setNewLabel] = React.useState("");
    const [newPct, setNewPct] = React.useState("0");
    const [newEvent, setNewEvent] = React.useState("on_acceptance");
    const totalPct = milestones.reduce((n, m) => n + m.percentage, 0);
    const isComplete = totalPct === 100;
    const isOver = totalPct > 100;
    const handleAdd = () => {
        if (!newLabel.trim()) {
            toast.error("Milestone label is required");
            return;
        }
        const pct = parseFloat(newPct) || 0;
        if (totalPct + pct > 100) {
            toast.error(`Total would exceed 100% (currently ${totalPct}%)`);
            return;
        }
        addMilestone(quotationId, { label: newLabel.trim(), percentage: pct, due_event: newEvent });
        toast.success(`Milestone "${newLabel.trim()}" added`);
        setNewLabel("");
        setNewPct("0");
        setNewEvent("on_acceptance");
        setAdding(false);
    };
    return (<div className="overflow-hidden rounded-lg border border-border">

      <div className="grid grid-cols-[1.5fr_0.5fr_1fr_0.3fr] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>Milestone</span>
        <span className="text-right">%</span>
        <span>Due event</span>
        <span></span>
      </div>

      {milestones.length === 0 ? (<div className="px-3 py-6 text-center text-xs text-muted-foreground">
          No milestones. Add payment stages (e.g. Advance 30%, On delivery 50%, On handover 20%).
        </div>) : (milestones.map((m) => (<div key={m.id} className="group grid grid-cols-[1.5fr_0.5fr_1fr_0.3fr] gap-2 border-b border-border px-3 py-1.5 text-xs last:border-0 hover:bg-accent/20">
            <input type="text" defaultValue={m.label} onBlur={(e) => { if (e.target.value !== m.label)
            updateMilestone(quotationId, m.id, { label: e.target.value }); }} className="min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 font-medium text-foreground hover:border-border focus:border-primary focus:bg-card focus:outline-none"/>
            <input type="number" defaultValue={m.percentage} min="0" max="100" step="5" onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== m.percentage)
            updateMilestone(quotationId, m.id, { percentage: v }); }} className="rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono hover:border-border focus:border-primary focus:bg-card focus:outline-none"/>
            <select defaultValue={m.due_event} onChange={(e) => updateMilestone(quotationId, m.id, { due_event: e.target.value })} className="min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-muted-foreground hover:border-border focus:border-primary focus:bg-card focus:outline-none">
              {DUE_EVENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <button type="button" onClick={() => { removeMilestone(quotationId, m.id); toast.success("Milestone removed"); }} className="flex items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove ${m.label}`}>
              <Trash2 className="h-3.5 w-3.5"/>
            </button>
          </div>)))}

      <div className={cn("grid grid-cols-[1.5fr_0.5fr_1fr_0.3fr] gap-2 px-3 py-2 text-xs font-bold", isOver ? "bg-destructive/10" : isComplete ? "bg-success/10" : "bg-muted/30")}>
        <span>Total</span>
        <span className={cn("text-right font-mono", isOver ? "text-destructive" : isComplete ? "text-success" : "text-foreground")}>{totalPct}%</span>
        <span className="font-mono font-semibold text-muted-foreground">{formatINR(Math.round(totalAmount * totalPct / 100))}</span>
        <span></span>
      </div>

      {adding ? (<div className="grid grid-cols-[1.5fr_0.5fr_1fr_0.3fr] gap-2 border-t border-border bg-primary/[0.03] px-3 py-2 text-xs">
          <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter")
            handleAdd(); if (e.key === "Escape")
            setAdding(false); }} placeholder="Milestone label…" autoFocus className="min-w-0 rounded border border-border bg-card px-1.5 py-1 text-foreground outline-none focus:border-primary"/>
          <input type="number" value={newPct} onChange={(e) => setNewPct(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter")
            handleAdd(); if (e.key === "Escape")
            setAdding(false); }} min="0" max="100" step="5" className="rounded border border-border bg-card px-1.5 py-1 text-right font-mono outline-none focus:border-primary"/>
          <select value={newEvent} onChange={(e) => setNewEvent(e.target.value)} className="min-w-0 rounded border border-border bg-card px-1.5 py-1 text-muted-foreground outline-none focus:border-primary">
            {DUE_EVENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <div className="flex items-center justify-center gap-0.5">
            <button type="button" onClick={handleAdd} className="rounded p-1 text-primary hover:bg-primary/10" aria-label="Confirm add"><Plus className="h-3.5 w-3.5"/></button>
            <button type="button" onClick={() => setAdding(false)} className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Cancel add"><X className="h-3.5 w-3.5"/></button>
          </div>
        </div>) : (<button type="button" onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-1.5 border-t border-dashed border-border py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground">
          <Plus className="h-3.5 w-3.5"/> Add milestone
        </button>)}
    </div>);
}
type JobInnerTab = "overview" | "bidding" | "settlement";
function JobOverview({ j }: {
    j: import("@/lib/rdash/types").WorkOrder;
}) {
    const [innerTab, setInnerTab] = React.useState<JobInnerTab>("overview");
    const db = useRDashStore((s) => s.db);
    React.useEffect(() => {
        if (j.status === "abandoned")
            setInnerTab("settlement");
        else if (j.replacement_for_work_order_id)
            setInnerTab("overview");
    }, [j.id, j.status, j.replacement_for_work_order_id]);
    const jobBidsCount = db.contractorBids.filter((b) => b.work_order_id === j.id).length;
    const settlementCount = db.contractorSettlements.filter((s) => s.work_order_id === j.id).length;
    const tabs: Array<{
        key: JobInnerTab;
        label: string;
        icon: React.ReactNode;
        count?: number;
    }> = [
        { key: "overview", label: "Overview", icon: <Building2 className="h-3.5 w-3.5"/> },
        { key: "bidding", label: "Bidding", icon: <Gavel className="h-3.5 w-3.5"/>, count: jobBidsCount },
        { key: "settlement", label: "Settlement", icon: <HandCoins className="h-3.5 w-3.5"/>, count: settlementCount },
    ];
    return (<div className="flex h-full flex-col">

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto rd-scroll rd-scroll-fade border-b border-border px-3 py-2">
        {tabs.map((t) => (<button key={t.key} type="button" onClick={() => setInnerTab(t.key)} className={cn("flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap", innerTab === t.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground")}>
            {t.icon}
            {t.label}
            {t.count != null && t.count > 0 && (<span className={cn("ml-0.5 rounded-full px-1.5 text-[10px] font-bold", innerTab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{t.count}</span>)}
          </button>))}
      </div>
      <div className="flex-1 overflow-y-auto rd-scroll">
        {innerTab === "overview" && <JobOverviewBody j={j}/>}
        {innerTab === "bidding" && <JobBiddingBody j={j}/>}
        {innerTab === "settlement" && <JobSettlementBody j={j}/>}
      </div>
    </div>);
}
function JobOverviewBody({ j }: {
    j: import("@/lib/rdash/types").WorkOrder;
}) {
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const updateJob = useRDashStore((s) => s.updateJob);
    const db = useRDashStore((s) => s.db);
    const pnl = computeJobPnL(db, j.id);
    const st = jobStatusStyle(j.status);
    const boq = db.boqs.find((b) => b.work_order_id === j.id);
    const pos = db.purchaseOrders.filter((p) => p.work_order_id === j.id);
    const grns = db.grns.filter((g) => g.work_order_id === j.id);
    const dispatches = db.dispatches.filter((d) => d.work_order_id === j.id);
    const drawings = db.drawings.filter((d) => d.work_order_id === j.id);
    const executionLogs = db.executionLogs.filter((log) => log.work_order_id === j.id);
    const costLines = db.workOrderCostLines.filter((c) => c.work_order_id === j.id);
    const site = j.site_id ? db.sites.find((s) => s.id === j.site_id) : undefined;
    const customer = db.customers.find((p) => p.id === j.customer_id || p.id === j.customer_id);
    const visits = db.visits.filter((v) => v.work_order_id === j.id || v.customer_id === j.customer_id);
    const materialResponsibility = j.material_responsibility || (j.with_material === true ? "contractor" : j.with_material === false ? "company" : undefined);
    const modeHint = materialResponsibility === "company"
        ? "Company supplies material — approved BOQ lines can enter vendor RFQ, PO and GRN flow"
        : materialResponsibility === "contractor"
            ? "Contractor supplies material — vendor procurement is not opened for this work order; contractor cost is tracked separately"
            : materialResponsibility === "customer"
                ? "Customer supplies material — record issue/proof only; do not create company vendor procurement"
                : "Material responsibility is not set — choose it before procurement planning";
    return (<div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={(j.customer_name || "Customer")} size={42}/>
          <div>
            <p className="text-base font-bold">{j.title}</p>
            <p className="text-xs text-muted-foreground">{j.work_order_no} · {j.contractor_name || "Unassigned"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {j.contractor_selection_method === "direct_award" && <span title={j.contractor_award_reason || "Direct award (no formal bid round)"} className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning"><Zap className="h-2.5 w-2.5"/>Direct Award</span>}
          {j.contractor_selection_method === "bid" && <span title="Formal bid round (competitively vetted)" className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">Competitive</span>}
          <StatusBadge label={st.label} className={st.className}/>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Customer committed value" value={formatINR(j.value)} mono/>
        <Field label="Contractor award" value={j.contractor_award_amount != null ? formatINR(j.contractor_award_amount) : "—"} mono/>
        <Field label="Progress" value={`${j.progress}%`}/>
        <Field label="Start" value={formatDate(j.start_date)}/>
        <Field label="Expected end" value={j.expected_end ? formatDate(j.expected_end) : "—"}/>
        <Field label="Site" value={site ? site.name : j.site_address || "—"}/>
        <Field label="Contractor" value={j.contractor_name || "—"}/>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Material responsibility</label>
          <select value={materialResponsibility || ""} onChange={(e) => {
            const v = e.target.value as "company" | "contractor" | "customer" | "";
            updateJob(j.id, {
                material_responsibility: v || undefined,
                with_material: v === "contractor" ? true : v === "company" ? false : undefined,
            });
            toast.success(v === "company" ? "Company-procured material enabled" : v === "contractor" ? "Contractor-supplied material enabled" : v === "customer" ? "Customer-supplied material enabled" : "Material responsibility cleared");
        }} className="h-8 rounded-md border border-input bg-card px-2 text-xs">
            <option value="">— select responsibility —</option>
            <option value="company">Company procures</option>
            <option value="contractor">Contractor supplies</option>
            <option value="customer">Customer supplies</option>
          </select>
        </div>
        {j.replacement_for_work_order_id && (<Field label="Replacement for" value={db.workOrders.find((x) => x.id === j.replacement_for_work_order_id)?.work_order_no || "—"}/>)}
      </div>

      <div className={cn("mt-3 rounded-md border p-2.5 text-[11px]", materialResponsibility === "company" ? "border-primary/30 bg-primary/[0.05] text-primary" : materialResponsibility === "contractor" ? "border-warning/30 bg-warning/[0.05] text-warning" : materialResponsibility === "customer" ? "border-success/30 bg-success/[0.05] text-success" : "border-border bg-muted/30 text-muted-foreground")}>
        <span className="font-semibold">Procurement: </span>{modeHint}
      </div>
      <EntityFilesCard entityType="workOrder" entityId={j.id} title="Work Order files" manage showEmpty />
      {j.status === "abandoned" && (<div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/[0.05] p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive"/>
            <p className="text-xs font-semibold uppercase text-destructive">Contractor abandoned mid-work</p>
          </div>
          <p className="mt-1.5 text-xs text-foreground/80">
            <strong>{j.abandoned_contractor_name}</strong> left this workOrder at {j.progress}% completion. {j.abandoned_reason}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Abandoned on {j.abandoned_at ? formatDate(j.abandoned_at) : "—"}. Open the Settlement tab to view the settlement voucher and replacement bidding round.</p>
        </div>)}
      {pnl && (<div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live P&L</p>
            <StatusPill label={`${pnl.margin_pct}% margin`} tone={pnl.margin_pct > 20 ? "success" : pnl.margin_pct > 5 ? "warning" : "destructive"}/>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div><span className="text-muted-foreground">Contract value</span><p className="font-mono font-semibold text-success">{formatINRShort(pnl.contracted_revenue)}</p></div>
            <div><span className="text-muted-foreground">Cost</span><p className="font-mono font-semibold text-destructive">{formatINRShort(pnl.total_cost)}</p></div>
            <div><span className="text-muted-foreground">Margin</span><p className="font-mono font-semibold">{formatINRShort(pnl.gross_margin)}</p></div>
          </div>
        </div>)}
      <div className="mt-4 space-y-1.5">
        <LinkedRow icon={<User className="h-3.5 w-3.5"/>} label="Customer" value={customer?.name || (j.customer_name || "Customer")} onClick={customer ? () => openDetail("customer", customer.id) : undefined}/>
        <LinkedRow icon={<MapPin className="h-3.5 w-3.5"/>} label="Field Visits" value={`${visits.length} visit${visits.length === 1 ? "" : "s"}`} onClick={() => setActiveModule("fieldOperations")}/>
        <LinkedRow icon={<Gavel className="h-3.5 w-3.5"/>} label="Contractor Matching" value={j.contractor_name || "Open matching"} onClick={() => setActiveModule("siteExecution")}/>
        <LinkedRow icon={<FileText className="h-3.5 w-3.5"/>} label="BOQ" value={boq ? boq.title : "Not created"} onClick={boq ? () => openDetail("boq", boq.id) : undefined}/>
        <LinkedRow icon={<Package className="h-3.5 w-3.5"/>} label="Purchase Orders" value={`${pos.length} POs`} onClick={() => setActiveModule("procurementInventory")}/>
        <LinkedRow icon={<Truck className="h-3.5 w-3.5"/>} label="GRNs" value={`${grns.length} receipts`} onClick={() => setActiveModule("grn")}/>
        <LinkedRow icon={<Wrench className="h-3.5 w-3.5"/>} label="Site dispatches" value={`${dispatches.length} issues`} onClick={() => setActiveModule("dispatch")}/>
        <LinkedRow icon={<FileText className="h-3.5 w-3.5"/>} label="Drawings" value={`${drawings.length} drawing${drawings.length === 1 ? "" : "s"}`} onClick={() => setActiveModule("drawings")}/>
        <LinkedRow icon={<History className="h-3.5 w-3.5"/>} label="Execution logs" value={`${executionLogs.length} log${executionLogs.length === 1 ? "" : "s"}`} onClick={() => setActiveModule("executionLogs")}/>

        <LinkedRow icon={<History className="h-3.5 w-3.5"/>} label="Cost lines" value={`${costLines.length} entries · ${formatINRShort(costLines.reduce((n, c) => n + c.amount, 0))}`} onClick={() => setActiveModule("workOrderPnl")}/>
        <LinkedRow icon={<AlertCircle className="h-3.5 w-3.5"/>} label="Obstacles" value={`${db.blocked.filter((b) => b.linked_work_order_id === j.id).length} blocked`} onClick={() => setActiveModule("blockedRisks")}/>
      </div>
    </div>);
}
function JobBiddingBody({ j }: {
    j: import("@/lib/rdash/types").WorkOrder;
}) {
    const db = useRDashStore((s) => s.db);
    const addContractorBid = useRDashStore((s) => s.addContractorBid);
    const selectContractorBid = useRDashStore((s) => s.selectContractorBid);
    const reopenJobForBidding = useRDashStore((s) => s.reopenJobForBidding);
    const [addOpen, setAddOpen] = React.useState(false);
    const [selContractor, setSelContractor] = React.useState("");
    const [scope, setScope] = React.useState("");
    const [amount, setAmount] = React.useState("");
    const [days, setDays] = React.useState("");
    const [withMaterial, setWithMaterial] = React.useState(true);
    const [bidFilesId, setBidFilesId] = React.useState<string | null>(null);
    const bids = db.contractorBids
        .filter((b) => b.work_order_id === j.id)
        .sort((a, b) => (a.quote_amount || 0) - (b.quote_amount || 0));
    const cheapest = bids.length > 0 ? bids[0] : null;
    const mostReliable = bids.length > 0
        ? bids.slice().sort((a, b) => (b.reliability_score || 0) - (a.reliability_score || 0))[0]
        : null;
    const handleSubmit = () => {
        if (!selContractor) {
            toast.error("Pick a contractor");
            return;
        }
        addContractorBid({
            work_order_id: j.id,
            contractor_id: selContractor,
            scope: scope || j.title,
            quote_amount: amount ? parseFloat(amount) : undefined,
            estimated_days: days ? parseInt(days) : undefined,
            with_material: withMaterial,
        });
        toast.success("Bid added — comparison updated");
        setAddOpen(false);
        setSelContractor("");
        setScope("");
        setAmount("");
        setDays("");
        setWithMaterial(true);
    };
    return (<div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold"><Gavel className="h-4 w-4 text-primary"/> Contractor Bidding</p>
          <p className="text-[11px] text-muted-foreground">Compare quotes, reliability, and on-time % — then award the workOrder.</p>
        </div>
        <div className="flex gap-2">
          {j.contractor_id && (j.status === "scheduled" || j.status === "on_hold") && (<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { reopenJobForBidding(j.id); toast.success("Bidding re-opened — collect new quotes"); }}>
              Re-open bidding
            </Button>)}
          <Button size="sm" className="h-7 text-xs" onClick={() => setAddOpen((v) => !v)}>
            <Plus className="mr-1 h-3.5 w-3.5"/> Add bid
          </Button>
        </div>
      </div>


      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className={cn("rounded-full px-2 py-0.5 font-medium", j.contractor_id ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
          {j.contractor_id ? `Awarded: ${j.contractor_name}` : "Not yet awarded"}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">{bids.length} bid{bids.length === 1 ? "" : "s"} received</span>
      </div>


      {addOpen && (<div className="mt-3 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
          <p className="mb-2 text-xs font-semibold">New bid for {j.work_order_no}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Contractor</label>
              <select value={selContractor} onChange={(e) => setSelContractor(e.target.value)} className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm">
                <option value="">Pick contractor…</option>
                {db.master.contractors.map((c) => (<option key={c.id} value={c.id}>{c.name} · {c.trade} · {c.city}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Quote amount (₹)</label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="lump-sum quote" className="h-8 text-sm"/>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Estimated days</label>
              <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} placeholder="duration" className="h-8 text-sm"/>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Engagement mode</label>
              <select value={withMaterial ? "y" : "n"} onChange={(e) => setWithMaterial(e.target.value === "y")} className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm">
                <option value="y">With material</option>
                <option value="n">Labour-only</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Scope</label>
              <Textarea value={scope} onChange={(e) => setScope(e.target.value)} placeholder="What the bid covers…" rows={2} className="text-sm"/>
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={!selContractor}>Submit bid</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddOpen(false)}>Cancel</Button>
          </div>
        </div>)}


      {bids.length === 0 ? (<div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 py-6 text-center text-xs text-muted-foreground">
          No bids yet. Click <strong>Add bid</strong> to record a contractor's quote.
        </div>) : (<div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2.5 py-2">Contractor</th>
                <th className="px-2.5 py-2 text-right">Quote</th>
                <th className="px-2.5 py-2 text-right">Days</th>
                <th className="px-2.5 py-2 text-right">Reliability</th>
                <th className="px-2.5 py-2 text-right">On-time %</th>
                <th className="px-2.5 py-2 text-right">Past workOrders</th>
                <th className="px-2.5 py-2 text-right">Rating</th>
                <th className="px-2.5 py-2">Status</th>
                <th className="px-2.5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {bids.map((b) => (<tr key={b.id} className="border-t border-border align-top hover:bg-accent/20">
                  <td className="px-2.5 py-2">
                    <p className="font-semibold">{b.contractor_name}</p>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 max-w-[200px]">{b.scope}</p>
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono font-semibold">
                    {b.quote_amount ? formatINR(b.quote_amount) : "—"}
                    {b === cheapest && <span className="ml-1 text-[10px] font-bold text-success">★ LOW</span>}
                  </td>
                  <td className="px-2.5 py-2 text-right">{b.estimated_days || "—"}</td>
                  <td className="px-2.5 py-2 text-right">
                    <span className={cn("font-mono font-semibold", b === mostReliable ? "text-success" : "")}>{b.reliability_score ?? "—"}</span>
                    {b === mostReliable && <span className="ml-1 text-[10px] font-bold text-success">★ BEST</span>}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono">{b.on_time_pct != null ? `${b.on_time_pct}%` : "—"}</td>
                  <td className="px-2.5 py-2 text-right font-mono">{b.past_jobs_count ?? "—"}</td>
                  <td className="px-2.5 py-2 text-right">
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-warning text-warning"/>{b.rating ?? "—"}
                    </span>
                  </td>
                  <td className="px-2.5 py-2">
                    <StatusBadge label={b.status === "selected" ? "Selected" : b.status === "rejected" ? "Rejected" : b.status === "withdrawn" ? "Withdrawn" : "Submitted"} className={b.status === "selected" ? "bg-success/10 text-success border-success/20" : b.status === "rejected" || b.status === "withdrawn" ? "bg-muted text-muted-foreground border-border" : "bg-primary/10 text-primary border-primary/20"}/>
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setBidFilesId(b.id)}>Files</Button>
                      {(b.status === "submitted") && (<Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { selectContractorBid(b.id); toast.success(`${b.contractor_name} awarded ${j.work_order_no}`); }}>
                          Award
                        </Button>)}
                    </div>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
      <Dialog open={Boolean(bidFilesId)} onOpenChange={(open) => { if (!open) setBidFilesId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Contractor bid files</DialogTitle><DialogDescription>Keep the contractor's quotation and bid-specific documents with the bid itself.</DialogDescription></DialogHeader>
          {bidFilesId ? <EntityFilesCard entityType="contractor_bid" entityId={bidFilesId} title="Bid files" manage showEmpty /> : null}
        </DialogContent>
      </Dialog>
    </div>);
}
function JobSettlementBody({ j }: {
    j: import("@/lib/rdash/types").WorkOrder;
}) {
    const db = useRDashStore((s) => s.db);
    const settleContractor = useRDashStore((s) => s.settleContractor);
    const [settleOpen, setSettleOpen] = React.useState(false);
    const [completedPct, setCompletedPct] = React.useState("");
    const [reason, setReason] = React.useState("");
    const [advances, setAdvances] = React.useState("");
    const [materials, setMaterials] = React.useState("");
    const [recoveries, setRecoveries] = React.useState("");
    const [createReplacement, setCreateReplacement] = React.useState(true);
    const settlements = db.contractorSettlements.filter((s) => s.work_order_id === j.id);
    const replacementJob = db.workOrders.find((x) => x.replacement_for_work_order_id === j.id);
    const cp = Math.max(0, Math.min(100, parseFloat(completedPct) || 0));
    const adv = parseFloat(advances) || 0;
    const mat = parseFloat(materials) || 0;
    const rec = parseFloat(recoveries) || 0;
    const payable = Math.max(0, Math.round((cp / 100) * j.value - adv - mat + rec));
    const handleSettle = () => {
        const result = settleContractor({
            workOrderId: j.id,
            completedPct: cp,
            reason: reason || "Contractor abandoned mid-work",
            advancesPaid: adv,
            materialsIssuedValue: mat,
            recoveries: rec,
            type: "abandonment",
            createReplacementJob: createReplacement,
        });
        if (result.settlementId) {
            toast.success(`Settled for ${formatINR(payable)}${result.replacementJobId ? " · replacement workOrder opened for new bidding" : ""}`);
            setSettleOpen(false);
            setCompletedPct("");
            setReason("");
            setAdvances("");
            setMaterials("");
            setRecoveries("");
        }
        else {
            toast.error("Could not settle — no contractor on this workOrder");
        }
    };
    return (<div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold"><HandCoins className="h-4 w-4 text-primary"/> Settlement &amp; Abandonment</p>
          <p className="text-[11px] text-muted-foreground">Pay only for completed work — then re-open for replacement bidding.</p>
        </div>
        {j.contractor_id && j.status !== "abandoned" && (<Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setSettleOpen(true)}>
            <AlertCircle className="mr-1 h-3.5 w-3.5"/> Settle &amp; abandon
          </Button>)}
      </div>
      {settlements.length === 0 ? (<div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 py-6 text-center text-xs text-muted-foreground">
          No settlements on this workOrder yet. Use <strong>Settle &amp; abandon</strong> when a contractor leaves mid-work.
        </div>) : (<div className="mt-4 flex flex-col gap-3">
          {settlements.map((s) => (<div key={s.id} className="rounded-lg border border-border bg-card p-3 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">{s.settlement_no} · {s.contractor_name}</p>
                  <p className="text-[11px] text-muted-foreground">{s.work_order_no} · settled {formatDate(s.settled_at)}</p>
                </div>
                <StatusBadge label={s.type === "abandonment" ? "Abandonment" : s.type === "mutual_termination" ? "Mutual" : s.type === "partial_completion" ? "Partial" : "Final"} className="bg-destructive/10 text-destructive border-destructive/20"/>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-md bg-muted/40 p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Completed</p>
                  <p className="font-mono font-semibold">{s.completed_pct}%</p>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Contract value</p>
                  <p className="font-mono font-semibold">{formatINRShort(s.contract_value)}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Advances paid</p>
                  <p className="font-mono font-semibold">{formatINRShort(s.advances_paid)}</p>
                </div>
                <div className="rounded-md bg-success/10 p-2">
                  <p className="text-[10px] uppercase text-success">Payable</p>
                  <p className="font-mono font-bold text-success">{formatINR(s.payable_amount)}</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-foreground/80">{s.reason}</p>
              <EntityFilesCard entityType="contractor_settlement" entityId={s.id} title="Settlement files" manage showEmpty />
              {s.replacement_work_order_id && (<p className="mt-1.5 text-[11px] text-primary">
                  → Replacement workOrder: <strong>{db.workOrders.find((x) => x.id === s.replacement_work_order_id)?.work_order_no || s.replacement_work_order_id}</strong> (open the Bidding tab on that workOrder to view the new bidding round)
                </p>)}
            </div>))}
        </div>)}
      {replacementJob && (<div className="mt-3 rounded-lg border border-primary/30 bg-primary/[0.05] p-3">
          <p className="text-xs font-semibold text-primary">Replacement workOrder: {replacementJob.work_order_no}</p>
          <p className="text-[11px] text-muted-foreground">
            Status: {replacementJob.status} · Awarded to: {replacementJob.contractor_name || "—"} · Value: {formatINR(replacementJob.value)}
          </p>
        </div>)}
      {settleOpen && (<div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/[0.04] p-3">
          <p className="mb-2 text-xs font-semibold">Settle {j.contractor_name} on {j.work_order_no}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Work completed %</label>
              <Input type="number" min="0" max="100" value={completedPct} onChange={(e) => setCompletedPct(e.target.value)} placeholder="e.g. 50" className="h-8 text-sm" autoFocus/>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Advances already paid (₹)</label>
              <Input type="number" value={advances} onChange={(e) => setAdvances(e.target.value)} placeholder="0" className="h-8 text-sm"/>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Materials issued value (₹)</label>
              <Input type="number" value={materials} onChange={(e) => setMaterials(e.target.value)} placeholder="0" className="h-8 text-sm"/>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Recoveries (₹)</label>
              <Input type="number" value={recoveries} onChange={(e) => setRecoveries(e.target.value)} placeholder="0" className="h-8 text-sm"/>
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Reason</label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Contractor completed only the bathroom + bedroom flooring then refused to continue." rows={2} className="text-sm"/>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={createReplacement} onChange={(e) => setCreateReplacement(e.target.checked)}/>
              Open replacement workOrder for new bidding round
            </label>
          </div>
          <div className="mt-3 rounded-md bg-background p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Payable = ({cp}% × {formatINR(j.value)}) − {formatINR(adv)} − {formatINR(mat)} + {formatINR(rec)}</span>
              <span className="font-mono text-base font-bold text-success">{formatINR(payable)}</span>
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleSettle} disabled={!completedPct}>
              <HandCoins className="mr-1 h-3.5 w-3.5"/> Confirm settlement
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSettleOpen(false)}>Cancel</Button>
          </div>
        </div>)}
    </div>);
}
function POOverview({ po }: {
    po: import("@/lib/rdash/types").PurchaseOrder;
}) {
    const approvePO = useRDashStore((s) => s.approvePO);
    const sendPO = useRDashStore((s) => s.sendPO);
    const openDetail = useRDashStore((s) => s.openDetail);
    const st = poStatusStyle(po.status);
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold">{po.po_no}</p>
          <p className="text-xs text-muted-foreground">{po.vendor_name} · {po.work_order_no}</p>
        </div>
        <StatusBadge label={st.label} className={st.className}/>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Vendor" value={po.vendor_name}/>
        <Field label="Expected delivery" value={formatDate(po.expected_delivery)}/>
        <Field label="Total" value={formatINR(po.total_amount)} mono/>
        <Field label="Actual delivery" value={po.actual_delivery ? formatDate(po.actual_delivery) : "Pending"}/>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">PO items</p>
        <LineItemTable items={po.items}/>
      </div>
      <EntityFilesCard entityType="purchase_order" entityId={po.id} title="Purchase Order files" manage showEmpty />
      {po.grn_ids.length > 0 && (<div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked GRNs</p>
          <div className="space-y-1.5">
            {po.grn_ids.map((gid) => {
                const g = useRDashStore.getState().db.grns.find((x) => x.id === gid);
                if (!g)
                    return null;
                return <LinkedRow key={gid} icon={<Truck className="h-3.5 w-3.5"/>} label={g.grn_no} value={`${g.status} · ${formatDate(g.received_at)}`} onClick={() => openDetail("grn", gid)}/>;
            })}
          </div>
        </div>)}
      <div className="mt-5 flex flex-wrap gap-2">
        {po.status === "pending_approval" && (<Button size="sm" onClick={() => { try {
            approvePO(po.id);
            toast.success("PO approved");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "PO approval blocked");
        } }}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Approve
          </Button>)}
        {po.status === "approved" && (<Button size="sm" onClick={() => { sendPO(po.id); toast.success("PO sent to vendor"); }}>
            <Send className="mr-1.5 h-3.5 w-3.5"/> Send to Vendor
          </Button>)}
        <Button size="sm" variant="outline" onClick={() => { toast.info("Opening print view…"); setTimeout(() => window.print(), 300); }} className="no-print">
          <Download className="mr-1.5 h-3.5 w-3.5"/> Print / PDF
        </Button>
      </div>
    </div>);
}
function GRNOverview({ grn }: {
    grn: import("@/lib/rdash/types").GRN;
}) {
    const openDetail = useRDashStore((s) => s.openDetail);
    const st = grnStatusStyle(grn.status);
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold">{grn.grn_no}</p>
          <p className="text-xs text-muted-foreground">{grn.vendor_name} · against {grn.po_no}</p>
        </div>
        <StatusBadge label={st.label} className={st.className}/>
      </div>
      {grn.mismatch_notes && (<div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.06] p-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>
          <span>{grn.mismatch_notes}</span>
        </div>)}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Received at" value={formatDate(grn.received_at)}/>
        <Field label="Received by" value={grn.received_by || "—"}/>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Received items</p>
        <LineItemTable items={grn.items}/>
      </div>
      <EntityFilesCard entityType="grn" entityId={grn.id} title="Delivery challan & receiving evidence" manage showEmpty />
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked records</p>
        <div className="space-y-1.5">
          <LinkedRow icon={<FileText className="h-3.5 w-3.5"/>} label="Purchase Order" value={grn.po_no} onClick={() => openDetail("po", grn.po_id)}/>
          {grn.bill_id && <LinkedRow icon={<FileText className="h-3.5 w-3.5"/>} label="Vendor Bill" value="Generated" onClick={() => openDetail("vendorBill", grn.bill_id!)}/>}
        </div>
      </div>
    </div>);
}
function DispatchOverview({ d }: {
    d: import("@/lib/rdash/types").SiteDispatch;
}) {
    const ack = useRDashStore((s) => s.acknowledgeDispatch);
    const st = dispatchStatusStyle(d.status);
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold">{d.dispatch_no}</p>
          <p className="text-xs text-muted-foreground">{d.work_order_no} · {(d.customer_name || "Customer")}</p>
        </div>
        <StatusBadge label={st.label} className={st.className}/>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Issued at" value={formatDate(d.issued_at)}/>
        <Field label="Issued by" value={d.issued_by || "—"}/>
        <Field label="Site" value={d.site_address || "—"}/>
        <Field label="Acknowledged" value={d.acknowledged_at ? formatDate(d.acknowledged_at) : "Pending"}/>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Issued items</p>
        <LineItemTable items={d.items}/>
      </div>
      <EntityFilesCard entityType="dispatch" entityId={d.id} title="Dispatch proof" manage showEmpty />
      {d.status === "issued" && (<div className="mt-5">
          <Button size="sm" onClick={() => { ack(d.id); toast.success("Dispatch acknowledged by contractor"); }}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Acknowledge Receipt
          </Button>
        </div>)}
    </div>);
}
function PaymentOverview({ p }: {
    p: import("@/lib/rdash/types").Payment;
}) {
    const db = useRDashStore((s) => s.db);
    const issueInvoice = useRDashStore((s) => s.issueInvoiceForPayment);
    const reconcilePayment = useRDashStore((s) => s.reconcilePayment);
    const recordPromise = useRDashStore((s) => s.recordPaymentPromise);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [promise, setPromise] = React.useState("");
    const st = paymentStatusStyle(p.status);
    const invoice = db.invoices.find((row) => row.id === p.invoice_id || row.payment_id === p.id);
    const received = p.received_amount || 0;
    const balance = Math.max(0, p.amount - received);
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><Avatar name={(p.customer_name || "Customer")} size={42}/><div><p className="text-base font-bold">{formatINR(p.amount)}</p><p className="text-xs text-muted-foreground">{(p.customer_name || "Customer")} · {p.milestone_label || "Collection milestone"}</p></div></div><div className="flex items-center gap-1.5">{p.provisional && <span title={p.reconciled_at ? `Reconciled at ${formatDate(p.reconciled_at)}` : "Created against provisional (unverified) data"} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", p.reconciled_at ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning")}>{p.reconciled_at ? "Reconciled" : "Provisional"}</span>}<StatusBadge label={st.label} className={st.className}/></div></div>
      <div className="mt-4 grid grid-cols-2 gap-3"><Field label="Due date" value={formatDate(p.due_date)}/><Field label="Received" value={formatINR(received)}/><Field label="Open balance" value={formatINR(balance)}/><Field label="Invoice" value={invoice ? invoice.invoice_no : "Not issued"}/></div>
      <EntityFilesCard entityType="payment" entityId={p.id} title="Collection milestone files" manage showEmpty />
      <div className="mt-4 rounded-lg border border-primary/25 bg-primary/[0.04] p-3">
        {invoice ? <><p className="text-xs font-semibold text-primary">Invoice issued</p><p className="mt-1 text-xs text-muted-foreground">Receipts are recorded against the invoice so partial collections stay auditable.</p><Button size="sm" className="mt-2" onClick={() => openDetail("invoice", invoice.id)}><FileText className="mr-1.5 h-3.5 w-3.5"/> Open invoice & record receipt</Button></> : <><p className="text-xs font-semibold text-primary">Issue customer invoice</p><p className="mt-1 text-xs text-muted-foreground">A planned collection milestone is not an invoice. Issue the invoice before recording money received.</p><Button size="sm" className="mt-2" onClick={() => { const id = issueInvoice(p.id); if (id) {
        toast.success("Customer invoice issued");
        openDetail("invoice", id);
    } }}><FileText className="mr-1.5 h-3.5 w-3.5"/> Issue invoice</Button></>}
      </div>
      {p.provisional && !p.reconciled_at && <div className="mt-4 rounded-lg border border-success/25 bg-success/[0.05] p-3"><p className="text-xs font-semibold text-success">Reconcile provisional payment</p><p className="mt-1 text-xs text-muted-foreground">This payment was created against provisional (unverified) data. Reconcile it now that the underlying BOQ/measurements are verified.</p><Button size="sm" className="mt-2" onClick={() => { try { reconcilePayment(p.id); toast.success("Payment reconciled — provisional flag cleared."); } catch (error) { toast.error(error instanceof Error ? error.message : "Reconciliation failed."); } }}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Reconcile now</Button></div>}
      {(p.status === "pending" || p.status === "partial" || p.status === "overdue") && <div className="mt-4 rounded-lg border border-warning/25 bg-warning/[0.05] p-3"><p className="mb-2 text-xs font-semibold text-warning">Record customer promise</p><div className="flex flex-wrap gap-2"><Input type="date" value={promise} onChange={(e) => setPromise(e.target.value)} className="h-8 flex-1 text-xs"/><Button size="sm" variant="outline" onClick={() => { if (promise) {
        recordPromise(p.id, promise);
        toast.success(`Recovery task scheduled for ${promise}`);
    } }}><Calendar className="mr-1.5 h-3.5 w-3.5"/> Schedule recovery</Button></div></div>}
      <div className="mt-4 space-y-1.5">{invoice && <LinkedRow icon={<FileText className="h-3.5 w-3.5"/>} label="Customer invoice" value="Open invoice" onClick={() => openDetail("invoice", invoice.id)}/>}{p.work_order_id && <LinkedRow icon={<Building2 className="h-3.5 w-3.5"/>} label="Work Order" value="Open work order" onClick={() => openDetail("workOrder", p.work_order_id!)}/>}</div>
    </div>);
}
function InvoiceOverview({ invoice }: {
    invoice: import("@/lib/rdash/types").CustomerInvoice;
}) {
    const db = useRDashStore((s) => s.db);
    const recordCustomerReceipt = useRDashStore((s) => s.recordCustomerReceipt);
    const reconcileInvoice = useRDashStore((s) => s.reconcileInvoice);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [mode, setMode] = React.useState("upi");
    const [ref, setRef] = React.useState("");
    const [receiptAmount, setReceiptAmount] = React.useState(String(invoice.balance_amount));
    const st = invoiceStatusStyle(invoice.status);
    const canCollect = invoice.status === "issued" || invoice.status === "partial" || invoice.status === "overdue";
    const receipts = db.customerReceipts.filter((receipt) => receipt.invoice_id === invoice.id);
    const recordReceipt = () => {
        const amount = Number(receiptAmount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > invoice.balance_amount + 0.01) {
            toast.error("Enter a receipt amount within the open invoice balance.");
            return;
        }
        if (!ref.trim()) {
            toast.error("Add the receipt reference.");
            return;
        }
        try {
            const id = recordCustomerReceipt(invoice.id, amount, mode, ref.trim(), invoice.payment_id);
            toast.success(`Customer receipt ${id} recorded`);
            setRef("");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Receipt could not be recorded");
        }
    };
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><Avatar name={(invoice.customer_name || "Customer")} size={42}/><div><p className="text-base font-bold">{invoice.invoice_no}</p><p className="text-xs text-muted-foreground">{(invoice.customer_name || "Customer")} - {invoice.title}</p></div></div><div className="flex items-center gap-1.5">{invoice.provisional && <span title={invoice.reconciled_at ? `Reconciled at ${formatDate(invoice.reconciled_at)}` : "Issued against provisional (unverified) data"} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", invoice.reconciled_at ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning")}>{invoice.reconciled_at ? "Reconciled" : "Provisional"}</span>}<StatusBadge label={st.label} className={st.className}/></div></div>
      <div className="mt-4 grid grid-cols-2 gap-3"><Field label="Invoice total" value={formatINR(invoice.total_amount)} mono/><Field label="Balance" value={formatINR(invoice.balance_amount)} mono/><Field label="Issued" value={invoice.issued_at ? formatDate(invoice.issued_at) : "-"}/><Field label="Due date" value={formatDate(invoice.due_date)}/><Field label="Paid" value={invoice.paid_at ? formatDate(invoice.paid_at) : "-"}/><Field label="Paid amount" value={formatINR(invoice.paid_amount)} mono/></div>
      <EntityFilesCard entityType="invoice" entityId={invoice.id} title="Invoice files" manage showEmpty />
      {invoice.notes && <p className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">{invoice.notes}</p>}
      {canCollect && <div className="mt-4 rounded-lg border border-success/25 bg-success/[0.05] p-3"><p className="mb-2 text-xs font-semibold text-success">Record customer receipt</p><div className="grid gap-2 sm:grid-cols-[0.8fr_1fr_1.2fr_auto]"><Input type="number" min="0" max={invoice.balance_amount} step="0.01" value={receiptAmount} onChange={(e) => setReceiptAmount(e.target.value)} placeholder="Amount" className="h-8 text-xs"/><select value={mode} onChange={(e) => setMode(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs"><option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Reference no." className="h-8 text-xs"/><Button size="sm" onClick={recordReceipt}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Record</Button></div><p className="mt-2 text-[11px] text-muted-foreground">Partial receipts reduce only the recorded amount; the remaining invoice balance stays open.</p></div>}
      {invoice.provisional && !invoice.reconciled_at && <div className="mt-4 rounded-lg border border-success/25 bg-success/[0.05] p-3"><p className="text-xs font-semibold text-success">Reconcile provisional invoice</p><p className="mt-1 text-xs text-muted-foreground">This invoice was issued against provisional (unverified) data. Reconcile it now that the underlying BOQ/measurements are verified.</p><Button size="sm" className="mt-2" onClick={() => { try { reconcileInvoice(invoice.id); toast.success("Invoice reconciled — provisional flag cleared."); } catch (error) { toast.error(error instanceof Error ? error.message : "Reconciliation failed."); } }}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Reconcile now</Button></div>}
      {receipts.length > 0 && <div className="mt-4 space-y-2"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Receipts & payment proof</p>{receipts.map((receipt) => <div key={receipt.id} className="rounded-md border border-border bg-muted/20 p-2"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold">{receipt.receipt_no}</span><span className="font-mono">{formatINR(receipt.amount)}</span></div><EntityFilesCard entityType="customer_receipt" entityId={receipt.id} title="Receipt proof" manage showEmpty /></div>)}</div>}
      <div className="mt-4 space-y-1.5">{invoice.payment_id && <LinkedRow icon={<Wallet className="h-3.5 w-3.5"/>} label="Collection milestone" value="Open milestone" onClick={() => openDetail("payment", invoice.payment_id!)}/>}{invoice.quotation_id && <LinkedRow icon={<FileText className="h-3.5 w-3.5"/>} label="Quotation" value="Open quotation" onClick={() => openDetail("quotation", invoice.quotation_id!)}/>}{invoice.work_order_id && <LinkedRow icon={<Building2 className="h-3.5 w-3.5"/>} label="Work Order" value="Open work order" onClick={() => openDetail("workOrder", invoice.work_order_id!)}/>}</div>
    </div>);
}
function TaskOverview({ t }: {
    t: import("@/lib/rdash/types").Task;
}) {
    const completeTask = useRDashStore((s) => s.completeTask);
    const blockTask = useRDashStore((s) => s.blockTask);
    const [notes, setNotes] = React.useState("");
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <p className="text-base font-bold">{t.title}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><User className="h-3 w-3"/> {t.assignee_name || "Unassigned"}</span>
        <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3"/> Due {formatDate(t.due_date)}</span>
        {t.auto_generated && <StatusPill label="Auto-generated" tone="primary"/>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Status" value={titleCase(t.status)}/>
        <Field label="Priority" value={titleCase(t.priority)}/>
        <Field label="Scope" value={titleCase(t.task_scope)}/>
        <Field label="Type" value={titleCase(t.task_type || "general")}/>
      </div>
      {t.description && <p className="mt-3 text-sm text-foreground/80">{t.description}</p>}
      <EntityFilesCard entityType="task" entityId={t.id} title="Task files & completion proof" manage showEmpty />
      {(t.status === "todo" || t.status === "in_progress") && (<div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completion record</p>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was done? Add task-specific proof above when needed." className="mb-2 text-sm" rows={3}/>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { try {
            completeTask(t.id, { note: notes.trim() });
            notifyCompleted("task", t.title);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Task could not be completed");
        } }}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Mark Complete
            </Button>
            <Button size="sm" variant="outline" onClick={async () => { const reason = await promptDialog({ title: "Block Task", description: "Record why this task is blocked.", label: "Blocker reason", placeholder: "e.g. Waiting for material delivery", required: true, multiline: true, confirmLabel: "Block task" }); if (!reason?.trim())
            return; try {
            blockTask(t.id, reason.trim());
            toast.info("Task moved to Blocked work");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Task could not be blocked");
        } }}>
              <AlertCircle className="mr-1.5 h-3.5 w-3.5"/> Mark Blocked
            </Button>
          </div>
        </div>)}
    </div>);
}
function VisitOverview({ v }: {
    v: import("@/lib/rdash/types").Visit;
}) {
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const cancelVisit = useRDashStore((s) => s.cancelVisit);
    const reassignVisit = useRDashStore((s) => s.reassignVisit);
    const currentUser = useRDashStore((s) => s.currentUser);
    const db = useRDashStore((s) => s.db);
    const actor = currentUser();
    const canManageVisit = actor.role === "Owner" || actor.role === "Operations Manager";
    const [nextAssignee, setNextAssignee] = React.useState("");
    const st = visitStatusStyle(v.status);
    const customer = db.customers.find((p) => p.id === v.customer_id);
    const site = v.site_id ? db.sites.find((entry) => entry.id === v.site_id) : undefined;
    const workOrder = v.work_order_id ? db.workOrders.find((j) => j.id === v.work_order_id) : undefined;
    const visitMapPoints: MapPoint[] = [{
            id: v.id,
            label: v.location_name,
            latitude: v.latitude,
            longitude: v.longitude,
            address: v.location_name || site?.address || site?.name || "Site pending",
            meta: `${v.staff_name} · ${titleCase(v.status)}`,
            status: v.status === "checked_in" || v.status === "en_route" ? "active" : v.status === "report_pending" ? "warning" : v.status === "completed" ? "completed" : "scheduled",
        }];
    const routeMapPoints: MapPoint[] = visitToMapPoints(v);
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold">{titleCase(v.visit_type)} · {v.location_name}</p>
          <p className="text-xs text-muted-foreground">{v.assignee_type === "contractor" || v.contractor_id ? `${v.contractor_name || "Contractor"} · contractor report` : v.staff_name} · {customer?.name || "—"}</p>
        </div>
        <StatusBadge label={st.label} className={st.className}/>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Scheduled" value={formatDate(v.scheduled_at)}/>
        <Field label="Check-in" value={v.check_in_at ? formatDate(v.check_in_at) : "—"}/>
        <Field label="Check-out" value={v.check_out_at ? formatDate(v.check_out_at) : "—"}/>
        <Field label="Dwell" value={v.dwell_minutes ? `${v.dwell_minutes} min` : "—"}/>
        <Field label="GPS verification" value={v.check_in_verified || v.check_out_verified ? `Verified · ${v.check_in_distance_m ?? v.check_out_distance_m ?? "—"} m from Site` : "No verified field GPS"}/>
        <Field label="Report" value={v.report_filed ? "Filed" : "Pending"}/>
      </div>
      <div className="mt-4">
        <MapView points={routeMapPoints} title={`${titleCase(v.visit_type)} location map`} showRoute geofenceRadiusM={db.master.staff.find((staff) => staff.id === v.staff_id)?.attendance_policy.visit_geofence_radius_m} className="h-56 min-h-56"/>
      </div>
      <div className="mt-4 space-y-1.5">
        {customer && <LinkedRow icon={<User className="h-3.5 w-3.5"/>} label="Customer" value={customer.name} onClick={() => openDetail("customer", customer.id)}/>}
        {workOrder && <LinkedRow icon={<Building2 className="h-3.5 w-3.5"/>} label="WorkOrder" value={workOrder.work_order_no} onClick={() => openDetail("workOrder", workOrder.id)}/>}
        <LinkedRow icon={<MapPin className="h-3.5 w-3.5"/>} label="Field Visits" value="Open visit planner" onClick={() => setActiveModule("fieldOperations")}/>
      </div>
      {v.proof_attachment_ids.length > 0 && (<div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Proofs</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {attachedFilesForIds(db, v.proof_attachment_ids).map(({ attachment, asset }) => <FilePreview key={attachment.id} file={assetPreview(asset)} compact controls/>)}
          </div>
        </div>)}
      <div className="mt-5 flex flex-wrap gap-2">
        {(v.status === "scheduled" || v.status === "checked_in" || v.status === "en_route") && (<Button size="sm" onClick={() => {
                setActiveModule("fieldMode");
                toast.info("Field check-in and check-out require live device GPS in Field Mode.");
            }}>
            <MapPin className="mr-1.5 h-3.5 w-3.5"/> Open Field Mode
          </Button>)}
        {!v.report_filed && v.status === "report_pending" && (<div className="w-full rounded-lg border border-warning/25 bg-warning/[0.05] p-3">
            <p className="mb-1 text-xs font-semibold text-warning">Visit report pending</p>
            <p className="mb-2 text-[11px] text-muted-foreground">File the report from Field Mode. Photos are optional; selected photos must have durable Google Drive links. This panel cannot bypass Visit ownership or verified checkout.</p>
            <Button size="sm" onClick={() => {
                setActiveModule("fieldMode");
                toast.info("Open Field Mode to upload Drive proof and file this report.");
            }}>
              <FileText className="mr-1.5 h-3.5 w-3.5"/> Open Field Mode
            </Button>
          </div>)}
      {canManageVisit && (v.status === "scheduled" || v.status === "en_route" || v.status === "missed") && (<div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visit control</p>
          <div className="flex flex-wrap gap-2">
            <select value={nextAssignee} onChange={(event) => setNextAssignee(event.target.value)} className="h-8 min-w-52 rounded-md border border-input bg-card px-2 text-xs">
              <option value="">Reassign to staff or contractor…</option>
              {db.master.staff.filter((staff) => staff.status === "active").map((staff) => <option key={`staff-${staff.id}`} value={`staff:${staff.id}`}>{staff.name} · {staff.role}</option>)}
              {db.master.contractors.map((contractor) => <option key={`contractor-${contractor.id}`} value={`contractor:${contractor.id}`}>{contractor.name} · contractor</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={!nextAssignee} onClick={() => { const [type, personId] = nextAssignee.split(":") as [
            "staff" | "contractor",
            string
        ]; try {
            reassignVisit(v.id, { type, id: personId });
            setNextAssignee("");
            toast.success("Visit reassigned");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Visit could not be reassigned");
        } }}>Reassign</Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={async () => { const reason = await promptDialog({ title: "Cancel Visit", description: "Record the cancellation reason.", label: "Reason", placeholder: "e.g. Customer rescheduled to next week", required: true, multiline: true, confirmLabel: "Cancel visit" }); if (!reason?.trim())
            return; try {
            cancelVisit(v.id, reason.trim());
            toast.success("Visit cancelled");
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Visit could not be cancelled");
        } }}>Cancel visit</Button>
          </div>
        </div>)}
      </div>
    </div>);
}
function SiteOverview({ site }: {
    site: import("@/lib/rdash/types").Site;
}) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const archiveSite = useRDashStore((s) => s.archiveSite);
    const [archiveOpen, setArchiveOpen] = React.useState(false);
    const [archiveReason, setArchiveReason] = React.useState("");
    const [cancelSite, setCancelSite] = React.useState(false);
    const customer = db.customers.find((customer) => customer.id === site.customer_id);
    const areas = db.areas.filter((area) => area.site_id === site.id);
    const works = db.workRequired.filter((work) => work.site_id === site.id);
    const quotes = db.quotations.filter((quote) => quote.site_id === site.id);
    const workOrders = db.workOrders.filter((order) => order.site_id === site.id);
    const verifiedMeasurements = db.measurementRevisions.filter((revision) => revision.site_id === site.id && revision.status === "verified");
    return (<div className="h-full overflow-y-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill label={titleCase(site.stage)} tone={site.stage === "completed" ? "success" : site.stage === "on_hold" ? "destructive" : "default"}/>
        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold">{titleCase(site.site_type)}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MetricMini label="Areas" value={areas.length}/>
        <MetricMini label="Work required" value={works.length}/>
        <MetricMini label="Work orders" value={workOrders.length}/>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {customer && <Button size="sm" variant="outline" onClick={() => openDetail("customer", customer.id)}><User className="mr-1.5 h-3.5 w-3.5"/> Customer</Button>}
        {!site.is_archived && <Button size="sm" onClick={() => setActiveModule("siteExecution")}><Building2 className="mr-1.5 h-3.5 w-3.5"/> Open site workspace</Button>}
        {!site.is_archived && <Button size="sm" variant="outline" onClick={() => setArchiveOpen(true)}><Trash2 className="mr-1.5 h-3.5 w-3.5"/> Archive Site</Button>}
      </div>
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archive Site</DialogTitle>
            <DialogDescription>History remains available, but this Site cannot be used for new Areas, work, quotations, jobs, procurement, or finance records.</DialogDescription>
          </DialogHeader>
          <Textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} placeholder="Reason for archiving this Site" rows={3}/>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cancelSite} onChange={(event) => setCancelSite(event.target.checked)}/> Mark Site as cancelled</label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>Cancel</Button>
            <Button onClick={() => {
            try {
                archiveSite(site.id, { reason: archiveReason, cancelled: cancelSite });
                setArchiveOpen(false);
                toast.success("Site archived. Historical records were retained.");
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Site could not be archived.");
            }
        }}>Archive Site</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Field label="Address" value={site.address || site.locality || site.city || "Not added"}/>
        <Field label="Measurement snapshots" value={`${verifiedMeasurements.length} verified`}/>
      </div>
      <EntityFilesCard entityType="site" entityId={site.id} title="Site photos & files" />
      <ContextSection title={`Areas (${areas.length})`}>
        {areas.length ? areas.map((area) => {
            const revision = [...db.measurementRevisions].filter((row) => row.area_id === area.id && row.status === "verified").sort((a, b) => b.revision_no - a.revision_no)[0];
            return <LinkedRow key={area.id} icon={<MapPin className="h-3.5 w-3.5"/>} label={area.name} value={revision ? `${revision.calculated_area || 0} sq ft · Rev ${revision.revision_no}` : "Measurement pending"} onClick={() => openDetail("area", area.id)}/>;
        }) : <EmptyContext label="Create areas before defining work, measurements, quotations or procurement."/>}
      </ContextSection>
      <ContextSection title={`Work Required (${works.length})`}>
        {works.length ? works.map((work) => <LinkedRow key={work.id} icon={<Wrench className="h-3.5 w-3.5"/>} label={work.title} value={titleCase(work.status)} onClick={() => openDetail("workRequired", work.id)}/>) : <EmptyContext label="No work has been defined for this site."/>}
      </ContextSection>
      <ContextSection title={`Quotations (${quotes.length})`}>
        {quotes.length ? quotes.map((quote) => <LinkedRow key={quote.id} icon={<FileText className="h-3.5 w-3.5"/>} label={quote.quotation_no} value={`${titleCase(quote.status)} · ${formatINRShort(quote.total_amount)}`} onClick={() => openDetail("quotation", quote.id)}/>) : <EmptyContext label="Create quotations only after covered areas have verified measurements."/>}
      </ContextSection>
    </div>);
}
function AreaOverview({ area }: {
    area: import("@/lib/rdash/types").Area;
}) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const archiveArea = useRDashStore((s) => s.archiveArea);
    const [archiveOpen, setArchiveOpen] = React.useState(false);
    const [archiveReason, setArchiveReason] = React.useState("");
    const [replacementAreaId, setReplacementAreaId] = React.useState("");
    const site = db.sites.find((row) => row.id === area.site_id);
    const works = db.workRequired.filter((work) => work.site_id === area.site_id && work.area_ids.includes(area.id));
    const measurements = db.measurementRevisions.filter((revision) => revision.area_id === area.id).sort((a, b) => b.revision_no - a.revision_no);
    const latest = measurements.find((revision) => revision.status === "verified") || measurements[0];
    const dependencies = areaDependencySummary(db, area.id);
    const replacementAreas = db.areas.filter((row) => row.site_id === area.site_id && row.id !== area.id && !row.is_archived);
    return (<div className="h-full overflow-y-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill label={titleCase(area.stage)} tone={area.stage === "completed" ? "success" : area.stage === "unmeasured" ? "warning" : "default"}/>
        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold">{titleCase(area.area_type)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <Field label="Site" value={site?.name || "Site not found"}/>
        <Field label="Latest measurement" value={latest ? `Rev ${latest.revision_no} · ${latest.calculated_area || 0} sq ft` : "Not captured"}/>
        <Field label="Dimensions" value={latest ? `${latest.length || 0} × ${latest.width || 0}${latest.height ? ` × ${latest.height}` : ""} ${latest.unit}` : "—"}/>
        <Field label="Perimeter" value={latest?.calculated_perimeter ? `${latest.calculated_perimeter} ${latest.unit}` : "—"}/>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {site && <Button size="sm" variant="outline" onClick={() => openDetail("site", site.id)}><Building2 className="mr-1.5 h-3.5 w-3.5"/> Site</Button>}
        {!area.is_archived && <Button size="sm" onClick={() => setActiveModule("siteExecution")}><MapPin className="mr-1.5 h-3.5 w-3.5"/> Capture / revise measurement</Button>}
        {!area.is_archived && <Button size="sm" variant="outline" onClick={() => setArchiveOpen(true)}><Trash2 className="mr-1.5 h-3.5 w-3.5"/> Archive Area</Button>}
      </div>
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archive Area</DialogTitle>
            <DialogDescription>{dependencies.total ? `${dependencies.total} linked record(s) must move to another Area before this Area is archived.` : "This Area has no linked records and can be archived directly."}</DialogDescription>
          </DialogHeader>
          {dependencies.total > 0 && <select value={replacementAreaId} onChange={(event) => setReplacementAreaId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"><option value="">Select replacement Area</option>{replacementAreas.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>}
          <Textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} placeholder="Reason for archiving this Area" rows={3}/>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>Cancel</Button>
            <Button disabled={dependencies.total > 0 && !replacementAreaId} onClick={() => {
            try {
                archiveArea(area.id, { reason: archiveReason, replacementAreaId: replacementAreaId || undefined });
                setArchiveOpen(false);
                toast.success("Area archived and linked records reassigned.");
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Area could not be archived.");
            }
        }}>Archive Area</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EntityFilesCard entityType="room" entityId={area.id} title="Area photos & files" manage={!area.is_archived} showEmpty={!area.is_archived} />
      <ContextSection title={`Work Required in this Area (${works.length})`}>
        {works.length ? works.map((work) => <LinkedRow key={work.id} icon={<Wrench className="h-3.5 w-3.5"/>} label={work.title} value={`${titleCase(work.status)} · ${work.system_name || "Specification pending"}`} onClick={() => openDetail("workRequired", work.id)}/>) : <EmptyContext label="Add area-specific work required before customer quotation or contractor bidding."/>}
      </ContextSection>
      <ContextSection title={`Measurement Revisions (${measurements.length})`}>
        {measurements.length ? measurements.map((revision) => <div key={revision.id} className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs"><div className="flex items-center justify-between gap-2"><span className="font-semibold">Revision {revision.revision_no}</span><StatusPill label={titleCase(revision.status)} tone={revision.status === "verified" ? "success" : revision.status === "superseded" ? "default" : "warning"}/></div><p className="mt-1 text-muted-foreground">{revision.length || 0} × {revision.width || 0}{revision.height ? ` × ${revision.height}` : ""} {revision.unit} · {revision.calculated_area || 0} sq ft</p><EntityFilesCard entityType="measurement_revision" entityId={revision.id} title="Measurement files" manage={!area.is_archived && revision.id === latest?.id && revision.status !== "superseded"} showEmpty={!area.is_archived && revision.id === latest?.id && revision.status !== "superseded"} /></div>) : <EmptyContext label="No measurement revision has been captured."/>}
      </ContextSection>
    </div>);
}
function WorkRequiredOverview({ work }: {
    work: import("@/lib/rdash/types").WorkRequired;
}) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const site = db.sites.find((row) => row.id === work.site_id);
    const areas = db.areas.filter((area) => work.area_ids.includes(area.id));
    const quotes = db.quotations.filter((quote) => quote.coverage.some((coverage) => coverage.work_required_id === work.id));
    const acceptedScopes = db.acceptedScopes.filter((scope) => scope.work_required_id === work.id);
    const workOrders = db.workOrders.filter((order) => order.work_required_ids.includes(work.id));
    return (<div className="h-full overflow-y-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill label={titleCase(work.status)} tone={work.status === "completed" || work.status === "awarded" || work.status === "in_progress" ? "success" : work.status === "lost" || work.status === "on_hold" ? "destructive" : "default"}/>
        {work.system_name && <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold">{work.system_name}</span>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MetricMini label="Areas" value={areas.length}/>
        <MetricMini label="Quotes" value={quotes.length}/>
        <MetricMini label="Orders" value={workOrders.length}/>
      </div>
      {work.specification || work.description ? <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">{work.specification || work.description}</div> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {site && <Button size="sm" variant="outline" onClick={() => openDetail("site", site.id)}><Building2 className="mr-1.5 h-3.5 w-3.5"/> {site.name}</Button>}
        <Button size="sm" onClick={() => setActiveModule("siteExecution")}><Wrench className="mr-1.5 h-3.5 w-3.5"/> Open execution flow</Button>
      </div>
      <EntityFilesCard entityType="workRequired" entityId={work.id} title="Requirement files" manage showEmpty />
      <ContextSection title={`Covered Areas (${areas.length})`}>
        {areas.length ? areas.map((area) => <LinkedRow key={area.id} icon={<MapPin className="h-3.5 w-3.5"/>} label={area.name} value={titleCase(area.stage)} onClick={() => openDetail("area", area.id)}/>) : <EmptyContext label="No areas are linked."/>}
      </ContextSection>
      <ContextSection title={`Customer Quotations (${quotes.length})`}>
        {quotes.length ? quotes.map((quote) => <LinkedRow key={quote.id} icon={<FileText className="h-3.5 w-3.5"/>} label={quote.quotation_no} value={`${titleCase(quote.status)} · ${formatINRShort(quote.total_amount)}`} onClick={() => openDetail("quotation", quote.id)}/>) : <EmptyContext label="Measure the covered areas, then prepare a customer quotation."/>}
      </ContextSection>
      <ContextSection title={`Award Path (${acceptedScopes.length})`}>
        {acceptedScopes.length ? acceptedScopes.map((scope) => { const order = scope.work_order_id ? db.workOrders.find((row) => row.id === scope.work_order_id) : undefined; return <div key={scope.id} className="rounded-md border border-border bg-muted/20 p-2"><LinkedRow icon={<Gavel className="h-3.5 w-3.5"/>} label={scope.label} value={order ? `${order.work_order_no} · ${titleCase(order.status)}` : titleCase(scope.status)} onClick={() => { if (order) openDetail("workOrder", order.id); else setActiveModule("siteExecution"); }}/><EntityFilesCard entityType="accepted_scope" entityId={scope.id} title="Acceptance files" manage showEmpty /></div>; }) : <EmptyContext label="After customer acceptance, invite contractor bids before a work order can be created."/>}
      </ContextSection>
    </div>);
}
function MetricMini({ label, value }: {
    label: string;
    value: React.ReactNode;
}) {
    return <div className="rounded-lg border border-border bg-muted/20 p-2 text-center"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-bold">{value}</p></div>;
}
function ContextSection({ title, children }: {
    title: string;
    children: React.ReactNode;
}) {
    return <section className="mt-5"><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p><div className="space-y-1">{children}</div></section>;
}
function EmptyContext({ label }: {
    label: string;
}) {
    return <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">{label}</p>;
}
function BOQOverview({ b }: {
    b: import("@/lib/rdash/types").WorkOrderBOQ;
}) {
    const approve = useRDashStore((s) => s.approveBOQ);
    const db = useRDashStore((s) => s.db);
    const linkBOQItemToDrawing = useRDashStore((s) => s.linkBOQItemToDrawing);
    const [boqItemFilesId, setBoqItemFilesId] = React.useState<string | null>(null);
    const jobDrawings = db.drawings.filter((d) => d.work_order_id === b.work_order_id);
    const itemsWithDrawings = b.items.filter((i) => i.drawing_id);
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold">{b.title}</p>
          <p className="text-xs text-muted-foreground">{b.work_order_no} · {(b.customer_name || "Customer")}</p>
        </div>
        <StatusPill label={titleCase(b.status)} tone={b.status === "approved" ? "success" : "warning"}/>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Total" value={formatINR(b.total_amount)} mono/>
        <Field label="Items" value={b.items.length}/>
        <Field label="Approved by" value={b.approved_by || "—"}/>
        <Field label="Approved at" value={b.approved_at ? formatDate(b.approved_at) : "—"}/>
      </div>
      {jobDrawings.length > 0 && (<div className="mt-4 rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
          <p className="text-[10px] font-semibold uppercase text-primary">Drawings available for this workOrder ({jobDrawings.length})</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{itemsWithDrawings.length} of {b.items.length} BOQ items linked to a drawing.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {jobDrawings.map((d) => (<span key={d.id} className="rounded-md border border-border bg-background px-2 py-1 text-[10px]">
                <span className="font-semibold">{d.drawing_no}</span> v{d.version} · {d.kind} · {d.status}
              </span>))}
          </div>
        </div>)}

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Material plan</p>
        <LineItemTable items={b.items}/>
      </div>
      <EntityFilesCard entityType="boq" entityId={b.id} title="BOQ files" manage showEmpty />
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">BOQ item files{jobDrawings.length ? " & drawing links" : ""}</p>
        <div className="space-y-1">
          {b.items.map((it) => (<div key={it.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
              <span className="flex-1 truncate">{it.title}</span>
              {it.drawing_no && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{it.drawing_no}</span>}
              {jobDrawings.length ? <select value={it.drawing_id || ""} onChange={(e) => {
                  if (e.target.value) {
                      linkBOQItemToDrawing(b.id, it.id, e.target.value);
                      toast.success(`Linked "${it.title}" to ${db.drawings.find((d) => d.id === e.target.value)?.drawing_no}`);
                  }
              }} className="h-7 rounded-md border border-input bg-card px-1.5 text-[11px]">
                <option value="">— link drawing —</option>
                {jobDrawings.map((d) => (<option key={d.id} value={d.id}>{d.drawing_no} · {d.title.slice(0, 30)}</option>))}
              </select> : null}
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setBoqItemFilesId(it.id)}><Paperclip className="mr-1 h-3 w-3"/>Files</Button>
            </div>))}
        </div>
      </div>

      <Dialog open={Boolean(boqItemFilesId)} onOpenChange={(open) => { if (!open) setBoqItemFilesId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>BOQ line files</DialogTitle><DialogDescription>Attach only documents or evidence that apply specifically to this BOQ line.</DialogDescription></DialogHeader>
          {boqItemFilesId ? <EntityFilesCard entityType="boq_item" entityId={boqItemFilesId} title="BOQ line files" manage showEmpty /> : null}
        </DialogContent>
      </Dialog>

      {b.status === "draft" && (<div className="mt-5">
          <Button size="sm" onClick={() => { approve(b.id); toast.success("BOQ approved"); }}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Approve BOQ
          </Button>
        </div>)}
    </div>);
}
function VendorBillOverview({ b }: {
    b: import("@/lib/rdash/types").VendorBill;
}) {
    const approve = useRDashStore((s) => s.approveVendorBill);
    const matchVendorBill = useRDashStore((s) => s.matchVendorBill);
    const resolveVendorBillMismatch = useRDashStore((s) => s.resolveVendorBillMismatch);
    const db = useRDashStore((s) => s.db);
    const st = vendorBillStatusStyle(b.status);
    const [matchOpen, setMatchOpen] = React.useState(false);
    const [invoiceNo, setInvoiceNo] = React.useState(b.vendor_invoice_no || "");
    const [invoiceAmt, setInvoiceAmt] = React.useState(String(b.amount || ""));
    const [resolveOpen, setResolveOpen] = React.useState(false);
    const [resolution, setResolution] = React.useState<"accept_as_is" | "partial_accept" | "return_to_vendor" | "price_adjustment" | "settlement" | "hold_payment">("accept_as_is");
    const [resolveNotes, setResolveNotes] = React.useState("");
    const po = b.po_id ? db.purchaseOrders.find((p) => p.id === b.po_id) : undefined;
    const grn = b.grn_id ? db.grns.find((g) => g.id === b.grn_id) : undefined;
    const vendorPayments = db.vendorPayments.filter((payment) => payment.vendor_bill_id === b.id);
    const match = b.three_way_match;
    const handleMatch = () => {
        const amt = parseFloat(invoiceAmt);
        if (!amt || amt <= 0) {
            toast.error("Enter the taxable invoice amount");
            return;
        }
        const invoiceLines = b.invoice_lines || (grn ? grn.items.map((line) => ({
            po_item_id: line.source_item_id,
            article_id: line.article_id,
            title: line.title,
            quantity: line.quantity,
            rate: line.rate,
            amount: line.amount,
            tax_rate: line.tax_rate,
        })) : []);
        const result = matchVendorBill(b.id, { vendorInvoiceNo: invoiceNo, invoiceAmount: amt, invoiceLines, matchedBy: "Meera Nair" });
        setMatchOpen(false);
        if (result.matched) {
            toast.success(`3-way match ✓ — PO/GRN/Invoice all agree at ₹${amt}`);
        }
        else {
            toast.error(`Mismatch flagged — obstacle raised for resolution`);
        }
    };
    const handleResolve = () => {
        resolveVendorBillMismatch(b.id, resolution, resolveNotes);
        toast.success(`Mismatch resolved as ${resolution.replace(/_/g, " ")}`);
        setResolveOpen(false);
        setResolveNotes("");
    };
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold">{b.bill_no}</p>
          <p className="text-xs text-muted-foreground">{b.vendor_name} · {b.po_no} / {b.grn_no}</p>
        </div>
        <StatusBadge label={st.label} className={st.className}/>
      </div>
      {match && (<div className={cn("mt-3 rounded-lg border p-3 text-xs", match.fully_matched ? "border-success/30 bg-success/[0.05] text-success" : "border-destructive/30 bg-destructive/[0.05] text-destructive")}>
          <div className="flex items-center gap-2">
            {match.fully_matched ? <CheckCircle2 className="h-4 w-4"/> : <AlertCircle className="h-4 w-4"/>}
            <p className="font-semibold uppercase">{match.fully_matched ? "3-way matched ✓" : "3-way mismatch — needs resolution"}</p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div><span className="text-muted-foreground">PO</span><p className="font-mono font-bold">{formatINR(match.po_amount)}</p></div>
            <div><span className="text-muted-foreground">GRN</span><p className="font-mono font-bold">{formatINR(match.grn_amount)}</p></div>
            <div><span className="text-muted-foreground">Invoice</span><p className="font-mono font-bold">{formatINR(match.invoice_amount)}</p></div>
          </div>
          {!match.fully_matched && (<div className="mt-2 space-y-0.5 text-[10px]">
              <div>Invoice vs PO: <span className="font-mono">{match.invoice_vs_po >= 0 ? "+" : ""}{formatINR(match.invoice_vs_po)}</span></div>
              <div>Invoice vs GRN: <span className="font-mono">{match.invoice_vs_grn >= 0 ? "+" : ""}{formatINR(match.invoice_vs_grn)}</span></div>
              <div>GRN vs PO: <span className="font-mono">{match.grn_vs_po >= 0 ? "+" : ""}{formatINR(match.grn_vs_po)}</span></div>
            </div>)}
          {match.line_diffs.length > 0 && (<div className="mt-2 border-t border-destructive/20 pt-2">
              <p className="text-[10px] font-semibold uppercase">Line diffs ({match.line_diffs.length})</p>
              <div className="mt-1 space-y-1">
                {match.line_diffs.map((d, i) => (<div key={i} className="rounded-md bg-background/60 px-2 py-1 text-[10px]">
                    <span className="font-semibold">{d.title}</span>
                    {d.issue && <span className="ml-1.5 rounded bg-destructive/15 px-1 py-0.5 font-semibold uppercase text-destructive">{d.issue.replace(/_/g, " ")}</span>}
                    <span className="ml-1.5 font-mono">PO qty {d.po_qty ?? "—"} → GRN qty {d.grn_qty ?? "—"} → Inv qty {d.invoice_qty ?? "—"}</span>
                    {d.po_rate != null && d.invoice_rate != null && d.po_rate !== d.invoice_rate && (<span className="ml-1.5 font-mono">rate ₹{d.po_rate} → ₹{d.invoice_rate}</span>)}
                    <span className="ml-1.5 font-mono font-bold">{d.diff >= 0 ? "+" : ""}₹{d.diff}</span>
                  </div>))}
              </div>
            </div>)}
          {match.resolution && (<div className="mt-2 border-t border-success/20 pt-2 text-[11px]">
              <span className="font-semibold">Resolved: </span>
              <span className="font-medium">{match.resolution.replace(/_/g, " ")}</span>
              {match.resolution_notes && <p className="mt-0.5 text-foreground/80">{match.resolution_notes}</p>}
            </div>)}
        </div>)}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Amount" value={formatINR(b.amount)} mono/>
        <Field label="Tax" value={formatINR(b.tax_amount || 0)} mono/>
        <Field label="Total" value={formatINR(b.total_amount)} mono/>
        <Field label="Due" value={formatDate(b.due_date)}/>
        {b.vendor_invoice_no && <Field label="Vendor invoice no" value={b.vendor_invoice_no}/>}
        {b.vendor_invoice_date && <Field label="Vendor invoice date" value={formatDate(b.vendor_invoice_date)}/>}
      </div>
      <EntityFilesCard entityType="vendor_bill" entityId={b.id} title="Vendor invoice & bill files" manage showEmpty />
      {vendorPayments.length > 0 && <div className="mt-4 space-y-2"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vendor payment proof</p>{vendorPayments.map((payment) => <div key={payment.id} className="rounded-md border border-border bg-muted/20 p-2"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold">{payment.payment_no}</span><span className="font-mono">{formatINR(payment.amount)}</span></div><EntityFilesCard entityType="vendor_payment" entityId={payment.id} title="Payment proof" manage showEmpty /></div>)}</div>}
      {po && (<div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">PO reference ({po.po_no})</p>
          <p className="mt-1 text-xs">Vendor: {po.vendor_name} · Status: {po.status}</p>
          <p className="text-xs">Items: {po.items.length} · Total: {formatINR(po.total_amount)}</p>
        </div>)}
      {grn && (<div className="mt-2 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">GRN reference ({grn.grn_no})</p>
          <p className="mt-1 text-xs">Status: {grn.status}{grn.mismatch_notes ? ` · ${grn.mismatch_notes}` : ""}</p>
          <p className="text-xs">Items: {grn.items.length} · Total: {formatINR(grn.items.reduce((n, i) => n + i.amount, 0))}</p>
        </div>)}

      <div className="mt-5 flex flex-wrap gap-2">
        {b.status === "draft" && (<Button size="sm" onClick={() => setMatchOpen((v) => !v)}>
            <Receipt className="mr-1.5 h-3.5 w-3.5"/> Match vendor invoice (3-way)
          </Button>)}
        {b.status === "disputed" && !match?.resolution && (<Button size="sm" variant="outline" onClick={() => setResolveOpen((v) => !v)}>
            <AlertCircle className="mr-1.5 h-3.5 w-3.5"/> Resolve mismatch
          </Button>)}
        {b.status === "pending" && (<Button size="sm" onClick={() => { approve(b.id); toast.success("Bill approved"); }}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Approve
          </Button>)}
        {(b.status === "approved" || b.status === "partly_paid") && (<p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Record partial or full settlement from the Vendor Bills & Payables workspace with an actual bank, UPI, cheque, or cash reference.
          </p>)}
      </div>
      {matchOpen && (<div className="mt-4 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
          <p className="mb-2 text-xs font-semibold">Match vendor invoice against PO {po?.po_no} + GRN {grn?.grn_no}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Vendor invoice no.</label>
              <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="INV-2026-045" className="h-8 text-sm"/>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Invoice amount (₹, ex-tax)</label>
              <Input type="number" value={invoiceAmt} onChange={(e) => setInvoiceAmt(e.target.value)} placeholder="e.g. 3492" className="h-8 text-sm" autoFocus/>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            PO amount: <span className="font-mono">{formatINR(match?.po_amount || po?.total_amount || 0)}</span>
            {grn && <> · GRN amount: <span className="font-mono">{formatINR(match?.grn_amount || grn.items.reduce((n, i) => n + i.amount, 0))}</span></>}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleMatch} disabled={!invoiceAmt}>Run 3-way match</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMatchOpen(false)}>Cancel</Button>
          </div>
        </div>)}
      {resolveOpen && match && (<div className="mt-4 rounded-lg border border-warning/30 bg-warning/[0.04] p-3">
          <p className="mb-2 text-xs font-semibold">Resolve mismatch on {b.bill_no}</p>
          <p className="mb-2 text-[11px] text-muted-foreground">Pick the team's decision. Anything except "hold payment" closes the linked obstacle and returns the bill to pending.</p>
          <div className="grid gap-1.5">
            {([
                ["accept_as_is", "Accept as-is (vendor's invoice stands)"],
                ["partial_accept", "Partial accept (some lines accepted, some returned)"],
                ["return_to_vendor", "Return to vendor (reject the whole invoice)"],
                ["price_adjustment", "Price adjustment (negotiated new rate)"],
                ["settlement", "Settlement (one-time adjustment to close the bill)"],
                ["hold_payment", "Hold payment (keep disputed, vendor payment frozen)"],
            ] as const).map(([val, label]) => (<label key={val} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs", resolution === val ? "border-primary bg-primary/10" : "border-border bg-background")}>
                <input type="radio" checked={resolution === val} onChange={() => setResolution(val)}/>
                <span>{label}</span>
              </label>))}
          </div>
          <div className="mt-2">
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Resolution notes</label>
            <Textarea value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} placeholder="e.g. Vendor agreed to absorb the ₹360 short-delivery as credit on next invoice." rows={2} className="text-sm"/>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleResolve} disabled={!resolveNotes.trim()}>Apply resolution</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setResolveOpen(false)}>Cancel</Button>
          </div>
        </div>)}
    </div>);
}
function CommissionOverview({ c }: {
    c: import("@/lib/rdash/types").Commission;
}) {
    const pay = useRDashStore((s) => s.payCommission);
    const st = commissionStatusStyle(c.status);
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold">{c.source_partner_name}</p>
          <p className="text-xs text-muted-foreground">{c.commission_no} · {(c.customer_name || "Customer")}</p>
        </div>
        <StatusBadge label={st.label} className={st.className}/>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Base amount" value={formatINR(c.base_amount)} mono/>
        <Field label="Rate" value={`${c.rate_pct}%`}/>
        <Field label="Commission" value={formatINR(c.amount)} mono/>
        <Field label="Accrued" value={formatDate(c.accrued_at)}/>
      </div>
      {c.notes && <p className="mt-3 text-sm text-foreground/80">{c.notes}</p>}
      <EntityFilesCard entityType="commission" entityId={c.id} title="Commission files" manage showEmpty />
      {c.status === "accrued" && (<div className="mt-5">
          <Button size="sm" onClick={() => { pay(c.id); toast.success("Commission paid"); }}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Mark Paid
          </Button>
        </div>)}
    </div>);
}
function BlockedOverview({ b }: {
    b: import("@/lib/rdash/types").BlockedItem;
}) {
    const resolve = useRDashStore((s) => s.resolveBlocked);
    const openDetail = useRDashStore((s) => s.openDetail);
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <p className="text-base font-bold">{b.title}</p>
      <p className="mt-1 text-sm text-foreground/80">{b.reason}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Customer" value={b.customer_name || "—"}/>
        <Field label="Resolved" value={b.resolved ? "Yes" : "No"}/>
      </div>
      <EntityFilesCard entityType="blocked" entityId={b.id} title="Obstacle evidence" manage={!b.resolved} showEmpty={!b.resolved} />
      <div className="mt-4 space-y-1.5">
        {b.linked_work_order_id && <LinkedRow icon={<Building2 className="h-3.5 w-3.5"/>} label="WorkOrder" value="Open" onClick={() => openDetail("workOrder", b.linked_work_order_id!)}/>}
        {b.linked_po_id && <LinkedRow icon={<Package className="h-3.5 w-3.5"/>} label="PO" value="Open" onClick={() => openDetail("po", b.linked_po_id!)}/>}
        {b.linked_grn_id && <LinkedRow icon={<Truck className="h-3.5 w-3.5"/>} label="GRN" value="Open" onClick={() => openDetail("grn", b.linked_grn_id!)}/>}
      </div>
      {!b.resolved && (<div className="mt-5">
          <Button size="sm" onClick={() => { resolve(b.id); toast.success("Obstacle resolved"); }}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5"/> Mark Resolved
          </Button>
        </div>)}
    </div>);
}
function LinkedRow({ icon, label, value, onClick }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    onClick?: () => void;
}) {
    return (<button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-primary/30 hover:bg-accent/40 disabled:cursor-default disabled:opacity-100 disabled:hover:bg-background">
      <span className="text-muted-foreground">{icon}</span>
      <span className="font-medium text-foreground">{label}</span>
      <span className="ml-auto truncate text-muted-foreground">{value}</span>
      {onClick && <ArrowRight className="h-3 w-3 text-muted-foreground"/>}
    </button>);
}
function FollowupOverview({ f }: {
    f: import("@/lib/rdash/types").Followup;
}) {
    const st = followupStatusStyle(f.status);
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold">{f.title}</p>
          <p className="text-xs text-muted-foreground">Due {formatDate(f.due_date)}</p>
        </div>
        <StatusBadge label={st.label} className={st.className}/>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Type" value={f.followup_type || "general"}/>
        <Field label="Priority" value={f.priority}/>
        <Field label="Assigned to" value={f.assigned_to || "—"}/>
        <Field label="Due at" value={formatDate(f.due_at)}/>
      </div>
      {f.notes && (<div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs text-foreground/80">{f.notes}</p>
        </div>)}
      <EntityFilesCard entityType="followup" entityId={f.id} title="Follow-up files" manage showEmpty />
    </div>);
}
function InventoryOverview({ inv }: {
    inv: import("@/lib/rdash/types").InventoryItem;
}) {
    return (<div className="h-full overflow-y-auto p-4 rd-scroll">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold">{inv.name}</p>
          <p className="text-xs text-muted-foreground">{inv.work_order_no || "—"} · {inv.location || "—"}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Quantity" value={`${inv.quantity} ${inv.unit_name || ""}`} mono/>
        <Field label="Rate" value={inv.rate ? formatINR(inv.rate) : "—"} mono/>
        <Field label="Reserved" value={`${inv.reserved_qty || 0}`} mono/>
        <Field label="Issued" value={`${inv.issued_qty || 0}`} mono/>
        <Field label="Received" value={`${inv.received_qty || 0}`} mono/>
        <Field label="Min qty" value={`${inv.min_qty || 0}`} mono/>
      </div>
      <EntityFilesCard entityType="inventory" entityId={inv.id} title="Inventory evidence" manage showEmpty />
    </div>);
}
