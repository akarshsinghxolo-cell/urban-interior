import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { StorageAccount } from "../types";
import {
  DRIVE_API,
  WORKSPACE_ID,
  driveFetch,
  ensureFolderPath as ensureFolderPathCore,
  nowIso,
} from "./direct-upload-storage-core";
import type { CanonicalFolderSegment } from "./drive-folder-hierarchy";

type FolderRegistryRow = {
  folder_key: string;
  google_folder_id: string;
  display_name?: string;
  web_view_link?: string;
  status: string;
  updated_at?: string;
};

type DriveFolder = {
  id: string;
  name?: string;
  mimeType?: string;
  parents?: string[];
  trashed?: boolean;
  webViewLink?: string;
  createdTime?: string;
};

function registryKey(storageAccountId: string, folderKey: string): string {
  return `${storageAccountId}:${folderKey}`;
}

function escapeDriveQuery(value: string): string {
  return value.replace(/'/g, "\\'");
}

async function registryRow(
  storageAccountId: string,
  folderKey: string,
): Promise<FolderRegistryRow | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("uc_drive_folders")
    .select("folder_key,google_folder_id,display_name,web_view_link,status,updated_at")
    .eq("folder_key", registryKey(storageAccountId, folderKey))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as FolderRegistryRow | null;
}

async function readFolder(accessToken: string, folderId: string): Promise<DriveFolder | null> {
  if (!folderId || folderId.startsWith("pending:")) return null;
  const response = await driveFetch(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,parents,trashed,webViewLink,createdTime`,
  );
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => ({})) as DriveFolder & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Could not inspect the registered Drive folder.");
  if (!payload.id || payload.trashed || payload.mimeType !== "application/vnd.google-apps.folder") return null;
  return payload;
}

async function findFoldersByKey(
  accessToken: string,
  folderKeys: string[],
): Promise<Array<DriveFolder & { matchedKey: string }>> {
  const found: Array<DriveFolder & { matchedKey: string }> = [];
  for (const folderKey of folderKeys) {
    const query = `appProperties has { key='ucFolderKey' and value='${escapeDriveQuery(folderKey)}' } and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const response = await driveFetch(
      accessToken,
      `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,parents,trashed,webViewLink,createdTime)&pageSize=100`,
    );
    const payload = await response.json().catch(() => ({})) as {
      files?: DriveFolder[];
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(payload.error?.message || "Could not search for canonical Drive folders.");
    for (const folder of payload.files || []) {
      if (folder.id) found.push({ ...folder, matchedKey: folderKey });
    }
  }
  return found.sort((a, b) => String(a.createdTime || "").localeCompare(String(b.createdTime || "")));
}

async function persistRegistry(
  accountId: string,
  segment: CanonicalFolderSegment,
  parentFolderKey: string | undefined,
  folder: DriveFolder,
): Promise<void> {
  const timestamp = nowIso();
  const { error } = await getSupabaseAdminClient().from("uc_drive_folders").upsert({
    folder_key: registryKey(accountId, segment.key),
    workspace_id: WORKSPACE_ID,
    storage_account_id: accountId,
    google_folder_id: folder.id,
    parent_folder_key: parentFolderKey ? registryKey(accountId, parentFolderKey) : null,
    display_name: segment.name,
    web_view_link: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
  }, { onConflict: "folder_key" });
  if (error) throw new Error(error.message);
}

async function adoptFolder(
  accessToken: string,
  account: StorageAccount,
  parentId: string,
  parentFolderKey: string | undefined,
  segment: CanonicalFolderSegment,
): Promise<void> {
  const keys = [segment.key, ...(segment.legacyKeys || [])];
  const registeredRows = (await Promise.all(keys.map((key) => registryRow(account.id, key))))
    .filter((row): row is FolderRegistryRow => Boolean(row));
  const candidates = await findFoldersByKey(accessToken, keys);

  const orderedIds = Array.from(new Set([
    ...registeredRows
      .filter((row) => row.status === "active" && !row.google_folder_id.startsWith("pending:"))
      .map((row) => row.google_folder_id),
    ...candidates.map((folder) => folder.id),
  ]));

  let canonical: (DriveFolder & { matchedKey?: string }) | null = null;
  for (const folderId of orderedIds) {
    const folder = await readFolder(accessToken, folderId);
    if (!folder) continue;
    canonical = {
      ...folder,
      matchedKey: candidates.find((candidate) => candidate.id === folder.id)?.matchedKey,
    };
    break;
  }

  if (!canonical) {
    for (const row of registeredRows) {
      if (row.status === "active") {
        await getSupabaseAdminClient().from("uc_drive_folders")
          .update({ status: "stale", updated_at: nowIso() })
          .eq("folder_key", row.folder_key)
          .eq("google_folder_id", row.google_folder_id);
      }
    }
    return;
  }

  const currentParents = canonical.parents || [];
  const needsMove = !currentParents.includes(parentId);
  const needsRename = canonical.name !== segment.name;
  const needsCanonicalKey = canonical.matchedKey && canonical.matchedKey !== segment.key;

  if (needsMove || needsRename || needsCanonicalKey) {
    const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(canonical.id)}`);
    if (needsMove) {
      url.searchParams.set("addParents", parentId);
      if (currentParents.length) url.searchParams.set("removeParents", currentParents.join(","));
    }
    url.searchParams.set("fields", "id,name,mimeType,parents,trashed,webViewLink,createdTime");
    const response = await driveFetch(accessToken, url.toString(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(needsRename ? { name: segment.name } : {}),
        ...(needsCanonicalKey ? {
          appProperties: { ucFolderKey: segment.key, ucWorkspaceId: WORKSPACE_ID },
        } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({})) as DriveFolder & { error?: { message?: string } };
    if (!response.ok || !payload.id) {
      throw new Error(payload.error?.message || `Could not place ${segment.name} in its canonical Drive parent.`);
    }
    canonical = { ...canonical, ...payload, matchedKey: segment.key };
  }

  await persistRegistry(account.id, segment, parentFolderKey, canonical);

  for (const legacyKey of segment.legacyKeys || []) {
    const legacy = registeredRows.find((row) => row.folder_key === registryKey(account.id, legacyKey));
    if (legacy && legacy.google_folder_id === canonical.id) {
      await getSupabaseAdminClient().from("uc_drive_folders")
        .update({ status: "migrated", updated_at: nowIso() })
        .eq("folder_key", legacy.folder_key)
        .eq("google_folder_id", legacy.google_folder_id);
    }
  }

  const duplicateIds = candidates
    .map((candidate) => candidate.id)
    .filter((id) => id !== canonical?.id);
  if (duplicateIds.length) {
    console.warn("[DriveHierarchy] Duplicate canonical folders detected", {
      folderKey: segment.key,
      canonicalFolderId: canonical.id,
      duplicateFolderIds: duplicateIds,
    });
  }
}

export async function ensureFolderPath(
  accessToken: string,
  account: StorageAccount,
  segments: CanonicalFolderSegment[],
): Promise<{ id: string; webViewLink: string; key: string }> {
  if (!account.root_folder_id) {
    throw new Error(`Drive account ${account.label} has no Urban Castle root folder.`);
  }

  let parentId = account.root_folder_id;
  let parentFolderKey: string | undefined;
  let resolved = {
    id: parentId,
    webViewLink: account.web_view_link || `https://drive.google.com/drive/folders/${parentId}`,
    key: "root",
  };

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    await adoptFolder(accessToken, account, parentId, parentFolderKey, segment);
    resolved = await ensureFolderPathCore(accessToken, account, segments.slice(0, index + 1));
    parentId = resolved.id;
    parentFolderKey = segment.key;
  }

  return resolved;
}
