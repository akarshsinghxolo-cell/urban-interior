import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import { recordStaffLocationPing } from "@/lib/rdash/server/staff-location";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { StaffLocationSource } from "@/lib/rdash/staff-location";
export const runtime = "nodejs";
function parseSource(value: unknown): StaffLocationSource | undefined {
    return value === "native_background" || value === "browser_foreground" ? value : undefined;
}
export async function POST(request: NextRequest) {
    try {
        const user = await requireSession(request);
        const body = (await request.json().catch(() => ({}))) as {
            latitude?: unknown;
            longitude?: unknown;
            accuracy_m?: unknown;
            captured_at?: unknown;
            source?: unknown;
        };
        // Graceful demo-mode fallback: when Supabase is not configured (in-memory
        // seed-data mode), GPS pings cannot be persisted. Instead of returning 500
        // (which spams the browser console on every background poll), acknowledge
        // the ping so the client stops retrying, and flag it as ignored.
        if (!isSupabaseConfigured()) {
            return NextResponse.json(
                { point: null, demo: true, ignored: true, reason: "GPS persistence unavailable in demo mode" },
                { headers: { "Cache-Control": "no-store" } },
            );
        }
        const point = await recordStaffLocationPing(user, {
            latitude: body.latitude,
            longitude: body.longitude,
            accuracy_m: body.accuracy_m,
            captured_at: body.captured_at,
            source: parseSource(body.source),
        });
        return NextResponse.json({ point }, { headers: { "Cache-Control": "no-store" } });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Staff location could not be recorded.";
        const status = message === "UNAUTHORIZED" ? 401 : message.startsWith("FORBIDDEN:") ? 403 : message.startsWith("INVALID:") ? 422 : 500;
        return NextResponse.json({ error: message.replace(/^(FORBIDDEN:|INVALID:)/, "") }, { status, headers: { "Cache-Control": "no-store" } });
    }
}
