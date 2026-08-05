import { NextRequest, NextResponse } from "next/server";
import {
  expiredRefreshTokenCookie,
  expiredSessionCookie,
  extractRefreshToken,
  refreshAuthenticatedSession,
  refreshTokenCookie,
  requireSession,
  sessionCookie,
  signSession,
} from "@/lib/rdash/server/auth";

export const runtime = "nodejs";

function successResponse(user: {
  userId: string;
  email: string;
  name: string;
  role: "Owner" | "Operations Manager" | "Field Staff" | "Sales / Telecaller" | "Procurement Staff" | "Finance" | "Accounts / Admin";
  staffId?: string;
}, refreshToken?: string) {
  const token = signSession(user);
  const response = NextResponse.json({
    token,
    user: {
      name: user.name,
      email: user.email,
      role: user.role,
      staffId: user.staffId,
    },
  }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(sessionCookie(token));
  if (refreshToken) response.cookies.set(refreshTokenCookie(refreshToken));
  return response;
}

export async function POST(request: NextRequest) {
  const refreshToken = extractRefreshToken(request);
  if (refreshToken) {
    try {
      const renewed = await refreshAuthenticatedSession(refreshToken);
      return successResponse(renewed.user, renewed.refreshToken);
    } catch {
      const response = NextResponse.json(
        { error: "The renewable browser session expired or was revoked. Sign in again." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
      response.cookies.set(expiredSessionCookie());
      response.cookies.set(expiredRefreshTokenCookie());
      return response;
    }
  }

  // Compatibility bridge for users who signed in before renewable sessions were
  // deployed. Their current 8-hour token can still be renewed until they next
  // sign in, at which point the rotating Supabase refresh cookie is installed.
  try {
    const current = await requireSession(request);
    return successResponse({
      userId: current.userId,
      email: current.email,
      name: current.name,
      role: current.role,
      staffId: current.staffId,
    });
  } catch {
    const response = NextResponse.json(
      { error: "Authentication is required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(expiredSessionCookie());
    return response;
  }
}
