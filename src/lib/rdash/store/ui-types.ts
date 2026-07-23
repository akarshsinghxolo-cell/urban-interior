import type { Customer, VisitType } from "../types";

export interface WorkspaceTab {
    id: string;
    moduleId: string;
    label: string;
    icon?: string;
}
export type DetailPanelKind = "quotation" | "workOrder" | "task" | "followup" | "visit" | "payment" | "invoice" | "po" | "grn" | "dispatch" | "boq" | "vendorBill" | "commission" | "blocked" | "customer" | "site" | "area" | "workRequired" | "inventory" | "vendor" | "vendorRate" | "contractor" | "contractorBill" | "contractorPayment" | "staff" | "audit" | "media" | null;
export type ContextCustomerTab = "overview" | "sites" | "tasks" | "quotations" | "payments" | "invoices" | "advances" | "liabilities" | "visits" | "activity";
export type ContextDetailTab = "overview" | "thread" | "history";
export interface ContextHistoryEntry {
    kind: Exclude<DetailPanelKind, null>;
    recordId: string;
    customerId?: string;
    sourceModule?: string;
    customerTab?: ContextCustomerTab;
    detailTab?: ContextDetailTab;
}
export interface DetailPanelState {
    kind: DetailPanelKind;
    recordId: string | null;
    panelTab?: ContextDetailTab;
    fromModule?: string;
}
export interface ContextRecord {
    recordType: "task" | "followup" | "visit" | "quotation" | "payment" | "invoice" | "approval" | "risk" | "blocked" | "customer" | "site" | "area" | "workRequired" | "workOrder" | "po" | "grn" | "dispatch" | "boq" | "vendorBill" | "commission" | "inventory" | "vendor" | "vendorRate" | "contractor" | "contractorBill" | "contractorPayment" | "staff" | "audit" | "media" | "generic";
    record: Record<string, unknown>;
    customer?: Customer;
}
export interface CurrentUserContext {
    name: string;
    role: string;
    staffId?: string;
}
export interface AuthenticatedWorkspaceUser extends CurrentUserContext {
    email: string;
    expiresAt: number;
}
export type WorkspaceSyncStatus = "idle" | "saving" | "saved" | "error";
export interface GuardResult {
    ok: boolean;
    reason?: string;
}
export interface SavedView {
    id: string;
    workspaceKey: string;
    label: string;
    presetId?: string;
    search: string;
    extra: Record<string, string>;
    createdAt: number;
}
export type CreateDialogKind = "task" | "quotation" | "visit" | "followup";
export interface CreateDialogRequest {
    kind: CreateDialogKind;
    customerId?: string;
    siteId?: string;
    workRequiredId?: string;
    visitType?: VisitType;
}

export type ActionDialogType = "record-payment" | "send-catalogue" | "send-reference" | "send-pinterest" | "send-material";
export interface ActionDialogState {
    type: ActionDialogType | null;
    customerId?: string;
}
export interface EditDialogRequest {
    type: "task" | "followup" | "visit" | "workOrder";
    entityId: string;
}
export type WorkspaceOverlaySnapshot =
    | { type: "commandPalette" }
    | { type: "actionDialog"; value: ActionDialogState }
    | { type: "createDialog"; value: CreateDialogRequest }
    | { type: "quotationAcceptance"; quotationId: string }
    | { type: "editDialog"; value: EditDialogRequest }
    | { type: "mobileNav" }
    | { type: "moreMenu" }
    | { type: "quickAdd" }
    | { type: "keyboardShortcuts" };
export interface WorkspaceNavigationSnapshot {
    moduleId: string;
    activeTabId: string | null;
    moduleHistoryIndex: number;
    moduleHistoryLength: number;
    selectedCustomerId: string | null;
    detailPanel: DetailPanelState;
    contextHistory: ContextHistoryEntry[];
    contextHistoryIndex: number;
    overlays: WorkspaceOverlaySnapshot[];
}
