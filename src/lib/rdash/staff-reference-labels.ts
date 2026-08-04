import type { RDashDatabase } from "./types";

type Row = Record<string, unknown>;
type StaffDirectoryEntry = {
  id: string;
  name?: string;
  role?: string;
  status?: string;
};

function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((row): row is Row => Boolean(row) && typeof row === "object")
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function staffDirectory(database: RDashDatabase): Map<string, StaffDirectoryEntry> {
  const map = new Map<string, StaffDirectoryEntry>();
  for (const row of rows(database.master?.staff)) {
    const id = text(row.id);
    if (!id) continue;
    map.set(id, {
      id,
      name: text(row.name) || undefined,
      role: text(row.role) || undefined,
      status: text(row.status) || undefined,
    });
  }
  return map;
}

function hydrateTaskLike(row: Row, staff: Map<string, StaffDirectoryEntry>): void {
  const staffId = text(row.assigned_staff_id) || text(row.assignee_id);
  if (!staffId) return;
  const person = staff.get(staffId);
  if (!person) return;
  row.assigned_staff_id = staffId;
  // Compatibility-only runtime aliases. These labels are derived from canonical
  // Staff and are stripped by the database write normalizer before persistence.
  row.assignee_id = staffId;
  row.assignee_name = person.name || staffId;
}

function hydrateFollowup(row: Row, staff: Map<string, StaffDirectoryEntry>): void {
  const staffId = text(row.assigned_staff_id);
  if (!staffId) return;
  const person = staff.get(staffId);
  if (!person) return;
  row.assigned_to = person.name || staffId;
  if (person.role) row.assigned_role = person.role;
}

function hydrateVisit(row: Row, staff: Map<string, StaffDirectoryEntry>): void {
  const staffId = text(row.assigned_staff_id) || text(row.staff_id);
  if (!staffId) return;
  const person = staff.get(staffId);
  if (!person) return;
  row.assigned_staff_id = staffId;
  row.assignee_type = "staff";
  row.staff_id = staffId;
  row.staff_name = person.name || staffId;
}

function hydrateAttendance(row: Row, staff: Map<string, StaffDirectoryEntry>): void {
  const staffId = text(row.staff_id);
  if (!staffId) return;
  const person = staff.get(staffId);
  if (!person) return;
  row.staff_name = person.name || staffId;
}

function hydrateApprovalPolicy(row: Row, staff: Map<string, StaffDirectoryEntry>): void {
  const staffId = text(row.approver_id);
  if (!staffId) return;
  const person = staff.get(staffId);
  if (!person) return;
  row.approver_name = person.name || staffId;
}

/**
 * Rehydrates display labels from canonical Staff after a workspace read.
 * Persisted entity payloads keep IDs only; legacy name fields exist only in the
 * in-memory/read response so existing UI modules can migrate independently.
 */
export function hydrateStaffReferenceLabels(database: RDashDatabase): RDashDatabase {
  const staff = staffDirectory(database);
  if (!staff.size) return database;

  for (const row of rows(database.tasks)) hydrateTaskLike(row, staff);
  for (const row of rows(database.recurringTasks)) hydrateTaskLike(row, staff);
  for (const row of rows(database.followups)) hydrateFollowup(row, staff);
  for (const row of rows(database.visits)) hydrateVisit(row, staff);
  for (const row of rows(database.attendance)) hydrateAttendance(row, staff);
  for (const row of rows(database.approvalPolicies)) hydrateApprovalPolicy(row, staff);

  return database;
}
