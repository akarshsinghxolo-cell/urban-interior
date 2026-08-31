import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const PHOTON_BASE = "https://photon.komoot.io";
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || "Urban Castle Workspace/1.0 (location lookup)";
const UPSTREAM_TIMEOUT_MS = 7_000;

// Promise.race instead of AbortSignal: an AbortSignal would disable Next's
// fetch cache, and the 60s revalidate is what keeps us inside Nominatim's
// 1 req/s usage policy.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Upstream lookup timed out.")), ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); },
        );
    });
}

async function fetchUpstreamJson(url: URL) {
    const response = await withTimeout(fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        next: { revalidate: 60 },
    }), UPSTREAM_TIMEOUT_MS);
    if (!response.ok) throw new Error(`Upstream lookup failed (${response.status}).`);
    return response.json();
}

type PhotonProperties = {
    name?: string; street?: string; district?: string; city?: string;
    county?: string; town?: string; village?: string; state?: string; country?: string;
};
type PhotonFeature = { properties?: PhotonProperties; geometry?: { coordinates?: number[] } };

// Photon (fallback) speaks GeoJSON; project it into the Nominatim-like shape
// the client expects so address search stays provider-agnostic.
function photonResult(feature: PhotonFeature) {
    const properties = feature.properties || {};
    const latitude = Number(feature.geometry?.coordinates?.[1]);
    const longitude = Number(feature.geometry?.coordinates?.[0]);
    const city = properties.city || properties.county || "";
    const district = properties.district || "";
    const display_name = [
        properties.name || properties.street,
        district,
        city,
        properties.town || properties.village,
        properties.state,
        properties.country,
    ].filter(Boolean).join(", ");
    return {
        display_name,
        address: {
            city,
            town: properties.town || properties.village || "",
            suburb: district,
            neighbourhood: district,
            road: properties.street || "",
            state: properties.state || "",
            country: properties.country || "",
        },
        lat: String(latitude),
        lon: String(longitude),
    };
}

export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams.get("q")?.trim() || "";
    if (query.length < 3 || query.length > 180) {
        return NextResponse.json({ error: "Search query must be between 3 and 180 characters." }, { status: 400 });
    }
    let nominatimError: unknown;
    try {
        const url = new URL(`${NOMINATIM_BASE}/search`);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "5");
        url.searchParams.set("q", query);
        const payload = await fetchUpstreamJson(url);
        return NextResponse.json(Array.isArray(payload) ? payload : []);
    } catch (error) {
        nominatimError = error;
    }
    try {
        const url = new URL(`${PHOTON_BASE}/api`);
        url.searchParams.set("q", query);
        url.searchParams.set("limit", "5");
        url.searchParams.set("lang", "en");
        const payload = await fetchUpstreamJson(url) as { features?: PhotonFeature[] };
        return NextResponse.json((payload.features || []).map(photonResult));
    } catch {
        const message = nominatimError instanceof Error ? nominatimError.message : "Location search is unavailable.";
        return NextResponse.json({ error: `${message} Location search is unavailable right now.` }, { status: 502 });
    }
}
