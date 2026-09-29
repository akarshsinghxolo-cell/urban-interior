import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, type AuthenticatedUser } from "@/lib/rdash/server/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "staff-documents";
const WORKSPACE_ID = process.env.UC_WORKSPACE_ID || "default";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type Context = { params: Promise<{ action: string }> };

function canManageStaffDocuments(user: AuthenticatedUser) {
  return ["Owner", "Operations Manager", "Accounts / Admin"].includes(user.role);
}

async function assertStaffExists(staffId: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("entity_master_staff")
    .select("id")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("id", staffId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Staff profile does not exist.");
}

function safeName(value: string) {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(-120) || "document";
}

function assertOwnedPath(staffId: string, path: string) {
  const prefix = `${WORKSPACE_ID}/${staffId}/`;
  if (!path.startsWith(prefix) || path.includes("..")) {
    throw new Error("Staff document path is invalid.");
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Staff document operation failed.";
  const status = message === "UNAUTHORIZED" ? 401 : message.startsWith("FORBIDDEN:") ? 403 : 422;
  return NextResponse.json({ error: message.replace(/^FORBIDDEN:/, "") }, { status });
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await requireSession(request);
    const { action } = await context.params;
    if (action !== "download") return NextResponse.json({ error: "Unknown action." }, { status: 404 });

    const staffId = String(request.nextUrl.searchParams.get("staffId") || "").trim();
    const path = String(request.nextUrl.searchParams.get("path") || "").trim();
    if (!staffId || !path) throw new Error("Staff document reference is incomplete.");
    if (!canManageStaffDocuments(user) && user.staffId !== staffId) {
      throw new Error("FORBIDDEN:You cannot open this staff document.");
    }
    assertOwnedPath(staffId, path);
    await assertStaffExists(staffId);

    const { data, error } = await getSupabaseAdminClient().storage.from(BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) throw new Error(error?.message || "Could not open staff document.");
    return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireSession(request);
    if (!canManageStaffDocuments(user)) {
      throw new Error("FORBIDDEN:Only HR/payroll managers can change staff documents.");
    }

    const { action } = await context.params;
    if (action === "upload") {
      const form = await request.formData();
      const staffId = String(form.get("staffId") || "").trim();
      const file = form.get("file");
      if (!staffId) throw new Error("Staff is required.");
      if (!(file instanceof File)) throw new Error("Choose a document to upload.");
      if (!ALLOWED_MIME_TYPES.has(file.type)) throw new Error("Only PDF, JPEG, PNG and WebP staff documents are supported.");
      if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error("Staff documents must be between 1 byte and 15 MB.");
      await assertStaffExists(staffId);

      const now = new Date();
      const year = String(now.getUTCFullYear());
      const month = String(now.getUTCMonth() + 1).padStart(2, "0");
      const path = `${WORKSPACE_ID}/${staffId}/${year}/${month}/${randomUUID()}-${safeName(file.name)}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error } = await getSupabaseAdminClient().storage.from(BUCKET).upload(path, bytes, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw new Error(error.message);

      const query = new URLSearchParams({ staffId, path });
      return NextResponse.json({
        bucket: BUCKET,
        path,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        webViewLink: `/api/staff-documents/download?${query.toString()}`,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "delete") {
      const body = await request.json().catch(() => ({})) as { staffId?: string; path?: string };
      const staffId = String(body.staffId || "").trim();
      const path = String(body.path || "").trim();
      if (!staffId || !path) throw new Error("Staff document reference is incomplete.");
      assertOwnedPath(staffId, path);
      await assertStaffExists(staffId);
      const { error } = await getSupabaseAdminClient().storage.from(BUCKET).remove([path]);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
