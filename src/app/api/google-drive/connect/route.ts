import { NextRequest, NextResponse } from "next/server";
import { resolvePublicOrigin } from "@/lib/rdash/server/public-origin";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const origin = resolvePublicOrigin(request);
  const target = new URL("/api/drive/connect", origin);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  return NextResponse.redirect(target, 307);
}
