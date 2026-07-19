export type LocationSearchResult = {
    display_name: string;
    lat: string;
    lon: string;
    address?: Record<string, string>;
};
export type ReverseLocationResult = {
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
