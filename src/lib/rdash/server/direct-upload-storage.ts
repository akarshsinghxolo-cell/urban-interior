import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getGoogleDriveAccessToken } from "./google-drive";
import { resolveEntityContext } from "../entity-context";
import type { FileAttachmentEntityType, RDashDatabase, StorageAccount } from "../types";
import type { UploadPurpose } from "@/lib/uploads/upload-types";

export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
export const WORKSPACE_ID = "default";
export const MAX_UPLOAD_BYTES = Number(process.env.GOOGLE_DRIVE_MAX_UPLOAD_BYTES || 100 * 1024 * 1024);

export function nowIso(): string {
  return new Date().toISOString();
}

function escapeDriveQuery(value: string): string {
  return value.replace(/'/g, "\\'");
}

export function safeSegment(value: string | undefined, fallback: string): string {
  const cleaned = (value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return cleaned || fallback;
}

function shortId(value: string | undefined): string {
  return safeSegment((value || "unknown").replace(/[^a-zA-Z0-9]/g, "").slice(-8), "unknown");
}

export async function driveFetch(accessToken: string, url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) },
    cache: "no-store",
  });
}

async function liveAccountAccess(account: StorageAccount): Promise<{
  account: StorageAccount;
  accessToken: string;
  used: number;
  limit: number;
}> {
  const accessToken = await getGoogleDriveAccessToken(account);
  const response = await driveFetch(accessToken, `${DRIVE_API}/about?fields=storageQuota(limit,usage)`);
  const payload = await response.json().catch(() => ({})) as {
    storageQuota?: { limit?: string; usage?: string };
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || `Could not read quota for ${account.label}.`);
  return {
    account,
    accessToken,
    used: Number(payload.storageQuota?.usage || account.quota_used_bytes || 0),
    limit: Number(payload.storageQuota?.limit || account.quota_limit_bytes || 0),
  };
}

export async function selectUploadAccount(db: RDashDatabase, batchId: string, incomingBytes: number) {
  const admin = getSupabaseAdminClient();
  const { data: existingBatch } = await admin
    .from("uc_upload_batches")
    .select("storage_account_id")
    .eq("id", batchId)
    .maybeSingle();
  const accounts = [...(db.master.storageAccounts || [])]
    .filter((account) => account.status === "connected" && account.write_enabled !== false)
    .sort((a, b) => a.priority_order - b.priority_order || a.label.localeCompare(b.label));
  if (!accounts.length) throw new Error("Connect at least one Google Drive account before uploading files.");
  if (existingBatch?.storage_account_id) {
    const pinned = accounts.find((account) => account.id === existingBatch.storage_account_id);
    if (!pinned) throw new Error("The Drive account pinned to this upload batch is no longer available.");
    return liveAccountAccess(pinned);
  }
  const errors: string[] = [];
  for (const account of accounts) {
    try {
      const access = await liveAccountAccess(account);
      const limit = access.limit || 15 * 1024 * 1024 * 1024;
      const threshold = Math.max(1, Math.min(100, Number(account.switch_threshold_percent || 85))) / 100;
      if (access.used + incomingBytes < limit * threshold) return access;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Could not use ${account.label}.`);
    }
  }
  throw new Error(errors[0] || "No connected Drive account has enough configured capacity.");
}

export type FolderSegment = { name: string; key: string };

function registryKey(storageAccountId: string, folderKey: string): string {
  return `${storageAccountId}:${folderKey}`;
}

async function registeredFolder(storageAccountId: string, folderKey: string) {
  const { data } = await getSupabaseAdminClient()
    .from("uc_drive_folders")
    .select("google_folder_id,web_view_link")
    .eq("folder_key", registryKey(storageAccountId, folderKey))
    .eq("status", "active")
    .maybeSingle();
  return data as { google_folder_id: string; web_view_link?: string } | null;
}

async function ensureFolder(
  accessToken: string,
  storageAccountId: string,
  parentId: string,
  segment: FolderSegment,
  parentFolderKey?: string,
): Promise<{ id: string; webViewLink: string }> {
  const registered = await registeredFolder(storageAccountId, segment.key);
  if (registered?.google_folder_id) {
    return {
      id: registered.google_folder_id,
      webViewLink: registered.web_view_link || `https://drive.google.com/drive/folders/${registered.google_folder_id}`,
    };
  }
  const key = escapeDriveQuery(segment.key);
  const query = `appProperties has { key='ucFolderKey' and value='${key}' } and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const listed = await driveFetch(accessToken, `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,parents)&pageSize=10`);
  const payload = await listed.json().catch(() => ({})) as {
    files?: Array<{ id?: string; webViewLink?: string; parents?: string[] }>;
    error?: { message?: string };
  };
  if (!listed.ok) throw new Error(payload.error?.message || "Could not search Google Drive folders.");
  let folder = payload.files?.find((candidate) => candidate.id && candidate.parents?.includes(parentId));
  if (!folder?.id) {
    const created = await driveFetch(accessToken, `${DRIVE_API}/files?fields=id,name,webViewLink,parents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: segment.name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
        appProperties: { ucFolderKey: segment.key, ucWorkspaceId: WORKSPACE_ID },
      }),
    });
    const createdPayload = await created.json().catch(() => ({})) as {
      id?: string;
      webViewLink?: string;
      error?: { message?: string };
    };
    if (!created.ok || !createdPayload.id) throw new Error(createdPayload.error?.message || `Could not create ${segment.name}.`);
    folder = createdPayload;
  }
  const id = String(folder.id);
  const webViewLink = folder.webViewLink || `https://drive.google.com/drive/folders/${id}`;
  const timestamp = nowIso();
  await getSupabaseAdminClient().from("uc_drive_folders").upsert({
    folder_key: registryKey(storageAccountId, segment.key),
    workspace_id: WORKSPACE_ID,
    storage_account_id: storageAccountId,
    google_folder_id: id,
    parent_folder_key: parentFolderKey ? registryKey(storageAccountId, parentFolderKey) : null,
    display_name: segment.name,
    web_view_link: webViewLink,
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
  }, { onConflict: "folder_key" });
  return { id, webViewLink };
}

export async function ensureFolderPath(
  accessToken: string,
  account: StorageAccount,
  segments: FolderSegment[],
): Promise<{ id: string; webViewLink: string; key: string }> {
  if (!account.root_folder_id) throw new Error(`Drive account ${account.label} has no Urban Castle root folder.`);
  let parentId = account.root_folder_id;
  let webViewLink = account.web_view_link || `https://drive.google.com/drive/folders/${parentId}`;
  let parentFolderKey: string | undefined;
  for (const segment of segments) {
    const folder = await ensureFolder(accessToken, account.id, parentId, segment, parentFolderKey);
    parentId = folder.id;
    webViewLink = folder.webViewLink;
    parentFolderKey = segment.key;
  }
  return { id: parentId, webViewLink, key: segments.at(-1)?.key || "root" };
}

export function destinationSegments(
  db: RDashDatabase,
  purpose: UploadPurpose,
  entityType: FileAttachmentEntityType,
  entityId: string,
): FolderSegment[] {
  if (purpose === "catalogue") return [{ name: "Library", key: "root:library" }, { name: "Catalogues", key: "library:catalogues" }];
  if (purpose === "reference_media") return [{ name: "Library", key: "root:library" }, { name: "Reference", key: "library:reference" }];
  if (purpose === "import_source") return [{ name: "_System", key: "root:system" }, { name: "Imports", key: "system:imports" }];
  if (purpose === "diagnostic") return [{ name: "_System", key: "root:system" }, { name: "Diagnostics", key: "system:diagnostics" }];

  let context: ReturnType<typeof resolveEntityContext> | undefined;
  try {
    context = resolveEntityContext(db, entityType, entityId, "Direct upload destination");
  } catch {
    context = undefined;
  }
  const customer = db.customers.find((row) => row.id === context?.customerId);
  const site = db.sites.find((row) => row.id === context?.siteId);
  const workOrder = db.workOrders.find((row) => row.id === context?.workOrderId);
  const vendor = db.master.vendors.find((row) => row.id === context?.vendorId || (entityType === "vendor" ? row.id === entityId : false));
  const contractor = db.master.contractors.find((row) => row.id === context?.contractorId || (entityType === "contractor" ? row.id === entityId : false));
  const po = db.purchaseOrders.find((row) => row.id === context?.purchaseOrderId || (entityType === "purchase_order" ? row.id === entityId : false));
  const grn = db.grns.find((row) => row.id === context?.grnId || (entityType === "grn" ? row.id === entityId : false));
  const bill = db.vendorBills.find((row) => row.id === entityId);
  const customerRoot: FolderSegment[] = [
    { name: "Customers", key: "root:customers" },
    { name: `C-${shortId(customer?.id)} ${safeSegment(customer?.name, "Customer")}`, key: `customer:${customer?.id || "unlinked"}` },
  ];

  if (["site_evidence", "visit_evidence", "measurement", "drawing"].includes(purpose)) {
    return [...customerRoot, { name: `S-${shortId(site?.id)} ${safeSegment(site?.name, "Site")}`, key: `site:${site?.id || entityId}` }];
  }
  if (["work_order_document", "execution_evidence"].includes(purpose)) {
    return [...customerRoot, { name: `WO-${safeSegment(workOrder?.work_order_no, shortId(workOrder?.id))}`, key: `work_order:${workOrder?.id || entityId}` }];
  }
  if (["quotation_document", "customer_document", "customer_invoice", "communication_attachment"].includes(purpose)) {
    return [...customerRoot, { name: "Commercial", key: `customer:${customer?.id || "unlinked"}:commercial` }];
  }
  if (purpose === "purchase_order") {
    const year = String(new Date(po?.created_at || Date.now()).getFullYear());
    return [{ name: "Procurement", key: "root:procurement" }, { name: year, key: `procurement:${year}` }, { name: safeSegment(po?.po_no, `PO-${shortId(po?.id || entityId)}`), key: `purchase_order:${po?.id || entityId}` }];
  }
  if (purpose === "grn_evidence") {
    const year = String(new Date(grn?.received_at || Date.now()).getFullYear());
    return [{ name: "Procurement", key: "root:procurement" }, { name: year, key: `procurement:${year}` }, { name: safeSegment(grn?.grn_no, `GRN-${shortId(grn?.id || entityId)}`), key: `grn:${grn?.id || entityId}` }];
  }
  if (purpose === "vendor_bill") {
    const year = String(new Date(bill?.created_at || Date.now()).getFullYear());
    return [{ name: "Procurement", key: "root:procurement" }, { name: year, key: `procurement:${year}` }, { name: safeSegment(bill?.bill_no, `BILL-${shortId(bill?.id || entityId)}`), key: `vendor_bill:${bill?.id || entityId}` }];
  }
  if (purpose === "vendor_document") {
    return [{ name: "Vendors", key: "root:vendors" }, { name: `V-${shortId(vendor?.id)} ${safeSegment(vendor?.name, "Vendor")}`, key: `vendor:${vendor?.id || entityId}` }];
  }
  if (purpose === "contractor_document") {
    return [{ name: "Contractors", key: "root:contractors" }, { name: `CT-${shortId(contractor?.id)} ${safeSegment(contractor?.name, "Contractor")}`, key: `contractor:${contractor?.id || entityId}` }];
  }
  if (purpose === "staff_document") {
    const staff = db.master.staff.find((row) => row.id === entityId);
    return [{ name: "Staff", key: "root:staff" }, { name: `ST-${shortId(staff?.id)} ${safeSegment(staff?.name, "Staff")}`, key: `staff:${staff?.id || entityId}` }];
  }
  return [{ name: "_System", key: "root:system" }, { name: "Staging", key: "system:staging" }];
}
