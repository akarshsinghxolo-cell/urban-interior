import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { completeGoogleDriveConnect } from "@/lib/rdash/server/drive-connections";
import { getWorkspace, saveWorkspace } from "@/lib/rdash/server/workspace";
import { resolvePublicOrigin } from "@/lib/rdash/server/public-origin";
export const runtime = "nodejs";
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
        if (!state || !code)
            throw new Error("Google Drive did not return a valid authorization response.");
        const user = await requireSession(request);
        const result = await completeGoogleDriveConnect(user, { state, code, origin });
        const current = await getWorkspace();
        const timestamp = new Date().toISOString();
        const previous = current.data.master.storageAccounts.find((account) => account.oauth_connection_id === result.connection.id);
        const priority = previous?.priority_order || Math.max(0, ...current.data.master.storageAccounts.map((account) => account.priority_order || 0)) + 1;
        const account = {
            id: previous?.id || `storage-${result.connection.id}`,
            label: result.label,
            email: result.connection.email,
            oauth_connection_id: result.connection.id,
            status: "connected" as const,
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
        const next = {
            ...current.data,
            master: {
                ...current.data.master,
                storageAccounts: [...current.data.master.storageAccounts.filter((entry) => entry.id !== account.id), account],
            },
        };
        await saveWorkspace(current.revision, next);
        return NextResponse.redirect(back(origin, result.returnTo, "drive_connected", account.id));
    }
    catch (error) {
        const message = error instanceof Error ? error.message.replace(/^FORBIDDEN:/, "") : "Google Drive connection failed.";
        return NextResponse.redirect(back(origin, "/", "drive_error", message.slice(0, 160)));
    }
}
