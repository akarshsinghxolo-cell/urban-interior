import { NextRequest, NextResponse } from "next/server";
import { requireSession, extractSessionToken } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import { canReadManagedFileAsset, getGoogleDriveAccessToken, managedFileByGoogleId } from "@/lib/rdash/server/google-drive";
export const runtime = "nodejs";
function size(value: string | null) {
    const parsed = Number(value || "360");
    return Number.isFinite(parsed) ? Math.max(120, Math.min(720, Math.round(parsed))) : 360;
}
function placeholder(name: string, type: string) {
    const label = type === "application/pdf" ? "PDF" : type.startsWith("video/") ? "VIDEO" : "FILE";
    const safeName = name.slice(0, 60).replace(/[<&>]/g, "");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect width="360" height="240" fill="#eef2f7"/><rect x="134" y="42" width="92" height="116" rx="9" fill="#ffffff" stroke="#cbd5e1"/><text x="180" y="104" text-anchor="middle" font-family="Arial, sans-serif" font-size="21" font-weight="700" fill="#334155">${label}</text><text x="180" y="188" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#475569">${safeName || "Managed file"}</text></svg>`;
}
export async function GET(request: NextRequest) {
    try {
        const user = await requireSession(request);
        const fileId = request.nextUrl.searchParams.get("fileId")?.trim();
        if (!fileId)
            return NextResponse.json({ error: "A Google Drive file ID is required." }, { status: 400 });
        // Local-storage fallback: redirect to the local-file serving route.
        // Append the session token as a query param so <img src> tags can authenticate (they can't send headers).
        if (fileId.startsWith("local-")) {
            const token = extractSessionToken(request);
            const redirectUrl = new URL(`/api/local-file/${fileId}`, request.url);
            if (token) redirectUrl.searchParams.set("token", token);
            return NextResponse.redirect(redirectUrl);
        }
        const workspace = await getWorkspace();
        if (!canReadManagedFileAsset(user, workspace.data, fileId))
            return NextResponse.json({ error: "You are not allowed to preview this file." }, { status: 403 });
        const asset = managedFileByGoogleId(workspace.data, fileId);
        const account = asset?.storage_account_id ? workspace.data.master.storageAccounts.find((item) => item.id === asset.storage_account_id) : undefined;
        if (!account)
            return NextResponse.json({ error: "This file has no connected original Drive account. Reconnect its original Drive account." }, { status: 422 });
        const token = await getGoogleDriveAccessToken(account);
        const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType,thumbnailLink`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const metadata = await metadataResponse.json().catch(() => ({})) as {
            name?: string;
            mimeType?: string;
            thumbnailLink?: string;
        };
        if (!metadataResponse.ok)
            return NextResponse.json({ error: "Google Drive could not provide this file thumbnail." }, { status: metadataResponse.status });
        const width = size(request.nextUrl.searchParams.get("w"));
        if (metadata.thumbnailLink) {
            const thumbnail = new URL(metadata.thumbnailLink);
            thumbnail.searchParams.set("sz", `w${width}`);
            const response = await fetch(thumbnail, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
            if (response.ok && response.body) {
                const headers = new Headers();
                headers.set("Content-Type", response.headers.get("content-type") || "image/jpeg");
                headers.set("Cache-Control", "private, max-age=300");
                return new NextResponse(response.body, { headers });
            }
        }
        return new NextResponse(placeholder(metadata.name || "Managed file", metadata.mimeType || ""), { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, max-age=300" } });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "File thumbnail failed.";
        return NextResponse.json({ error: message === "UNAUTHORIZED" ? "Authentication is required before files can be previewed." : message }, { status: message === "UNAUTHORIZED" ? 401 : 422 });
    }
}
