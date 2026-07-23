"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { calculateQuotationMetrics, calculateSalesPipelineMetrics, collectWonWorkRequiredIds, isWonSalesStatus } from "@/lib/rdash/metrics";
import { useRDashStore, computeJobPnL, allJobPnLs, vendorBalance, customerBalance } from "@/lib/rdash/store";
import type { RDashDatabase } from "@/lib/rdash/types";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { formatINR, formatINRShort, formatDate, relativeDay, titleCase, quotationStatusStyle, paymentStatusStyle, jobStatusStyle, } from "@/lib/rdash/format";
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Users, Package, Clock, Target, MapPin, CheckCircle2, AlertTriangle, Download, FileText, Calendar as CalendarIcon, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
function BarRow({ label, value, max, color = "bg-primary", valueLabel }: {
    label: string;
    value: number;
    max: number;
    color?: string;
    valueLabel?: string;
}) {
    const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
    return (<div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-xs text-muted-foreground" title={label}>{label}</span>
      <div className="h-4 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }}/>
      </div>
      <span className="w-24 shrink-0 text-right text-xs font-semibold">{valueLabel || formatINRShort(value)}</span>
    </div>);
}
function lastNMonths(n: number): {
    key: string;
    label: string;
    year: number;
    monthIdx: number;
}[] {
    const out: {
        key: string;
        label: string;
        year: number;
        monthIdx: number;
    }[] = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        out.push({
            key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
            label: d.toLocaleString("en-IN", { month: "short" }),
            year: d.getFullYear(),
            monthIdx: d.getMonth(),
        });
    }
    return out;
}
function paymentOutstanding(payment: {
    amount: number;
    received_amount?: number;
}) {
    return Math.max(0, payment.amount - (payment.received_amount || 0));
}
function monthlyReceived(db: RDashDatabase, n: number) {
    const months = lastNMonths(n);
    return months.map((month) => {
        const value = db.customerReceipts
            .filter((receipt) => {
            const date = new Date(receipt.received_at);
            return date.getFullYear() === month.year && date.getMonth() === month.monthIdx;
        })
            .reduce((sum, receipt) => sum + receipt.amount, 0);
        return { ...month, value };
    });
}
function monthlyReceivedVsPending(db: RDashDatabase, n: number) {
    const months = lastNMonths(n);
    return months.map((month) => {
        const received = db.customerReceipts
            .filter((receipt) => {
            const date = new Date(receipt.received_at);
            return date.getFullYear() === month.year && date.getMonth() === month.monthIdx;
        })
            .reduce((sum, receipt) => sum + receipt.amount, 0);
        const pending = db.payments
            .filter((payment) => payment.status === "pending" || payment.status === "overdue" || payment.status === "partial")
            .filter((payment) => {
            const date = new Date(payment.due_date);
            return date.getFullYear() === month.year && date.getMonth() === month.monthIdx;
        })
            .reduce((sum, payment) => sum + paymentOutstanding(payment), 0);
        return { ...month, received, pending, total: received + pending };
    });
}
function DonutStat({ label, value, total, color }: {
    label: string;
    value: number;
    total: number;
    color: string;
}) {
    const pct = total > 0 ? (value / total) * 100 : 0;
    return (<div className="flex items-center gap-2.5">
      <div className={cn("h-3 w-3 rounded-full", color)}/>
      <div className="flex-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-xs font-semibold">{pct.toFixed(0)}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }}/>
        </div>
      </div>
      <span className="w-16 shrink-0 text-right text-xs font-mono">{formatINRShort(value)}</span>
    </div>);
}
function ReportCard({ title, subtitle, icon, children, action }: {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-primary">{icon}</span>}
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>);
}

/**
 * I: Apply the inbound report filter to the database, returning a shallow
 * filtered view that the individual report functions consume. When no filter
 * is set (or the filter has no fields), the original db is returned.
 *
 * Filter dimensions:
 *  - customerId: filter quotations, payments, invoices, customerReceipts,
 *    visits, tasks, followups, workOrders to that customer. Vendor data is
 *    left untouched (a customer filter doesn't change vendor exposure).
 *  - workOrderId: filter the same set + POs/GRNs/bills to that work order.
 *  - vendorId: filter POs, GRNs, vendorBills, vendorPayments, vendorRates to
 *    that vendor.
 *  - staffId: filter tasks, visits, attendance, pings to that staff.
 */
type ReportFilter = { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null | undefined;
function applyReportFilter(db: RDashDatabase, filter: ReportFilter): RDashDatabase {
    if (!filter) return db;
    const hasFilter = !!(filter.customerId || filter.workOrderId || filter.vendorId || filter.staffId);
    if (!hasFilter) return db;
    // Resolve customerId from workOrderId if only workOrderId is set, so we
    // can filter customer-scoped collections consistently.
    let customerId = filter.customerId;
    if (!customerId && filter.workOrderId) {
        const wo = db.workOrders.find((w) => w.id === filter.workOrderId);
        if (wo) customerId = wo.customer_id;
    }
    // Resolve workOrderIds from customerId if only customerId is set, so
    // work-order-scoped collections (POs/GRNs/bills) are also filtered.
    const workOrderIds = new Set<string>();
    if (customerId) {
        db.workOrders.filter((w) => w.customer_id === customerId).forEach((w) => workOrderIds.add(w.id));
    }
    if (filter.workOrderId) workOrderIds.add(filter.workOrderId);
    return {
        ...db,
        customers: filter.customerId ? db.customers.filter((c) => c.id === filter.customerId) : db.customers,
        sites: customerId ? db.sites.filter((s) => s.customer_id === customerId) : db.sites,
        workOrders: customerId || filter.workOrderId
            ? db.workOrders.filter((w) => (!customerId || w.customer_id === customerId) && (!filter.workOrderId || w.id === filter.workOrderId))
            : db.workOrders,
        quotations: customerId || filter.workOrderId
            ? db.quotations.filter((q) => (!customerId || q.customer_id === customerId) && (!filter.workOrderId || (q.work_order_ids || []).includes(filter.workOrderId)))
            : db.quotations,
        payments: customerId || filter.workOrderId
            ? db.payments.filter((p) => (!customerId || p.customer_id === customerId) && (!filter.workOrderId || p.work_order_id === filter.workOrderId))
            : db.payments,
        invoices: customerId || filter.workOrderId
            ? db.invoices.filter((i) => (!customerId || i.customer_id === customerId) && (!filter.workOrderId || i.work_order_id === filter.workOrderId))
            : db.invoices,
        customerReceipts: customerId || filter.workOrderId
            ? db.customerReceipts.filter((r) => (!customerId || r.customer_id === customerId) && (!filter.workOrderId || r.work_order_id === filter.workOrderId))
            : db.customerReceipts,
        visits: customerId || filter.workOrderId || filter.staffId
            ? db.visits.filter((v) => (!customerId || v.customer_id === customerId) && (!filter.workOrderId || v.work_order_id === filter.workOrderId) && (!filter.staffId || v.staff_id === filter.staffId))
            : db.visits,
        tasks: customerId || filter.workOrderId || filter.staffId
            ? db.tasks.filter((t) => (!customerId || t.customer_id === customerId) && (!filter.workOrderId || t.work_order_id === filter.workOrderId) && (!filter.staffId || t.assignee_id === filter.staffId))
            : db.tasks,
        followups: customerId || filter.staffId
            ? db.followups.filter((f) => (!customerId || f.customer_id === customerId) && (!filter.staffId || f.assigned_to === filter.staffId))
            : db.followups,
        purchaseOrders: filter.workOrderId || filter.vendorId
            ? db.purchaseOrders.filter((p) => (!filter.workOrderId || p.work_order_id === filter.workOrderId) && (!filter.vendorId || p.vendor_id === filter.vendorId))
            : db.purchaseOrders,
        grns: filter.workOrderId || filter.vendorId
            ? db.grns.filter((g) => (!filter.workOrderId || g.work_order_id === filter.workOrderId) && (!filter.vendorId || g.vendor_id === filter.vendorId))
            : db.grns,
        vendorBills: filter.workOrderId || filter.vendorId
            ? db.vendorBills.filter((b) => (!filter.workOrderId || b.work_order_id === filter.workOrderId) && (!filter.vendorId || b.vendor_id === filter.vendorId))
            : db.vendorBills,
        vendorPayments: filter.workOrderId || filter.vendorId
            ? db.vendorPayments.filter((p) => (!filter.workOrderId || p.work_order_id === filter.workOrderId) && (!filter.vendorId || p.vendor_id === filter.vendorId))
            : db.vendorPayments,
        vendorRfqs: filter.workOrderId
            ? db.vendorRfqs.filter((r) => r.work_order_id === filter.workOrderId)
            : db.vendorRfqs,
        master: filter.vendorId
            ? { ...db.master, vendors: db.master.vendors.filter((v) => v.id === filter.vendorId) }
            : filter.staffId
                ? { ...db.master, staff: db.master.staff.filter((s) => s.id === filter.staffId) }
                : db.master,
    };
}
export function ReportsModule({ reportId }: {
    reportId?: string;
}) {
    const db = useRDashStore((s) => s.db);
    const reportFilter = useRDashStore((s) => s.reportFilter);
    const clearReportFilter = useRDashStore((s) => s.clearReportFilter);
    // I: If reportFilter carries a different reportId, prefer it (inbound deep-link).
    const id = reportFilter?.reportId || reportId || "reportsDesk";
    // I: Show a banner when an inbound filter is active so users know the
    // report is scoped + can clear it to see all data.
    const filterCustomer = reportFilter?.customerId ? db.customers.find((c) => c.id === reportFilter.customerId) : undefined;
    const filterWo = reportFilter?.workOrderId ? db.workOrders.find((w) => w.id === reportFilter.workOrderId) : undefined;
    const filterVendor = reportFilter?.vendorId ? db.master.vendors.find((v) => v.id === reportFilter.vendorId) : undefined;
    const filterStaff = reportFilter?.staffId ? db.master.staff.find((s) => s.id === reportFilter.staffId) : undefined;
    const hasInboundFilter = !!(filterCustomer || filterWo || filterVendor || filterStaff);
    const render = () => {
        switch (id) {
            case "salesReport": return <SalesReport db={db} filter={reportFilter}/>;
            case "collectionReport": return <CollectionReport db={db} filter={reportFilter}/>;
            case "jobPnlReport": return <JobPnLReport db={db} filter={reportFilter}/>;
            case "vendorExposureReport": return <VendorExposureReport db={db} filter={reportFilter}/>;
            case "taxReport": return <TaxReport db={db} filter={reportFilter}/>;
            case "staffProductivity": return <StaffProductivityReport db={db} filter={reportFilter}/>;
            case "quotationConversion": return <QuotationConversionReport db={db} filter={reportFilter}/>;
            case "leadSourceReport": return <LeadSourceReport db={db} filter={reportFilter}/>;
            case "agingReportRep": return <AgingReport db={db} filter={reportFilter}/>;
            case "visitCompliance": return <VisitComplianceReport db={db} filter={reportFilter}/>;
            case "taskThroughput": return <TaskThroughputReport db={db} filter={reportFilter}/>;
            default: return <ReportsOverview db={db}/>;
        }
    };
    const exportCsv = () => {
        // I: Apply the inbound filter to the export too, so the CSV matches
        // what the user sees on screen.
        const fdb = applyReportFilter(db, reportFilter);
        const rows: string[][] = [];
        switch (id) {
            case "salesReport": {
                rows.push(["Quotation No", "Customer", "Status", "Amount", "Valid Until", "Created"]);
                fdb.quotations.forEach((q) => rows.push([q.quotation_no, (q.customer_name || "Customer"), q.status, String(q.total_amount), q.valid_until, q.created_at]));
                break;
            }
            case "collectionReport": {
                rows.push(["Payment No", "Customer", "Milestone", "Amount", "Status", "Due Date", "Received Date"]);
                fdb.payments.forEach((p) => rows.push([p.id, (p.customer_name || "Customer"), p.milestone_label || "", String(p.amount), p.status, p.due_date || "", p.received_date || ""]));
                break;
            }
            case "jobPnlReport": {
                rows.push(["WorkOrder No", "Customer", "Title", "Status", "Value", "Progress"]);
                fdb.workOrders.forEach((j) => rows.push([j.work_order_no, (j.customer_name || "Customer"), j.title, j.status, String(j.value), `${j.progress}%`]));
                break;
            }
            case "vendorExposureReport": {
                rows.push(["Vendor", "Category", "City", "Outstanding", "On-time %"]);
                fdb.master.vendors.forEach((v) => rows.push([v.name, v.category || "", v.city || "", String(v.outstanding || 0), `${v.on_time_pct || 0}%`]));
                break;
            }
            case "taxReport": {
                rows.push(["Quotation No", "Customer", "Subtotal", "Tax", "Total", "Status"]);
                fdb.quotations.forEach((q) => rows.push([q.quotation_no, (q.customer_name || "Customer"), String(q.subtotal || 0), String(q.tax_amount || 0), String(q.total_amount), q.status]));
                break;
            }
            case "agingReportRep": {
                const unpaid = fdb.payments.filter((p) => p.status === "pending" || p.status === "overdue");
                rows.push(["Payment ID", "Customer", "Amount", "Status", "Due Date", "Days Overdue"]);
                unpaid.forEach((p) => {
                    const days = p.due_date ? Math.floor((Date.now() - new Date(p.due_date).getTime()) / 86400000) : 0;
                    rows.push([p.id, (p.customer_name || "Customer"), String(p.amount), p.status, p.due_date || "", String(Math.max(0, days))]);
                });
                break;
            }
            default: {
                rows.push(["Report", titleFor(id)]);
                rows.push(["Generated", new Date().toISOString()]);
                rows.push(["Note", "Detailed CSV export available for Sales, Collection, WorkOrder P&L, Vendor Exposure, Tax, and Aging reports."]);
            }
        }
        const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${id}-report-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`${titleFor(id)} exported as CSV`);
    };
    const exportPdf = () => {
        // I: Apply the inbound filter to the PDF export too, so it matches
        // what the user sees on screen.
        const fdb = applyReportFilter(db, reportFilter);
        const title = titleFor(id);
        const subtitle = subtitleFor(id);
        const generated = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
        const headers: string[] = [];
        const dataRows: string[][] = [];
        switch (id) {
            case "salesReport": {
                headers.push("Quotation No", "Customer", "Status", "Amount", "Valid Until", "Created");
                fdb.quotations.forEach((q) => dataRows.push([q.quotation_no, (q.customer_name || "Customer"), titleCase(q.status), formatINR(q.total_amount), formatDate(q.valid_until), formatDate(q.created_at)]));
                break;
            }
            case "collectionReport": {
                headers.push("Payment No", "Customer", "Milestone", "Amount", "Status", "Due Date", "Received");
                fdb.payments.forEach((p) => dataRows.push([p.id.slice(-6).toUpperCase(), (p.customer_name || "Customer"), p.milestone_label || "—", formatINR(p.amount), titleCase(p.status), p.due_date ? formatDate(p.due_date) : "—", p.received_date ? formatDate(p.received_date) : "—"]));
                break;
            }
            case "jobPnlReport": {
                headers.push("WorkOrder No", "Customer", "Title", "Status", "Value", "Progress");
                fdb.workOrders.forEach((j) => dataRows.push([j.work_order_no, (j.customer_name || "Customer"), j.title, titleCase(j.status), formatINR(j.value), `${j.progress}%`]));
                break;
            }
            case "vendorExposureReport": {
                headers.push("Vendor", "Category", "City", "Outstanding", "On-time %");
                fdb.master.vendors.forEach((v) => dataRows.push([v.name, v.category || "—", v.city || "—", formatINR(v.outstanding || 0), `${v.on_time_pct || 0}%`]));
                break;
            }
            case "taxReport": {
                headers.push("Quotation No", "Customer", "Subtotal", "Tax", "Total", "Status");
                fdb.quotations.forEach((q) => dataRows.push([q.quotation_no, (q.customer_name || "Customer"), formatINR(q.subtotal || 0), formatINR(q.tax_amount || 0), formatINR(q.total_amount), titleCase(q.status)]));
                break;
            }
            case "agingReportRep": {
                const unpaid = fdb.payments.filter((p) => p.status === "pending" || p.status === "overdue");
                headers.push("Payment ID", "Customer", "Amount", "Status", "Due Date", "Days Overdue");
                unpaid.forEach((p) => {
                    const days = p.due_date ? Math.floor((Date.now() - new Date(p.due_date).getTime()) / 86400000) : 0;
                    dataRows.push([p.id.slice(-6).toUpperCase(), (p.customer_name || "Customer"), formatINR(p.amount), titleCase(p.status), p.due_date ? formatDate(p.due_date) : "—", String(Math.max(0, days))]);
                });
                break;
            }
            default: {
                headers.push("Report", "Generated", "Note");
                dataRows.push([title, generated, "Detailed PDF export is available for Sales, Collection, WorkOrder P&L, Vendor Exposure, Tax, and Aging reports."]);
            }
        }
        const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const tableHtml = `
      <table>
        <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${dataRows.length > 0
            ? dataRows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
            : `<tr><td colspan="${headers.length}" class="empty">No data for this report.</td></tr>`}
        </tbody>
      </table>`;
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)} — Urban Castle Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 32px; font-size: 12px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7c3aed; padding-bottom: 12px; margin-bottom: 20px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-mark { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; }
  .brand-name { font-size: 16px; font-weight: 700; }
  .brand-sub { font-size: 10px; color: #6b7280; }
  .meta { text-align: right; font-size: 10px; color: #6b7280; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #111; }
  .subtitle { font-size: 12px; color: #6b7280; margin: 0 0 16px; }
  .summary { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .kpi { flex: 1; min-width: 140px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; background: #fafafa; }
  .kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; }
  .kpi-value { font-size: 16px; font-weight: 700; color: #111; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; text-transform: uppercase; font-size: 9px; letter-spacing: 0.04em; }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; color: #1f2937; }
  tbody tr:nth-child(even) { background: #fafafa; }
  tbody tr:hover { background: #f0f0ff; }
  td.empty { text-align: center; color: #9ca3af; padding: 24px; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; display: flex; justify-content: space-between; }
  @media print {
    body { margin: 16mm; }
    .header { page-break-after: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    thead { display: table-header-group; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-mark">R</div>
      <div>
        <div class="brand-name">Urban Castle Business Workspace</div>
        <div class="brand-sub">Owner-operating cockpit</div>
      </div>
    </div>
    <div class="meta">
      <div>Generated: ${esc(generated)}</div>
      <div>Report ID: ${esc(id)}</div>
    </div>
  </div>
  <h1>${esc(title)}</h1>
  <p class="subtitle">${esc(subtitle)}</p>
  ${dataRows.length > 0 ? `<div class="summary">
    <div class="kpi"><div class="kpi-label">Total Records</div><div class="kpi-value">${dataRows.length}</div></div>
  </div>` : ""}
  ${tableHtml}
  <div class="footer">
    <span>Urban Castle Report · ${esc(generated)}</span>
    <span>Confidential business document</span>
  </div>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;
        const win = window.open("", "_blank", "width=900,height=700");
        if (!win) {
            toast.error("Pop-up blocked — allow pop-ups for this site to export PDF");
            return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        toast.success(`${title} PDF opened in a new window — use "Save as PDF" in the print dialog`);
    };
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="h-5 w-5"/>
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">{titleFor(id)}</h2>
            <p className="text-xs text-muted-foreground">{subtitleFor(id)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportPdf}>
            <FileText className="mr-1.5 h-3.5 w-3.5"/> Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5"/> Export CSV
          </Button>
        </div>
      </div>
      {/* I: Inbound deep-link banner — shown when another module sent a
          filter (customer / work order / vendor / staff). Users can clear
          the filter to see all data. */}
      {hasInboundFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--panel-radius)] border border-primary/25 bg-primary/[0.04] px-3 py-2 text-xs">
          <span className="font-semibold text-primary">Filtered:</span>
          {filterCustomer && <span className="rounded-full bg-card px-2 py-0.5 font-medium">Customer: {filterCustomer.name}</span>}
          {filterWo && <span className="rounded-full bg-card px-2 py-0.5 font-medium">Work order: {filterWo.work_order_no}</span>}
          {filterVendor && <span className="rounded-full bg-card px-2 py-0.5 font-medium">Vendor: {filterVendor.name}</span>}
          {filterStaff && <span className="rounded-full bg-card px-2 py-0.5 font-medium">Staff: {filterStaff.name}</span>}
          <button type="button" onClick={() => clearReportFilter()} className="ml-auto text-primary hover:underline">Clear filter</button>
        </div>
      )}
      {render()}
    </div>);
}
function titleFor(id: string) {
    const map: Record<string, string> = {
        reportsHome: "Reports Desk",
        salesReport: "Sales Report",
        collectionReport: "Collection Report",
        jobPnlReport: "WorkOrder P&L Report",
        vendorExposureReport: "Vendor Exposure Report",
        taxReport: "Tax / GST Report",
        staffProductivity: "Staff Productivity Report",
        quotationConversion: "Quotation Conversion Report",
        leadSourceReport: "Lead Source Report",
        agingReportRep: "Aging Report",
        visitCompliance: "Visit Compliance Report",
        taskThroughput: "Task Throughput Report",
    };
    return map[id] || "Reports";
}
function subtitleFor(id: string) {
    const map: Record<string, string> = {
        reportsHome: "Business insights and exports — select a report from the sidebar",
        salesReport: "Revenue, pipeline and quotation performance",
        collectionReport: "Payment collection health and overdue exposure",
        jobPnlReport: "WorkOrder-wise profitability and cost breakdown",
        vendorExposureReport: "Vendor outstanding and reliability",
        taxReport: "GST collected vs paid",
        staffProductivity: "Task completion and visit compliance by staff",
        quotationConversion: "Quotation funnel: draft → sent → accepted",
        leadSourceReport: "Lead acquisition by source",
        agingReportRep: "Receivables aging buckets",
        visitCompliance: "Visit completion and report-filing compliance",
        taskThroughput: "Task throughput and completion rate",
    };
    return map[id] || "Business insights and exports";
}
function ReportsOverview({ db }: {
    db: RDashDatabase;
}) {
    const totalRevenue = db.customerReceipts.reduce((n, receipt) => n + receipt.amount, 0);
    const quotationMetrics = calculateQuotationMetrics(db.quotations);
    const totalPipeline = quotationMetrics.pipelineValue;
    const totalJobValue = db.workOrders.reduce((n, j) => n + j.value, 0);
    const overdueAmt = db.payments.filter((p) => p.status === "overdue").reduce((n, p) => n + paymentOutstanding(p), 0);
    const pnls = allJobPnLs(db);
    const totalCost = pnls.reduce((n, p) => n + (p?.total_cost || 0), 0);
    const totalMargin = pnls.reduce((n, p) => n + (p?.gross_margin || 0), 0);
    // Margin % is conventionally (margin / revenue) * 100. Use contracted revenue
    // (workOrder value) as the denominator when collected revenue is 0 (pre-revenue
    // projects still have a contracted value). Avoid divide-by-zero when there's
    // no revenue AND no contract value — fall back to 0% instead of absurd values.
    const marginDenominator = totalRevenue > 0 ? totalRevenue : totalJobValue;
    const marginPct = marginDenominator > 0 ? Math.round((totalMargin / marginDenominator) * 100) : 0;
    return (<div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Revenue (received)" value={formatINRShort(totalRevenue)} tone="success" icon={<DollarSign className="h-4 w-4"/>}/>
        <MetricCard label="Pipeline value" value={formatINRShort(totalPipeline)} tone="primary" icon={<TrendingUp className="h-4 w-4"/>}/>
        <MetricCard label="WorkOrder value" value={formatINRShort(totalJobValue)} tone="warning" icon={<Package className="h-4 w-4"/>}/>
        <MetricCard label="Overdue" value={formatINRShort(overdueAmt)} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard title="Revenue vs Cost vs Margin" subtitle="Across all workOrders" icon={<TrendingUp className="h-4 w-4"/>}>
          <div className="space-y-2">
            <BarRow label="Revenue" value={totalRevenue} max={Math.max(totalRevenue, totalCost, 1)} color="bg-success"/>
            <BarRow label="Cost" value={totalCost} max={Math.max(totalRevenue, totalCost, 1)} color="bg-destructive"/>
            <BarRow label="Gross margin" value={Math.max(0, totalMargin)} max={Math.max(totalRevenue, totalCost, 1)} color="bg-primary" valueLabel={`${marginPct}%`}/>
          </div>
        </ReportCard>
        <ReportCard title="Quotation status funnel" subtitle="Current quotation chains from draft to decision" icon={<Target className="h-4 w-4"/>}>
          <div className="space-y-2">
            {(() => {
              const statuses = ["draft", "sent", "accepted", "rejected", "expired", "cancelled"] as const;
              const counts = statuses.map((status) => ({ status, count: quotationMetrics.current.filter((quotation) => quotation.status === status).length }));
              const max = Math.max(...counts.map((entry) => entry.count), 1);
              return counts.map(({ status, count }) => <BarRow key={status} label={titleCase(status)} value={count} max={max} color={status === "accepted" ? "bg-success" : status === "rejected" || status === "expired" ? "bg-destructive" : "bg-primary"} valueLabel={`${count}`}/>);
            })()}
          </div>
        </ReportCard>
      </div>
      <ReportCard title="Quick links" subtitle="Jump to a detailed report" icon={<BarChart3 className="h-4 w-4"/>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {[
            ["salesReport", "Sales Report", DollarSign],
            ["collectionReport", "Collection", DollarSign],
            ["jobPnlReport", "WorkOrder P&L", TrendingUp],
            ["vendorExposureReport", "Vendor Exposure", Package],
            ["taxReport", "Tax / GST", BarChart3],
            ["staffProductivity", "Staff Productivity", Users],
            ["quotationConversion", "Conversion", Target],
            ["leadSourceReport", "Lead Source", Users],
            ["agingReportRep", "Aging", Clock],
            ["visitCompliance", "Visit Compliance", MapPin],
            ["taskThroughput", "Task Throughput", CheckCircle2],
        ].map(([id, label, Icon]) => {
            const I = Icon as React.ComponentType<{
                className?: string;
            }>;
            return (<button key={id as string} type="button" onClick={() => useRDashStore.getState().setActiveModule(id as string)} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-xs font-medium transition-all hover:border-primary/30 hover:bg-accent/40 hover:shadow-sm">
                <I className="h-4 w-4 text-primary"/>
                {label as string}
              </button>);
        })}
        </div>
      </ReportCard>
    </div>);
}
function SalesReport({ db: dbRaw, filter }: {
    db: RDashDatabase;
    filter?: { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null;
}) {
    // I: Apply the inbound filter via useMemo so the filtered db is stable
    // across renders — required for downstream React.useMemo dependencies.
    const db = React.useMemo(() => applyReportFilter(dbRaw, filter), [dbRaw, filter]);
    const received = db.customerReceipts.reduce((n, receipt) => n + receipt.amount, 0);
    const pending = db.payments.filter((p) => p.status === "pending" || p.status === "partial").reduce((n, p) => n + paymentOutstanding(p), 0);
    const overdue = db.payments.filter((p) => p.status === "overdue").reduce((n, p) => n + paymentOutstanding(p), 0);
    const total = received + pending + overdue;
    const byCustomer = React.useMemo(() => {
        const m = new Map<string, {
            name: string;
            value: number;
        }>();
        db.quotations.forEach((q) => {
            const e = m.get(q.customer_id) || { name: (q.customer_name || "Customer"), value: 0 };
            e.value += q.total_amount;
            m.set(q.customer_id, e);
        });
        return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.value - a.value).slice(0, 8);
    }, [db.quotations]);
    const maxCust = Math.max(...byCustomer.map((c) => c.value), 1);
    const monthly = monthlyReceived(db, 6);
    const maxMonth = Math.max(...monthly.map((m) => m.value), 1);
    return (<div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Received" value={formatINRShort(received)} tone="success" icon={<DollarSign className="h-4 w-4"/>}/>
        <MetricCard label="Pending" value={formatINRShort(pending)} tone="warning" icon={<Clock className="h-4 w-4"/>}/>
        <MetricCard label="Overdue" value={formatINRShort(overdue)} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Total sales" value={formatINRShort(total)} tone="primary" icon={<TrendingUp className="h-4 w-4"/>}/>
      </div>

      <ReportCard title="Revenue trend (6 months)" subtitle="Posted customer receipts grouped by month" icon={<TrendingUp className="h-4 w-4"/>}>
        <div className="space-y-2">
          {monthly.map((m) => {
            const pct = maxMonth > 0 ? Math.max(2, (m.value / maxMonth) * 100) : 0;
            return (<div key={m.key} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">{m.label}</span>
                <div className="h-5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="flex h-full items-center justify-end rounded-full bg-primary pr-2 text-[10px] font-semibold text-primary-foreground transition-all" style={{ width: `${pct}%` }} title={`${m.label}: ${formatINR(m.value)}`}>
                    {m.value > 0 && formatINRShort(m.value)}
                  </div>
                </div>
                <span className="w-20 shrink-0 text-right text-xs font-mono text-muted-foreground">{formatINRShort(m.value)}</span>
              </div>);
        })}
        </div>
      </ReportCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard title="Payment status breakdown" icon={<DollarSign className="h-4 w-4"/>}>
          <div className="space-y-3">
            <DonutStat label="Received" value={received} total={total} color="bg-success"/>
            <DonutStat label="Pending" value={pending} total={total} color="bg-warning"/>
            <DonutStat label="Overdue" value={overdue} total={total} color="bg-destructive"/>
          </div>
        </ReportCard>
        <ReportCard title="Top customers by quotation value" icon={<Users className="h-4 w-4"/>}>
          <div className="space-y-2">
            {byCustomer.map((c) => (<BarRow key={c.id} label={c.name} value={c.value} max={maxCust} color="bg-primary"/>))}
          </div>
        </ReportCard>
      </div>
    </div>);
}
function CollectionReport({ db: dbRaw, filter }: {
    db: RDashDatabase;
    filter?: { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null;
}) {
    const db = applyReportFilter(dbRaw, filter);
    const byMode = React.useMemo(() => {
        const m = new Map<string, number>();
        db.customerReceipts.forEach((receipt) => {
            m.set(receipt.mode || "Unknown", (m.get(receipt.mode || "Unknown") || 0) + receipt.amount);
        });
        return Array.from(m.entries()).map(([mode, value]) => ({ mode, value })).sort((a, b) => b.value - a.value);
    }, [db.customerReceipts]);
    const totalCollected = byMode.reduce((n, m) => n + m.value, 0);
    const maxMode = Math.max(...byMode.map((m) => m.value), 1);
    const overdueByCustomer = React.useMemo(() => {
        const m = new Map<string, {
            name: string;
            value: number;
        }>();
        db.payments.filter((p) => p.status === "overdue").forEach((p) => {
            const e = m.get(p.customer_id) || { name: (p.customer_name || "Customer"), value: 0 };
            e.value += paymentOutstanding(p);
            m.set(p.customer_id, e);
        });
        return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.value - a.value);
    }, [db.payments]);
    return (<div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total collected" value={formatINRShort(totalCollected)} tone="success" icon={<DollarSign className="h-4 w-4"/>}/>
        <MetricCard label="Overdue count" value={db.payments.filter((p) => p.status === "overdue").length} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Overdue value" value={formatINRShort(db.payments.filter((p) => p.status === "overdue").reduce((n, p) => n + paymentOutstanding(p), 0))} tone="destructive" icon={<TrendingDown className="h-4 w-4"/>}/>
        <MetricCard label="Collection rate" value={`${totalCollected > 0 ? Math.round((totalCollected / (totalCollected + db.invoices.reduce((sum, invoice) => sum + invoice.balance_amount, 0))) * 100) : 0}%`} tone="primary" icon={<Target className="h-4 w-4"/>}/>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard title="Collection by mode" icon={<DollarSign className="h-4 w-4"/>}>
          <div className="space-y-2">
            {byMode.length === 0 ? <p className="text-xs text-muted-foreground">No collections recorded yet.</p> :
            byMode.map((m) => (<BarRow key={m.mode} label={m.mode} value={m.value} max={maxMode} color="bg-success"/>))}
          </div>
        </ReportCard>
        <ReportCard title="Overdue by customer" icon={<AlertTriangle className="h-4 w-4"/>}>
          <div className="space-y-2">
            {overdueByCustomer.length === 0 ? <p className="text-xs text-muted-foreground">No overdue payments 🎉</p> :
            overdueByCustomer.map((c) => (<BarRow key={c.id} label={c.name} value={c.value} max={Math.max(...overdueByCustomer.map((x) => x.value), 1)} color="bg-destructive"/>))}
          </div>
        </ReportCard>
      </div>
    </div>);
}
function JobPnLReport({ db: dbRaw, filter }: {
    db: RDashDatabase;
    filter?: { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null;
}) {
    const db = applyReportFilter(dbRaw, filter);
    const pnls = allJobPnLs(db).filter(Boolean) as NonNullable<ReturnType<typeof computeJobPnL>>[];
    const totalRevenue = pnls.reduce((n, p) => n + p.contracted_revenue, 0);
    const totalCollected = pnls.reduce((n, p) => n + p.collected, 0);
    const totalCost = pnls.reduce((n, p) => n + p.total_cost, 0);
    const totalMargin = pnls.reduce((n, p) => n + p.gross_margin, 0);
    const maxVal = Math.max(...pnls.map((p) => Math.max(p.contracted_revenue, p.total_cost, p.gross_margin)), 1);
    return (<div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Contracted revenue" value={formatINRShort(totalRevenue)} tone="success" icon={<TrendingUp className="h-4 w-4"/>}/>
        <MetricCard label="Collections" value={formatINRShort(totalCollected)} tone="success" icon={<DollarSign className="h-4 w-4"/>}/>
        <MetricCard label="Total cost" value={formatINRShort(totalCost)} tone="destructive" icon={<TrendingDown className="h-4 w-4"/>}/>
        <MetricCard label="Gross margin" value={formatINRShort(totalMargin)} tone="primary" icon={<DollarSign className="h-4 w-4"/>}/>
        <MetricCard label="Avg margin %" value={`${pnls.length ? Math.round(pnls.reduce((n, p) => n + p.margin_pct, 0) / pnls.length) : 0}%`} tone={totalMargin > 0 ? "success" : "destructive"} icon={<Target className="h-4 w-4"/>}/>
      </div>
      <ReportCard title="WorkOrder-wise P&L" subtitle="Revenue vs cost vs margin per workOrder" icon={<TrendingUp className="h-4 w-4"/>}>
        <div className="space-y-4">
          {pnls.map((p) => (<div key={p.work_order_id} className="rounded-lg border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{p.work_order_no}</p>
                  <p className="text-[11px] text-muted-foreground">{db.workOrders.find((workOrder) => workOrder.id === p.work_order_id)?.customer_name || "Customer"}</p>
                </div>
                <StatusBadge label={`${p.margin_pct}% margin`} className={p.margin_pct > 20 ? "bg-success/10 text-success border-success/20" : p.margin_pct > 5 ? "bg-warning/10 text-warning border-warning/20" : "bg-destructive/10 text-destructive border-destructive/20"}/>
              </div>
              <div className="space-y-1.5">
                <BarRow label="Contracted" value={p.contracted_revenue} max={maxVal} color="bg-success"/>
                <BarRow label="Material" value={p.material_cost} max={maxVal} color="bg-primary"/>
                <BarRow label="Contractor" value={p.contractor_cost} max={maxVal} color="bg-warning"/>
                <BarRow label="Overhead" value={p.overhead_cost} max={maxVal} color="bg-muted-foreground"/>
                <BarRow label="Margin" value={p.gross_margin} max={maxVal} color={p.gross_margin > 0 ? "bg-success" : "bg-destructive"} valueLabel={formatINRShort(p.gross_margin)}/>
              </div>
            </div>))}
        </div>
      </ReportCard>
    </div>);
}
function VendorExposureReport({ db: dbRaw, filter }: {
    db: RDashDatabase;
    filter?: { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null;
}) {
    const db = applyReportFilter(dbRaw, filter);
    const vendors = db.master.vendors.map((v) => {
        const bal = vendorBalance(db, v.id);
        const bills = db.vendorBills.filter((b) => b.vendor_id === v.id);
        return { ...v, outstanding: bal.outstanding, billCount: bal.bills, unpaid: bal.unpaid, onTimePct: v.on_time_pct || 0, reliability: v.reliability_score || 0 };
    }).sort((a, b) => b.outstanding - a.outstanding);
    const maxOutstanding = Math.max(...vendors.map((v) => v.outstanding), 1);
    return (<div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Vendors" value={vendors.length} tone="primary" icon={<Package className="h-4 w-4"/>}/>
        <MetricCard label="Total outstanding" value={formatINRShort(vendors.reduce((n, v) => n + v.outstanding, 0))} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Avg reliability" value={`${Math.round(vendors.reduce((n, v) => n + v.reliability, 0) / (vendors.length || 1))}/100`} tone="success" icon={<Target className="h-4 w-4"/>}/>
        <MetricCard label="Avg on-time" value={`${Math.round(vendors.reduce((n, v) => n + v.onTimePct, 0) / (vendors.length || 1))}%`} tone="warning" icon={<Clock className="h-4 w-4"/>}/>
      </div>
      <ReportCard title="Vendor outstanding & reliability" icon={<Package className="h-4 w-4"/>}>
        <div className="space-y-3">
          {vendors.map((v) => (<div key={v.id} className="rounded-lg border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{v.name}</p>
                  <p className="text-[11px] text-muted-foreground">{v.city} · {v.category} · {v.phone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={`${v.reliability}/100`} className={v.reliability >= 85 ? "bg-success/10 text-success border-success/20" : v.reliability >= 70 ? "bg-warning/10 text-warning border-warning/20" : "bg-destructive/10 text-destructive border-destructive/20"}/>
                  <StatusBadge label={`${v.onTimePct}% on-time`} className="bg-muted text-muted-foreground border-border"/>
                </div>
              </div>
              <BarRow label="Outstanding" value={v.outstanding} max={maxOutstanding} color={v.outstanding > 0 ? "bg-destructive" : "bg-success"} valueLabel={formatINRShort(v.outstanding)}/>
              <p className="mt-1 text-[10px] text-muted-foreground">{v.unpaid} unpaid bills · {v.billCount} total bills</p>
            </div>))}
        </div>
      </ReportCard>
    </div>);
}
function TaxReport({ db: dbRaw, filter }: {
    db: RDashDatabase;
    filter?: { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null;
}) {
    const db = applyReportFilter(dbRaw, filter);
    const gstCollected = db.invoices.filter((invoice) => invoice.status !== "cancelled").reduce((n, invoice) => n + invoice.tax_amount, 0);
    const gstPaid = db.vendorBills.filter((bill) => bill.status === "approved" || bill.status === "partly_paid" || bill.status === "paid").reduce((n, bill) => n + (bill.tax_amount || 0), 0);
    const netGst = gstCollected - gstPaid;
    return (<div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard label="GST collected (output)" value={formatINRShort(gstCollected)} tone="success" icon={<TrendingUp className="h-4 w-4"/>}/>
        <MetricCard label="GST paid (input)" value={formatINRShort(gstPaid)} tone="primary" icon={<TrendingDown className="h-4 w-4"/>}/>
        <MetricCard label="Net GST payable" value={formatINRShort(netGst)} tone={netGst > 0 ? "warning" : "success"} icon={<DollarSign className="h-4 w-4"/>}/>
      </div>
      <ReportCard title="GST summary" subtitle="Output tax from issued customer invoices minus input tax from matched and approved vendor invoices" icon={<BarChart3 className="h-4 w-4"/>}>
        <div className="space-y-2">
          <BarRow label="GST collected" value={gstCollected} max={Math.max(gstCollected, gstPaid, 1)} color="bg-success"/>
          <BarRow label="GST paid" value={gstPaid} max={Math.max(gstCollected, gstPaid, 1)} color="bg-primary"/>
          <BarRow label="Net payable" value={Math.max(0, netGst)} max={Math.max(gstCollected, gstPaid, 1)} color="bg-warning" valueLabel={formatINRShort(netGst)}/>
        </div>
      </ReportCard>
    </div>);
}
function StaffProductivityReport({ db: dbRaw, filter }: {
    db: RDashDatabase;
    filter?: { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null;
}) {
    const db = applyReportFilter(dbRaw, filter);
    const staff = db.master.staff.map((s) => {
        const tasks = db.tasks.filter((t) => t.assignee_id === s.id);
        const completed = tasks.filter((t) => t.status === "completed").length;
        const visits = db.visits.filter((v) => v.staff_id === s.id);
        const visitsCompleted = visits.filter((v) => v.status === "completed").length;
        return {
            ...s,
            taskCount: tasks.length,
            taskCompleted: completed,
            taskRate: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
            visitCount: visits.length,
            visitsCompleted,
            visitRate: visits.length ? Math.round((visitsCompleted / visits.length) * 100) : 0,
        };
    });
    return (<div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Staff" value={staff.length} tone="primary" icon={<Users className="h-4 w-4"/>}/>
        <MetricCard label="Total tasks" value={db.tasks.length} tone="default" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Total visits" value={db.visits.length} tone="default" icon={<MapPin className="h-4 w-4"/>}/>
        <MetricCard label="Avg task completion" value={`${Math.round(staff.reduce((n, s) => n + s.taskRate, 0) / (staff.length || 1))}%`} tone="success" icon={<Target className="h-4 w-4"/>}/>
      </div>
      <ReportCard title="Staff productivity" subtitle="Task completion and visit compliance per staff member" icon={<Users className="h-4 w-4"/>}>
        <div className="space-y-3">
          {staff.map((s) => (<div key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
              <Avatar name={s.name} size={36}/>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <span className="text-[11px] text-muted-foreground">{s.role}</span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground"><span>Tasks {s.taskCompleted}/{s.taskCount}</span><span>{s.taskRate}%</span></div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${s.taskRate}%` }}/></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground"><span>Visits {s.visitsCompleted}/{s.visitCount}</span><span>{s.visitRate}%</span></div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${s.visitRate}%` }}/></div>
                  </div>
                </div>
              </div>
            </div>))}
        </div>
      </ReportCard>
    </div>);
}
function QuotationConversionReport({ db: dbRaw, filter }: {
    db: RDashDatabase;
    filter?: { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null;
}) {
    const db = applyReportFilter(dbRaw, filter);
    const stages = [
        { key: "draft", label: "Draft", color: "bg-muted" },
        { key: "sent", label: "Sent", color: "bg-primary" },
        { key: "accepted", label: "Accepted", color: "bg-success" },
        { key: "rejected", label: "Rejected", color: "bg-destructive" },
        { key: "expired", label: "Expired", color: "bg-destructive" },
        { key: "cancelled", label: "Cancelled", color: "bg-muted" },
    ] as const;
    const quotationMetrics = calculateQuotationMetrics(db.quotations);
    const counts = stages.map((stage) => ({
        ...stage,
        count: quotationMetrics.current.filter((quotation) => quotation.status === stage.key).length,
        value: quotationMetrics.current.filter((quotation) => quotation.status === stage.key).reduce((sum, quotation) => sum + quotation.total_amount, 0),
    }));
    const total = quotationMetrics.totalCount || 1;
    const maxValue = Math.max(...counts.map((count) => count.value), 1);
    const conversionRate = quotationMetrics.conversionRate;
    return (<div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total quotations" value={quotationMetrics.totalCount} tone="primary" icon={<BarChart3 className="h-4 w-4"/>}/>
        <MetricCard label="Accepted" value={counts.find((c) => c.key === "accepted")!.count} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Conversion rate" value={`${conversionRate}%`} tone={conversionRate > 30 ? "success" : "warning"} icon={<Target className="h-4 w-4"/>}/>
        <MetricCard label="Pipeline value" value={formatINRShort(quotationMetrics.pipelineValue)} tone="primary" icon={<DollarSign className="h-4 w-4"/>}/>
      </div>
      <ReportCard title="Conversion funnel" subtitle="Quotation status distribution by count and value" icon={<Target className="h-4 w-4"/>}>
        <div className="space-y-3">
          {counts.map((c) => (<div key={c.key}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium">{c.label}</span>
                <span className="text-muted-foreground">{c.count} quotes · {formatINRShort(c.value)}</span>
              </div>
              <div className="h-5 overflow-hidden rounded-full bg-muted">
                <div className={cn("flex h-full items-center justify-end rounded-full pr-2 text-[10px] font-semibold text-white", c.color)} style={{ width: `${Math.max(5, (c.count / total) * 100)}%` }}>
                  {c.count > 0 && `${Math.round((c.count / total) * 100)}%`}
                </div>
              </div>
            </div>))}
        </div>
      </ReportCard>
      <ReportCard title="Value by status" icon={<DollarSign className="h-4 w-4"/>}>
        <div className="space-y-2">
          {counts.map((c) => (<BarRow key={c.key} label={c.label} value={c.value} max={maxValue} color={c.color}/>))}
        </div>
      </ReportCard>
    </div>);
}
function LeadSourceReport({ db: dbRaw, filter }: {
    db: RDashDatabase;
    filter?: { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null;
}) {
    const db = applyReportFilter(dbRaw, filter);
    const wonWorkRequiredIds = React.useMemo(
        () => collectWonWorkRequiredIds(db.quotations, db.workOrders),
        [db.quotations, db.workOrders],
    );
    const salesMetrics = calculateSalesPipelineMetrics(db.workRequired, { wonWorkRequiredIds });
    const sources = React.useMemo(() => {
        const m = new Map<string, {
            count: number;
            value: number;
            won: number;
        }>();
        db.workRequired.forEach((r) => {
            const src = r.source || "Unknown";
            const e = m.get(src) || { count: 0, value: 0, won: 0 };
            e.count++;
            e.value += r.budget || 0;
            if (isWonSalesStatus(r.status) || wonWorkRequiredIds.has(r.id)) e.won++;
            m.set(src, e);
        });
        return Array.from(m.entries()).map(([source, v]) => ({ source, ...v })).sort((a, b) => b.count - a.count);
    }, [db.workRequired, wonWorkRequiredIds]);
    const maxCount = Math.max(...sources.map((s) => s.count), 1);
    return (<div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Lead sources" value={sources.length} tone="primary" icon={<Users className="h-4 w-4"/>}/>
        <MetricCard label="Total leads" value={salesMetrics.totalLeads} tone="default" icon={<Target className="h-4 w-4"/>}/>
        <MetricCard label="Won" value={salesMetrics.wonCount} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Win rate" value={`${salesMetrics.winRate}%`} hint={`${salesMetrics.decidedCount} decided`} tone="primary" icon={<TrendingUp className="h-4 w-4"/>}/>
      </div>
      <ReportCard title="Leads by source" subtitle="Count, won, and total budget value per acquisition channel" icon={<Users className="h-4 w-4"/>}>
        <div className="space-y-3">
          {sources.map((s) => (<div key={s.source} className="rounded-lg border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">{s.source}</p>
                <div className="flex items-center gap-2">
                  <StatusBadge label={`${s.won}/${s.count} won`} className="bg-success/10 text-success border-success/20"/>
                  <span className="text-xs font-mono">{formatINRShort(s.value)}</span>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(s.count / maxCount) * 100}%` }}/>
              </div>
            </div>))}
        </div>
      </ReportCard>
    </div>);
}
function AgingReport({ db: dbRaw, filter }: {
    db: RDashDatabase;
    filter?: { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null;
}) {
    const db = applyReportFilter(dbRaw, filter);
    const now = Date.now();
    const buckets = [
        { label: "Current (not due)", min: -Infinity, max: 0, color: "bg-success" },
        { label: "1–7 days overdue", min: 0, max: 7, color: "bg-warning" },
        { label: "8–30 days overdue", min: 7, max: 30, color: "bg-warning" },
        { label: "31+ days overdue", min: 30, max: Infinity, color: "bg-destructive" },
    ];
    const unpaid = db.invoices.filter((invoice) => invoice.status === "issued" || invoice.status === "overdue" || invoice.status === "partial");
    const bucketed = buckets.map((b) => {
        const items = unpaid.filter((invoice) => {
            const days = Math.floor((now - new Date(invoice.due_date).getTime()) / 86400000);
            return days > b.min && days <= b.max;
        });
        return { ...b, count: items.length, value: items.reduce((n, invoice) => n + invoice.balance_amount, 0), items };
    });
    const maxValue = Math.max(...bucketed.map((b) => b.value), 1);
    return (<div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total receivable" value={formatINRShort(unpaid.reduce((n, p) => n + p.balance_amount, 0))} tone="warning" icon={<DollarSign className="h-4 w-4"/>}/>
        <MetricCard label="Unpaid invoices" value={unpaid.length} tone="primary" icon={<BarChart3 className="h-4 w-4"/>}/>
        <MetricCard label="Overdue (>0 days)" value={bucketed.slice(1).reduce((n, b) => n + b.count, 0)} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Critical (>30 days)" value={bucketed[3].count} tone="destructive" icon={<Clock className="h-4 w-4"/>}/>
      </div>
      <ReportCard title="Receivables aging" subtitle="Unpaid invoices bucketed by days overdue" icon={<Clock className="h-4 w-4"/>}>
        <div className="space-y-3">
          {bucketed.map((b) => (<div key={b.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium">{b.label}</span>
                <span className="text-muted-foreground">{b.count} invoices · {formatINRShort(b.value)}</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", b.color)} style={{ width: `${Math.max(2, (b.value / maxValue) * 100)}%` }}/>
              </div>
            </div>))}
        </div>
      </ReportCard>
      <ReportCard title="Critical overdue invoices" subtitle="More than 30 days past due — escalate immediately" icon={<AlertTriangle className="h-4 w-4"/>}>
        {bucketed[3].items.length === 0 ? <p className="text-xs text-muted-foreground">No critical overdue invoices 🎉</p> : (<div className="space-y-2">
            {bucketed[3].items.map((p) => (<div key={p.id} className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/[0.04] px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{db.workOrders.find((workOrder) => workOrder.id === p.work_order_id)?.customer_name || "Customer"}</p>
                  <p className="text-[11px] text-muted-foreground">{p.invoice_no} - {p.title} - due {formatDate(p.due_date)}</p>
                </div>
                <span className="font-mono text-sm font-semibold text-destructive">{formatINR(p.balance_amount)}</span>
              </div>))}
          </div>)}
      </ReportCard>
    </div>);
}
function VisitComplianceReport({ db: dbRaw, filter }: {
    db: RDashDatabase;
    filter?: { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null;
}) {
    const db = applyReportFilter(dbRaw, filter);
    const total = db.visits.length;
    const completed = db.visits.filter((v) => v.status === "completed").length;
    const missed = db.visits.filter((v) => v.status === "missed").length;
    const reported = db.visits.filter((v) => v.report_filed).length;
    const complianceRate = total ? Math.round((completed / total) * 100) : 0;
    const reportRate = completed ? Math.round((reported / completed) * 100) : 0;
    return (<div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total visits" value={total} tone="primary" icon={<MapPin className="h-4 w-4"/>}/>
        <MetricCard label="Completed" value={completed} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Missed" value={missed} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Report filing" value={`${reportRate}%`} tone={reportRate > 80 ? "success" : "warning"} icon={<CheckCircle2 className="h-4 w-4"/>}/>
      </div>
      <ReportCard title="Visit compliance" subtitle="Completion and report-filing rates" icon={<MapPin className="h-4 w-4"/>}>
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs"><span className="font-medium">Visits completed</span><span className="text-muted-foreground">{completed}/{total} · {complianceRate}%</span></div>
            <div className="h-4 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${complianceRate}%` }}/></div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs"><span className="font-medium">Reports filed (of completed)</span><span className="text-muted-foreground">{reported}/{completed} · {reportRate}%</span></div>
            <div className="h-4 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${reportRate}%` }}/></div>
          </div>
        </div>
      </ReportCard>
      <ReportCard title="Missed visits" subtitle="Require follow-up and rescheduling" icon={<AlertTriangle className="h-4 w-4"/>}>
        {missed === 0 ? <p className="text-xs text-muted-foreground">No missed visits 🎉</p> : (<div className="space-y-2">
            {db.visits.filter((v) => v.status === "missed").map((v) => (<div key={v.id} className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/[0.04] px-3 py-2">
                <div><p className="text-sm font-medium">{titleCase(v.visit_type)} · {v.location_name}</p><p className="text-[11px] text-muted-foreground">{v.staff_name} · {formatDate(v.scheduled_at)}</p></div>
                <StatusBadge label="Missed" className="bg-destructive/10 text-destructive border-destructive/20"/>
              </div>))}
          </div>)}
      </ReportCard>
    </div>);
}
function TaskThroughputReport({ db: dbRaw, filter }: {
    db: RDashDatabase;
    filter?: { customerId?: string; workOrderId?: string; vendorId?: string; staffId?: string; reportId?: string } | null;
}) {
    const db = applyReportFilter(dbRaw, filter);
    const total = db.tasks.length;
    const byStatus = [
        { key: "todo", label: "To do", color: "bg-muted" },
        { key: "in_progress", label: "In progress", color: "bg-primary" },
        { key: "blocked", label: "Blocked", color: "bg-destructive" },
        { key: "review", label: "Review", color: "bg-warning" },
        { key: "completed", label: "Completed", color: "bg-success" },
        { key: "cancelled", label: "Cancelled", color: "bg-muted" },
    ] as const;
    const counts = byStatus.map((s) => ({ ...s, count: db.tasks.filter((t) => t.status === s.key).length }));
    const completionRate = total ? Math.round((counts.find((c) => c.key === "completed")!.count / total) * 100) : 0;
    const autoGenerated = db.tasks.filter((t) => t.auto_generated).length;
    const maxCount = Math.max(...counts.map((c) => c.count), 1);
    return (<div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total tasks" value={total} tone="primary" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Completed" value={counts.find((c) => c.key === "completed")!.count} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Completion rate" value={`${completionRate}%`} tone={completionRate > 50 ? "success" : "warning"} icon={<Target className="h-4 w-4"/>}/>
        <MetricCard label="Auto-generated" value={autoGenerated} tone="primary" icon={<BarChart3 className="h-4 w-4"/>}/>
      </div>
      <ReportCard title="Task status distribution" icon={<BarChart3 className="h-4 w-4"/>}>
        <div className="space-y-2">
          {counts.map((c) => (<BarRow key={c.key} label={c.label} value={c.count} max={maxCount} color={c.color} valueLabel={`${c.count}`}/>))}
        </div>
      </ReportCard>
      <ReportCard title="Blocked tasks" subtitle="Require unblocking — click to open" icon={<AlertTriangle className="h-4 w-4"/>}>
        {db.tasks.filter((t) => t.status === "blocked").length === 0 ? <p className="text-xs text-muted-foreground">No blocked tasks 🎉</p> : (<div className="space-y-2">
            {db.tasks.filter((t) => t.status === "blocked").map((t) => (<div key={t.id} className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/[0.04] px-3 py-2">
                <div><p className="text-sm font-medium">{t.title}</p><p className="text-[11px] text-muted-foreground">{t.assignee_name} · due {formatDate(t.due_date)}</p></div>
                <StatusBadge label="Blocked" className="bg-destructive/10 text-destructive border-destructive/20"/>
              </div>))}
          </div>)}
      </ReportCard>
    </div>);
}
