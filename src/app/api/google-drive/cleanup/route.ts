import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { cleanupUnreferencedManagedFile } from "@/lib/rdash/server/file-cleanup";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const body = await request.json().catch(() => ({})) as { fileAssetId?: string };
    const fileAssetId = String(body.fileAssetId || "").trim();
    if (!fileAssetId) {
      return NextResponse.json({ error: "fileAssetId is required." }, { status: 400 });
    }
    return NextResponse.json(await cleanupUnreferencedManagedFile(user, fileAssetId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "File cleanup failed.";
    return NextResponse.json(
      { error: message === "UNAUTHORIZED" ? "Authentication is required before files can be cleaned up." : message },
      { status: message === "UNAUTHORIZED" ? 401 : 422, headers: { "Cache-Control": "no-store" } },
    );
  }
}
