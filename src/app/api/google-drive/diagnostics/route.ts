import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { readGoogleDriveSecurityDiagnostics } from "@/lib/rdash/server/drive-security-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const diagnostics = await readGoogleDriveSecurityDiagnostics(user);
    return NextResponse.json(diagnostics, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message.replace(/^FORBIDDEN:/, "")
      : "Google Drive security diagnostics could not be loaded.";
    return NextResponse.json(
      { error: message },
      {
        status: message.includes("Only Owner") ? 403 : 422,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  }
}
