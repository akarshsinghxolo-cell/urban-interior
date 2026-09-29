import { describe, expect, test } from "vitest";
import { normalizeAttendancePolicy } from "@/lib/rdash/attendance-policy";
import { expectNoTokens, expectTokens } from "./helpers/source-contract";
import { testFile } from "./test-file";

describe("Staff profile integrity", () => {
  test("normalizes attendance policy to canonical fields without legacy baggage", () => {
    const policy = normalizeAttendancePolicy({
      office_name: "HQ",
      standard_check_in_time: "09:30",
      auto_absent_after_minutes: 50,
      id: "legacy-policy",
      grace_period_minutes: 15,
      auto_absent_after: "50",
    } as any);

    expect(policy.auto_absent_after_minutes).toBe(50);
    expect((policy as any).auto_absent_after).toBeUndefined();
    expect((policy as any).grace_period_minutes).toBeUndefined();
    expect((policy as any).id).toBeUndefined();
  });

  test("Staff editor reuses shared GPS capture and private Supabase document upload", async () => {
    const editor = await testFile("src/components/rdash/StaffEditDialog.tsx").text();
    expectTokens(editor, [
      'captureDeviceGps({ mode: "master-location" })',
      'type="file"',
      'fetch("/api/staff-documents"',
      "auto_absent_after_minutes",
      "Daily-wage payroll uses daily wage × the actual number of calendar days",
    ]);
    expectNoTokens(editor, [
      "Office latitude",
      "Office longitude",
      "Known document IDs",
      "Google Drive file URL",
      '<SelectItem value="contract">',
    ]);
  });

  test("privileged HR reads replace the bootstrap Staff directory projection", async () => {
    const scopedRead = await testFile("src/lib/rdash/server/module-scoped-read.ts").text();
    expectTokens(scopedRead, [
      'collection === "master.staff" && fullStaffAllowed',
      'metadata._workspace_staff_projection = input.fullStaffAllowed ? "full" : "directory"',
    ]);
  });

  test("staff document gateway uses private Supabase Storage", async () => {
    const route = await testFile("src/app/api/staff-documents/route.ts").text();
    expectTokens(route, [
      'const BUCKET = "staff-documents"',
      ".storage.from(BUCKET).upload",
      ".createSignedUrl(path, 60)",
      ".storage.from(bucket).remove([path])",
    ]);
    expectNoTokens(route, ["google_drive", "drive.google.com"]);
  });

  test("duplicate Staff Drive-link registration UI is pruned", async () => {
    const masters = await testFile("src/components/rdash/modules/MastersSalesOpsModule.tsx").text();
    expectNoTokens(masters, [
      "Staff Drive-link registration & verification",
      "Register Drive link",
      "Google Drive file URL required",
    ]);
  });
});
