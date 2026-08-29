import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { accessTokenForDriveConnection } from "@/lib/rdash/server/drive-connections";
import { getWorkspace } from "@/lib/rdash/server/workspace";

export const runtime = "nodejs";

/**
 * Authenticated Google Drive content proxy.
 *
 * Public-link Drive thumbnails/embeds fail for files that are not shared
 * "anyone with the link". This route streams thumbnail/media bytes through
 * the server using the storage account's OAuth token, so previews work for
 * every managed file without exposing tokens to the browser.
 *
 * GET /api/google-drive/stream?fileId=<drive-id>&account=<storage-account-id>&mode=thumb|media&w=<px>&download=0|1
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";

function jsonResponse(error: string, status: number, retryAfterSec?: string) {
  const response = NextResponse.json({ error }, { status });
  response.headers.set("Cache-Control", "no-store");
  if (retryAfterSec) response.headers.set("Retry-After", retryAfterSec);
  return response;
}

function safeFileName(input: string | null, fallback = "drive-file") {
  const cleaned = String(input || "").replace(/[\r\n"\\/]/g, " ").trim();
  return (cleaned || fallback).slice(0, 180);
}

async function resolveAccessToken(storageAccountId: string | null) {
  const workspace = await getWorkspace();
  const accounts = workspace.data.master.storageAccounts || [];
  const candidates = storageAccountId
    ? accounts.filter((account) => account.id === storageAccountId)
    : accounts.filter((account) => account.status === "connected" && account.oauth_connection_id);
  for (const account of candidates) {
    if (!account.oauth_connection_id) continue;
    try {
      return { token: await accessTokenForDriveConnection(account.oauth_connection_id), accountLabel: account.label };
    } catch {
      // Try the next connected account (multi-account failover).
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request);
  } catch {
    return jsonResponse("Your session is missing or expired.", 401);
  }

  const fileId = request.nextUrl.searchParams.get("fileId")?.trim();
  if (!fileId || !/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
    return jsonResponse("A valid Google Drive file ID is required.", 400);
  }

  const mode = request.nextUrl.searchParams.get("mode") === "thumb" ? "thumb" : "media";
  const width = Math.max(120, Math.min(1600, Number(request.nextUrl.searchParams.get("w")) || 640));
  const asDownload = request.nextUrl.searchParams.get("download") === "1";
  const fileName = safeFileName(request.nextUrl.searchParams.get("name"));

  const resolved = await resolveAccessToken(request.nextUrl.searchParams.get("account"));
  if (!resolved) {
    return jsonResponse("No connected Google Drive account can serve this file. Reconnect Drive in Settings.", 502, "30");
  }
  const { token } = resolved;

  try {
    if (mode === "thumb") {
      // 1) Drive-rendered thumbnail at the requested width.
      const thumbResponse = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/thumbnail?sz=w${width}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (thumbResponse.ok && thumbResponse.body) {
        return new NextResponse(thumbResponse.body, {
          status: 200,
          headers: {
            "Content-Type": thumbResponse.headers.get("Content-Type") || "image/jpeg",
            "Cache-Control": "private, max-age=300",
          },
        });
      }
      // 2) Fall back to the original media for images without a rendered thumbnail.
      const metaResponse = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=mimeType`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const meta = await metaResponse.json().catch(() => ({})) as { mimeType?: string };
      if (!String(meta.mimeType || "").toLowerCase().startsWith("image/")) {
        return jsonResponse("No preview is available for this file type.", 404);
      }
    }

    const mediaResponse = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!mediaResponse.ok || !mediaResponse.body) {
      return jsonResponse("The file could not be read from Google Drive. It may have been deleted or the connection was revoked.", 502);
    }
    const headers: Record<string, string> = {
      "Content-Type": mediaResponse.headers.get("Content-Type") || "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    };
    const length = mediaResponse.headers.get("Content-Length");
    if (length) headers["Content-Length"] = length;
    if (asDownload) headers["Content-Disposition"] = `attachment; filename="${fileName}"`;
    return new NextResponse(mediaResponse.body, { status: 200, headers });
  } catch (error) {
    console.error("[api/google-drive/stream] proxy failed:", error);
    return jsonResponse("The Google Drive proxy could not serve this file.", 502, "30");
  }
}
