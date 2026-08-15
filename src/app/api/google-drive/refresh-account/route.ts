import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { refreshDriveConnection } from "@/lib/rdash/server/drive-connections";
import { commitWorkspaceOperations, getWorkspaceSubset } from "@/lib/rdash/server/workspace";
import type { StorageAccount } from "@/lib/rdash/types";

export const runtime = "nodejs";

async function readAccount(accountId: string) {
  const workspace = await getWorkspaceSubset({
    rowsByCollection: { "master.storageAccounts": [accountId] },
  });
  const account = workspace.data.master.storageAccounts.find((item) => item.id === accountId);
  return { workspace, account };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    if (user.role !== "Owner") {
      return NextResponse.json({ error: "Only Owner can refresh Drive connection and quota." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { accountId?: string };
    const accountId = body.accountId?.trim();
    if (!accountId) return NextResponse.json({ error: "accountId is required." }, { status: 400 });

    const initial = await readAccount(accountId);
    if (!initial.account?.oauth_connection_id) {
      return NextResponse.json({ error: "This account has no server-side Google Drive connection." }, { status: 422 });
    }

    const refreshed = await refreshDriveConnection(initial.account.oauth_connection_id);

    // Refreshing Google quota can take long enough for unrelated ERP writes to
    // advance the workspace revision. Re-read only this account before commit;
    // never reload or rewrite the rest of the workspace.
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await readAccount(accountId);
      if (!current.account) return NextResponse.json({ error: "The Drive account no longer exists." }, { status: 404 });

      const updated: StorageAccount = {
        ...current.account,
        email: refreshed.email || current.account.email,
        root_folder_id: refreshed.rootFolderId || current.account.root_folder_id,
        root_folder_name: refreshed.rootFolderName || current.account.root_folder_name,
        web_view_link: refreshed.rootFolderUrl || current.account.web_view_link,
        quota_used_bytes: refreshed.quotaUsedBytes,
        quota_limit_bytes: refreshed.quotaLimitBytes,
        status: "connected",
        updated_at: new Date().toISOString(),
      };

      try {
        const saved = await commitWorkspaceOperations(
          current.workspace.revision,
          [{ collection: "master.storageAccounts", upsert: [updated as unknown as Record<string, unknown>] }],
          current.workspace.rowVersions || {},
        );
        return NextResponse.json(
          { revision: saved.revision, account: updated },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch (error) {
        lastError = error;
        if (!(error instanceof Error) || error.message !== "CONFLICT") throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not refresh the Drive account after concurrent updates.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive quota refresh failed.";
    return NextResponse.json(
      { error: message === "UNAUTHORIZED" ? "Authentication is required." : message },
      { status: message === "UNAUTHORIZED" ? 401 : message === "CONFLICT" ? 409 : 422 },
    );
  }
}
