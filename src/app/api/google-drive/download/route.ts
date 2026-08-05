import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import { canReadManagedFileAsset, getGoogleDriveAccessToken, managedFileByGoogleId } from "@/lib/rdash/server/google-drive";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const fileId = request.nextUrl.searchParams.get("fileId")?.trim();
    if (!fileId) return NextResponse.json({ error: "A Google Drive file ID is required." }, { status: 400 });

    const workspace = await getWorkspace();
    if (!canReadManagedFileAsset(user, workspace.data, fileId)) {
      return NextResponse.json({ error: "You are not allowed to download this file." }, { status: 403 });
    }

    const asset = managedFileByGoogleId(workspace.data, fileId);
    const account = asset?.storage_account_id
      ? workspace.data.master.storageAccounts.find((item) => item.id === asset.storage_account_id)
      : undefined;
    if (!account) {
      return NextResponse.json({ error: "This file has no connected original Drive account. Reconnect its original Drive account." }, { status: 422 });
    }

    const token = await getGoogleDriveAccessToken(account);
    const metadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webContentLink,webViewLink`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    const file = await metadataResponse.json().catch(() => ({})) as {
      webContentLink?: string;
      webViewLink?: string;
      error?: { message?: string };
    };
    if (!metadataResponse.ok) {
      return NextResponse.json(
        { error: file.error?.message || "Google Drive could not provide this file download." },
        { status: metadataResponse.status },
      );
    }

    // Vercel authorizes and resolves the current Drive link, then exits the byte
    // path. Google serves the download directly to the browser.
    const destination = file.webContentLink
      || file.webViewLink
      || `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
    const response = NextResponse.redirect(destination, 307);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "File download failed.";
    return NextResponse.json(
      { error: message === "UNAUTHORIZED" ? "Authentication is required before files can be downloaded." : message },
      { status: message === "UNAUTHORIZED" ? 401 : 422, headers: { "Cache-Control": "no-store" } },
    );
  }
}
