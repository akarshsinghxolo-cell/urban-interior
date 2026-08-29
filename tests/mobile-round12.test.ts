import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Workspace tab strip mobile usability", () => {
  test("per-tab close buttons are touch-visible (hover-reveal only on sm+)", async () => {
    const tabs = await source("src/components/rdash/WorkspaceTabs.tsx");
    // The old hover-only pattern must be gone — it made tabs unclosable on touch.
    expect(tabs).not.toContain("opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100");
    // Touch-visible by default, hover-reveal restored on sm+.
    expect(tabs).toContain("sm:opacity-0 sm:group-hover:opacity-100");
    expect(tabs).toContain("opacity-100 transition-opacity hover:bg-accent hover:text-foreground");
    expect(tabs).toContain("focus-visible:opacity-100");
  });

  test("a close-others affordance is offered once the strip is crowded", async () => {
    const tabs = await source("src/components/rdash/WorkspaceTabs.tsx");
    expect(tabs).toContain("closeOtherTabs");
    expect(tabs).toContain("tabs.length > 3");
    expect(tabs).toContain("Close all tabs except");
  });

  test("the store exposes closeOtherTabs and keeps the requested tab active", async () => {
    const types = await source("src/lib/rdash/store/types.ts");
    expect(types).toContain("closeOtherTabs: (id: string) => void;");
    const ui = await source("src/lib/rdash/store/slices/ui.ts");
    expect(ui).toContain("closeOtherTabs: (id) =>");
    expect(ui).toContain("tabs: [keep]");
  });
});

describe("Attendance policy rendering", () => {
  test("verification rules and policy form use the canonical normalized policy", async () => {
    const mod = await source("src/components/rdash/modules/AttendancePayrollModule.tsx");
    expect(mod).toContain('import { normalizeAttendancePolicy } from "@/lib/rdash/attendance-policy"');
    // The stale inline fallback with wrong keys must stay gone (radius was keyed "geofence radius meters",
    // grace was "grace minutes", half-day was hour-based — none of them the canonical AttendancePolicy keys).
    expect(mod).not.toContain("geofence_radius_meters:");
    expect(mod).not.toContain("grace_minutes: 15");
    expect(mod).not.toContain("half_day_hours: 4");
    expect(mod).toContain("normalizeAttendancePolicy(policyStaff?.attendance_policy)");
  });
});

describe("Record select-mode pills", () => {
  test("Select / Exit select pills never wrap mid-label on phones", async () => {
    for (const path of [
      "src/components/rdash/modules/MastersSalesOpsModule.tsx",
      "src/components/rdash/modules/QuotationsModule.tsx",
      "src/components/rdash/modules/TasksFollowups.tsx",
    ]) {
      const src = await source(path);
      // TasksFollowups uses the compact py-1 pill; the other two use py-1.5.
      const pill = path.endsWith("TasksFollowups.tsx")
        ? "whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium"
        : "whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs font-medium";
      expect(src).toContain(pill);
      expect(src).toContain("inline-flex shrink-0");
    }
  });
});
