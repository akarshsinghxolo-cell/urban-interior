import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { refreshDriveConnection } from "@/lib/rdash/server/drive-connections";
import { getWorkspace, saveWorkspace } from "@/lib/rdash/server/workspace";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
    try {
        const user = await requireSession(request);
        if (user.role !== "Owner")
            return NextResponse.json({ error: "Only Owner can refresh Drive connection and quota." }, { status: 403 });
        const body = await request.json().catch(() => ({})) as {
            accountId?: string;
        };
        const accountId = body.accountId?.trim();
        if (!accountId)
            return NextResponse.json({ error: "accountId is required." }, { status: 400 });
        const current = await getWorkspace();
        const account = current.data.master.storageAccounts.find((item) => item.id === accountId);
        if (!account?.oauth_connection_id)
            return NextResponse.json({ error: "This account has no server-side Google Drive connection." }, { status: 422 });
        const refreshed = await refreshDriveConnection(account.oauth_connection_id);
        const next = {
            ...current.data,
            master: {
                ...current.data.master,
                storageAccounts: current.data.master.storageAccounts.map((item) => item.id === accountId ? {
                    ...item,
                    email: refreshed.email || item.email,
                    root_folder_id: refreshed.rootFolderId || item.root_folder_id,
                    root_folder_name: refreshed.rootFolderName || item.root_folder_name,
                    web_view_link: refreshed.rootFolderUrl || item.web_view_link,
                    quota_used_bytes: refreshed.quotaUsedBytes,
                    quota_limit_bytes: refreshed.quotaLimitBytes,
                    status: "connected" as const,
                    updated_at: new Date().toISOString(),
                } : item),
            },
        };
        const saved = await saveWorkspace(current.revision, next);
        return NextResponse.json({ revision: saved.revision, data: saved.data }, { headers: { "Cache-Control": "no-store" } });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Google Drive quota refresh failed.";
        return NextResponse.json({ error: message === "UNAUTHORIZED" ? "Authentication is required." : message }, { status: message === "UNAUTHORIZED" ? 401 : 422 });
    }
}
