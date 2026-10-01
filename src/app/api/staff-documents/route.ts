import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "staff-documents";
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MANAGER_ROLES = new Set(["Owner", "Operations Manager", "Accounts / Admin"]);

function workspaceId() {
  return process.env.UC_WORKSPACE_ID || "default";
}

function safeFileName(name: string) {
  return name
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "document";
}

function canManageStaff(user: Awaited<ReturnType<typeof requireSession>>, staffId: string) {
  return MANAGER_ROLES.has(user.role) || user.staffId === staffId;
}

async function canonicalStaffExists(staffId: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("entity_master_staff")
    .select("id")
    .eq("workspace_id", workspaceId())
    .eq("id", staffId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function assetForId(assetId: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("entity_master_fileAssets")
    .select("id,data")
    .eq("workspace_id", workspaceId())
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; data: Record<string, unknown> } | null;
}

function staffIdFromAsset(asset: { data: Record<string, unknown> }) {
  const tags = Array.isArray(asset.data.tags) ? asset.data.tags.map(String) : [];
  if (!tags.includes("staff-document")) return null;
  const staffTag = tags.find((tag) => tag.startsWith("staff:"));
  return staffTag ? staffTag.slice("staff:".length) : null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const form = await request.formData();
    const file = form.get("file");
    const staffId = String(form.get("staffId") || "").trim();
    const uploadId = String(form.get("uploadId") || "").trim();

    if (!staffId) return NextResponse.json({ error: "Staff is required." }, { status: 400 });
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(uploadId)) {
      return NextResponse.json({ error: "A valid upload ID is required." }, { status: 400 });
    }
    if (!canManageStaff(user, staffId)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    if (!(await canonicalStaffExists(staffId))) {
      return NextResponse.json({ error: "Canonical Staff profile was not found." }, { status: 404 });
    }
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only PDF, JPG, PNG and WebP staff documents are allowed." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Staff documents must be between 1 byte and 15 MB." }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    // An upload retry uses the same client-generated UUID; it can never create
    // another storage object just because the first HTTP response was lost.
    const assetId = `staff-file-${uploadId}`;
    const storagePath = `${workspaceId()}/${staffId}/${assetId}-${safeFileName(file.name)}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      // A conflict is only a successful retry if the exact original file and
      // size exist at the expected, staff-scoped storage path.
      const alreadyUploaded = String(error.statusCode || "") === "409";
      if (!alreadyUploaded) throw error;
      const directory = `${workspaceId()}/${staffId}`;
      const expectedName = `${assetId}-${safeFileName(file.name)}`;
      const { data: objects, error: listError } = await admin.storage.from(BUCKET)
        .list(directory, { search: expectedName, limit: 10 });
      if (listError) throw listError;
      const existing = objects?.find((object) => object.name === expectedName);
      if (!existing || Number(existing.metadata?.size) !== file.size) {
        return NextResponse.json({ error: "An existing upload ID belongs to a different file." }, { status: 409 });
      }
    }

    return NextResponse.json({
      assetId,
      fileName: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
      storageBucket: BUCKET,
      storagePath,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Your session is missing or expired." }, { status: 401 });
    }
    console.error("[api/staff-documents] upload failed:", error);
    return NextResponse.json({ error: "Staff document upload failed." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const assetId = String(request.nextUrl.searchParams.get("assetId") || "").trim();
    if (!assetId) return NextResponse.json({ error: "assetId is required." }, { status: 400 });

    const asset = await assetForId(assetId);
    if (!asset) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    const staffId = staffIdFromAsset(asset);
    if (!staffId || !canManageStaff(user, staffId)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const bucket = String(asset.data.storage_bucket || "");
    const path = String(asset.data.storage_path || "");
    if (bucket !== BUCKET || !path) {
      return NextResponse.json({ error: "Document storage metadata is invalid." }, { status: 409 });
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) throw error || new Error("Signed URL was not created.");
    return NextResponse.redirect(data.signedUrl, 302);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Your session is missing or expired." }, { status: 401 });
    }
    console.error("[api/staff-documents] download failed:", error);
    return NextResponse.json({ error: "Staff document could not be opened." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const assetId = String(request.nextUrl.searchParams.get("assetId") || "").trim();
    if (!assetId) return NextResponse.json({ error: "assetId is required." }, { status: 400 });

    // An upload whose workspace record could not be linked can be discarded
    // through this same authenticated storage gateway, never a second path.
    if (request.nextUrl.searchParams.get("discardPending") === "true") {
      const staffId = String(request.nextUrl.searchParams.get("staffId") || "").trim();
      const fileName = String(request.nextUrl.searchParams.get("fileName") || "");
      if (!/^staff-file-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(assetId)
        || !staffId || !fileName || fileName.length > 255) {
        return NextResponse.json({ error: "Invalid pending upload." }, { status: 400 });
      }
      if (!canManageStaff(user, staffId) || !(await canonicalStaffExists(staffId))) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      if (await assetForId(assetId)) {
        return NextResponse.json({ error: "This upload is already linked. Refresh the workspace." }, { status: 409 });
      }
      const admin = getSupabaseAdminClient();
      const { data: existingDocument, error: readError } = await admin
        .from("entity_staffDocuments")
        .select("id")
        .eq("workspace_id", workspaceId())
        .contains("data", { file_asset_id: assetId })
        .limit(1);
      if (readError) throw readError;
      if (existingDocument?.length) {
        return NextResponse.json({ error: "This upload has a document record. Refresh the workspace." }, { status: 409 });
      }
      const path = `${workspaceId()}/${staffId}/${assetId}-${safeFileName(fileName)}`;
      const { error } = await admin.storage.from(BUCKET).remove([path]);
      if (error) throw error;
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const asset = await assetForId(assetId);
    if (!asset) return NextResponse.json({ error: "File record has not finished syncing. Refresh the workspace and retry." }, { status: 409 });
    const staffId = staffIdFromAsset(asset);
    if (!staffId || !MANAGER_ROLES.has(user.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const bucket = String(asset.data.storage_bucket || "");
    const path = String(asset.data.storage_path || "");
    if (bucket === BUCKET && path) {
      const admin = getSupabaseAdminClient();
      const { error } = await admin.storage.from(bucket).remove([path]);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Your session is missing or expired." }, { status: 401 });
    }
    console.error("[api/staff-documents] delete failed:", error);
    return NextResponse.json({ error: "Staff document could not be deleted." }, { status: 500 });
  }
}
