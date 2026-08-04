import type { Staff } from "./types";

/**
 * Fields that ordinary workspace modules may use for assignee pickers, labels,
 * contact context and operational status. Compensation, bank, address,
 * emergency-contact and authentication-link fields deliberately stay out.
 */
export const STAFF_DIRECTORY_FIELDS = Object.freeze([
  "code",
  "name",
  "phone",
  "email",
  "role",
  "role_key",
  "department",
  "designation",
  "city",
  "status",
  "gps_tracking_enabled",
] as const);

/** Runtime-only policy needed by field/geofence code for the signed-in Staff. */
export const CURRENT_STAFF_RUNTIME_FIELDS = Object.freeze([
  "attendance_policy",
] as const);

const FULL_STAFF_DATA_ROLES = new Set([
  "Owner",
  "Operations Manager",
  "Accounts / Admin",
]);

export function canReadFullStaffData(role?: string | null): boolean {
  return Boolean(role && FULL_STAFF_DATA_ROLES.has(role));
}

export function projectStaffDirectoryRow(
  row: Record<string, unknown>,
  currentStaffId?: string | null,
): Partial<Staff> & { id: string } {
  const id = String(row.id || "").trim();
  const projected: Record<string, unknown> = { id };
  for (const field of STAFF_DIRECTORY_FIELDS) {
    if (row[field] !== undefined) projected[field] = row[field];
  }
  if (id && id === currentStaffId) {
    for (const field of CURRENT_STAFF_RUNTIME_FIELDS) {
      if (row[field] !== undefined) projected[field] = row[field];
    }
  }
  return projected as Partial<Staff> & { id: string };
}
