import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || "Urban Castle Workspace/1.0 (reverse geocoding)";
function coordinate(value: string | null, min: number, max: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
export async function GET(request: NextRequest) {
    const latitude = coordinate(request.nextUrl.searchParams.get("lat"), -90, 90);
    const longitude = coordinate(request.nextUrl.searchParams.get("lon"), -180, 180);
    if (latitude == null || longitude == null) {
        return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
    }
    try {
        const url = new URL(`${NOMINATIM_BASE}/reverse`);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("lat", String(latitude));
        url.searchParams.set("lon", String(longitude));
        const response = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
            next: { revalidate: 60 },
        });
        if (!response.ok)
            throw new Error(`Nominatim reverse lookup failed (${response.status}).`);
        return NextResponse.json(await response.json());
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Reverse geocoding is unavailable." }, { status: 502 });
    }
}
