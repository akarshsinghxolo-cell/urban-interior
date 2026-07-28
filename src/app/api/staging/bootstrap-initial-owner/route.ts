import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_BRANCH = "staging/new-supabase-validation";
const MAX_PENDING_AGE_MS = 60 * 60 * 1000;

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH
  ) {
    return noStoreJson({ error: "Not found." }, 404);
  }

  const admin = getSupabaseAdminClient();

  const { data: activeOwners, error: ownerError } = await admin
    .from("uc_user_roles")
    .select("id")
    .eq("status", "active")
    .eq("role", "OWNER")
    .limit(2);
  if (ownerError) {
    return noStoreJson({ error: "Could not verify existing owners." }, 503);
  }
  if ((activeOwners || []).length > 0) {
    return noStoreJson({ status: "already_bootstrapped" }, 409);
  }

  const { data: pendingRows, error: pendingError } = await admin
    .from("uc_user_roles")
    .select("id,user_id,email,staff_id,display_name,status,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(3);
  if (pendingError) {
    return noStoreJson({ error: "Could not verify pending access requests." }, 503);
  }
  if ((pendingRows || []).length !== 1) {
    return noStoreJson(
      {
        status: "refused",
        reason: "expected_exactly_one_pending_request",
        pendingCount: (pendingRows || []).length,
      },
      409,
    );
  }

  const pending = pendingRows![0] as {
    id: string;
    user_id: string;
    email: string | null;
    staff_id: string | null;
    display_name: string | null;
    created_at: string;
  };
  const createdAt = Date.parse(pending.created_at);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > MAX_PENDING_AGE_MS) {
    return noStoreJson({ status: "refused", reason: "pending_request_not_recent" }, 409);
  }
  if (!pending.email) {
    return noStoreJson({ status: "refused", reason: "pending_request_missing_email" }, 409);
  }

  const { data: authPage, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 10,
  });
  if (authError) {
    return noStoreJson({ error: "Could not verify Auth users." }, 503);
  }
  if (authPage.users.length !== 1 || authPage.users[0]?.id !== pending.user_id) {
    return noStoreJson(
      {
        status: "refused",
        reason: "pending_request_is_not_the_only_auth_user",
        authUserCount: authPage.users.length,
      },
      409,
    );
  }

  const approvedAt = new Date().toISOString();
  const { data: synced, error: syncError } = await admin.rpc(
    "sync_staff_identity_bundle",
    {
      p_assignment_id: pending.id,
      p_user_id: pending.user_id,
      p_email: pending.email,
      p_role: "OWNER",
      p_display_name: String(pending.display_name || "Urban Castle Owner"),
      p_status: "active",
      p_staff_id: pending.staff_id,
      p_approved_by: null,
      p_approved_at: approvedAt,
      p_rejected_at: null,
      p_workspace_id: process.env.UC_WORKSPACE_ID || "default",
    },
  );
  if (syncError) {
    return noStoreJson({ error: "Could not activate the initial Owner." }, 503);
  }

  const result = synced as {
    assignment?: { id?: string; role?: string; status?: string; staff_id?: string | null };
    staffId?: string;
    workspaceRevision?: number;
  } | null;
  if (
    result?.assignment?.id !== pending.id ||
    result.assignment.role !== "OWNER" ||
    result.assignment.status !== "active" ||
    !result.staffId
  ) {
    return noStoreJson({ error: "Owner activation returned an incomplete result." }, 503);
  }

  return noStoreJson({
    status: "activated",
    role: "OWNER",
    staffLinked: true,
    workspaceRevision: Number(result.workspaceRevision || 0),
  });
}
