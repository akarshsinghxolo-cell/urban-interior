import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { readGoogleDriveConnectionSummaries, readGoogleDriveOAuthConfig, saveGoogleDriveOAuthConfig } from "@/lib/rdash/server/drive-connections";
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

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const body = await request.json().catch(() => ({}));
    const config = await saveGoogleDriveOAuthConfig(user, {
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      credentialsKey: body.credentialsKey,
    });
    const connections = await readGoogleDriveConnectionSummaries(user);
    return NextResponse.json({ ...config, connections });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^FORBIDDEN:/, "") : "Google Drive OAuth config could not be saved.";
    return NextResponse.json({ error: message }, { status: message.includes("Only Owner") ? 403 : 422 });
  }
}
