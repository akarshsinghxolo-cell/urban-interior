import type { GeoActionSource } from "./types";
import type { GpsCapture } from "./gps";

export type DeviceGpsMode = "transaction" | "master-location" | "tracking";

export const MASTER_LOCATION_MAX_ACCURACY_M = 75;

export const DEVICE_GPS_OPTIONS: Record<DeviceGpsMode, PositionOptions> = {
  transaction: {
    enableHighAccuracy: true,
    timeout: 15_000,
    maximumAge: 0,
  },
  "master-location": {
    enableHighAccuracy: true,
    timeout: 15_000,
    maximumAge: 0,
  },
  tracking: {
    enableHighAccuracy: true,
    timeout: 20_000,
    maximumAge: 15_000,
  },
};

export type CaptureDevicePositionOptions = {
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

export function captureDevicePosition(
  options: CaptureDevicePositionOptions = {},
): Promise<GeolocationPosition> {
  const mode = options.mode || "transaction";
  const maxAccuracyM =
    options.maxAccuracyM
    ?? (mode === "master-location" ? MASTER_LOCATION_MAX_ACCURACY_M : undefined);

  return new Promise((resolve, reject) => {
    let api: Geolocation;
    try {
      api = geolocation();
    } catch (error) {
      reject(error);
      return;
    }
    api.getCurrentPosition(
      (position) => {
        try {
          resolve(validatePosition(position, maxAccuracyM));
        } catch (error) {
          reject(error);
        }
      },
      reject,
      DEVICE_GPS_OPTIONS[mode],
    );
  });
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

export function watchDevicePosition(
  onPosition: PositionCallback,
  onError?: PositionErrorCallback,
): () => void {
  const api = geolocation();
  const watchId = api.watchPosition(
    onPosition,
    onError,
    DEVICE_GPS_OPTIONS.tracking,
  );
  return () => api.clearWatch(watchId);
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
