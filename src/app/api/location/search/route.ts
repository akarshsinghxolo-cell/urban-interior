import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || "Urban Castle Workspace/1.0 (location lookup)";
export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams.get("q")?.trim() || "";
    if (query.length < 3 || query.length > 180) {
        return NextResponse.json({ error: "Search query must be between 3 and 180 characters." }, { status: 400 });
    }
    try {
        const url = new URL(`${NOMINATIM_BASE}/search`);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "5");
        url.searchParams.set("q", query);
        const response = await fetch(url, {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
            next: { revalidate: 60 },
        });
        if (!response.ok)
            throw new Error(`Nominatim search failed (${response.status}).`);
        const payload = await response.json();
        return NextResponse.json(Array.isArray(payload) ? payload : []);
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Location search is unavailable." }, { status: 502 });
    }
}
