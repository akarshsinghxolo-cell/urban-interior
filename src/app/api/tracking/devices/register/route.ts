import { NextRequest, NextResponse } from "next/server";
import { registerTrackingDevice } from "@/lib/rdash/server/tracking-device";
import { rateLimit } from "@/lib/rdash/server/ratelimit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limited = rateLimit(`tracking-register:${forwarded}`, 10, 15 * 60);
    if (!limited.ok) return NextResponse.json({ error: "Too many registration attempts." }, { status: 429 });
    const body = await request.json().catch(() => ({})) as {
      code?: string;
      deviceName?: string;
      platform?: string;
      installationId?: string;
    };
    if (!body.code || !body.deviceName || !["android", "ios"].includes(body.platform || "")) {
      return NextResponse.json({ error: "Enrollment code, device name and platform are required." }, { status: 422 });
    }
    const device = await registerTrackingDevice({
      code: body.code,
      deviceName: body.deviceName,
      platform: body.platform as "android" | "ios",
      installationId: body.installationId,
    });
    return NextResponse.json(device, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not register device.";
    return NextResponse.json({ error: message.replace(/^INVALID:/, "") }, { status: message === "UNAUTHORIZED" ? 401 : 422 });
  }
}
