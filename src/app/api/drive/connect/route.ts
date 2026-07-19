import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { beginGoogleDriveConnect } from "@/lib/rdash/server/drive-connections";
import { resolvePublicOrigin } from "@/lib/rdash/server/public-origin";

export const runtime = "nodejs";

function setupUrl(request: NextRequest, origin: string, error: string) {
  const target = new URL("/google-drive-settings", origin);
  const label = request.nextUrl.searchParams.get("label") || "Urban Drive";
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/";
  target.searchParams.set("label", label);
  target.searchParams.set("returnTo", returnTo);
  target.searchParams.set("drive_error", error.slice(0, 160));
  return target;
}

export async function GET(request: NextRequest) {
  const origin = resolvePublicOrigin(request);
  try {
    const user = await requireSession(request);
    const label = request.nextUrl.searchParams.get("label") || "";
    const authorizeUrl = await beginGoogleDriveConnect(user, {
      label,
      origin,
      returnTo: request.nextUrl.searchParams.get("returnTo"),
      existingConnectionId: request.nextUrl.searchParams.get("connectionId") || undefined,
    });
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^FORBIDDEN:/, "") : "Google Drive connection could not start.";
    if (message.includes("OAuth is not configured") || message.includes("Client ID") || message.includes("Client Secret")) {
      return NextResponse.redirect(setupUrl(request, origin, message), 307);
    }
    return NextResponse.json({ error: message }, { status: message.includes("Only Owner") ? 403 : 422 });
  }
}
