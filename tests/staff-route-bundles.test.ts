import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  buildStaffRouteSegments,
  detectStaffRouteStops,
  summarizeStaffRoute,
  type StaffLocationPing,
} from "../src/lib/rdash/staff-location";

const point = (
  id: string,
  minute: number,
  latitude: number,
  longitude: number,
  speedKmh: number,
): StaffLocationPing => ({
  id,
  client_point_id: id,
  staff_id: "staff-1",
  latitude,
  longitude,
  accuracy_m: 8,
  speed_kmh: speedKmh,
  captured_at: new Date(
    Date.UTC(2026, 6, 30, 4, minute, 0),
  ).toISOString(),
  source: "browser_foreground",
});

describe("frontend route bundle analytics", () => {
  const points = [
    point("p1", 0, 26.7606, 83.3732, 0),
    point("p2", 2, 26.76061, 83.37321, 0.2),
    point("p3", 4, 26.76062, 83.37322, 0.1),
    point("p4", 5, 26.7612, 83.374, 10),
    point("p5", 6, 26.764, 83.378, 28),
  ];

  test("colours route segments by speed band", () => {
    const bands = buildStaffRouteSegments(points).map(
      (segment) => segment.band,
    );
    expect(bands).toContain("stopped");
    expect(bands).toContain("slow");
    expect(bands).toContain("fast");
  });

  test("detects stationary dwell clusters", () => {
    const stops = detectStaffRouteStops(points);
    expect(stops).toHaveLength(1);
    expect(stops[0].duration_minutes).toBe(4);
    expect(stops[0].point_count).toBe(3);
  });

  test("summarises distance, movement and stopping", () => {
    const summary = summarizeStaffRoute(points);
    expect(summary.point_count).toBe(5);
    expect(summary.distance_m).toBeGreaterThan(0);
    expect(summary.stopped_minutes).toBeGreaterThanOrEqual(4);
    expect(summary.max_speed_kmh).toBe(28);
  });
});

describe("frontend route queue safety", () => {
  test("queues are scoped to the authenticated Staff profile", () => {
    const helper = readFileSync(
      "src/lib/rdash/staff-route-client.ts",
      "utf8",
    );
    const tracker = readFileSync(
      "src/components/rdash/StaffLocationTracker.tsx",
      "utf8",
    );
    expect(helper).toContain("staffRouteQueueKey");
    expect(helper).toContain("encodeURIComponent(normalized)");
    expect(helper).toContain("uc:staff-route-queue:v2");
    expect(tracker).toContain("readQueue(staffId)");
    expect(tracker).toContain("writeQueue(staffId");
    expect(tracker).not.toContain('const STAFF_ROUTE_QUEUE_KEY = "uc:staff-route-queue:v1"');
  });

  test("stationary tracking has a two-minute browser heartbeat", () => {
    const tracker = readFileSync(
      "src/components/rdash/StaffLocationTracker.tsx",
      "utf8",
    );
    expect(tracker).toContain("POSITION_HEARTBEAT_MS = 2 * 60_000");
    expect(tracker).toContain("requestCurrentPosition");
    expect(tracker).toContain("positionHeartbeat");
  });

  test("unavailable persistence never clears the local queue", () => {
    const tracker = readFileSync(
      "src/components/rdash/StaffLocationTracker.tsx",
      "utf8",
    );
    const ignoredBranch = tracker.slice(
      tracker.indexOf("if (payload.ignored)"),
      tracker.indexOf("const uploadedIds"),
    );
    expect(ignoredBranch).toContain("remains queued");
    expect(ignoredBranch).not.toContain("writeQueue(");
  });
});

describe("old GPS paths are removed", () => {
  test("single-ping and native-device implementations no longer exist", () => {
    for (const path of [
      "src/app/api/tracking/ping/route.ts",
      "src/app/api/tracking/locations/route.ts",
      "src/app/api/tracking/devices/enroll/route.ts",
      "src/app/api/tracking/devices/register/route.ts",
      "src/app/api/tracking/devices/pings/route.ts",
      "src/lib/rdash/server/tracking-device.ts",
      "mobile/android-tracker/settings.gradle.kts",
      "mobile/android-tracker/app/src/main/AndroidManifest.xml",
      "mobile/android-tracker/app/src/main/java/com/urbancastle/tracker/TrackingService.kt",
    ]) {
      expect(existsSync(path)).toBe(false);
    }
  });

  test("frontend sends only hourly/manual bundles", () => {
    const tracker = readFileSync(
      "src/components/rdash/StaffLocationTracker.tsx",
      "utf8",
    );
    expect(tracker).toContain("/api/tracking/routes");
    expect(tracker).not.toContain("/api/tracking/ping");
    expect(tracker).not.toContain("native_background");
  });
});
