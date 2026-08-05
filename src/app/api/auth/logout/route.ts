import { NextResponse } from "next/server";
import { expiredRefreshTokenCookie, expiredSessionCookie } from "@/lib/rdash/server/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(expiredSessionCookie());
  response.cookies.set(expiredRefreshTokenCookie());
  return response;
}
