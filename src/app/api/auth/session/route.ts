import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { try {
    const user = await requireSession(request);
    return NextResponse.json({ user: { name: user.name, email: user.email, role: user.role, staffId: user.staffId, expiresAt: user.expiresAt } }, { headers: { "Cache-Control": "no-store" } });
}
catch {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
} }
