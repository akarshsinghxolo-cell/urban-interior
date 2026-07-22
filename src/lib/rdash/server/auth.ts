import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { normalizeRoleKey, roleLabel } from "../staff-operations";
import { getSupabaseAdminClient, getSupabaseAuthClient, isSupabaseConfigured } from "../../supabase/server";
export const AUTH_COOKIE = "uc_session";
export type RDashRole = "Owner" | "Operations Manager" | "Field Staff" | "Sales / Telecaller" | "Procurement Staff" | "Finance" | "Accounts / Admin";
export interface AuthenticatedUser {
    userId: string;
    email: string;
    name: string;
    role: RDashRole;
    staffId?: string;
    expiresAt: number;
}
export class AuthAccessError extends Error {
    constructor(message: string, public readonly status: number, public readonly code: string) {
        super(message);
        this.name = "AuthAccessError";
    }
}
type Token = Omit<AuthenticatedUser, "expiresAt"> & {
    exp: number;
    v: 1;
};
function secret() {
    const value = process.env.UC_SESSION_SECRET;
    if (!value || value.length < 32) {
        throw new Error(
            "UC_SESSION_SECRET must contain at least 32 random characters. " +
            "Generate one with: openssl rand -base64 48",
        );
    }
    return value;
}

function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }
export function signSession(user: Omit<AuthenticatedUser, "expiresAt">) { const data: Token = { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_TTL, v: 1 }; const payload = Buffer.from(JSON.stringify(data)).toString("base64url"); return `${payload}.${sign(payload)}`; }
export function verifySession(token?: string | null): AuthenticatedUser | null { if (!token)
    return null; const [payload, provided] = token.split("."); if (!payload || !provided)
    return null; const expected = sign(payload); const a = Buffer.from(provided), b = Buffer.from(expected); if (a.length !== b.length || !timingSafeEqual(a, b))
    return null; try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Token;
    if (data.v !== 1 || data.exp <= Math.floor(Date.now() / 1000) || !data.userId || !data.email || !data.name || !data.role)
        return null;
    return { userId: data.userId, email: data.email, name: data.name, role: data.role, staffId: data.staffId, expiresAt: data.exp * 1000 };
}
catch {
    return null;
} }
export const SESSION_TTL = 28800; // 8 hours — generous for preview/iframe environments
export const sessionCookie = (value: string) => ({ name: AUTH_COOKIE, value, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL });
export const expiredSessionCookie = () => ({ name: AUTH_COOKIE, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 0 });
export const AUTH_HEADER = "authorization";
/** Extract session token from Authorization: Bearer <token> header, falling back to cookie. */
export function extractSessionToken(request?: NextRequest): string | null {
    if (request) {
        const authHeader = request.headers.get(AUTH_HEADER);
        if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
            return authHeader.slice(7).trim() || null;
        }
        const cookieVal = request.cookies.get(AUTH_COOKIE)?.value;
        if (cookieVal) return cookieVal;
    }
    return null;
}
function asRDashRole(value: string): RDashRole {
    return roleLabel(normalizeRoleKey(value)) as RDashRole;
}
async function supabaseCredentials(email: string, password: string): Promise<Omit<AuthenticatedUser, "expiresAt"> | null> {
    if (!isSupabaseConfigured()) throw new Error("Supabase Auth is not fully configured.");
    const auth = getSupabaseAuthClient();
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error || !data.user?.id || !data.user.email) return null;
    const admin = getSupabaseAdminClient();
    // FIX-DB-MERGE-001: Read from entity_master_staff (single source of truth)
    // instead of uc_user_roles + StaffProfile. The auth_user_id field in the
    // JSON data links the staff record to the Supabase auth.users table.
    const { data: staffRows, error: staffError } = await admin
        .from("entity_master_staff")
        .select("id,data")
        .eq("workspace_id", "default");
    if (staffError) throw new Error(`Urban Castle staff lookup failed: ${staffError.message}`);
    // Find the staff record whose auth_user_id matches the logged-in user
    const staffRow = (staffRows || []).find((row: any) => {
        const d = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
        return d?.auth_user_id === data.user!.id;
    });
    if (staffRow) {
        const staffData = typeof staffRow.data === "string" ? JSON.parse(staffRow.data) : staffRow.data;
        const status = staffData.status || "active";
        if (status === "active") {
            return {
                userId: data.user.id,
                email: data.user.email.toLowerCase(),
                name: staffData.name || String(data.user.user_metadata?.full_name || data.user.email),
                role: asRDashRole(staffData.role_key || staffData.role || "FIELD_STAFF"),
                staffId: staffRow.id,
            };
        }
        if (status === "pending") throw new AuthAccessError("Your Urban Castle login request is waiting for owner approval.", 403, "PENDING_APPROVAL");
        if (status === "rejected") throw new AuthAccessError("Your Urban Castle login request was rejected by the owner.", 403, "ACCESS_REJECTED");
        if (status === "inactive") throw new AuthAccessError("This Urban Castle account is inactive. Contact the owner.", 403, "ACCESS_INACTIVE");
    }
    // Fallback: check uc_user_roles for backward compat (during migration period)
    const { data: rows, error: mappingError } = await admin
        .from("uc_user_roles")
        .select("role,staff_id,display_name,status")
        .eq("user_id", data.user.id)
        .in("status", ["active", "pending", "rejected", "inactive"]);
    if (mappingError) throw new Error(`Urban Castle Supabase role lookup failed: ${mappingError.message}`);
    const activeRow = rows?.find((candidate: any) => candidate.status === "active");
    if (activeRow?.role) {
        return {
            userId: data.user.id,
            email: data.user.email.toLowerCase(),
            name: activeRow.display_name || String(data.user.user_metadata?.full_name || data.user.email),
            role: asRDashRole(activeRow.role),
            staffId: activeRow.staff_id || undefined,
        };
    }
    const pendingRow = rows?.find((candidate: any) => candidate.status === "pending");
    if (pendingRow) throw new AuthAccessError("Your Urban Castle login request is waiting for owner approval.", 403, "PENDING_APPROVAL");
    const rejectedRow = rows?.find((candidate: any) => candidate.status === "rejected");
    if (rejectedRow) throw new AuthAccessError("Your Urban Castle login request was rejected by the owner.", 403, "ACCESS_REJECTED");
    const inactiveRow = rows?.find((candidate: any) => candidate.status === "inactive");
    if (inactiveRow) throw new AuthAccessError("This Urban Castle account is inactive. Contact the owner.", 403, "ACCESS_INACTIVE");
    throw new AuthAccessError("This authenticated account has no Urban Castle role assignment yet.", 403, "NO_ROLE_ASSIGNMENT");
}
export async function authenticateCredentials(emailInput: string, password: string): Promise<Omit<AuthenticatedUser, "expiresAt"> | null> {
    const email = emailInput.trim().toLowerCase();
    if (!email || !password) return null;

    // ── Super Owner (hardcoded, no Supabase needed) ──────────────────────
    // This account always works regardless of Supabase configuration.
    // The super owner authorizes all other users via the User Approvals module.
    if (email === SUPER_OWNER.email && password === SUPER_OWNER.password) {
        return {
            userId: SUPER_OWNER.userId,
            email: SUPER_OWNER.email,
            name: SUPER_OWNER.name,
            role: "Owner" as RDashRole,
            staffId: undefined,
        };
    }

    // ── Supabase auth (for all other users) ──────────────────────────────
    // Non-owner users must exist in Supabase Auth AND have an approved role
    // assignment in the uc_user_roles table.
    return supabaseCredentials(email, password);
}

// Hardcoded super owner — always available, no database dependency.
const SUPER_OWNER = {
    userId: "super-owner",
    email: "akarshsingh4@gmail.com",
    password: "Akarsh@123.",
    name: "Akarsh Singh",
} as const;
export async function requireSession(request?: NextRequest) { let token = extractSessionToken(request); if (!token && !request) { token = (await cookies()).get(AUTH_COOKIE)?.value ?? null; } const user = verifySession(token); if (!user)
    throw new Error("UNAUTHORIZED"); return user; }
