import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { resolvePublicOrigin } from "@/lib/rdash/server/public-origin";
import {
  bindDirectUpload,
  cancelDirectUpload,
  finalizeDirectUpload,
  initiateDirectUpload,
  listPendingDirectUploads,
  reportDirectUploadProgress,
  retryDirectUpload,
} from "@/lib/rdash/server/direct-upload";
import type {
  BindUploadRequest,
  FinalizeUploadRequest,
  GoogleFileId,
  InitiateUploadRequest,
} from "@/lib/uploads/upload-types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Context = { params: Promise<{ action: string }> };

function errorResponse(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : fallback;
  const message = raw.replace(/^FORBIDDEN:/, "").replace(/^TARGET_NOT_READY:/, "");
  const status = raw === "UNAUTHORIZED" ? 401 : raw.startsWith("TARGET_NOT_READY:") ? 409 : 422;
  return NextResponse.json({ error: message, code: raw.startsWith("TARGET_NOT_READY:") ? "TARGET_NOT_READY" : undefined }, { status });
}

function resolveBrowserUploadOrigin(request: NextRequest): string {
  const candidate = request.headers.get("origin") || resolvePublicOrigin(request);
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("The browser origin is invalid for direct Google Drive uploads.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Direct Google Drive uploads require an HTTP or HTTPS browser origin.");
  }
  return parsed.origin;
}

export async function GET(request: NextRequest, context: Context) {
  try {
    await requireSession(request);
    const { action } = await context.params;
    if (action !== "pending") return NextResponse.json({ error: "Unknown upload action." }, { status: 404 });
    return NextResponse.json({ items: await listPendingDirectUploads() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Could not load pending uploads.");
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireSession(request);
    const { action } = await context.params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    if (action === "initiate") {
      return NextResponse.json(
        await initiateDirectUpload(user, body as unknown as InitiateUploadRequest, resolveBrowserUploadOrigin(request)),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (action === "finalize") {
      return NextResponse.json(await finalizeDirectUpload(user, body as unknown as FinalizeUploadRequest), { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "bind") {
      await bindDirectUpload(user, body as unknown as BindUploadRequest);
      return NextResponse.json({ ok: true });
    }
    if (action === "cancel") {
      if (!body.uploadItemId) return NextResponse.json({ error: "uploadItemId is required." }, { status: 422 });
      await cancelDirectUpload(user, String(body.uploadItemId), body.googleFileId ? String(body.googleFileId) as GoogleFileId : undefined);
      return NextResponse.json({ ok: true });
    }
    if (action === "retry") {
      if (!body.uploadItemId) return NextResponse.json({ error: "uploadItemId is required." }, { status: 422 });
      await retryDirectUpload(String(body.uploadItemId));
      return NextResponse.json({ ok: true });
    }
    if (action === "progress") {
      if (!body.uploadItemId) return NextResponse.json({ error: "uploadItemId is required." }, { status: 422 });
      await reportDirectUploadProgress({
        uploadItemId: String(body.uploadItemId),
        confirmedBytes: Number(body.confirmedBytes || 0),
        progress: Number(body.progress || 0),
        status: String(body.status || "uploading"),
        googleFileId: body.googleFileId ? String(body.googleFileId) as GoogleFileId : undefined,
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "reconcile") {
      return NextResponse.json({ items: await listPendingDirectUploads(), reconciledAt: new Date().toISOString() });
    }
    return NextResponse.json({ error: "Unknown upload action." }, { status: 404 });
  } catch (error) {
    return errorResponse(error, "Upload action failed.");
  }
}
