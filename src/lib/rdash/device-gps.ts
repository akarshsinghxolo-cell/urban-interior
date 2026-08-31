import type { GeoActionSource } from "./types";
import type { GpsCapture } from "./gps";

type DeviceGpsMode = "transaction" | "master-location" | "tracking";

const MASTER_LOCATION_MAX_ACCURACY_M = 75;

// Two-stage capture: try the precise GPS fix first, then fall back to a
// balanced (Wi-Fi/network) fix. High-accuracy-only captures routinely time
// out indoors or on a cold GPS fix; the fallback stage returns a coarser fix
// instead of failing, so forms still capture coordinates. maximumAge lets the
// browser hand back a recent cached fix instantly instead of restarting.
const DEVICE_GPS_STAGES: Record<DeviceGpsMode, PositionOptions[]> = {
  transaction: [
    { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 },
    { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 },
  ],
  "master-location": [
    { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 },
    { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 },
  ],
  tracking: [
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 15_000 },
    { enableHighAccuracy: false, timeout: 12_000, maximumAge: 30_000 },
  ],
};

type CaptureDevicePositionOptions = {
  mode?: DeviceGpsMode;
  maxAccuracyM?: number;
};

function geolocation() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Device GPS is not available in this browser.");
  }
  return navigator.geolocation;
}

function validatePosition(
  position: GeolocationPosition,
  maxAccuracyM?: number,
) {
  const { latitude, longitude, accuracy } = position.coords;
  if (
    !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
  ) {
    throw new Error("The device returned invalid GPS coordinates.");
  }
  if (!Number.isFinite(accuracy) || accuracy <= 0) {
    throw new Error("The device did not provide GPS accuracy.");
  }
  if (
    maxAccuracyM != null
    && Number.isFinite(maxAccuracyM)
    && accuracy > maxAccuracyM
  ) {
    throw new Error(
      `GPS accuracy is ±${Math.round(accuracy)} m. Move to an open area and capture a reading within ${Math.round(maxAccuracyM)} m accuracy.`,
    );
  }
  return position;
}

function isPositionError(error: unknown): error is GeolocationPositionError {
  return typeof error === "object"
    && error !== null
    && typeof (error as { code?: unknown }).code === "number"
    && typeof (error as { TIMEOUT?: unknown }).TIMEOUT === "number";
}

function requestPosition(api: Geolocation, options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    api.getCurrentPosition(
      (position) => {
        try {
          resolve(validatePosition(position));
        } catch (error) {
          reject(error);
        }
      },
      reject,
      options,
    );
  });
}

async function captureDevicePosition(
  options: CaptureDevicePositionOptions = {},
): Promise<GeolocationPosition> {
  const mode = options.mode || "transaction";
  const maxAccuracyM =
    options.maxAccuracyM
    ?? (mode === "master-location" ? MASTER_LOCATION_MAX_ACCURACY_M : undefined);

  const api = geolocation();
  let lastPositionError: unknown;
  for (const stageOptions of DEVICE_GPS_STAGES[mode]) {
    try {
      const position = await requestPosition(api, stageOptions);
      return validatePosition(position, maxAccuracyM);
    } catch (error) {
      if (!isPositionError(error)) throw error; // accuracy/validation failure: retrying cannot fix it
      lastPositionError = error;
      if (error.code === error.PERMISSION_DENIED) throw error; // retrying cannot fix it either
    }
  }
  throw lastPositionError;
}

export async function captureDeviceGps(
  options: CaptureDevicePositionOptions & { actionSource?: GeoActionSource } = {},
): Promise<GpsCapture> {
  const position = await captureDevicePosition(options);
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy_m: position.coords.accuracy,
    captured_at: new Date(position.timestamp || Date.now()).toISOString(),
    action_source: options.actionSource,
  };
}


export function deviceGpsErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "code" in error) {
    const geoError = error as GeolocationPositionError;
    if (geoError.code === geoError.PERMISSION_DENIED) {
      return "Location permission is blocked. Allow precise location in browser settings.";
    }
    if (geoError.code === geoError.POSITION_UNAVAILABLE) {
      return "This device cannot determine a reliable GPS position.";
    }
    if (geoError.code === geoError.TIMEOUT) {
      return "Location capture timed out. Move to an open area and try again.";
    }
  }
  return "Location capture failed.";
}
