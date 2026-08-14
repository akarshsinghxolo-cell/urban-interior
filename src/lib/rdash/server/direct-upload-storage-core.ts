import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getGoogleDriveAccessToken } from "./google-drive";
import type { RDashDatabase, StorageAccount } from "../types";

export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
export const WORKSPACE_ID = "default";
export const MAX_UPLOAD_BYTES = Number(process.env.GOOGLE_DRIVE_MAX_UPLOAD_BYTES || 100 * 1024 * 1024);

const FOLDER_CLAIM_STALE_MS = 60_000;
const FOLDER_CLAIM_WAIT_MS = 12_000;

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

export function practicalFolderName(
  value: string | undefined,
  detail: string | undefined,
  fallback: string,
): string {
  const primary = safeSegment(value, fallback);
  const context = safeSegment(detail, "");
  if (!context || primary.toLocaleLowerCase().includes(context.toLocaleLowerCase())) return primary;
  return safeSegment(`${primary} - ${context}`, primary);
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
  const { data: existingBatch, error: existingBatchError } = await admin
    .from("uc_upload_batches")
    .select("storage_account_id")
    .eq("id", batchId)
    .maybeSingle();
  if (existingBatchError) throw new Error(existingBatchError.message);

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
      if (access.used + incomingBytes <= limit * threshold) return access;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Could not use ${account.label}.`);
    }
  }
  throw new Error(errors[0] || "No connected Drive account has enough configured capacity.");
}

export type FolderSegment = { name: string; key: string };

type FolderRegistryRow = {
  folder_key: string;
  google_folder_id: string;
  display_name?: string;
  web_view_link?: string;
  status: string;
  updated_at?: string;
};

function registryKey(storageAccountId: string, folderKey: string): string {
  return `${storageAccountId}:${folderKey}`;
}

async function folderRegistryRow(storageAccountId: string, folderKey: string): Promise<FolderRegistryRow | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("uc_drive_folders")
    .select("folder_key,google_folder_id,display_name,web_view_link,status,updated_at")
    .eq("folder_key", registryKey(storageAccountId, folderKey))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as FolderRegistryRow | null;
}

async function verifyFolder(
  accessToken: string,
  googleFolderId: string,
  parentId: string,
  desiredName: string,
): Promise<{ id: string; webViewLink: string } | null> {
  if (!googleFolderId || googleFolderId.startsWith("pending:")) return null;
  const response = await driveFetch(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(googleFolderId)}?fields=id,name,mimeType,parents,trashed,webViewLink`,
  );
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => ({})) as {
    id?: string;
    name?: string;
    mimeType?: string;
    parents?: string[];
    trashed?: boolean;
    webViewLink?: string;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || "Could not verify the registered Google Drive folder.");
  if (!payload.id || payload.trashed || payload.mimeType !== "application/vnd.google-apps.folder" || !payload.parents?.includes(parentId)) return null;

  let webViewLink = payload.webViewLink || `https://drive.google.com/drive/folders/${payload.id}`;
  if (payload.name !== desiredName) {
    const renamed = await driveFetch(
      accessToken,
      `${DRIVE_API}/files/${encodeURIComponent(payload.id)}?fields=id,name,webViewLink`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: desiredName }),
      },
    );
    const renamedPayload = await renamed.json().catch(() => ({})) as {
      id?: string;
      webViewLink?: string;
      error?: { message?: string };
    };
    if (!renamed.ok) throw new Error(renamedPayload.error?.message || `Could not rename the Drive folder to ${desiredName}.`);
    webViewLink = renamedPayload.webViewLink || webViewLink;
  }

  return { id: payload.id, webViewLink };
}

async function findFolderByProperty(accessToken: string, parentId: string, segment: FolderSegment) {
  const key = escapeDriveQuery(segment.key);
  const query = `appProperties has { key='ucFolderKey' and value='${key}' } and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const listed = await driveFetch(
    accessToken,
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,parents,createdTime)&pageSize=100`,
  );
  const payload = await listed.json().catch(() => ({})) as {
    files?: Array<{ id?: string; webViewLink?: string; parents?: string[]; createdTime?: string }>;
    error?: { message?: string };
  };
  if (!listed.ok) throw new Error(payload.error?.message || "Could not search Google Drive folders.");
  return (payload.files || [])
    .filter((candidate) => candidate.id && candidate.parents?.includes(parentId))
    .sort((a, b) => String(a.createdTime || "").localeCompare(String(b.createdTime || "")))[0];
}

async function persistFolderRegistry(input: {
  storageAccountId: string;
  segment: FolderSegment;
  parentFolderKey?: string;
  googleFolderId: string;
  webViewLink: string;
  status: string;
  expectedClaim?: string;
}): Promise<void> {
  const admin = getSupabaseAdminClient();
  const timestamp = nowIso();
  const values = {
    folder_key: registryKey(input.storageAccountId, input.segment.key),
    workspace_id: WORKSPACE_ID,
    storage_account_id: input.storageAccountId,
    google_folder_id: input.googleFolderId,
    parent_folder_key: input.parentFolderKey ? registryKey(input.storageAccountId, input.parentFolderKey) : null,
    display_name: input.segment.name,
    web_view_link: input.webViewLink,
    status: input.status,
    updated_at: timestamp,
  };

  if (input.expectedClaim) {
    const { data, error } = await admin.from("uc_drive_folders")
      .update(values)
      .eq("folder_key", values.folder_key)
      .eq("google_folder_id", input.expectedClaim)
      .select("folder_key")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Another upload replaced the Drive folder creation claim.");
    return;
  }

  const { error } = await admin.from("uc_drive_folders").upsert({
    ...values,
    created_at: timestamp,
  }, { onConflict: "folder_key" });
  if (error) throw new Error(error.message);
}

async function acquireFolderClaim(
  storageAccountId: string,
  segment: FolderSegment,
  parentFolderKey?: string,
): Promise<{ owner: true; claim: string } | { owner: false; folder: FolderRegistryRow }> {
  const admin = getSupabaseAdminClient();
  const folderKey = registryKey(storageAccountId, segment.key);
  const claim = `pending:${crypto.randomUUID()}`;
  const timestamp = nowIso();
  const { error: insertError } = await admin.from("uc_drive_folders").insert({
    folder_key: folderKey,
    workspace_id: WORKSPACE_ID,
    storage_account_id: storageAccountId,
    google_folder_id: claim,
    parent_folder_key: parentFolderKey ? registryKey(storageAccountId, parentFolderKey) : null,
    display_name: segment.name,
    web_view_link: "",
    status: "creating",
    created_at: timestamp,
    updated_at: timestamp,
  });
  if (!insertError) return { owner: true, claim };
  if (insertError.code !== "23505") throw new Error(insertError.message);

  const startedAt = Date.now();
  while (Date.now() - startedAt < FOLDER_CLAIM_WAIT_MS) {
    const row = await folderRegistryRow(storageAccountId, segment.key);
    if (row?.status === "active") return { owner: false, folder: row };
    const stale = !row?.updated_at || Date.now() - Date.parse(row.updated_at) > FOLDER_CLAIM_STALE_MS;
    if (row && row.status !== "active" && stale) {
      const replacementClaim = `pending:${crypto.randomUUID()}`;
      const { data, error } = await admin.from("uc_drive_folders")
        .update({
          google_folder_id: replacementClaim,
          parent_folder_key: parentFolderKey ? registryKey(storageAccountId, parentFolderKey) : null,
          display_name: segment.name,
          web_view_link: "",
          status: "creating",
          updated_at: nowIso(),
        })
        .eq("folder_key", folderKey)
        .eq("google_folder_id", row.google_folder_id)
        .select("folder_key")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return { owner: true, claim: replacementClaim };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for the ${segment.name} Drive folder to be created.`);
}

async function ensureFolder(
  accessToken: string,
  storageAccountId: string,
  parentId: string,
  segment: FolderSegment,
  parentFolderKey?: string,
): Promise<{ id: string; webViewLink: string }> {
  const existing = await folderRegistryRow(storageAccountId, segment.key);
  if (existing?.status === "active") {
    const verified = await verifyFolder(accessToken, existing.google_folder_id, parentId, segment.name);
    if (verified) {
      if (existing.display_name !== segment.name) {
        await getSupabaseAdminClient().from("uc_drive_folders")
          .update({ display_name: segment.name, updated_at: nowIso() })
          .eq("folder_key", existing.folder_key)
          .eq("google_folder_id", existing.google_folder_id);
      }
      return verified;
    }
    await getSupabaseAdminClient().from("uc_drive_folders")
      .update({ status: "stale", updated_at: nowIso() })
      .eq("folder_key", existing.folder_key)
      .eq("google_folder_id", existing.google_folder_id);
  }

  const discovered = await findFolderByProperty(accessToken, parentId, segment);
  if (discovered?.id) {
    const folder = await verifyFolder(accessToken, String(discovered.id), parentId, segment.name);
    if (!folder) throw new Error(`The discovered ${segment.name} Drive folder is not available.`);
    await persistFolderRegistry({
      storageAccountId,
      segment,
      parentFolderKey,
      googleFolderId: folder.id,
      webViewLink: folder.webViewLink,
      status: "active",
    });
    return folder;
  }

  const ownership = await acquireFolderClaim(storageAccountId, segment, parentFolderKey);
  if (!ownership.owner) {
    const verified = await verifyFolder(accessToken, ownership.folder.google_folder_id, parentId, segment.name);
    if (verified) return verified;
    throw new Error(`The registered ${segment.name} Drive folder is not available.`);
  }

  try {
    const discoveredAfterClaim = await findFolderByProperty(accessToken, parentId, segment);
    let folder: { id: string; webViewLink: string };
    if (discoveredAfterClaim?.id) {
      const verified = await verifyFolder(accessToken, String(discoveredAfterClaim.id), parentId, segment.name);
      if (!verified) throw new Error(`The discovered ${segment.name} Drive folder is not available.`);
      folder = verified;
    } else {
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
      folder = {
        id: createdPayload.id,
        webViewLink: createdPayload.webViewLink || `https://drive.google.com/drive/folders/${createdPayload.id}`,
      };
    }

    await persistFolderRegistry({
      storageAccountId,
      segment,
      parentFolderKey,
      googleFolderId: folder.id,
      webViewLink: folder.webViewLink,
      status: "active",
      expectedClaim: ownership.claim,
    });
    return folder;
  } catch (error) {
    await getSupabaseAdminClient().from("uc_drive_folders")
      .update({ status: "error", updated_at: nowIso() })
      .eq("folder_key", registryKey(storageAccountId, segment.key))
      .eq("google_folder_id", ownership.claim)
      .then(() => undefined);
    throw error;
  }
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
