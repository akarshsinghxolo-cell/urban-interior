import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { normalizeRoleKey, roleLabel } from "../staff-operations";
import { getSupabaseAdminClient, getSupabaseAuthClient, isSupabaseConfigured } from "../../supabase/server";

export const AUTH_COOKIE = "uc_session";
export const AUTH_REFRESH_COOKIE = "uc_auth_refresh";
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

type SupabaseAuthUser = {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
};

export type RenewableAuthSession = {
    user: Omit<AuthenticatedUser, "expiresAt">;
    refreshToken: string;
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

function sign(value: string) {
    return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function signSession(user: Omit<AuthenticatedUser, "expiresAt">) {
    const data: Token = {
        ...user,
        exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
        v: 1,
    };
    const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
    return `${payload}.${sign(payload)}`;
}

export function verifySession(token?: string | null): AuthenticatedUser | null {
    if (!token) return null;
    const [payload, provided] = token.split(".");
    if (!payload || !provided) return null;
    const expected = sign(payload);
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Token;
        if (
            data.v !== 1 ||
            data.exp <= Math.floor(Date.now() / 1000) ||
            !data.userId ||
            !data.email ||
            !data.name ||
            !data.role
        ) {
            return null;
        }
        return {
            userId: data.userId,
            email: data.email,
            name: data.name,
            role: data.role,
            staffId: data.staffId,
            expiresAt: data.exp * 1000,
        };
    } catch {
        return null;
    }
}

// The application token remains deliberately short-lived. Long-lived browser
// access comes from the rotating Supabase refresh token, never from extending
// this bearer token for weeks or months.
export const SESSION_TTL = 28800;
const REFRESH_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const WORKSPACE_ID = process.env.UC_WORKSPACE_ID || "default";

export const sessionCookie = (value: string) => ({
    name: AUTH_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL,
});

export const refreshTokenCookie = (value: string) => ({
    name: AUTH_REFRESH_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/auth",
    maxAge: REFRESH_COOKIE_MAX_AGE,
});

export const expiredSessionCookie = () => ({
    name: AUTH_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
});

export const expiredRefreshTokenCookie = () => ({
    name: AUTH_REFRESH_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/auth",
    maxAge: 0,
});

export const AUTH_HEADER = "authorization";

/** Extract a session token from Authorization: Bearer, falling back to cookie. */
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

export function extractRefreshToken(request: NextRequest): string | null {
    return request.cookies.get(AUTH_REFRESH_COOKIE)?.value?.trim() || null;
}

function asRDashRole(value: string): RDashRole {
    return roleLabel(normalizeRoleKey(value)) as RDashRole;
}

async function authorizedUserFromSupabase(user: SupabaseAuthUser): Promise<Omit<AuthenticatedUser, "expiresAt">> {
    if (!user.id || !user.email) {
        throw new AuthAccessError("The Supabase session is missing its user identity.", 401, "INVALID_AUTH_SESSION");
    }

    const admin = getSupabaseAdminClient();
    const { data: staffRow, error: staffError } = await admin
        .from("entity_master_staff")
        .select("id,data")
        .eq("workspace_id", WORKSPACE_ID)
        .eq("auth_user_id_gen" as never, user.id)
        .maybeSingle();
    if (staffError) {
        throw new Error(`Urban Castle indexed staff lookup failed: ${staffError.message}`);
    }

    if (staffRow) {
        const staffRowTyped = staffRow as {
            id: string;
            data: string | Record<string, unknown>;
        };
        const staffData = typeof staffRowTyped.data === "string"
            ? JSON.parse(staffRowTyped.data)
            : staffRowTyped.data;
        const status = String(staffData.status || "active");

        if (status === "active") {
            return {
                userId: user.id,
                email: user.email.toLowerCase(),
                name: String(staffData.name || user.user_metadata?.full_name || user.email),
                role: asRDashRole(String(staffData.role_key || staffData.role || "FIELD_STAFF")),
                staffId: staffRowTyped.id,
            };
        }
        if (status === "pending") {
            throw new AuthAccessError(
                "Your Urban Castle login request is waiting for owner approval.",
                403,
                "PENDING_APPROVAL",
            );
        }
        if (status === "rejected") {
            throw new AuthAccessError(
                "Your Urban Castle login request was rejected by the owner.",
                403,
                "ACCESS_REJECTED",
            );
        }
        if (status === "inactive") {
            throw new AuthAccessError(
                "This Urban Castle account is inactive. Contact the owner.",
                403,
                "ACCESS_INACTIVE",
            );
        }
    }

    // Compatibility mapping while all approved users are moved onto Staff rows.
    const { data: rows, error: mappingError } = await admin
        .from("uc_user_roles")
        .select("role,staff_id,display_name,status")
        .eq("user_id", user.id)
        .in("status", ["active", "pending", "rejected", "inactive"]);
    if (mappingError) {
        throw new Error(`Urban Castle Supabase role lookup failed: ${mappingError.message}`);
    }

    const activeRow = rows?.find((candidate: { status?: string }) => candidate.status === "active");
    if (activeRow?.role) {
        return {
            userId: user.id,
            email: user.email.toLowerCase(),
            name: activeRow.display_name || String(user.user_metadata?.full_name || user.email),
            role: asRDashRole(activeRow.role),
            staffId: activeRow.staff_id || undefined,
        };
    }

    const pendingRow = rows?.find((candidate: { status?: string }) => candidate.status === "pending");
    if (pendingRow) {
        throw new AuthAccessError(
            "Your Urban Castle login request is waiting for owner approval.",
            403,
            "PENDING_APPROVAL",
        );
    }
    const rejectedRow = rows?.find((candidate: { status?: string }) => candidate.status === "rejected");
    if (rejectedRow) {
        throw new AuthAccessError(
            "Your Urban Castle login request was rejected by the owner.",
            403,
            "ACCESS_REJECTED",
        );
    }
    const inactiveRow = rows?.find((candidate: { status?: string }) => candidate.status === "inactive");
    if (inactiveRow) {
        throw new AuthAccessError(
            "This Urban Castle account is inactive. Contact the owner.",
            403,
            "ACCESS_INACTIVE",
        );
    }
    throw new AuthAccessError(
        "This authenticated account has no Urban Castle role assignment yet.",
        403,
        "NO_ROLE_ASSIGNMENT",
    );
}

async function supabaseCredentialSession(email: string, password: string): Promise<RenewableAuthSession | null> {
    if (!isSupabaseConfigured()) {
        throw new Error("Supabase Auth is not fully configured.");
    }

    const auth = getSupabaseAuthClient();
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error || !data.user?.id || !data.user.email || !data.session?.refresh_token) return null;
    return {
        user: await authorizedUserFromSupabase(data.user),
        refreshToken: data.session.refresh_token,
    };
}

async function supabaseCredentials(
    email: string,
    password: string,
): Promise<Omit<AuthenticatedUser, "expiresAt"> | null> {
    return (await supabaseCredentialSession(email, password))?.user || null;
}

/**
 * Every account, including Owner accounts, authenticates through Supabase Auth.
 * Authorization is then derived from the linked active Staff record or the
 * temporary role-mapping compatibility table.
 */
export async function authenticateCredentials(
    emailInput: string,
    password: string,
): Promise<Omit<AuthenticatedUser, "expiresAt"> | null> {
    const email = emailInput.trim().toLowerCase();
    if (!email || !password) return null;
    return supabaseCredentials(email, password);
}

/** Sign in and preserve Supabase's rotating refresh token in a server-only cookie. */
export async function authenticateCredentialsWithSession(
    emailInput: string,
    password: string,
): Promise<RenewableAuthSession | null> {
    const email = emailInput.trim().toLowerCase();
    if (!email || !password) return null;
    return supabaseCredentialSession(email, password);
}

/**
 * Rotate a Supabase refresh token and re-read the current Staff authorization.
 * This means role deactivation/rejection takes effect on the next silent renew.
 */
export async function refreshAuthenticatedSession(refreshToken: string): Promise<RenewableAuthSession> {
    if (!refreshToken) throw new AuthAccessError("The renewable browser session is missing.", 401, "MISSING_REFRESH_TOKEN");
    const auth = getSupabaseAuthClient();
    const { data, error } = await auth.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.user?.id || !data.user.email || !data.session?.refresh_token) {
        throw new AuthAccessError("The renewable browser session has expired or was revoked.", 401, "REFRESH_REJECTED");
    }
    return {
        user: await authorizedUserFromSupabase(data.user),
        refreshToken: data.session.refresh_token,
    };
}

export async function requireSession(request?: NextRequest) {
    let token = extractSessionToken(request);
    if (!token && !request) {
        token = (await cookies()).get(AUTH_COOKIE)?.value ?? null;
    }
    const user = verifySession(token);
    if (!user) throw new Error("UNAUTHORIZED");
    return user;
}
