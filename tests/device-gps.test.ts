import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureDeviceGps,
  captureDevicePosition,
  DEVICE_GPS_WATCH_OPTIONS,
  deviceGpsErrorMessage,
  MASTER_LOCATION_MAX_ACCURACY_M,
  watchDevicePosition,
} from "../src/lib/rdash/device-gps";

const originalNavigator = globalThis.navigator;

function position(accuracy = 12, timestamp = 1_700_000_000_000): GeolocationPosition {
  return { coords: { latitude: 26.7606, longitude: 83.3732, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp } as GeolocationPosition;
}

function geoError(code: number): GeolocationPositionError {
  return { code, message: "gps error", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

function installGeolocation(geolocation: Partial<Geolocation>) {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation } });
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
});

describe("device GPS policy", () => {
  it("rejects inaccurate master-location captures instead of saving weak coordinates", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position(120)));
    installGeolocation({ getCurrentPosition } as Partial<Geolocation>);
    await expect(captureDevicePosition({ mode: "master-location" })).rejects.toThrow(`within ${MASTER_LOCATION_MAX_ACCURACY_M} m accuracy`);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("falls back from a timed-out precise transaction fix to a balanced fix", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback, error?: PositionErrorCallback | null) => {
      if (getCurrentPosition.mock.calls.length === 1) error?.(geoError(3));
      else success(position(55));
    });
    installGeolocation({ getCurrentPosition } as Partial<Geolocation>);
    const captured = await captureDeviceGps({ mode: "transaction" });
    expect(captured.accuracy_m).toBe(55);
    expect(captured.captured_at).toBe(new Date(1_700_000_000_000).toISOString());
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it("does not retry when location permission is denied", async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error?: PositionErrorCallback | null) => error?.(geoError(1)));
    installGeolocation({ getCurrentPosition } as Partial<Geolocation>);
    await expect(captureDevicePosition({ mode: "transaction" })).rejects.toMatchObject({ code: 1 });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(deviceGpsErrorMessage(geoError(1))).toContain("Location permission is blocked");
  });

  it("centralizes tracking watch options and cleanup", () => {
    const clearWatch = vi.fn();
    const watchPosition = vi.fn(() => 42);
    installGeolocation({ watchPosition, clearWatch } as Partial<Geolocation>);
    const stop = watchDevicePosition(() => undefined, () => undefined);
    expect(watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), DEVICE_GPS_WATCH_OPTIONS);
    stop();
    expect(clearWatch).toHaveBeenCalledWith(42);
  });
});
