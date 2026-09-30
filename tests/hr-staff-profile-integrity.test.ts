import { describe, expect, test } from "vitest";
import { normalizeAttendancePolicy } from "@/lib/rdash/attendance-policy";
import { createEmptyWorkspaceDatabase, mergeWorkspaceSnapshot } from "@/lib/rdash/workspace-session-merge";
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

  test("directory foundation refresh cannot erase a full Staff profile already loaded in HR", () => {
    const current = createEmptyWorkspaceDatabase();
    (current as any)._workspace_staff_projection = "full";
    (current as any)._workspace_foundation_embedded = true;
    current.master.staff = [{
      id: "staff-owner",
      name: "Akarsh Singh",
      role: "Owner",
      role_key: "OWNER",
      status: "active",
      city: "Gorakhpur",
      address: "Taramandal",
      emergency_contact: "9453768144",
      salary_type: "monthly",
      monthly_salary: 34555,
      attendance_policy: normalizeAttendancePolicy({}),
    } as any];

    const incoming = createEmptyWorkspaceDatabase();
    (incoming as any)._workspace_read_scope = "bootstrap";
    (incoming as any)._workspace_read_mode = "bootstrap";
    (incoming as any)._workspace_read_strategy = "bootstrap";
    (incoming as any)._workspace_foundation_embedded = true;
    (incoming as any)._workspace_staff_projection = "directory";
    incoming.master.staff = [{
      id: "staff-owner",
      name: "Akarsh Singh Updated",
      role: "Owner",
      role_key: "OWNER",
      status: "active",
      city: "Gorakhpur",
      attendance_policy: normalizeAttendancePolicy({}),
    } as any];

    const merged = mergeWorkspaceSnapshot(current, incoming);
    const owner = merged.master.staff.find((row) => row.id === "staff-owner")!;

    expect(owner.name).toBe("Akarsh Singh Updated");
    expect(owner.address).toBe("Taramandal");
    expect(owner.emergency_contact).toBe("9453768144");
    expect(owner.monthly_salary).toBe(34555);
    expect((merged as any)._workspace_staff_projection).toBe("full");
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

  test("Staff editing uses linked labels and one responsive section model", async () => {
    const editor = await testFile("src/components/rdash/StaffEditDialog.tsx").text();
    expectTokens(editor, [
      'function fieldLabel(text: string, htmlFor: string)',
      '<label htmlFor={htmlFor}',
      'const labelPrefix = React.useId()',
      'id={fieldId("name")}',
      'id={fieldId("phone")}',
      'id={fieldId("monthly-salary")}',
      'value={activeSection}',
      'onValueChange={(value) => setActiveSection(value as StaffSection)}',
      'staffSections.map',
    ]);
    expectNoTokens(editor, ['grid-cols-4 lg:grid-cols-7', 'function fieldLabel(text: string)']);
  });

  test("Staff documents report phases and prevent premature or repeated deletes", async () => {
    const editor = await testFile("src/components/rdash/StaffEditDialog.tsx").text();
    const route = await testFile("src/app/api/staff-documents/route.ts").text();
    expectTokens(editor, [
      'setPendingDocumentLink(uploaded)',
      'uploaded = pendingDocumentLink',
      'registerStaffDocument(uploaded)',
      'documentOperationRef.current',
      '<AlertDialog open={Boolean(documentToDelete)}',
      'setDocumentToDelete(document)',
      'Retry linking',
      'queued for workspace sync',
      'documentStage === "uploading"',
    ]);
    expectTokens(route, ['File record has not finished syncing', 'status: 409']);
  });

  test("attendance regularization uses the shared keyboard-accessible modal", async () => {
    const module = await testFile("src/components/rdash/modules/AttendancePayrollModule.tsx").text();
    expectTokens(module, [
      'Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle',
      '<Dialog open={Boolean(regularizeRecordId)}',
      '<DialogDescription>',
      'onClick={saveRegularize}',
    ]);
    expectNoTokens(module, ['z-[80] flex items-center justify-center bg-black/45']);
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
