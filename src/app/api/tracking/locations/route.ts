import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { listStaffLocationPings } from "@/lib/rdash/server/staff-location";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
    try {
        const user = await requireSession(request);
        const points = await listStaffLocationPings(user);
        return NextResponse.json({ points }, { headers: { "Cache-Control": "no-store" } });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Staff location feed cannot be loaded.";
        const status = message === "UNAUTHORIZED" ? 401 : message.startsWith("FORBIDDEN:") ? 403 : 500;
        return NextResponse.json({ error: message.replace(/^FORBIDDEN:/, "") }, { status, headers: { "Cache-Control": "no-store" } });
    }
}
