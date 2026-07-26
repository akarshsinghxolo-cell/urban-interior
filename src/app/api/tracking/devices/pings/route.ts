import { NextRequest, NextResponse } from "next/server";
import { authenticateTrackingDevice, markTrackingDeviceSeen } from "@/lib/rdash/server/tracking-device";
import { recordStaffLocationPingForStaff } from "@/lib/rdash/server/staff-location";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const device = await authenticateTrackingDevice(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({})) as {
      points?: Array<{ latitude: unknown; longitude: unknown; accuracy_m: unknown; captured_at?: unknown }>;
    };
    if (!Array.isArray(body.points) || body.points.length === 0 || body.points.length > 200) {
      return NextResponse.json({ error: "Send between 1 and 200 location points." }, { status: 422 });
    }
    const accepted: Array<Awaited<ReturnType<typeof recordStaffLocationPingForStaff>>> = [];
    for (const point of body.points) {
      accepted.push(await recordStaffLocationPingForStaff(device.staffId, {
        ...point,
        source: "native_background",
      }));
    }
    await markTrackingDeviceSeen(device.id, accepted.length);
    return NextResponse.json({
      accepted: accepted.length,
      lastPoint: accepted[accepted.length - 1],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Device locations could not be recorded.";
    const status = message === "UNAUTHORIZED" ? 401 : message.startsWith("FORBIDDEN:") ? 403 : message.startsWith("INVALID:") ? 422 : 500;
    return NextResponse.json({ error: message.replace(/^(FORBIDDEN:|INVALID:)/, "") }, { status });
  }
}
