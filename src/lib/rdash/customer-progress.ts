import type { WorkRequired, WorkRequiredStatus, RDashDatabase } from "./types";
export type CustomerProgress = {
    key: "new" | "contacted" | "visit" | "measurement" | "quote" | "decision" | "negotiation" | "accepted" | "execution" | "on_hold" | "lost" | "completed";
    label: string;
    summary: string;
    percent: number;
};
function latestWorkRequired(workRequired: WorkRequired[]) {
    return [...workRequired].sort((a, b) => {
        const aDate = a.updated_at || a.created_at;
        const bDate = b.updated_at || b.created_at;
        return bDate.localeCompare(aDate);
    })[0];
}
function progressForWorkRequired(workRequired: WorkRequired | undefined): CustomerProgress {
    const title = workRequired?.title || "Add work required to begin";
    const status: WorkRequiredStatus | undefined = workRequired?.status;
    switch (status) {
        case "new":
            return { key: "new", label: "Contacted", summary: `${title} · qualify workRequired and plan a visit`, percent: 16 };
        case "visit_scheduled":
            return { key: "visit", label: "Site visit planned", summary: `${title} · measurement or site visit is scheduled`, percent: 24 };
        case "measurement_done":
            return { key: "measurement", label: "Measurement complete", summary: `${title} · prepare the quotation`, percent: 32 };
        case "quotation_in_progress":
            return { key: "quote", label: "Quotation in progress", summary: `${title} · scope and rates are being prepared`, percent: 42 };
        case "quotation_sent":
            return { key: "decision", label: "Awaiting customer decision", summary: `${title} · quotation has been sent`, percent: 55 };
        case "negotiation":
            return { key: "negotiation", label: "In negotiation", summary: `${title} · revise scope, price, or terms as needed`, percent: 60 };
        case "accepted":
            return { key: "accepted", label: "Quote accepted", summary: `${title} · contractor bidding is next`, percent: 68 };
        case "contractor_bidding":
            return { key: "decision", label: "Contractor bidding", summary: `${title} · compare and award contractor bids`, percent: 74 };
        case "awarded":
            return { key: "execution", label: "Work order awarded", summary: `${title} · execution package is ready to start`, percent: 80 };
        case "in_progress":
            return { key: "execution", label: "Execution in progress", summary: `${title} · field work is active`, percent: 88 };
        case "on_hold":
            return { key: "on_hold", label: "On hold", summary: `${title} · waiting for the next decision or dependency`, percent: 50 };
        case "lost":
            return { key: "lost", label: "Lost", summary: `${title} · no active sales work remains`, percent: 0 };
        case "completed":
            return { key: "completed", label: "Work completed", summary: `${title} is complete`, percent: 100 };
        default:
            return { key: "new", label: "WorkRequired captured", summary: title, percent: workRequired ? 10 : 5 };
    }
}

/**
 * J: Compute a payment-recovery penalty for this customer.
 *
 * Reads:
 *  - `db.invoices` for this customer (issued + outstanding balance)
 *  - `db.payments` for this customer (scheduled + received)
 *  - `db.customerReceipts` for actual cash received against invoices
 *
 * Returns a number between 0 and 25 (the max penalty applied to progress).
 *  - 0 penalty when the customer has no invoices, or every issued invoice is
 *    fully paid.
 *  - Penalty scales with the overdue ratio: if 50% of the issued invoice
 *    value is overdue (past due_date + unpaid), the penalty is 12.5 (half
 *    of the 25 max).
 *
 * Pure function — no store access.
 */
export function customerCollectionPenalty(db: RDashDatabase, customerId: string): number {
    const invoices = db.invoices.filter((inv) => inv.customer_id === customerId);
    if (!invoices.length)
        return 0;
    const today = new Date().toISOString().slice(0, 10);
    const issuedValue = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
    if (issuedValue <= 0)
        return 0;
    const overdueValue = invoices
        .filter((inv) => inv.balance_amount > 0 && inv.due_date < today && inv.status !== "cancelled")
        .reduce((sum, inv) => sum + inv.balance_amount, 0);
    if (overdueValue <= 0)
        return 0;
    const overdueRatio = Math.min(1, overdueValue / issuedValue);
    // 25-point max penalty, scaled linearly by overdue ratio.
    return Math.round(overdueRatio * 25 * 10) / 10;
}

export function customerProgress(db: RDashDatabase, customerId: string): CustomerProgress {
    const customer = db.customers.find((row) => row.id === customerId);
    const workRequiredList = db.workRequired.filter((row) => row.customer_id === customerId);
    const activeWorkRequireds = workRequiredList.filter((row) => row.status !== "lost" && row.status !== "completed");
    const activeWorkRequired = latestWorkRequired(activeWorkRequireds) || latestWorkRequired(workRequiredList);
    const workOrders = db.workOrders.filter((row) => row.customer_id === customerId);
    const activeJob = workOrders.find((row) => row.status === "in_progress" || row.status === "scheduled" || row.status === "on_hold");
    const completedJob = workOrders.find((row) => row.status === "completed");
    // J: Apply payment-recovery penalty on top of the base progress. The
    //    penalty is capped at 25 points and never reduces below 0%.
    const penalty = customerCollectionPenalty(db, customerId);
    if (activeJob) {
        const basePercent = Math.max(72, Math.min(95, activeJob.progress || 72));
        return {
            key: activeJob.status === "on_hold" ? "on_hold" : "execution",
            label: activeJob.status === "on_hold" ? "Execution on hold" : "Execution in progress",
            summary: `${activeJob.title} · ${activeJob.progress}% progress${penalty > 0 ? ` · ⚠ collection risk (-${penalty}%)` : ""}`,
            percent: Math.max(0, Math.round((basePercent - penalty) * 10) / 10),
        };
    }
    if (completedJob) {
        const basePercent = 100;
        return {
            key: "completed",
            label: penalty > 0 ? "Work completed · dues pending" : "Work completed",
            summary: `${completedJob.title} is complete${penalty > 0 ? ` · ⚠ ${penalty}% collection-risk penalty applied` : ""}`,
            percent: Math.max(0, Math.round((basePercent - penalty) * 10) / 10),
        };
    }
    const base = progressForWorkRequired(activeWorkRequired);
    if (penalty <= 0 || base.percent <= 0)
        return base;
    return {
        ...base,
        summary: `${base.summary} · ⚠ collection risk (-${penalty}%)`,
        percent: Math.max(0, Math.round((base.percent - penalty) * 10) / 10),
    };
}
export function customerMapHref(address?: string, latitude?: number, longitude?: number) {
    const query = latitude != null && longitude != null ? `${latitude},${longitude}` : address || "";
    return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : undefined;
}
export function customerWhatsappHref(phone?: string) {
    const digits = (phone || "").replace(/\D/g, "");
    if (!digits)
        return undefined;
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${normalized}`;
}
