import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { accessTokenForDriveConnection } from "@/lib/rdash/server/drive-connections";
import { getWorkspace, saveWorkspace } from "@/lib/rdash/server/workspace";
import { selectWriteStorageAccount } from "@/lib/rdash/storage";
import type { FileAsset } from "@/lib/rdash/types";

export const runtime = "nodejs";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(5).toString("hex")}`;
}

function multipartBody(metadata: Record<string, unknown>, content: string) {
  const boundary = `rdash-${randomBytes(12).toString("hex")}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    content,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return { boundary, body };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    if (user.role !== "Owner") {
      return NextResponse.json({ error: "Only Owner can run a Google Drive test upload." }, { status: 403 });
    }

    const input = await request.json().catch(() => ({})) as { accountId?: string };

    const current = await getWorkspace();
    const accounts = current.data.master.storageAccounts || [];
    const selected = input.accountId
      ? accounts.find((account) => account.id === input.accountId)
      : selectWriteStorageAccount({ storageAccounts: accounts });

    if (!selected) {
      return NextResponse.json({ error: "No connected Drive is eligible for new uploads." }, { status: 422 });
    }

    if (selected.status !== "connected" || selected.write_enabled === false) {
      return NextResponse.json({ error: "Selected Drive is not active for new uploads." }, { status: 422 });
    }

    if (!selected.oauth_connection_id) {
      return NextResponse.json({ error: "Selected Drive has no OAuth connection. Connect or refresh it first." }, { status: 422 });
    }

    const accessToken = await accessTokenForDriveConnection(selected.oauth_connection_id);
    const timestamp = new Date().toISOString();
    const fileName = `Urban Castle Drive Test ${timestamp.replace(/[:.]/g, "-")}.txt`;
    const content = [
      "Urban Castle Google Drive test upload",
      `Uploaded at: ${timestamp}`,
      `Uploaded by: ${user.name} <${user.email}>`,
      `Storage account: ${selected.label}`,
      "Visibility: Public - anyone with the link can view",
    ].join("\n");

    const { boundary, body } = multipartBody({
      name: fileName,
      mimeType: "text/plain",
      parents: selected.root_folder_id ? [selected.root_folder_id] : undefined,
    }, content);

    const upload = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,thumbnailLink`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      cache: "no-store",
    });

    const payload = await upload.json().catch(() => ({})) as {
      id?: string;
      name?: string;
      mimeType?: string;
      size?: string;
      webViewLink?: string;
      thumbnailLink?: string;
      error?: { message?: string };
    };

    if (!upload.ok || !payload.id || !payload.webViewLink) {
      return NextResponse.json({ error: payload.error?.message || "Google Drive test upload failed." }, { status: 422 });
    }

    const permission = await fetch(`${DRIVE_API}/files/${encodeURIComponent(payload.id)}/permissions?supportsAllDrives=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }),
      cache: "no-store",
    });
    if (!permission.ok) {
      const permissionPayload = await permission.json().catch(() => ({})) as { error?: { message?: string } };
      await fetch(`${DRIVE_API}/files/${encodeURIComponent(payload.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }).catch(() => undefined);
      return NextResponse.json({ error: permissionPayload.error?.message || "Google Drive could not make the test file public." }, { status: 422 });
    }

    const asset: FileAsset = {
      id: makeId("drive-test"),
      storage_account_id: selected.id,
      google_file_id: payload.id,
      file_name: payload.name || fileName,
      mime_type: payload.mimeType || "text/plain",
      kind: "document",
      web_view_link: payload.webViewLink,
      thumbnail_url: payload.thumbnailLink,
      file_size_bytes: Number(payload.size || Buffer.byteLength(content)),
      storage_provider: "google_drive",
      // FIX: Test uploads go to the Drive ROOT folder (not a managed subfolder),
      // so they cannot have a storage_folder_instance_id. Marking them as
      // "external_reference" (instead of "managed") bypasses the business-rule
      // validation that requires managed files to have a folder instance.
      // Without this fix, every test upload creates an orphan FileAsset that
      // blocks ALL future workspace commits with the error:
      //   "managed uploads require their original physical folder"
      storage_mode: "external_reference",
      sync_status: "uploaded",
      tags: ["drive-test", "public"],
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    };

    const next = {
      ...current.data,
      master: {
        ...current.data.master,
        fileAssets: [...(current.data.master.fileAssets || []), asset],
        storageAccounts: accounts.map((account) => account.id === selected.id ? {
          ...account,
          quota_used_bytes: Number(account.quota_used_bytes || 0) + Number(asset.file_size_bytes || 0),
          updated_at: timestamp,
        } : account),
      },
    };

    const saved = await saveWorkspace(current.revision, next);
    return NextResponse.json({ revision: saved.revision, file: asset, data: saved.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive test upload failed.";
    return NextResponse.json({ error: message === "UNAUTHORIZED" ? "Authentication is required." : message }, { status: message === "UNAUTHORIZED" ? 401 : 422 });
  }
}
