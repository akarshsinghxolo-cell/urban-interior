type LocationSearchResult = {
    display_name: string;
    lat: string;
    lon: string;
    address?: Record<string, string>;
};
type ReverseLocationResult = {
    display_name?: string;
    address?: Record<string, string>;
};
async function readJson<T>(response: Response): Promise<T> {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = typeof payload?.error === "string" ? payload.error : "Location service is unavailable.";
        throw new Error(message);
    }
    return payload as T;
}
export async function searchAddressWithNominatim(query: string) {
    const response = await fetch(`/api/location/search?q=${encodeURIComponent(query)}`);
    return readJson<LocationSearchResult[]>(response);
}
export async function reverseGeocodeWithNominatim(latitude: number, longitude: number) {
    const response = await fetch(`/api/location/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`);
    return readJson<ReverseLocationResult>(response);
}

// Nominatim (and fallback providers) use different address keys per region —
// Indian results often carry city_district/quarter instead of suburb. These
// helpers give every GPS autofill the same broad extraction.
export function addressCity(address?: Record<string, string>) {
    for (const key of ["city", "town", "village", "municipality"]) {
        if (address?.[key]) return address[key];
    }
    return "";
}
export function addressLocality(address?: Record<string, string>) {
    for (const key of ["suburb", "neighbourhood", "city_district", "quarter", "residential"]) {
        if (address?.[key]) return address[key];
    }
    return "";
}
