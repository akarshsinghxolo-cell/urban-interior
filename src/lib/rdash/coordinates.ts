type CoordinatePair = {
    latitude: number;
    longitude: number;
};
function isValidCoordinatePair(value: Partial<CoordinatePair> | null | undefined): value is CoordinatePair {
    return Boolean(value &&
        Number.isFinite(value.latitude) &&
        Number.isFinite(value.longitude) &&
        value.latitude! >= -90 &&
        value.latitude! <= 90 &&
        value.longitude! >= -180 &&
        value.longitude! <= 180);
}
export function formatCoordinatePair(value: Partial<CoordinatePair> | null | undefined, precision = 6) {
    if (!isValidCoordinatePair(value))
        return "";
    return `${value.latitude.toFixed(precision)}, ${value.longitude.toFixed(precision)}`;
}
export function parseCoordinatePair(input: string): CoordinatePair | null {
    const normalized = input.trim().replace(/\s+/g, " ");
    if (!normalized)
        return null;
    const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*(?:,|\s)\s*(-?\d+(?:\.\d+)?)$/);
    if (!match)
        return null;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    return isValidCoordinatePair({ latitude, longitude })
        ? { latitude, longitude }
        : null;
}
export function coordinateInputError(input: string) {
    if (!input.trim())
        return undefined;
    return parseCoordinatePair(input)
        ? undefined
        : "Enter coordinates as latitude, longitude (for example 26.739800, 83.371200).";
}
