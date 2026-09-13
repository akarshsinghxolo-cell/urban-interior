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
            return { key: "new", label: "New enquiry", summary: `${title} · qualify workRequired and plan a visit`, percent: 8 };
        case "contacted":
            return { key: "contacted", label: "Contacted", summary: `${title} · plan a site visit`, percent: 16 };
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
 * Customer progress is strictly CRM / execution progress.
 * Collection health belongs to Finance and must not affect this score or force
 * Customer Desk to read invoices, payments or receipts.
 */
export function customerProgress(db: RDashDatabase, customerId: string): CustomerProgress {
    const workRequiredList = db.workRequired.filter((row) => row.customer_id === customerId);
    const activeWorkRequireds = workRequiredList.filter((row) => row.status !== "lost" && row.status !== "completed");
    const activeWorkRequired = latestWorkRequired(activeWorkRequireds) || latestWorkRequired(workRequiredList);
    const workOrders = db.workOrders.filter((row) => row.customer_id === customerId);
    const activeJob = workOrders.find((row) => row.status === "in_progress" || row.status === "scheduled" || row.status === "on_hold");
    const completedJob = workOrders.find((row) => row.status === "completed");

    if (activeJob) {
        return {
            key: activeJob.status === "on_hold" ? "on_hold" : "execution",
            label: activeJob.status === "on_hold" ? "Execution on hold" : "Execution in progress",
            summary: `${activeJob.title} · ${activeJob.progress}% progress`,
            percent: Math.max(72, Math.min(95, activeJob.progress || 72)),
        };
    }
    if (completedJob) {
        return {
            key: "completed",
            label: "Work completed",
            summary: `${completedJob.title} is complete`,
            percent: 100,
        };
    }
    return progressForWorkRequired(activeWorkRequired);
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
