import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { readGoogleDriveConnectionSummaries, readGoogleDriveOAuthConfig } from "@/lib/rdash/server/drive-connections";
import { resolvePublicOrigin } from "@/lib/rdash/server/public-origin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
    if (user.role !== "Owner") return NextResponse.json({ error: "Only Owner can configure Google Drive." }, { status: 403 });
    const origin = resolvePublicOrigin(request);
    const [config, connections] = await Promise.all([
      readGoogleDriveOAuthConfig(origin),
      readGoogleDriveConnectionSummaries(user),
    ]);
    return NextResponse.json({ ...config, connections });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^FORBIDDEN:/, "") : "Google Drive OAuth config could not be loaded.";
    return NextResponse.json({ error: message }, { status: message.includes("Only Owner") ? 403 : 422 });
  }
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Google Drive OAuth credentials are server secrets. Set GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET, and DRIVE_TOKEN_ENCRYPTION_KEY in Vercel environment variables instead of submitting them from the browser.",
    },
    { status: 405, headers: { Allow: "GET" } },
  );
}
