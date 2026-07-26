import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { issueTrackingEnrollment } from "@/lib/rdash/server/tracking-device";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const body = await request.json().catch(() => ({})) as { staffId?: string; deviceName?: string };
    if (!body.staffId) return NextResponse.json({ error: "Staff is required." }, { status: 422 });
    const enrollment = await issueTrackingEnrollment(user, body.staffId, body.deviceName || "");
    return NextResponse.json(enrollment, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create device enrollment.";
    const status = message === "UNAUTHORIZED" ? 401 : message.startsWith("FORBIDDEN:") ? 403 : 422;
    return NextResponse.json({ error: message.replace(/^(FORBIDDEN:|INVALID:)/, "") }, { status });
  }
}
