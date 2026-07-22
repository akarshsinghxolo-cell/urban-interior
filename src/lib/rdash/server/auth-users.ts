import type { User } from "@supabase/supabase-js";
import { STAFF_ROLE_KEYS, type StaffRoleKey } from "../staff-operations";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../supabase/server";
import type { AuthenticatedUser } from "./auth";

export type RDashUserApprovalStatus = "pending" | "active" | "rejected" | "inactive";

export interface RDashUserRoleAssignment {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  staff_id: string | null;
  display_name: string | null;
  status: RDashUserApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}

export function assertSupabaseAuthConfigured() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase Auth is not fully configured. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY. Legacy aliases SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are also accepted.");
  }
}

export function normalizeRequestedRole(role: string | undefined): StaffRoleKey {
  const requested = String(role || "FIELD_STAFF").trim().toUpperCase().replace(/[\s/-]+/g, "_");
  return (STAFF_ROLE_KEYS as readonly string[]).includes(requested) ? requested as StaffRoleKey : "FIELD_STAFF";
}

export function validateSignupInput(input: { email?: string; password?: string; displayName?: string }) {
  const email = normalizeAuthEmail(input.email || "");
  const password = String(input.password || "");
  const displayName = String(input.displayName || "").trim();
  if (!EMAIL_PATTERN.test(email)) throw new Error("Enter a valid email address.");
  if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
  if (!displayName) throw new Error("Enter the user's name.");
  return { email, password, displayName };
}

function staffIdForAuthUser(userId: string) {
  return `staff-auth-${userId.replace(/-/g, "").slice(0, 12)}`;
}

function staffCodeForAuthUser(userId: string) {
  return `AUTH-${userId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function validAssignmentEmail(email: string | null | undefined) {
  const normalized = normalizeAuthEmail(email || "");
  if (!EMAIL_PATTERN.test(normalized)) throw new Error("The auth user does not have a valid work email.");
  return normalized;
}

async function ensureStaffProfileForAuthUser(input: {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  status: "pending" | "active" | "inactive";
  staffId?: string | null;
}) {
  const email = validAssignmentEmail(input.email);
  const roleId = normalizeRequestedRole(input.role);
  const name = String(input.displayName || email).trim();
  const admin = getSupabaseAdminClient();
  const byStaffId = input.staffId
    ? (await admin.from("StaffProfile").select("id,code").eq("id", input.staffId).maybeSingle()).data
    : null;
  const byEmail = byStaffId
    ? null
    : (await admin.from("StaffProfile").select("id,code").eq("email", email).limit(1).maybeSingle()).data;
  const existing = byStaffId || byEmail;
  const id = existing?.id || input.staffId || staffIdForAuthUser(input.userId);
  const code = existing?.code || staffCodeForAuthUser(input.userId);
  const dataJson = JSON.stringify({ source: "supabase_auth", authUserId: input.userId, email });
  const { data: profile, error } = existing
    ? await admin
        .from("StaffProfile")
        .update({ name, email, roleId, status: input.status, dataJson })
        .eq("id", id)
        .select("id")
        .single()
    : await admin
        .from("StaffProfile")
        .insert({
          id,
          code,
          name,
          email,
          roleId,
          status: input.status,
          salaryType: "monthly",
          gpsTrackingEnabled: true,
          dataJson,
        })
        .select("id")
        .single();
  if (error || !profile) throw new Error(`Could not save staff profile: ${error?.message || "unknown error"}`);

  // FIX-STAFF-SYNC: Also upsert into entity_master_staff so the staff member
  // appears in the HR module (Attendance, Payroll, Staff Board). The auth
  // system writes to StaffProfile (normalized table), but the workspace/HR
  // module reads from entity_master_staff (workspace blob table). Without
  // this sync, approved users can log in but are invisible in HR — they
  // can't be assigned visits, tracked for attendance, or processed for
  // payroll.
  try {
    const now = new Date().toISOString();
    const staffEntityData = {
      id,
      code,
      name,
      email,
      phone: "",
      auth_user_id: input.userId,  // FIX-DB-MERGE-001: links to Supabase auth.users
      role: roleId === "OWNER" ? "Owner"
        : roleId === "OPERATIONS_MANAGER" ? "Operations Manager"
        : roleId === "FIELD_STAFF" ? "Field Staff"
        : roleId === "SALES_TELECALLER" ? "Sales / Telecaller"
        : roleId === "PROCUREMENT_STAFF" ? "Procurement Staff"
        : roleId === "FINANCE" ? "Finance"
        : roleId === "ACCOUNTS_ADMIN" ? "Accounts / Admin"
        : "Staff",
      role_key: roleId as any,
      department: "",
      designation: "",
      status: input.status === "active" ? "active" : input.status,
      salary_type: "monthly" as const,
      gps_tracking_enabled: true,
      login_enabled: true,
      login_email: email,
      attendance_policy: {
        id: `policy-${id}`,
        grace_period_minutes: 15,
        late_grace_minutes: 15,
        absent_deduction_enabled: false,
        absent_deduction_days: 0,
      },
      created_at: now,
      updated_at: now,
    };
    await admin.from("entity_master_staff").upsert({
      id,
      workspace_id: "default",
      revision: 0,
      updated_at: now,
      updated_by: "auth-system",
      data: staffEntityData,
    }, { onConflict: "id" });
  } catch (syncError) {
    // Non-fatal — the StaffProfile was saved successfully, so login will
    // work. The entity_master_staff sync is for HR visibility. Log but
    // don't block the approval.
    console.error("[auth-users] Failed to sync staff to entity_master_staff:", syncError);
  }

  return profile.id;
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  // STAGE-2-FIX: Use an RPC (Postgres function) for an O(1) lookup on
  // auth.users by email, instead of paginating through ALL users via
  // listUsers (which was O(N) and DOS-able). Requires the
  // get_auth_user_by_email function from stage2-schema-fixes.sql.
  const admin = getSupabaseAdminClient();
  const target = normalizeAuthEmail(email);
  const { data, error } = await (admin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("get_auth_user_by_email", { p_email: target });
  if (error) {
    // If the RPC doesn't exist yet (migration not run), fall back to the old
    // paginated approach so the app keeps working during the transition.
    console.warn("[auth-users] get_auth_user_by_email RPC failed, falling back to listUsers:", error.message);
    let page = 1;
    for (;;) {
      const { data: pageData, error: pageError } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (pageError) throw new Error(`Supabase user lookup failed: ${pageError.message}`);
      const found = pageData.users.find((user) => normalizeAuthEmail(user.email || "") === target);
      if (found) return found;
      if (pageData.users.length < 100) return null;
      page += 1;
    }
  }
  if (!data) return null;
  // The RPC returns a json object with id, email, etc. — cast to User.
  return data as unknown as User;
}

export async function createPendingAccessRequest(input: {
  email?: string;
  password?: string;
  displayName?: string;
  requestedRole?: string;
}) {
  assertSupabaseAuthConfigured();
  const { email, password, displayName } = validateSignupInput(input);
  const role = normalizeRequestedRole(input.requestedRole);
  const admin = getSupabaseAdminClient();

  const { data: existingAssignments, error: assignmentError } = await admin
    .from("uc_user_roles")
    .select("id,status,email,role,display_name,user_id,staff_id,approved_by,approved_at,rejected_at,created_at,updated_at")
    .ilike("email", email)
    .in("status", ["pending", "active"])
    .limit(1);
  if (assignmentError) throw new Error(`Urban Castle role request lookup failed: ${assignmentError.message}`);
  const existingAssignment = existingAssignments?.[0] as RDashUserRoleAssignment | undefined;
  if (existingAssignment?.status === "active") throw new Error("This email already has active Urban Castle access.");
  if (existingAssignment?.status === "pending") {
    const staffId = existingAssignment.staff_id || await ensureStaffProfileForAuthUser({
      userId: existingAssignment.user_id,
      email,
      displayName: existingAssignment.display_name || displayName,
      role: existingAssignment.role,
      status: "pending",
    });
    if (!existingAssignment.staff_id) {
      const { error: linkError } = await admin.from("uc_user_roles").update({ staff_id: staffId, updated_at: new Date().toISOString() }).eq("id", existingAssignment.id);
      if (linkError) throw new Error(`Could not link staff profile: ${linkError.message}`);
      existingAssignment.staff_id = staffId;
    }
    return { status: "pending" as const, assignment: existingAssignment };
  }

  const existingAuthUser = await findAuthUserByEmail(email);
  let createdAuthUserId: string | null = null;
  const userId = existingAuthUser?.id || null;
  let resolvedUserId = userId;

  if (!resolvedUserId) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(created.error?.message || "Could not create the Supabase Auth user.");
    }
    createdAuthUserId = created.data.user.id;
    resolvedUserId = created.data.user.id;
  }

  let staffId: string;
  try {
    staffId = await ensureStaffProfileForAuthUser({ userId: resolvedUserId, email, displayName, role, status: "pending" });
  } catch (error) {
    if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId).catch(() => undefined);
    throw error;
  }

  const { data: assignment, error: insertError } = await admin
    .from("uc_user_roles")
    .insert({
      user_id: resolvedUserId,
      email,
      role,
      staff_id: staffId,
      display_name: displayName,
      status: "pending",
    })
    .select("id,status,email,role,display_name,user_id,staff_id,approved_by,approved_at,rejected_at,created_at,updated_at")
    .single();
  if (insertError) {
    if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId).catch(() => undefined);
    throw new Error(`Could not create the Urban Castle access request: ${insertError.message}`);
  }
  return { status: "pending" as const, assignment: assignment as RDashUserRoleAssignment };
}

export function assertOwner(user: AuthenticatedUser) {
  if (user.role !== "Owner") throw new Error("Only the Owner can manage Urban Castle login approvals.");
}

export async function listRoleAssignments(user: AuthenticatedUser) {
  assertOwner(user);
  // Supabase-only: read from uc_user_roles table.
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("uc_user_roles")
    .select("id,user_id,email,role,staff_id,display_name,status,approved_by,approved_at,rejected_at,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load user approvals: ${error.message}`);
  return (data || []) as RDashUserRoleAssignment[];
}

export async function approveRoleAssignment(user: AuthenticatedUser, input: {
  id?: string;
  role?: string;
  displayName?: string;
  staffId?: string;
}) {
  assertOwner(user);
  const id = String(input.id || "").trim();
  if (!id) throw new Error("Missing role assignment id.");
  const admin = getSupabaseAdminClient();
  const role = normalizeRequestedRole(input.role);
  const { data: pendingRows, error: lookupError } = await admin
    .from("uc_user_roles")
    .select("id,status,email,role,display_name,user_id,staff_id,approved_by,approved_at,rejected_at,created_at,updated_at")
    .eq("id", id)
    .eq("status", "pending")
    .limit(1);
  if (lookupError) throw new Error(`Could not load user for approval: ${lookupError.message}`);
  const pending = pendingRows?.[0] as RDashUserRoleAssignment | undefined;
  if (!pending) throw new Error("No pending user approval was found.");
  const displayName = String(input.displayName || pending.display_name || pending.email || "Urban Castle User").trim();
  const staffId = await ensureStaffProfileForAuthUser({
    userId: pending.user_id,
    email: validAssignmentEmail(pending.email),
    displayName,
    role,
    status: "active",
    staffId: String(input.staffId || pending.staff_id || "").trim() || null,
  });
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("uc_user_roles")
    .update({
      role,
      display_name: displayName,
      staff_id: staffId,
      status: "active",
      // STAGE-3-FIX: Store the user's email when userId isn't a UUID (super-owner).
      // The approved_by column is TEXT, so we can store either a UUID or an email.
      // This preserves the audit trail for super-owner approvals (previously null).
      approved_by: user.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.userId) ? user.userId : user.email,
      approved_at: now,
      rejected_at: null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id,user_id,email,role,staff_id,display_name,status,approved_by,approved_at,rejected_at,created_at,updated_at")
    .single();
  if (error) throw new Error(`Could not approve user: ${error.message}`);
  return data as RDashUserRoleAssignment;
}

export async function rejectRoleAssignment(user: AuthenticatedUser, input: { id?: string }) {
  assertOwner(user);
  const id = String(input.id || "").trim();
  if (!id) throw new Error("Missing role assignment id.");
  const admin = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("uc_user_roles")
    .update({
      status: "rejected",
      approved_by: user.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.userId) ? user.userId : null,
      rejected_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id,user_id,email,role,staff_id,display_name,status,approved_by,approved_at,rejected_at,created_at,updated_at")
    .single();
  if (error) throw new Error(`Could not reject user: ${error.message}`);
  const rejected = data as RDashUserRoleAssignment;
  if (rejected.staff_id) {
    const adminClient = getSupabaseAdminClient();
    await adminClient.from("StaffProfile").update({ status: "inactive" }).eq("id", rejected.staff_id).then(() => undefined, () => undefined);
    // FIX-STAFF-SYNC: Also mark as inactive in entity_master_staff so the
    // HR module reflects the rejection.
    try {
      const existing = await adminClient.from("entity_master_staff").select("data").eq("id", rejected.staff_id).maybeSingle();
      if (existing.data) {
        const staffData = typeof existing.data.data === "string" ? JSON.parse(existing.data.data) : existing.data.data;
        staffData.status = "inactive";
        staffData.updated_at = now;
        await adminClient.from("entity_master_staff").update({
          data: staffData,
          updated_at: now,
          updated_by: "auth-system",
        }).eq("id", rejected.staff_id);
      }
    } catch { /* non-fatal */ }
  }
  return rejected;
}
