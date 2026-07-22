import { NextRequest, NextResponse } from "next/server";
import { AuthAccessError, authenticateCredentials, sessionCookie, signSession } from "@/lib/rdash/server/auth";
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

    const user = await authenticateCredentials(email, body.password || "");
    if (!user) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    const token = signSession(user);
    const response = NextResponse.json({ user: { name: user.name, email: user.email, role: user.role, staffId: user.staffId }, token });
    response.cookies.set(sessionCookie(token));
    return response;
  } catch (error) {
    if (error instanceof AuthAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sign-in failed." }, { status: 500 });
  }
}
