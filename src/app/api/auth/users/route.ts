import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/rdash/server/auth";
import {
  approveRoleAssignment,
  deleteLoginAccount,
  listRoleAssignments,
  rejectRoleAssignment,
  revokeRoleAssignment,
  setLoginPassword,
} from "@/lib/rdash/server/auth-users";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const users = await listRoleAssignments(user);
    return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load user approvals.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Only the Owner") ? 403 : 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const body = await request.json() as { id?: string; action?: "approve" | "reject" | "revoke" | "password" | "delete"; role?: string; displayName?: string; staffId?: string; password?: string };
    if (body.action === "approve") {
      const updated = await approveRoleAssignment(user, body);
      return NextResponse.json({ user: updated });
    }
    if (body.action === "reject") {
      const updated = await rejectRoleAssignment(user, body);
      return NextResponse.json({ user: updated });
    }
    if (body.action === "revoke") {
      const updated = await revokeRoleAssignment(user, body);
      return NextResponse.json({ user: updated });
    }
    if (body.action === "password") {
      const result = await setLoginPassword(user, body);
      return NextResponse.json(result);
    }
    if (body.action === "delete") {
      const result = await deleteLoginAccount(user, body);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown user access action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update user approval.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Only the Owner") ? 403 : 400 });
  }
}
