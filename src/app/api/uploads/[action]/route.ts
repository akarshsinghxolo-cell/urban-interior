import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
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
  InitiateUploadRequest,
} from "@/lib/uploads/upload-types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Context = { params: Promise<{ action: string }> };

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.replace(/^FORBIDDEN:/, "") : fallback;
  return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 422 });
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
      return NextResponse.json(await initiateDirectUpload(user, body as unknown as InitiateUploadRequest), { headers: { "Cache-Control": "no-store" } });
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
      await cancelDirectUpload(user, String(body.uploadItemId));
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
