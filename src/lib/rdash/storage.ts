import type { FileAsset, FileAttachmentEntityType, FileAttachmentRole, FileAssetKind, Master, RDashDatabase, StorageAccount, StorageFolderInstance, StorageFolderPurpose, StorageFolderTemplate, } from "./types";
import { resolveEntityContext } from "./entity-context";
const DEFAULT_STORAGE_TEMPLATE_TIMESTAMP = "2026-07-07T00:00:00.000Z";
export const STORAGE_FOLDER_TEMPLATES: Array<Pick<StorageFolderTemplate, "id" | "purpose" | "label" | "path_template">> = [
    { id: "storage-template-catalogue", purpose: "catalogue", label: "Catalogues", path_template: "Catalogues/{category}/{subcategory}/{article}" },
    { id: "storage-template-reference-media", purpose: "reference_media", label: "Reference media", path_template: "Reference Media/{category}/{subcategory}/{article}" },
    { id: "storage-template-customer-document", purpose: "customer_document", label: "Customer documents", path_template: "Customers/{customer}/Documents" },
    { id: "storage-template-site-proof", purpose: "site_proof", label: "Site proof", path_template: "Customers/{customer}/Sites/{site}/Site Proof" },
    { id: "storage-template-measurement", purpose: "measurement", label: "Measurements", path_template: "Customers/{customer}/Sites/{site}/Measurements" },
    { id: "storage-template-quotation", purpose: "quotation", label: "Quotations", path_template: "Customers/{customer}/Quotations/{quotation}" },
    { id: "storage-template-job-document", purpose: "job_document", label: "Job documents", path_template: "Customers/{customer}/Jobs/{job}" },
    { id: "storage-template-purchase-order", purpose: "purchase_order", label: "Purchase orders", path_template: "Procurement/Purchase Orders/{purchase_order}" },
    { id: "storage-template-grn", purpose: "grn", label: "Goods receipt notes", path_template: "Procurement/GRN/{grn}" },
    { id: "storage-template-vendor-bill", purpose: "vendor_bill", label: "Vendor bills", path_template: "Procurement/Vendors/{vendor}/Bills" },
    { id: "storage-template-invoice", purpose: "invoice", label: "Customer invoices & receipts", path_template: "Finance/Customers/{customer}/Invoices" },
    { id: "storage-template-vendor-document", purpose: "vendor_document", label: "Vendor documents", path_template: "Vendors/{vendor}/Documents" },
    { id: "storage-template-contractor-document", purpose: "contractor_document", label: "Contractor documents", path_template: "Contractors/{contractor}/Documents" },
    { id: "storage-template-general", purpose: "general", label: "General documents", path_template: "General/{entity}" },
];
export function defaultStorageFolderTemplates(timestamp = DEFAULT_STORAGE_TEMPLATE_TIMESTAMP): StorageFolderTemplate[] {
    return STORAGE_FOLDER_TEMPLATES.map((row) => ({ ...row, status: "active", created_at: timestamp, updated_at: timestamp }));
}
export function normalizeStorageMaster(master: Master): Master {
    const timestamp = master.storageFolderTemplates?.[0]?.created_at
        || master.storageAccounts?.[0]?.created_at
        || master.fileAssets?.[0]?.created_at
        || DEFAULT_STORAGE_TEMPLATE_TIMESTAMP;
    const templates = master.storageFolderTemplates?.length
        ? master.storageFolderTemplates
        : defaultStorageFolderTemplates(timestamp);
    const accounts = (master.storageAccounts || [])
        .map((account) => ({
        ...account,
        write_enabled: account.write_enabled !== false,
        priority_order: Number.isFinite(account.priority_order) ? account.priority_order : 999,
        switch_threshold_percent: Number.isFinite(account.switch_threshold_percent) ? account.switch_threshold_percent : 85,
        status: account.status || "connected",
    }))
        .sort((left, right) => left.priority_order - right.priority_order || left.label.localeCompare(right.label));
    const accountIds = new Set(accounts.map((account) => account.id));
    // "local" is a built-in storage account for the local-storage fallback; preserve its folders/assets.
    accountIds.add("local");
    const instances = (master.storageFolderInstances || []).filter((folder) => accountIds.has(folder.storage_account_id));
    const instanceIds = new Set(instances.map((folder) => folder.id));
    const assets = (master.fileAssets || []).map((file) => ({
        ...file,
        storage_account_id: file.storage_account_id && accountIds.has(file.storage_account_id)
            ? file.storage_account_id
            : undefined,
        storage_folder_instance_id: file.storage_folder_instance_id && instanceIds.has(file.storage_folder_instance_id)
            ? file.storage_folder_instance_id
            : undefined,
    }));
    return {
        ...master,
        storageAccounts: accounts,
        storageFolderTemplates: templates,
        storageFolderInstances: instances,
        fileAssets: assets,
    };
}
export function accountUsagePercent(account: StorageAccount) {
    const limit = Number(account.quota_limit_bytes || 0);
    const used = Number(account.quota_used_bytes || 0);
    return limit > 0 ? Math.max(0, Math.round((used / limit) * 10000) / 100) : 0;
}
// UPLOAD-025: Default Drive limit when quota_limit_bytes is unknown (consumer accounts = 15 GB)
const DEFAULT_DRIVE_LIMIT_BYTES = 15 * 1024 * 1024 * 1024;
export function accountIsAtSwitchThreshold(account: StorageAccount, additionalBytes = 0) {
    const limit = Number(account.quota_limit_bytes || 0) || DEFAULT_DRIVE_LIMIT_BYTES;
    const threshold = Math.max(1, Math.min(100, Number(account.switch_threshold_percent || 85))) / 100;
    return Number(account.quota_used_bytes || 0) + additionalBytes >= limit * threshold;
}
export function selectWriteStorageAccount(master: Pick<Master, "storageAccounts">, additionalBytes = 0): StorageAccount | undefined {
    return [...(master.storageAccounts || [])]
        .filter((account) => account.status === "connected" && account.write_enabled !== false)
        .sort((a, b) => a.priority_order - b.priority_order || a.label.localeCompare(b.label))
        .find((account) => !accountIsAtSwitchThreshold(account, additionalBytes));
}
// UPLOAD-026: Log warning when falling back to general template
export function templateForPurpose(master: Pick<Master, "storageFolderTemplates">, purpose: StorageFolderPurpose) {
    const exact = (master.storageFolderTemplates || []).find((template) => template.status === "active" && template.purpose === purpose);
    if (exact) return exact;
    const general = (master.storageFolderTemplates || []).find((template) => template.purpose === "general");
    if (general) {
        console.warn(`[storage] No active template for purpose "${purpose}" — falling back to general. Files will be stored in the General folder.`);
        return general;
    }
    return undefined;
}
export function inferStoragePurpose(entityType: FileAttachmentEntityType, kind?: FileAssetKind, role?: FileAttachmentRole): StorageFolderPurpose {
    if (kind === "catalogue" || role === "catalogue")
        return "catalogue";
    if (entityType === "quotation" || entityType === "quotation_item" || entityType === "drawing" || kind === "drawing")
        return "quotation";
    if (entityType === "purchase_order")
        return "purchase_order";
    if (entityType === "grn" || role === "delivery")
        return "grn";
    if (entityType === "vendor_bill" || role === "bill")
        return "vendor_bill";
    if (entityType === "invoice" || entityType === "payment" || role === "invoice")
        return "invoice";
    if (entityType === "vendor" || entityType === "vendor_rate")
        return "vendor_document";
    if (["contractor", "contractor_bid", "contractor_settlement"].includes(entityType))
        return "contractor_document";
    if (entityType === "customer")
        return "customer_document";
    if (role === "measurement" || entityType === "visit" && kind === "site_proof")
        return "measurement";
    if (["site", "room", "visit", "execution_log", "dispatch"].includes(entityType) || kind === "site_proof" || role === "proof")
        return "site_proof";
    if (["workOrder", "boq", "boq_item", "workRequired", "task", "followup"].includes(entityType))
        return "job_document";
    if (kind === "media")
        return "reference_media";
    return "general";
}
function segment(value: string | undefined, fallback: string) {
    const clean = (value || "").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 80);
    return clean || fallback;
}
function recordName(rows: Array<{
    id: string;
    name?: string;
    title?: string;
    code?: string;
}> | undefined, id: string | undefined, fallback: string) {
    const value = id ? rows?.find((row) => row.id === id) : undefined;
    return segment(value?.name || value?.title || value?.code || id, fallback);
}
export function logicalStoragePath(db: RDashDatabase, entityType: FileAttachmentEntityType, entityId: string, template: StorageFolderTemplate) {
    const context = resolveEntityContext(db, entityType, entityId, "Storage path");
    const customer = recordName(db.customers, context.customerId, "Unlinked customer");
    const site = recordName(db.sites, context.siteId, "General site");
    const job = recordName(db.workOrders, context.workOrderId, "Unassigned job");
    const quotation = recordName(db.quotations, context.quotationId, "Draft quotation");
    const purchaseOrder = recordName(db.purchaseOrders, context.purchaseOrderId, "Unassigned PO");
    const grn = recordName(db.grns, context.grnId, "Unassigned GRN");
    const vendor = recordName(db.master.vendors, context.vendorId, "Unassigned vendor");
    const contractor = recordName(db.master.contractors, context.contractorId, "Unassigned contractor");
// UPLOAD-027: Single-pass regex substitution to prevent name collisions
// (e.g., customer name containing "{site}" would be corrupted by sequential replaceAll)
    const substitutions: Record<string, string> = {
        customer, site, job, quotation, purchase_order: purchaseOrder, grn, vendor, contractor,
        category: "Unclassified", subcategory: "General", article: "General",
        entity: segment(entityType, "General"),
    };
    return template.path_template.replace(/\{(customer|site|job|quotation|purchase_order|grn|vendor|contractor|category|subcategory|article|entity)\}/g, (match, key) => substitutions[key] ?? match);
}
export function storageFileLinksFor(db: RDashDatabase, fileId: string) {
    return (db.entityFileAttachments || []).filter((link) => link.file_asset_id === fileId);
}
