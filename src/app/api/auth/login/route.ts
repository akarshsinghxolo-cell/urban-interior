import { NextRequest, NextResponse } from "next/server";
import { AuthAccessError, authenticateCredentials, sessionCookie, signSession } from "@/lib/rdash/server/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    const user = await authenticateCredentials(body.email || "", body.password || "");
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
