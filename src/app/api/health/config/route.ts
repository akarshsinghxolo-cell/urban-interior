import { NextResponse } from "next/server";

/**
 * GET /api/health/config
 * Returns the configuration health of the workspace. Used by the sign-in page
 * to surface configuration issues (missing session secret, Supabase not
 * configured) as actionable UI instead of generic "error" messages.
 *
 * Public endpoint — does NOT require auth (it's needed before login).
 */
export function GET() {
  const sessionSecret = process.env.UC_SESSION_SECRET;
  const hasSessionSecret = Boolean(sessionSecret && sessionSecret.length >= 32);
  const usingDevFallback = !hasSessionSecret && process.env.NODE_ENV !== "production";

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  const supabaseConfigured = Boolean(
    supabaseUrl &&
      supabaseKey &&
      !supabaseUrl.includes("placeholder") &&
      !supabaseKey.includes("placeholder") &&
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl),
  );

  const ownerEmail = process.env.UC_OWNER_EMAIL || "akarshsingh4@gmail.com";

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || "development",
    config: {
      sessionSecret: hasSessionSecret
        ? "configured"
        : usingDevFallback
          ? "dev-fallback"
          : "missing",
      supabase: supabaseConfigured ? "configured" : "in-memory-fallback",
      workspaceId: process.env.UC_WORKSPACE_ID || "default",
      ownerEmail,
    },
    warnings: [
      ...(!hasSessionSecret && !usingDevFallback
        ? ["UC_SESSION_SECRET is missing — sign-in will fail in production."]
        : []),
      ...(!hasSessionSecret && usingDevFallback
        ? ["Using dev-fallback session secret. Set UC_SESSION_SECRET for production."]
        : []),
      ...(!supabaseConfigured
        ? ["Supabase not configured — app runs on in-memory seed data (resets on restart)."]
        : []),
    ],
    dataLayer: supabaseConfigured ? "supabase" : "in-memory",
  });
}
