import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { completeGoogleDriveConnect } from "@/lib/rdash/server/drive-connections";
import { commitWorkspaceOperations, getWorkspaceSubset } from "@/lib/rdash/server/workspace";
import { resolvePublicOrigin } from "@/lib/rdash/server/public-origin";
import type { StorageAccount } from "@/lib/rdash/types";

export const runtime = "nodejs";

function storageAccountId(connectionId: string) {
  const workspaceId = process.env.UC_WORKSPACE_ID || "default";
  const workspaceKey = createHash("sha256")
    .update(`${workspaceId}:${connectionId}`)
    .digest("hex")
    .slice(0, 24);
  return `storage-${workspaceKey}`;
}

function back(origin: string, path: string, key: string, value: string) {
  const url = new URL(path, origin);
  url.searchParams.set(key, value);
  return url;
}

export async function GET(request: NextRequest) {
  const origin = resolvePublicOrigin(request);
  const state = request.nextUrl.searchParams.get("state") || "";
  const code = request.nextUrl.searchParams.get("code") || "";
  try {
    if (!state || !code) throw new Error("Google Drive did not return a valid authorization response.");
    const user = await requireSession(request);
    const result = await completeGoogleDriveConnect(user, { state, code, origin });

    // Storage account ordering only depends on the small storage-account
    // registry. Never load or rewrite unrelated ERP entities after OAuth.
    let accountId = "";
    let lastSaveError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await getWorkspaceSubset({
        fullCollections: ["master.storageAccounts"],
        limitsByCollection: { "master.storageAccounts": 0 },
      });
      const timestamp = new Date().toISOString();
      const previous = current.data.master.storageAccounts.find(
        (account) => account.oauth_connection_id === result.connection.id,
      );
      const priority = previous?.priority_order
        || Math.max(0, ...current.data.master.storageAccounts.map((account) => account.priority_order || 0)) + 1;
      const account: StorageAccount = {
        id: previous?.id || storageAccountId(result.connection.id),
        label: previous?.label || result.label,
        email: result.connection.email,
        oauth_connection_id: result.connection.id,
        status: "connected",
        write_enabled: previous?.write_enabled ?? true,
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
      try {
        await commitWorkspaceOperations(
          current.revision,
          [{ collection: "master.storageAccounts", upsert: [account as unknown as Record<string, unknown>] }],
          current.rowVersions || {},
        );
        accountId = account.id;
        lastSaveError = undefined;
        break;
      } catch (error) {
        lastSaveError = error;
        if (!(error instanceof Error) || error.message !== "CONFLICT") throw error;
      }
    }
    if (lastSaveError || !accountId) {
      throw lastSaveError instanceof Error
        ? lastSaveError
        : new Error("Drive authorization succeeded, but the workspace account could not be saved.");
    }
    return NextResponse.redirect(back(origin, result.returnTo, "drive_connected", accountId));
  } catch (error) {
    const message = error instanceof Error
      ? error.message.replace(/^FORBIDDEN:/, "")
      : "Google Drive connection failed.";
    return NextResponse.redirect(back(origin, "/", "drive_error", message.slice(0, 160)));
  }
}
