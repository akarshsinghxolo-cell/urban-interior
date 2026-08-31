import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const PHOTON_BASE = "https://photon.komoot.io";
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || "Urban Castle Workspace/1.0 (reverse geocoding)";
const UPSTREAM_TIMEOUT_MS = 7_000;

function coordinate(value: string | null, min: number, max: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

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

// Photon (fallback) speaks GeoJSON; project it into the Nominatim-like shape
// the client expects so autofill code stays provider-agnostic.
function photonResult(properties: PhotonProperties, latitude: number, longitude: number) {
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
    const latitude = coordinate(request.nextUrl.searchParams.get("lat"), -90, 90);
    const longitude = coordinate(request.nextUrl.searchParams.get("lon"), -180, 180);
    if (latitude == null || longitude == null) {
        return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
    }
    let nominatimError: unknown;
    try {
        const url = new URL(`${NOMINATIM_BASE}/reverse`);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("lat", String(latitude));
        url.searchParams.set("lon", String(longitude));
        return NextResponse.json(await fetchUpstreamJson(url));
    } catch (error) {
        nominatimError = error;
    }
    try {
        const url = new URL(`${PHOTON_BASE}/reverse`);
        url.searchParams.set("lat", String(latitude));
        url.searchParams.set("lon", String(longitude));
        const payload = await fetchUpstreamJson(url) as { features?: Array<{ properties?: PhotonProperties }> };
        const properties = payload.features?.[0]?.properties;
        if (!properties) throw new Error("Empty fallback result.");
        return NextResponse.json(photonResult(properties, latitude, longitude));
    } catch {
        const message = nominatimError instanceof Error ? nominatimError.message : "Reverse geocoding is unavailable.";
        return NextResponse.json({ error: `${message} Address autofill is unavailable right now.` }, { status: 502 });
    }
}
