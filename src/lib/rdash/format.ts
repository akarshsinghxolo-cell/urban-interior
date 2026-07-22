import type { Priority, TaskStatus, FollowupStatus, VisitStatus, QuotationStatus, PaymentStatus, InvoiceStatus, WorkOrderStatus, WorkRequiredStatus, EntityStatus, POStatus, GRNStatus, DispatchStatus, VendorBillStatus, CommissionStatus, } from "./types";
export function formatINR(n: number | undefined | null): string {
    if (n == null || isNaN(n))
        return "₹0";
    return "₹" + Math.round(n).toLocaleString("en-IN");
}
export function formatINRShort(n: number | undefined | null): string {
    if (n == null || isNaN(n))
        return "₹0";
    const abs = Math.abs(n);
    if (abs >= 10000000)
        return "₹" + (n / 10000000).toFixed(2) + "Cr";
    if (abs >= 100000)
        return "₹" + (n / 100000).toFixed(2) + "L";
    if (abs >= 1000)
        return "₹" + (n / 1000).toFixed(1) + "k";
    return "₹" + Math.round(n);
}
export const INDIA_TIME_ZONE = "Asia/Kolkata";
export function formatDate(iso: string | undefined | null): string {
    if (!iso)
        return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return "—";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: INDIA_TIME_ZONE });
}
export function formatDateTime(iso: string | undefined | null): string {
    if (!iso)
        return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return "—";
    return d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: INDIA_TIME_ZONE,
    });
}
export function indiaBusinessDate(value = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: INDIA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
    return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
export function indiaDateTimeInputValue(value = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: INDIA_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(value);
    const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
    return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}`;
}
export function relativeDay(iso: string | undefined | null): string {
    if (!iso)
        return "";
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return "";
    const target = indiaBusinessDate(d);
    const current = indiaBusinessDate();
    const targetNoon = new Date(`${target}T12:00:00+05:30`).getTime();
    const currentNoon = new Date(`${current}T12:00:00+05:30`).getTime();
    const diff = Math.round((targetNoon - currentNoon) / 86400000);
    if (diff === 0)
        return "Today";
    if (diff === 1)
        return "Tomorrow";
    if (diff === -1)
        return "Yesterday";
    if (diff > 1 && diff < 7)
        return `In ${diff} days`;
    if (diff < -1 && diff > -7)
        return `${Math.abs(diff)} days ago`;
    return formatDate(iso);
}
export function relativeTime(ts: number): string {
    if (!ts || isNaN(ts))
        return "";
    const diffMs = Date.now() - ts;
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60)
        return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60)
        return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24)
        return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day === 1)
        return "Yesterday";
    if (day < 7)
        return `${day}d ago`;
    return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
export function isOverdue(iso: string | undefined | null): boolean {
    if (!iso)
        return false;
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return false;
    return d.getTime() < Date.now();
}
export function initials(name: string): string {
    const trimmed = (name || "").trim();
    if (!trimmed)
        return "?";
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1)
        return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
type StatusStyle = {
    label: string;
    className: string;
};
export function priorityStyle(p: Priority): StatusStyle {
    switch (p) {
        case "urgent":
            return { label: "Urgent", className: "bg-destructive/10 text-destructive border-destructive/20" };
        case "high":
            return { label: "High", className: "bg-warning/10 text-warning border-warning/20" };
        case "medium":
            return { label: "Medium", className: "bg-primary/10 text-primary border-primary/20" };
        case "low":
        default:
            return { label: "Low", className: "bg-muted text-muted-foreground border-border" };
    }
}
export function taskStatusStyle(s: TaskStatus): StatusStyle {
    switch (s) {
        case "todo":
            return { label: "To do", className: "bg-muted text-muted-foreground border-border" };
        case "in_progress":
            return { label: "In progress", className: "bg-primary/10 text-primary border-primary/20" };
        case "blocked":
            return { label: "Blocked", className: "bg-destructive/10 text-destructive border-destructive/20" };
        case "review":
            return { label: "Review", className: "bg-warning/10 text-warning border-warning/20" };
        case "cancelled":
            return { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function followupStatusStyle(s: FollowupStatus): StatusStyle {
    switch (s) {
        case "pending":
            return { label: "Pending", className: "bg-warning/10 text-warning border-warning/20" };
        case "scheduled":
            return { label: "Scheduled", className: "bg-primary/10 text-primary border-primary/20" };
        case "missed":
            return { label: "Missed", className: "bg-destructive/10 text-destructive border-destructive/20" };
        case "closed":
            return { label: "Closed", className: "bg-muted text-muted-foreground border-border" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function visitStatusStyle(s: VisitStatus): StatusStyle {
    switch (s) {
        case "scheduled":
            return { label: "Scheduled", className: "bg-primary/10 text-primary border-primary/20" };
        case "en_route":
            return { label: "En route", className: "bg-warning/10 text-warning border-warning/20" };
        case "checked_in":
            return { label: "Checked in", className: "bg-primary/15 text-primary border-primary/25" };
        case "report_pending":
            return { label: "Report pending", className: "bg-warning/10 text-warning border-warning/20" };
        case "completed":
            return { label: "Completed", className: "bg-success/10 text-success border-success/20" };
        case "missed":
            return { label: "Missed", className: "bg-destructive/10 text-destructive border-destructive/20" };
        case "cancelled":
            return { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function quotationStatusStyle(s: QuotationStatus): StatusStyle {
    switch (s) {
        case "draft":
            return { label: "Draft", className: "bg-muted text-muted-foreground border-border" };
        case "sent":
            return { label: "Sent", className: "bg-primary/10 text-primary border-primary/20" };
        case "accepted":
            return { label: "Accepted", className: "bg-success/10 text-success border-success/20" };
        case "rejected":
            return { label: "Rejected", className: "bg-destructive/10 text-destructive border-destructive/20" };
        case "expired":
            return { label: "Expired", className: "bg-warning/10 text-warning border-warning/20" };
        case "cancelled":
            return { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function paymentStatusStyle(s: PaymentStatus): StatusStyle {
    switch (s) {
        case "pending":
            return { label: "Pending", className: "bg-warning/10 text-warning border-warning/20" };
        case "partial":
            return { label: "Partial", className: "bg-primary/10 text-primary border-primary/20" };
        case "received":
            return { label: "Received", className: "bg-success/10 text-success border-success/20" };
        case "overdue":
            return { label: "Overdue", className: "bg-destructive/10 text-destructive border-destructive/20" };
        case "cancelled":
            return { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function invoiceStatusStyle(s: InvoiceStatus): StatusStyle {
    switch (s) {
        case "draft":
            return { label: "Draft", className: "bg-muted text-muted-foreground border-border" };
        case "issued":
            return { label: "Issued", className: "bg-warning/10 text-warning border-warning/20" };
        case "partial":
            return { label: "Partial", className: "bg-primary/10 text-primary border-primary/20" };
        case "paid":
            return { label: "Paid", className: "bg-success/10 text-success border-success/20" };
        case "overdue":
            return { label: "Overdue", className: "bg-destructive/10 text-destructive border-destructive/20" };
        case "cancelled":
            return { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function jobStatusStyle(s: WorkOrderStatus): StatusStyle {
    switch (s) {
        case "scheduled":
            return { label: "Scheduled", className: "bg-primary/10 text-primary border-primary/20" };
        case "in_progress":
            return { label: "In progress", className: "bg-primary/15 text-primary border-primary/25" };
        case "cancelled":
            return { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" };
        case "abandoned":
            return { label: "Abandoned", className: "bg-destructive/15 text-destructive border-destructive/25" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function workRequiredStatusStyle(s: WorkRequiredStatus): StatusStyle {
    switch (s) {
        case "new":
            return { label: "New", className: "bg-primary/10 text-primary border-primary/20" };  // STAGE-4-FIX: removed duplicate dead "new" case (was "Qualified" label, unreachable)
        case "visit_scheduled":
            return { label: "Visit planned", className: "bg-warning/10 text-warning border-warning/20" };
        case "measurement_done":
            return { label: "Measurement complete", className: "bg-warning/10 text-warning border-warning/20" };
        case "quotation_in_progress":
            return { label: "Quotation in progress", className: "bg-warning/10 text-warning border-warning/20" };
        case "quotation_sent":
            return { label: "Quotation sent", className: "bg-primary/15 text-primary border-primary/25" };
        case "negotiation":
            return { label: "In negotiation", className: "bg-primary/15 text-primary border-primary/25" };
        case "accepted":
            return { label: "Accepted", className: "bg-success/10 text-success border-success/20" };
        case "contractor_bidding":
            return { label: "Converted to workOrder", className: "bg-success/10 text-success border-success/20" };
        case "completed":
            return { label: "Completed", className: "bg-success/10 text-success border-success/20" };
        case "lost":
            return { label: "Lost", className: "bg-destructive/10 text-destructive border-destructive/20" };
        case "on_hold":
            return { label: "On hold", className: "bg-muted text-muted-foreground border-border" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function entityStatusStyle(s: EntityStatus): StatusStyle {
    switch (s) {
        case "active":
            return { label: "Active", className: "bg-success/10 text-success border-success/20" };
        case "inactive":
            return { label: "Inactive", className: "bg-muted text-muted-foreground border-border" };
        case "blocked":
            return { label: "Blocked", className: "bg-destructive/10 text-destructive border-destructive/20" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function titleCase(s: string): string {
    return (s || "").toLowerCase().replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export function poStatusStyle(s: POStatus): StatusStyle {
    switch (s) {
        case "draft":
            return { label: "Draft", className: "bg-muted text-muted-foreground border-border" };
        case "pending_approval":
            return { label: "Pending Approval", className: "bg-warning/10 text-warning border-warning/20" };
        case "approved":
            return { label: "Approved", className: "bg-primary/10 text-primary border-primary/20" };
        case "sent":
            return { label: "Sent", className: "bg-primary/15 text-primary border-primary/25" };
        case "partially_received":
            return { label: "Partial", className: "bg-warning/15 text-warning border-warning/25" };
        case "received":
            return { label: "Received", className: "bg-success/10 text-success border-success/20" };
        case "cancelled":
            return { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function grnStatusStyle(s: GRNStatus): StatusStyle {
    switch (s) {
        case "draft":
            return { label: "Draft", className: "bg-muted text-muted-foreground border-border" };
        case "pending_receipt_verification":
            return { label: "Receipt verification pending", className: "bg-warning/10 text-warning border-warning/20" };
        case "received_pending_invoice_match":
            return { label: "Received · invoice match pending", className: "bg-warning/10 text-warning border-warning/20" };
        case "matched":
            return { label: "PO–GRN–invoice matched", className: "bg-success/10 text-success border-success/20" };
        case "mismatched":
            return { label: "Mismatched", className: "bg-destructive/10 text-destructive border-destructive/20" };
        case "closed":
            return { label: "Closed", className: "bg-muted text-muted-foreground border-border" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function dispatchStatusStyle(s: DispatchStatus): StatusStyle {
    switch (s) {
        case "draft":
            return { label: "Draft", className: "bg-muted text-muted-foreground border-border" };
        case "issued":
            return { label: "Issued", className: "bg-primary/10 text-primary border-primary/20" };
        case "acknowledged":
            return { label: "Acknowledged", className: "bg-success/10 text-success border-success/20" };
        case "returned":
            return { label: "Returned", className: "bg-warning/10 text-warning border-warning/20" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function vendorBillStatusStyle(s: VendorBillStatus): StatusStyle {
    switch (s) {
        case "draft":
            return { label: "Draft", className: "bg-muted text-muted-foreground border-border" };
        case "pending":
            return { label: "Pending", className: "bg-warning/10 text-warning border-warning/20" };
        case "approved":
            return { label: "Approved", className: "bg-primary/10 text-primary border-primary/20" };
        case "paid":
            return { label: "Paid", className: "bg-success/10 text-success border-success/20" };
        case "disputed":
            return { label: "Disputed", className: "bg-destructive/10 text-destructive border-destructive/20" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function commissionStatusStyle(s: CommissionStatus): StatusStyle {
    switch (s) {
        case "accrued":
            return { label: "Accrued", className: "bg-warning/10 text-warning border-warning/20" };
        case "payable":
            return { label: "Payable", className: "bg-primary/10 text-primary border-primary/20" };
        case "paid":
            return { label: "Paid", className: "bg-success/10 text-success border-success/20" };
        case "cancelled":
            return { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function boqStatusStyle(s: "draft" | "approved" | "in_progress" | "closed"): StatusStyle {
    switch (s) {
        case "draft":
            return { label: "Draft", className: "bg-muted text-muted-foreground border-border" };
        case "approved":
            return { label: "Approved", className: "bg-success/10 text-success border-success/20" };
        case "in_progress":
            return { label: "In progress", className: "bg-primary/10 text-primary border-primary/20" };
        case "closed":
            return { label: "Closed", className: "bg-muted text-muted-foreground border-border" };
        default:
            return { label: String(s || "—"), className: "bg-muted text-muted-foreground border-border" };
    }
}
export function workByCustomerFallback(sites: Array<{
    name: string;
    locality?: string;
    city?: string;
}>): string {
    if (!sites.length)
        return "No Site added";
    if (sites.length > 1)
        return `${sites.length} Sites`;
    const site = sites[0];
    return [site.name, site.locality, site.city].filter(Boolean).join(" · ");
}
