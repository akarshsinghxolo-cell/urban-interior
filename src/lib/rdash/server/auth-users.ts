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

export interface StaffIdentityDriftRow {
  identity_key: string;
  role_assignment_id: string | null;
  user_id: string | null;
  staff_id: string | null;
  email: string | null;
  role: string | null;
  role_status: string | null;
  expected_profile_status: string | null;
  profile_email: string | null;
  profile_role: string | null;
  profile_status: string | null;
  profile_auth_user_id: string | null;
  master_email: string | null;
  master_role: string | null;
  master_status: string | null;
  master_auth_user_id: string | null;
  profile_exists: boolean;
  master_exists: boolean;
  drift_reasons: string[];
  is_drifted: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_ASSIGNMENT_SELECT = "id,user_id,email,role,staff_id,display_name,status,approved_by,approved_at,rejected_at,created_at,updated_at";

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

function validAssignmentEmail(email: string | null | undefined) {
  const normalized = normalizeAuthEmail(email || "");
  if (!EMAIL_PATTERN.test(normalized)) throw new Error("The auth user does not have a valid work email.");
  return normalized;
}

function approvedByUuid(user: AuthenticatedUser) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.userId)
    ? user.userId
    : null;
}

async function syncStaffIdentity(input: {
  assignmentId?: string | null;
  userId: string;
  email: string;
  displayName: string;
  role: string;
  status: RDashUserApprovalStatus;
  staffId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
}) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("sync_staff_identity_bundle", {
    p_assignment_id: input.assignmentId || null,
    p_user_id: input.userId,
    p_email: validAssignmentEmail(input.email),
    p_role: normalizeRequestedRole(input.role),
    p_display_name: String(input.displayName || input.email).trim(),
    p_status: input.status,
    p_staff_id: String(input.staffId || "").trim() || null,
    p_approved_by: input.approvedBy || null,
    p_approved_at: input.approvedAt || null,
    p_rejected_at: input.rejectedAt || null,
    p_workspace_id: process.env.UC_WORKSPACE_ID || "default",
  });
  if (error) throw new Error(`Could not synchronize staff identity: ${error.message}`);
  const result = data as {
    assignment?: RDashUserRoleAssignment;
    staffId?: string;
    workspaceRevision?: number;
  } | null;
  if (!result?.assignment?.id || !result.staffId) {
    throw new Error("Staff synchronization returned an incomplete result.");
  }
  return {
    assignment: result.assignment,
    staffId: result.staffId,
    workspaceRevision: Number(result.workspaceRevision || 0),
  };
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = getSupabaseAdminClient();
  const target = normalizeAuthEmail(email);
  const { data, error } = await (admin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("get_auth_user_by_email", { p_email: target });
  if (error) {
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
    .select(ROLE_ASSIGNMENT_SELECT)
    .ilike("email", email)
    .in("status", ["pending", "active"])
    .limit(1);
  if (assignmentError) throw new Error(`Urban Castle role request lookup failed: ${assignmentError.message}`);
  const existingAssignment = existingAssignments?.[0] as RDashUserRoleAssignment | undefined;
  if (existingAssignment?.status === "active") throw new Error("This email already has active Urban Castle access.");
  if (existingAssignment?.status === "pending") {
    const synced = await syncStaffIdentity({
      assignmentId: existingAssignment.id,
      userId: existingAssignment.user_id,
      email,
      displayName: existingAssignment.display_name || displayName,
      role: existingAssignment.role,
      status: "pending",
      staffId: existingAssignment.staff_id,
    });
    return { status: "pending" as const, assignment: synced.assignment };
  }

  const existingAuthUser = await findAuthUserByEmail(email);
  let createdAuthUserId: string | null = null;
  let resolvedUserId = existingAuthUser?.id || null;

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

  try {
    const synced = await syncStaffIdentity({
      userId: resolvedUserId,
      email,
      displayName,
      role,
      status: "pending",
    });
    return { status: "pending" as const, assignment: synced.assignment };
  } catch (error) {
    if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId).catch(() => undefined);
    throw error;
  }
}

export function assertOwner(user: AuthenticatedUser) {
  if (user.role !== "Owner") throw new Error("Only the Owner can manage Urban Castle login approvals.");
}

export async function listRoleAssignments(user: AuthenticatedUser) {
  assertOwner(user);
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("uc_user_roles")
    .select(ROLE_ASSIGNMENT_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load user approvals: ${error.message}`);
  return (data || []) as RDashUserRoleAssignment[];
}

export async function listStaffIdentityDrift(user: AuthenticatedUser) {
  assertOwner(user);
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("staff_identity_drift_report")
    .select("*")
    .order("is_drifted", { ascending: false })
    .order("email", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Could not load staff identity drift report: ${error.message}`);
  return (data || []) as StaffIdentityDriftRow[];
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
    .select(ROLE_ASSIGNMENT_SELECT)
    .eq("id", id)
    .eq("status", "pending")
    .limit(1);
  if (lookupError) throw new Error(`Could not load user for approval: ${lookupError.message}`);
  const pending = pendingRows?.[0] as RDashUserRoleAssignment | undefined;
  if (!pending) throw new Error("No pending user approval was found.");
  const displayName = String(input.displayName || pending.display_name || pending.email || "Urban Castle User").trim();
  const now = new Date().toISOString();
  const synced = await syncStaffIdentity({
    assignmentId: pending.id,
    userId: pending.user_id,
    email: validAssignmentEmail(pending.email),
    displayName,
    role,
    status: "active",
    staffId: String(input.staffId || pending.staff_id || "").trim() || null,
    approvedBy: approvedByUuid(user),
    approvedAt: now,
  });
  return synced.assignment;
}

export async function rejectRoleAssignment(user: AuthenticatedUser, input: { id?: string }) {
  assertOwner(user);
  const id = String(input.id || "").trim();
  if (!id) throw new Error("Missing role assignment id.");
  const admin = getSupabaseAdminClient();
  const { data: pendingRows, error: lookupError } = await admin
    .from("uc_user_roles")
    .select(ROLE_ASSIGNMENT_SELECT)
    .eq("id", id)
    .eq("status", "pending")
    .limit(1);
  if (lookupError) throw new Error(`Could not load user for rejection: ${lookupError.message}`);
  const pending = pendingRows?.[0] as RDashUserRoleAssignment | undefined;
  if (!pending) throw new Error("No pending user approval was found.");
  const now = new Date().toISOString();
  const synced = await syncStaffIdentity({
    assignmentId: pending.id,
    userId: pending.user_id,
    email: validAssignmentEmail(pending.email),
    displayName: pending.display_name || pending.email || "Urban Castle User",
    role: pending.role,
    status: "rejected",
    staffId: pending.staff_id,
    approvedBy: approvedByUuid(user),
    rejectedAt: now,
  });
  return synced.assignment;
}
