import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureDeviceGps,
  captureDevicePosition,
  DEVICE_GPS_WATCH_OPTIONS,
  deviceGpsErrorMessage,
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
  it("returns a precise master-location fix without an unnecessary second request", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position(12)));
    installGeolocation({ getCurrentPosition } as Partial<Geolocation>);
    await expect(captureDeviceGps({ mode: "master-location" })).resolves.toMatchObject({ accuracy_m: 12 });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it.each([
    [900, 400, 400],
    [400, 900, 400],
    [900, 12, 12],
    [900, "timeout", 900],
    ["timeout", 900, 900],
    ["unavailable", 900, 900],
  ] as const)("keeps the best available master-location fix (%s then %s)", async (first, second, expected) => {
    const getCurrentPosition = vi.fn((success: PositionCallback, error?: PositionErrorCallback | null) => {
      const result = getCurrentPosition.mock.calls.length === 1 ? first : second;
      if (typeof result === "number") success(position(result));
      else error?.(geoError(result === "timeout" ? 3 : 2));
    });
    installGeolocation({ getCurrentPosition });
    await expect(captureDeviceGps({ mode: "master-location" })).resolves.toMatchObject({ accuracy_m: expected });
    expect(getCurrentPosition.mock.calls.map((call) => (call as unknown[])[2])).toEqual([
      expect.objectContaining({ enableHighAccuracy: true }),
      expect.objectContaining({ enableHighAccuracy: false }),
    ]);
  });

  it("enforces explicit accuracy limits after trying both stages", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position(900)));
    installGeolocation({ getCurrentPosition });
    await expect(captureDevicePosition({ mode: "master-location", maxAccuracyM: 50 })).rejects.toThrow("within 50 m accuracy");
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it("can satisfy an explicit accuracy limit with the second fix", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position(getCurrentPosition.mock.calls.length === 1 ? 900 : 25)));
    installGeolocation({ getCurrentPosition });
    await expect(captureDeviceGps({ maxAccuracyM: 50 })).resolves.toMatchObject({ accuracy_m: 25 });
  });

  it("does not invent a location when both stages fail", async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error?: PositionErrorCallback | null) => error?.(geoError(2)));
    installGeolocation({ getCurrentPosition });
    await expect(captureDevicePosition({ mode: "master-location" })).rejects.toMatchObject({ code: 2 });
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it("still rejects invalid device coordinates", async () => {
    const invalid = position();
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({ ...invalid, coords: { ...invalid.coords, latitude: NaN } } as GeolocationPosition));
    installGeolocation({ getCurrentPosition });
    await expect(captureDevicePosition({ mode: "master-location" })).rejects.toThrow("invalid GPS coordinates");
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
