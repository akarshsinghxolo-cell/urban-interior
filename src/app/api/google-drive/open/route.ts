import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { getWorkspace } from "@/lib/rdash/server/workspace";
import { canReadManagedFileAsset } from "@/lib/rdash/server/google-drive";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const fileId = request.nextUrl.searchParams.get("fileId")?.trim();
    if (!fileId) return NextResponse.json({ error: "A Google Drive file ID is required." }, { status: 400 });

    const workspace = await getWorkspace();
    if (!canReadManagedFileAsset(user, workspace.data, fileId)) {
      return NextResponse.json({ error: "You are not allowed to open this file." }, { status: 403 });
    }

    const mode = request.nextUrl.searchParams.get("mode") === "preview" ? "preview" : "view";
    const destination = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/${mode}`;
    const response = NextResponse.redirect(destination, 307);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "File access failed.";
    return NextResponse.json(
      { error: message === "UNAUTHORIZED" ? "Authentication is required before files can be opened." : message },
      { status: message === "UNAUTHORIZED" ? 401 : 422, headers: { "Cache-Control": "no-store" } },
    );
  }
}
