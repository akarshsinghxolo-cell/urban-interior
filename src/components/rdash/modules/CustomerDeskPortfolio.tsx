"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  Building,
  FileText,
  ListChecks,
  MapPin,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useRDashStore,
  siteFinancials,
  type ContextCustomerTab,
} from "@/lib/rdash/store";
import { customerProgress } from "@/lib/rdash/customer-progress";
import { isCustomerLinked } from "@/lib/rdash/customer-relations";
import {
  formatDate,
  formatINR,
  formatINRShort,
  indiaBusinessDate,
  invoiceStatusStyle,
  paymentStatusStyle,
  quotationStatusStyle,
  relativeDay,
  taskStatusStyle,
} from "@/lib/rdash/format";
import { workRequiredDisplayTitle } from "@/lib/rdash/work-types";
import { Avatar, EmptyState, MetricCard, StatusBadge } from "../primitives";
import { CustomerSitesDialog } from "../CustomerSitesDialog";
import { CustomerWorkRequiredDialog as WorkRequiredCreateDialog } from "../customer/CustomerWorkRequiredDialog";
import { CustomerWorkCaptureDialog } from "../customer/CustomerWorkCaptureDialog";
import { EntityFilesCard } from "../EntityFilesCard";
import { RecordPaymentDialog } from "../ActionDialogs";

/**
 * Customer 360° portfolio.
 *
 * This file intentionally contains only Customer context, aggregation and
 * launchers. Area / Work Required capture and Quotation business workflows are
 * implemented once in Customer-owned canonical components and are launched
 * from here and from the other modules.
 */
export function CustomerDesk({ view }: { view?: "default" | "timeline" } = {}) {
  const db = useRDashStore((state) => state.db);
  const selectedCustomerId = useRDashStore((state) => state.selectedCustomerId);
  const customer = selectedCustomerId
    ? db.customers.find((row) => row.id === selectedCustomerId)
    : undefined;

  if (!customer) {
    return <EmptyState title="No customer selected" description="Pick a customer to open the Customer portfolio." />;
  }

  if (view === "timeline") return <CustomerTimelineView customerId={customer.id} />;
  return <CustomerPortfolioDrawerContent customerId={customer.id} />;
}

export function CustomerPortfolioDrawerContent({ customerId }: { customerId: string }) {
  const db = useRDashStore((state) => state.db);
  const detailPanel = useRDashStore((state) => state.detailPanel);
  const contextHistory = useRDashStore((state) => state.contextHistory);
  const contextHistoryIndex = useRDashStore((state) => state.contextHistoryIndex);
  const setContextCustomerTab = useRDashStore((state) => state.setContextCustomerTab);
  const openCreateDialog = useRDashStore((state) => state.openCreateDialog);
  const openActionDialog = useRDashStore((state) => state.openActionDialog);
  const openDetail = useRDashStore((state) => state.openDetail);
  const setActiveModule = useRDashStore((state) => state.setActiveModule);

  const customer = db.customers.find((row) => row.id === customerId);
  const currentContextEntry = contextHistory[contextHistoryIndex];
  const isContextCustomer = detailPanel.fromModule === "context"
    && detailPanel.kind === "customer"
    && detailPanel.recordId === customerId
    && currentContextEntry?.recordId === customerId;
  const [localTab, setLocalTab] = React.useState<ContextCustomerTab>("overview");
  const tab = isContextCustomer ? currentContextEntry?.customerTab || "overview" : localTab;
  const selectTab = (next: ContextCustomerTab) => {
    if (isContextCustomer) setContextCustomerTab(next);
    else setLocalTab(next);
  };

  const [addSiteOpen, setAddSiteOpen] = React.useState(false);
  const [editSiteId, setEditSiteId] = React.useState<string | undefined>();
  const [createWorkRequiredSiteId, setCreateWorkRequiredSiteId] = React.useState<string | null>(null);
  const [captureWorkRequiredId, setCaptureWorkRequiredId] = React.useState<string | null>(null);
  const [advanceDialogOpen, setAdvanceDialogOpen] = React.useState(false);

  if (!customer) return <EmptyState title="Customer not found" description="This Customer record is no longer available." />;

  const sites = db.sites.filter((row) => row.customer_id === customerId && !row.is_archived);
  const siteIds = new Set(sites.map((row) => row.id));
  const workRequired = db.workRequired.filter((row) => row.customer_id === customerId || (row.site_id ? siteIds.has(row.site_id) : false));
  const quotations = db.quotations.filter((row) => row.customer_id === customerId);
  const payments = db.payments.filter((row) => row.customer_id === customerId);
  const visits = db.visits.filter((row) => row.customer_id === customerId);
  const invoices = db.invoices.filter((row) => row.customer_id === customerId);
  const tasks = db.tasks.filter((row) => isCustomerLinked(db, row, customerId));
  const workOrders = db.workOrders.filter((row) => row.customer_id === customerId);
  const workOrderIds = new Set(workOrders.map((row) => row.id));
  const receipts = db.customerReceipts.filter((row) => isCustomerLinked(db, row, customerId));
  const advances = payments.filter((row) => row.is_advance);
  const advanceIds = new Set(advances.map((row) => row.id));
  const advanceReceived = db.customerReceipts
    .filter((row) => row.payment_id && advanceIds.has(row.payment_id))
    .reduce((sum, row) => sum + row.amount, 0);
  const acceptedScopes = db.acceptedScopes.filter((row) => row.customer_id === customerId);
  const vendorBills = db.vendorBills.filter((bill) => {
    if (bill.status === "paid") return false;
    const po = bill.po_id ? db.purchaseOrders.find((row) => row.id === bill.po_id) : undefined;
    return Boolean(po?.work_order_id && workOrderIds.has(po.work_order_id));
  });
  const contractorCosts = db.workOrderCostLines.filter((row) => workOrderIds.has(row.work_order_id) && row.type === "contractor");
  const contractorApprovals = db.actions.filter((row) =>
    row.status === "pending" && row.linked_record_type === "contractor_payment" && workOrders.some((workOrder) => workOrder.id === row.linked_record_id),
  );
  const references = db.entityReferenceAssignments.filter((row) => isCustomerLinked(db, row, customerId));
  const progress = customerProgress(db, customerId);

  const relatedEntityIds = new Set<string>([customerId]);
  [
    ...sites,
    ...workRequired,
    ...quotations,
    ...payments,
    ...visits,
    ...invoices,
    ...tasks,
    ...workOrders,
  ].forEach((row) => relatedEntityIds.add(row.id));
  db.areas.filter((row) => row.site_id && siteIds.has(row.site_id)).forEach((row) => relatedEntityIds.add(row.id));
  const relatedFiles = db.entityFileAttachments.filter((row) => relatedEntityIds.has(row.entity_id));

  const totalAccepted = acceptedScopes.reduce((sum, row) => sum + (row.accepted_value || 0), 0);
  const unlinkedReceipts = receipts.filter((row) => !row.payment_id).reduce((sum, row) => sum + row.amount, 0);
  const paymentMirror = payments.reduce((sum, row) => sum + (row.received_amount || (row.status === "received" ? row.amount : 0)), 0);
  const totalReceived = unlinkedReceipts + paymentMirror;
  const totalInvoiced = invoices.reduce((sum, row) => sum + (row.total_amount || 0), 0);
  const totalReceivable = invoices.reduce((sum, row) => sum + (row.balance_amount || 0), 0);
  const vendorLiability = vendorBills.reduce((sum, row) => sum + (row.total_amount || 0), 0);
  const contractorIncurred = contractorCosts.reduce((sum, row) => sum + (row.amount || 0), 0);

  const tabs: Array<{ key: ContextCustomerTab; label: string; icon: React.ReactNode }> = [
    { key: "overview", label: "Overview", icon: <Activity className="h-3.5 w-3.5" /> },
    { key: "sites", label: `Sites (${sites.length})`, icon: <Building className="h-3.5 w-3.5" /> },
    { key: "tasks", label: `Tasks (${tasks.length})`, icon: <ListChecks className="h-3.5 w-3.5" /> },
    { key: "quotations", label: `Quotations (${quotations.length})`, icon: <FileText className="h-3.5 w-3.5" /> },
    { key: "payments", label: `Payments (${payments.length})`, icon: <Wallet className="h-3.5 w-3.5" /> },
    { key: "invoices", label: `Invoices (${invoices.length})`, icon: <Receipt className="h-3.5 w-3.5" /> },
    { key: "advances", label: `Advances (${advances.length})`, icon: <Wallet className="h-3.5 w-3.5" /> },
    { key: "liabilities", label: `Liabilities (${vendorBills.length + contractorApprovals.length})`, icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    { key: "visits", label: `Visits (${visits.length})`, icon: <MapPin className="h-3.5 w-3.5" /> },
    { key: "activity", label: `Activity (${references.length + relatedFiles.length})`, icon: <Activity className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={customer.name} size={44} />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{customer.name}</h2>
            <p className="text-xs text-muted-foreground">{customer.phone || "No phone"}{customer.email ? ` · ${customer.email}` : ""}</p>
            <p className="mt-1 text-xs text-foreground/70">{progress.summary}</p>
          </div>
        </div>
        <StatusBadge label={progress.label} className="border-primary/20 bg-primary/10 text-primary" />
      </div>

      <div className="rd-scroll mt-4 flex gap-1 overflow-x-auto border-b border-border pb-2">
        {tabs.map((entry) => (
          <button key={entry.key} type="button" onClick={() => selectTab(entry.key)} className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${tab === entry.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            {entry.icon}{entry.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "overview" && (
          <div className="space-y-4">
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase text-muted-foreground">Financial Summary</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricCard label="Accepted" value={formatINRShort(totalAccepted)} tone="primary" />
                <MetricCard label="Collected" value={formatINRShort(totalReceived)} tone="success" />
                <MetricCard label="Invoiced" value={formatINRShort(totalInvoiced)} tone="default" />
                <MetricCard label="Receivable" value={formatINRShort(totalReceivable)} tone="warning" />
              </div>
            </section>
            <EntityFilesCard entityType="customer" entityId={customerId} title="Customer documents" />
            <section>
              <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold uppercase text-muted-foreground">Sites</h3><Button size="sm" variant="outline" onClick={() => setAddSiteOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />Add site</Button></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {sites.map((site) => {
                  const financials = siteFinancials(db, site.id);
                  return <button key={site.id} type="button" onClick={() => selectTab("sites")} className="rounded-lg border border-border bg-background p-3 text-left hover:bg-accent/20">
                    <p className="font-semibold">{site.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{site.locality || site.city || site.address || "Location pending"}</p>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]"><span>Collected {formatINRShort(financials.collected)}</span><span>Invoiced {formatINRShort(financials.invoiced)}</span><span>Due {formatINRShort(financials.receivable)}</span></div>
                  </button>;
                })}
                {!sites.length && <EmptyState title="No sites" description="Add the first Customer Site to define Areas and Work Required." />}
              </div>
            </section>
          </div>
        )}

        {tab === "sites" && (
          <div className="space-y-3">
            <div className="flex justify-end"><Button size="sm" onClick={() => setAddSiteOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />Add site</Button></div>
            {sites.map((site) => {
              const siteAreas = db.areas.filter((row) => row.site_id === site.id && !row.is_archived);
              const siteWork = workRequired.filter((row) => row.site_id === site.id);
              return <section key={site.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-bold">{site.name}</p><p className="text-xs text-muted-foreground">{site.locality || site.city || site.address || "Location pending"} · {siteAreas.length} Area(s)</p></div>
                  <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setEditSiteId(site.id)}>Edit site</Button><Button size="sm" variant="outline" onClick={() => setCreateWorkRequiredSiteId(site.id)}><Plus className="mr-1 h-3 w-3" />Work Required</Button></div>
                </div>
                <div className="mt-3 space-y-2">
                  {siteWork.map((work) => <div key={work.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2.5">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{workRequiredDisplayTitle(db.master.workSubcategories, work)}</p><p className="text-[11px] text-muted-foreground">{work.area_ids.map((id) => siteAreas.find((area) => area.id === id)?.name).filter(Boolean).join(", ") || "Area selection pending"}</p></div>
                    <div className="flex gap-2"><StatusBadge label={work.status} className="bg-muted text-muted-foreground border-border" /><Button size="sm" onClick={() => setCaptureWorkRequiredId(work.id)}>Capture detailed area</Button></div>
                  </div>)}
                  {!siteWork.length && <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No Work Required yet. Use the canonical Work Required form to create Areas, category, subcategory and work type selection together.</p>}
                </div>
              </section>;
            })}
            {!sites.length && <EmptyState title="No sites" description="Add a Customer Site first." />}
          </div>
        )}

        {tab === "tasks" && (
          <RecordList
            action={<Button size="sm" variant="outline" onClick={() => openCreateDialog({ kind: "task", customerId })}><Plus className="mr-1 h-3 w-3" />Add task</Button>}
            empty="No Customer tasks."
            rows={tasks.map((task) => ({
              id: task.id,
              title: task.title,
              detail: `Due ${relativeDay(task.due_date)} · ${task.assignee_name}`,
              status: taskStatusStyle(task.status),
              onOpen: () => openDetail("task", task.id),
            }))}
          />
        )}

        {tab === "quotations" && (
          <RecordList
            action={<Button size="sm" variant="outline" onClick={() => openCreateDialog({ kind: "quotation", customerId })}><Plus className="mr-1 h-3 w-3" />Add quotation</Button>}
            empty="No Customer quotations."
            rows={quotations.map((quotation) => ({
              id: quotation.id,
              title: `${quotation.quotation_no} · ${quotation.title}`,
              detail: `${formatINR(quotation.total_amount)} · valid ${relativeDay(quotation.valid_until)}`,
              status: quotationStatusStyle(quotation.status),
              onOpen: () => openDetail("quotation", quotation.id),
            }))}
          />
        )}

        {tab === "payments" && (
          <RecordList
            action={<Button size="sm" variant="outline" onClick={() => openActionDialog("record-payment", customerId)}><Plus className="mr-1 h-3 w-3" />Add collection milestone</Button>}
            empty="No Customer payment milestones."
            rows={payments.map((payment) => ({
              id: payment.id,
              title: `${formatINR(payment.amount)} · ${payment.milestone_label || "Payment"}`,
              detail: `Due ${relativeDay(payment.due_date)} · ${payment.mode}`,
              status: paymentStatusStyle(payment.status),
              onOpen: () => openDetail("payment", payment.id),
            }))}
          />
        )}

        {tab === "invoices" && (
          <RecordList
            empty="No Customer invoices. Issue/open the invoice from its collection milestone so receipts remain auditable."
            rows={invoices.map((invoice) => ({
              id: invoice.id,
              title: `${invoice.invoice_no} · ${invoice.title}`,
              detail: `Due ${relativeDay(invoice.due_date)} · balance ${formatINR(invoice.balance_amount)}`,
              status: invoiceStatusStyle(invoice.status),
              onOpen: () => openDetail("invoice", invoice.id),
            }))}
          />
        )}

        {tab === "advances" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><MetricCard label="Advance milestones" value={advances.length} tone="primary" /><MetricCard label="Received advances" value={formatINRShort(advanceReceived)} tone="success" /><MetricCard label="Open advance" value={formatINRShort(Math.max(0, advances.reduce((sum, row) => sum + row.amount, 0) - advanceReceived))} tone="warning" /></div>
            <div className="flex justify-end"><Button size="sm" onClick={() => setAdvanceDialogOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />Add advance</Button></div>
            <RecordList empty="No Customer advances." rows={advances.map((payment) => ({ id: payment.id, title: `${formatINR(payment.amount)} · ${payment.milestone_label || "Advance"}`, detail: `Due ${relativeDay(payment.due_date)}`, status: paymentStatusStyle(payment.status), onOpen: () => openDetail("payment", payment.id) }))} />
          </div>
        )}

        {tab === "liabilities" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><MetricCard label="Vendor bills unpaid" value={formatINRShort(vendorLiability)} tone="destructive" /><MetricCard label="Contractor cost incurred" value={formatINRShort(contractorIncurred)} tone="warning" /><MetricCard label="Pending contractor approvals" value={contractorApprovals.length} tone="primary" /></div>
            <RecordList empty="No unpaid vendor bills for this Customer." rows={vendorBills.map((bill) => ({ id: bill.id, title: `${bill.bill_no} · ${bill.vendor_name}`, detail: `${bill.po_no || "PO"} · due ${relativeDay(bill.due_date)}`, onOpen: () => openDetail("vendorBill", bill.id) }))} />
            <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setActiveModule("financeDesk")}>Open Finance</Button></div>
          </div>
        )}

        {tab === "visits" && (
          <RecordList
            action={<Button size="sm" variant="outline" onClick={() => openCreateDialog({ kind: "visit", customerId })}><Plus className="mr-1 h-3 w-3" />Add visit</Button>}
            empty="No Customer visits."
            rows={visits.map((visit) => ({ id: visit.id, title: `${visit.visit_type.replaceAll("_", " ")} · ${visit.location_name}`, detail: `${formatDate(visit.scheduled_at)} · ${visit.staff_name}`, status: { label: visit.status, className: "bg-muted text-muted-foreground border-border" }, onOpen: () => openDetail("visit", visit.id) }))}
          />
        )}

        {tab === "activity" && (
          <div className="space-y-4">
            <CustomerTimelineView customerId={customerId} compact />
            <section><h3 className="mb-2 text-xs font-bold uppercase text-muted-foreground">Reference media & catalogues ({references.length})</h3>{references.length ? <div className="space-y-1">{references.map((row) => <div key={row.id} className="rounded border border-border p-2 text-xs"><p className="font-semibold">{row.entity_label || row.resource_type.replaceAll("_", " ")}</p><p className="text-muted-foreground">{row.resource_type.replaceAll("_", " ")} · {row.purpose.replaceAll("_", " ")} · {row.status}</p></div>)}</div> : <p className="text-xs text-muted-foreground">No linked reference media.</p>}</section>
            <section><h3 className="mb-2 text-xs font-bold uppercase text-muted-foreground">Files & proofs ({relatedFiles.length})</h3>{relatedFiles.length ? <div className="space-y-1">{relatedFiles.slice(0, 20).map((row) => <div key={row.id} className="rounded border border-border p-2 text-xs"><p className="font-semibold">{row.entity_type.replaceAll("_", " ")} proof / file</p><p className="text-muted-foreground">Attachment {row.file_asset_id}</p></div>)}</div> : <p className="text-xs text-muted-foreground">No Customer-linked files or proofs.</p>}</section>
          </div>
        )}
      </div>

      <CustomerSitesDialog editId={customerId} open={addSiteOpen} autoAddSite onClose={() => setAddSiteOpen(false)} />
      <CustomerSitesDialog editId={customerId} open={Boolean(editSiteId)} expandSiteId={editSiteId} onClose={() => setEditSiteId(undefined)} />
      {createWorkRequiredSiteId && (() => {
        const site = sites.find((row) => row.id === createWorkRequiredSiteId);
        return site ? <WorkRequiredCreateDialog open customerId={customerId} site={site} onOpenChange={(open) => !open && setCreateWorkRequiredSiteId(null)} onCreated={(id) => setCaptureWorkRequiredId(id)} /> : null;
      })()}
      {captureWorkRequiredId && (() => {
        const work = workRequired.find((row) => row.id === captureWorkRequiredId);
        const site = work?.site_id ? sites.find((row) => row.id === work.site_id) : undefined;
        return work && site ? <CustomerWorkCaptureDialog workRequired={work} site={site} areas={db.areas.filter((row) => row.site_id === site.id)} onClose={() => setCaptureWorkRequiredId(null)} /> : null;
      })()}
      <RecordPaymentDialog open={advanceDialogOpen} onOpenChange={setAdvanceDialogOpen} customerId={customerId} defaultIsAdvance />
    </div>
  );
}

type ListRow = {
  id: string;
  title: string;
  detail?: string;
  status?: { label: string; className: string };
  onOpen?: () => void;
};

function RecordList({ rows, empty, action }: { rows: ListRow[]; empty: string; action?: React.ReactNode }) {
  return <div className="space-y-2">{action && <div className="flex justify-end">{action}</div>}{rows.length ? rows.map((row) => <button key={row.id} type="button" onClick={row.onOpen} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-accent/20"><div className="min-w-0"><p className="truncate text-sm font-medium">{row.title}</p>{row.detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{row.detail}</p>}</div>{row.status && <StatusBadge label={row.status.label} className={row.status.className} />}</button>) : <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{empty}</p>}</div>;
}

type TimelineEntry = { id: string; ts: string; kind: string; title: string; detail?: string };

function CustomerTimelineView({ customerId, compact = false }: { customerId: string; compact?: boolean }) {
  const db = useRDashStore((state) => state.db);
  const customer = db.customers.find((row) => row.id === customerId);
  if (!customer) return null;
  const workOrders = db.workOrders.filter((row) => row.customer_id === customerId);
  const workOrderIds = new Set(workOrders.map((row) => row.id));
  const sites = db.sites.filter((row) => row.customer_id === customerId);
  const siteIds = new Set(sites.map((row) => row.id));
  const quotations = db.quotations.filter((row) => row.customer_id === customerId);
  const payments = db.payments.filter((row) => row.customer_id === customerId);
  const visits = db.visits.filter((row) => row.customer_id === customerId);
  const tasks = db.tasks.filter((row) => isCustomerLinked(db, row, customerId));
  const relatedIds = new Set([customerId, ...workOrders.map((row) => row.id), ...sites.map((row) => row.id), ...quotations.map((row) => row.id), ...payments.map((row) => row.id), ...visits.map((row) => row.id), ...tasks.map((row) => row.id)]);

  const entries: TimelineEntry[] = [
    ...tasks.map((row) => ({ id: `task-${row.id}`, ts: row.updated_at || row.created_at, kind: "task", title: row.title, detail: row.status })),
    ...quotations.map((row) => ({ id: `quotation-${row.id}`, ts: row.updated_at || row.created_at, kind: "quotation", title: row.quotation_no, detail: row.status })),
    ...payments.map((row) => ({ id: `payment-${row.id}`, ts: row.updated_at || row.created_at, kind: "payment", title: row.milestone_label || "Payment", detail: formatINR(row.amount) })),
    ...visits.map((row) => ({ id: `visit-${row.id}`, ts: row.updated_at || row.created_at, kind: "visit", title: row.location_name, detail: row.status })),
    ...db.drawings.filter((row) => row.work_order_id && workOrderIds.has(row.work_order_id)).map((row) => ({ id: `drawing-${row.id}`, ts: row.updated_at || row.created_at, kind: "drawing", title: row.title || "Drawing", detail: row.status })),
    ...db.executionLogs.filter((row) => row.work_order_id && workOrderIds.has(row.work_order_id)).map((row) => ({ id: `execution-${row.id}`, ts: row.created_at, kind: "executionLog", title: row.log_no || "Execution update", detail: row.work_order_no })),
    ...db.purchaseOrders.filter((row) => (row.site_id && siteIds.has(row.site_id)) || (row.work_order_id && workOrderIds.has(row.work_order_id))).map((row) => ({ id: `po-${row.id}`, ts: row.updated_at || row.created_at, kind: "po", title: row.po_no, detail: row.status })),
    ...db.grns.filter((row) => row.work_order_id && workOrderIds.has(row.work_order_id)).map((row) => ({ id: `grn-${row.id}`, ts: row.updated_at || row.created_at, kind: "grn", title: row.grn_no, detail: row.status })),
    ...db.vendorBills.filter((row) => row.work_order_id && workOrderIds.has(row.work_order_id)).map((row) => ({ id: `vendorBill-${row.id}`, ts: row.updated_at || row.created_at, kind: "vendorBill", title: row.bill_no, detail: row.status })),
    ...db.commSends.filter((row) => row.customer_id === customerId).map((row) => ({ id: `communication-${row.id}`, ts: row.sent_at, kind: "communication", title: row.subject || row.channel, detail: row.status })),
    ...db.auditLog.filter((row) => row.entity_id && relatedIds.has(row.entity_id)).map((row) => ({ id: `audit-${row.id}`, ts: row.timestamp, kind: "audit", title: row.action, detail: row.entity_label })),
  ].filter((entry) => Boolean(entry.ts)).sort((a, b) => b.ts.localeCompare(a.ts));

  const visible = compact ? entries.slice(0, 12) : entries;
  const groups = new Map<string, TimelineEntry[]>();
  for (const entry of visible) {
    const date = indiaBusinessDate(entry.ts);
    groups.set(date, [...(groups.get(date) || []), entry]);
  }

  return <div className="space-y-3">{[...groups.entries()].map(([date, rows]) => <section key={date}><p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">{date}</p><div className="space-y-1">{rows.map((entry) => <div key={entry.id} className="rounded-md border border-border bg-background px-2.5 py-2"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold">{entry.title}</p><span className="text-[10px] uppercase text-muted-foreground">{entry.kind}</span></div>{entry.detail && <p className="mt-0.5 text-[10px] text-muted-foreground">{entry.detail}</p>}</div>)}</div></section>)}{!visible.length && <EmptyState title="No activity yet" description="Customer operational events will appear here." />}</div>;
}
