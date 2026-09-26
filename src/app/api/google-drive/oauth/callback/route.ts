import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import {
  completeGoogleDriveConnect,
  persistGoogleDriveCredential,
} from "@/lib/rdash/server/drive-connections";
import { commitWorkspaceOperations, getWorkspaceSubset } from "@/lib/rdash/server/workspace";
import { resolvePublicOrigin } from "@/lib/rdash/server/public-origin";
import type { StorageAccount } from "@/lib/rdash/types";

export const runtime = "nodejs";

function back(origin: string, path: string, key: string, value: string) {
  const url = new URL(path, origin);
  url.searchParams.set(key, value);
  return url;
}

async function storageAccountsSnapshot() {
  return getWorkspaceSubset({
    fullCollections: ["master.storageAccounts"],
    limitsByCollection: { "master.storageAccounts": 0 },
  });
}

async function saveStorageAccount(
  build: (accounts: StorageAccount[]) => StorageAccount,
): Promise<StorageAccount> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await storageAccountsSnapshot();
    const account = build(current.data.master.storageAccounts || []);
    try {
      await commitWorkspaceOperations(
        current.revision,
        [{ collection: "master.storageAccounts", upsert: [account as unknown as Record<string, unknown>] }],
        current.rowVersions || {},
      );
      return account;
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || error.message !== "CONFLICT") throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Drive account could not be saved after concurrent updates.");
}

export async function GET(request: NextRequest) {
  const origin = resolvePublicOrigin(request);
  const state = request.nextUrl.searchParams.get("state") || "";
  const code = request.nextUrl.searchParams.get("code") || "";
  try {
    if (!state || !code) throw new Error("Google Drive did not return a valid authorization response.");
    const user = await requireSession(request);
    const result = await completeGoogleDriveConnect(user, { state, code, origin });
    const timestamp = new Date().toISOString();

    const staged = await saveStorageAccount((accounts) => {
      const previous = accounts.find((account) => account.id === result.storageAccountId);
      const priority = previous?.priority_order
        || Math.max(0, ...accounts.map((account) => account.priority_order || 0)) + 1;
      return {
        id: result.storageAccountId,
        label: previous?.label || result.label,
        email: result.connection.email,
        status: "reconnect_required",
        write_enabled: false,
        priority_order: priority,
        quota_used_bytes: result.connection.quotaUsedBytes,
        quota_limit_bytes: result.connection.quotaLimitBytes,
        switch_threshold_percent: previous?.switch_threshold_percent ?? 85,
        root_folder_id: result.connection.rootFolderId,
        root_folder_name: result.connection.rootFolderName,
        web_view_link: result.connection.rootFolderUrl,
        notes: previous?.notes,
        created_at: previous?.created_at || timestamp,
        updated_at: timestamp,
      };
    });

    await persistGoogleDriveCredential(staged.id, result.credential);

    const activated = await saveStorageAccount((accounts) => {
      const current = accounts.find((account) => account.id === staged.id) || staged;
      return {
        ...current,
        status: "connected",
        write_enabled: true,
        email: result.connection.email || current.email,
        quota_used_bytes: result.connection.quotaUsedBytes,
        quota_limit_bytes: result.connection.quotaLimitBytes,
        root_folder_id: result.connection.rootFolderId || current.root_folder_id,
        root_folder_name: result.connection.rootFolderName || current.root_folder_name,
        web_view_link: result.connection.rootFolderUrl || current.web_view_link,
        updated_at: new Date().toISOString(),
      };
    });

    return NextResponse.redirect(back(origin, result.returnTo, "drive_connected", activated.id));
  } catch (error) {
    const message = error instanceof Error
      ? error.message.replace(/^FORBIDDEN:/, "")
      : "Google Drive connection failed.";
    return NextResponse.redirect(back(origin, "/", "drive_error", message.slice(0, 160)));
  }
}
