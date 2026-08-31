import type { FileAttachmentEntityType, FileAttachmentRole, FileAssetKind, Master, StorageAccount, StorageFolderPurpose, StorageFolderTemplate } from "./types";
import { uploadPurposeForEntity } from "../uploads/upload-purpose";
const DEFAULT_STORAGE_TEMPLATE_TIMESTAMP = "2026-07-07T00:00:00.000Z";
const STORAGE_FOLDER_TEMPLATES: Array<Pick<StorageFolderTemplate, "id" | "purpose" | "label" | "path_template">> = [
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
function defaultStorageFolderTemplates(timestamp = DEFAULT_STORAGE_TEMPLATE_TIMESTAMP): StorageFolderTemplate[] {
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
export function inferStoragePurpose(entityType: FileAttachmentEntityType, kind?: FileAssetKind, role?: FileAttachmentRole): StorageFolderPurpose {
    if (kind === "catalogue" || role === "catalogue") return "catalogue";
    if (kind === "drawing") return "drawing";
    if (entityType === "visit" && role === "measurement") return "measurement";
    if (entityType === "general" && kind === "media") return "reference_media";
    return uploadPurposeForEntity(entityType);
}