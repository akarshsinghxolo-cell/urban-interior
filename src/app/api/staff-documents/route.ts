import { randomUUID } from "node:crypto";
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
  return tags.find((tag) => tag.startsWith("staff-")) || null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const form = await request.formData();
    const file = form.get("file");
    const staffId = String(form.get("staffId") || "").trim();

    if (!staffId) return NextResponse.json({ error: "Staff is required." }, { status: 400 });
    if (!canManageStaff(user, staffId)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only PDF, JPG, PNG and WebP staff documents are allowed." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Staff documents must be between 1 byte and 15 MB." }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const assetId = `staff-file-${randomUUID()}`;
    const storagePath = `${workspaceId()}/${staffId}/${assetId}-${safeFileName(file.name)}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw error;

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

    const asset = await assetForId(assetId);
    if (!asset) return NextResponse.json({ ok: true });
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
