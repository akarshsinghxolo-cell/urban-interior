import { NextRequest, NextResponse } from "next/server";
import { requireSession, signSession, AUTH_COOKIE } from "@/lib/rdash/server/auth";

export const runtime = "nodejs";

/**
 * PUT /api/auth/profile
 * Authenticated. Updates the current user's display name.
 *
 * How it works:
 * - Verifies the current session (requireSession)
 * - Re-signs a new JWT with the updated name (signSession)
 * - Returns the new token so the client can store it (setSessionToken)
 * - The name change persists for the session's lifetime (until the JWT
 *   expires or the user logs out).
 *
 * For the super-owner: the name is hardcoded in source (auth.ts SUPER_OWNER),
 * but this endpoint overrides it in the session token. The override lasts
 * until logout. To make it permanent across logins, the name would need to
 * be stored in the database (Supabase uc_user_roles table) — but in
 * in-memory/demo mode, session-level persistence is the best we can do.
 *
 * For Supabase users: in production, this would also call Supabase Auth's
 * updateUser API to persist the name change server-side.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    const newName = typeof body.name === "string" ? body.name.trim() : "";

    if (!newName) {
      return NextResponse.json(
        { error: "Name is required." },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (newName.length > 100) {
      return NextResponse.json(
        { error: "Name must be 100 characters or fewer." },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Re-sign the session with the updated name. All other fields (userId,
    // email, role, staffId) are preserved from the current session.
    const newToken = signSession({
      userId: user.userId,
      email: user.email,
      name: newName,
      role: user.role,
      staffId: user.staffId,
    });

    return NextResponse.json(
      {
        status: "ok",
        token: newToken,
        user: {
          ...user,
          name: newName,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Profile update failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { error: message === "UNAUTHORIZED" ? "Authentication required." : message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
