import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import {
  listStaffRoutePoints,
  recordStaffRouteBundle,
} from "@/lib/rdash/server/staff-location";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const url = new URL(request.url);
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { bundles: [], points: [], demo: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const result = await listStaffRoutePoints(user, {
      staffId: url.searchParams.get("staffId"),
      date: url.searchParams.get("date"),
      start: url.searchParams.get("start"),
      end: url.searchParams.get("end"),
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Staff routes cannot be loaded.";
    const status =
      message === "UNAUTHORIZED"
        ? 401
        : message.startsWith("FORBIDDEN:")
          ? 403
          : message.startsWith("INVALID:")
            ? 422
            : 500;
    return NextResponse.json(
      {
        error: message.replace(
          /^(FORBIDDEN:|INVALID:)/,
          "",
        ),
      },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const body = await request.json().catch(() => ({}));
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { bundles: [], points: [], demo: true, ignored: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const bundle = await recordStaffRouteBundle(user, body);
    return NextResponse.json(
      { bundle, points: bundle.points },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Staff route bundle could not be recorded.";
    const status =
      message === "UNAUTHORIZED"
        ? 401
        : message.startsWith("FORBIDDEN:")
          ? 403
          : message.startsWith("INVALID:")
            ? 422
            : 500;
    return NextResponse.json(
      {
        error: message.replace(
          /^(FORBIDDEN:|INVALID:)/,
          "",
        ),
      },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
