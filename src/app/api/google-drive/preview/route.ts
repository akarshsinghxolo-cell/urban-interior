import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import { canReadManagedFileAsset, getGoogleDriveAccessToken, managedFileByGoogleId } from "@/lib/rdash/server/google-drive";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
    try {
        const user = await requireSession(request);
        const fileId = request.nextUrl.searchParams.get("fileId")?.trim();
        if (!fileId)
            return NextResponse.json({ error: "A Google Drive file ID is required." }, { status: 400 });

        const workspace = await getWorkspace();
        if (!canReadManagedFileAsset(user, workspace.data, fileId))
            return NextResponse.json({ error: "You are not allowed to preview this file." }, { status: 403 });

        const asset = managedFileByGoogleId(workspace.data, fileId);
        const account = asset?.storage_account_id
            ? workspace.data.master.storageAccounts.find((item) => item.id === asset.storage_account_id)
            : undefined;
        if (!account)
            return NextResponse.json({ error: "This file has no connected original Drive account. Reconnect its original Drive account." }, { status: 422 });

        const token = await getGoogleDriveAccessToken(account);
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,mimeType,size,webContentLink,webViewLink`,
            { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
        );
        const file = await response.json().catch(() => ({})) as {
            webContentLink?: string;
            webViewLink?: string;
            error?: { message?: string };
        };
        if (!response.ok)
            return NextResponse.json({ error: file.error?.message || "Google Drive could not provide this file preview." }, { status: response.status });

        // Authorization stays on Vercel, but the actual media bytes are delivered
        // by Google Drive. This avoids turning the Vercel Function into a media proxy.
        const destination = file.webContentLink
            || file.webViewLink
            || `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
        const redirect = NextResponse.redirect(destination, 307);
        redirect.headers.set("Cache-Control", "private, no-store");
        return redirect;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "File preview failed.";
        return NextResponse.json(
            { error: message === "UNAUTHORIZED" ? "Authentication is required before files can be previewed." : message },
            { status: message === "UNAUTHORIZED" ? 401 : 422 },
        );
    }
}
