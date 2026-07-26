import { NextRequest, NextResponse } from "next/server";
import { requireSession, sessionCookie, signSession } from "@/lib/rdash/server/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const current = await requireSession(request);
    const token = signSession({
      userId: current.userId,
      email: current.email,
      name: current.name,
      role: current.role,
      staffId: current.staffId,
    });
    const response = NextResponse.json({
      token,
      user: {
        name: current.name,
        email: current.email,
        role: current.role,
        staffId: current.staffId,
      },
    }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(sessionCookie(token));
    return response;
  } catch {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
}
