import { NextRequest, NextResponse } from "next/server";
import {
  AuthAccessError,
  authenticateCredentialsWithSession,
  refreshTokenCookie,
  sessionCookie,
  signSession,
} from "@/lib/rdash/server/auth";
import { rateLimit } from "@/lib/rdash/server/ratelimit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    const email = (body.email || "").trim().toLowerCase();

    // Rate limit: 5 login attempts per email per 15 minutes.
    if (email) {
      const rl = rateLimit(`login:${email}`, 5, 15 * 60);
      if (!rl.ok) {
        return NextResponse.json(
          { error: "Too many sign-in attempts. Please try again later." },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
        );
      }
    }

    const renewable = await authenticateCredentialsWithSession(email, body.password || "");
    if (!renewable) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

    const token = signSession(renewable.user);
    const response = NextResponse.json({
      user: {
        name: renewable.user.name,
        email: renewable.user.email,
        role: renewable.user.role,
        staffId: renewable.user.staffId,
      },
      token,
    }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(sessionCookie(token));
    // The static super-owner login has no Supabase session, hence no rotating
    // refresh token — skip the cookie so /api/auth/refresh uses its compat bridge.
    if (renewable.refreshToken) {
      response.cookies.set(refreshTokenCookie(renewable.refreshToken));
    }
    return response;
  } catch (error) {
    if (error instanceof AuthAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sign-in failed." }, { status: 500 });
  }
}
