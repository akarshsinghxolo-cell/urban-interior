import { toast } from "sonner";
import { useRDashStore } from "./store";
type EntityKind = "customer" | "task" | "quotation" | "visit" | "followup" | "payment" | "workOrder" | "po" | "vendor" | "contractor" | "staff";
const KIND_LABEL: Record<EntityKind, string> = {
    customer: "Customer",
    task: "Task",
    quotation: "Quotation",
    visit: "Visit",
    followup: "Follow-up",
    payment: "Payment",
    workOrder: "WorkOrder",
    po: "Purchase Order",
    vendor: "Vendor",
    contractor: "Contractor",
    staff: "Staff",
};
const KIND_EMOJI: Record<EntityKind, string> = {
    customer: "🧭",
    task: "✅",
    quotation: "📝",
    visit: "📍",
    followup: "📞",
    payment: "💰",
    workOrder: "🏗️",
    po: "📦",
    vendor: "🏢",
    contractor: "👷",
    staff: "👤",
};
function openEntity(kind: EntityKind, id: string) {
    const store = useRDashStore.getState();
    if (kind === "customer") {
        store.selectCustomer(id);
        return;
    }
    if (kind === "vendor") {
        store.setActiveModule("vendors");
        return;
    }
    if (kind === "contractor") {
        store.setActiveModule("contractors");
        return;
    }
    if (kind === "staff") {
        store.setActiveModule("staff");
        return;
    }
    store.openDetail(kind, id);
}
export function notifyCreated(kind: EntityKind, id: string, title: string, description?: string) {
    const label = KIND_LABEL[kind];
    const emoji = KIND_EMOJI[kind];
    toast.success(`${emoji} ${label} created`, {
        description: description || title,
        duration: 5000,
        action: {
            label: "View",
            onClick: () => openEntity(kind, id),
        },
    });
}
export function notifyUpdated(kind: EntityKind, title: string, description?: string) {
    const label = KIND_LABEL[kind];
    const emoji = KIND_EMOJI[kind];
    toast.success(`${emoji} ${label} updated`, {
        description: description || title,
        duration: 3500,
    });
}
export function notifyConverted(fromKind: EntityKind, toKind: EntityKind, toId: string, title: string) {
    const fromLabel = KIND_LABEL[fromKind];
    const toLabel = KIND_LABEL[toKind];
    const emoji = KIND_EMOJI[toKind];
    toast.success(`${emoji} ${fromLabel} → ${toLabel}`, {
        description: title,
        duration: 5000,
        action: {
            label: `Open ${toLabel.toLowerCase()}`,
            onClick: () => openEntity(toKind, toId),
        },
    });
}
export function notifyCompleted(kind: "task" | "payment", title: string) {
    const label = KIND_LABEL[kind];
    const emoji = kind === "task" ? "✅" : "💰";
    toast.success(`${emoji} ${label} completed`, {
        description: title,
        duration: 4000,
    });
}
export function notifyStatusChange(kind: EntityKind, newStatus: string, title: string) {
    const label = KIND_LABEL[kind];
    const emoji = KIND_EMOJI[kind];
    toast.success(`${emoji} ${label} → ${newStatus}`, {
        description: title,
        duration: 3500,
    });
}
