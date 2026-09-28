import type { RDashDatabase, Staff } from "./types";


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



/** Canonical Staff lookup for runtime presentation. Assignment records store Staff IDs only. */
export function staffRecordById(database: Pick<RDashDatabase, "master">, staffId?: string | null): Staff | undefined {
  if (!staffId) return undefined;
  return database.master.staff.find((staff) => staff.id === staffId);
}

export function staffNameForId(database: Pick<RDashDatabase, "master">, staffId?: string | null, fallback = "Unassigned"): string {
  return staffRecordById(database, staffId)?.name || fallback;
}

export function staffRoleForId(database: Pick<RDashDatabase, "master">, staffId?: string | null): string | undefined {
  return staffRecordById(database, staffId)?.role;
}

export function activeStaffIdForRole(database: Pick<RDashDatabase, "master">, roles: string | readonly string[]): string | undefined {
  const wanted = Array.isArray(roles) ? roles : [roles];
  return database.master.staff.find((staff) => staff.status === "active" && wanted.includes(staff.role))?.id;
}
