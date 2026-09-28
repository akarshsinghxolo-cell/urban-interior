import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * GET /api/health/config
 * Reports whether the canonical runtime configuration is ready. Urban Castle
 * has one server persistence architecture: Supabase/PostgreSQL. If it is not
 * configured, workspace requests fail closed rather than switching backends.
 *
 * Public endpoint — does NOT require auth (it's needed before login).
 */
export function GET() {
  const sessionSecret = process.env.UC_SESSION_SECRET;
  const hasSessionSecret = Boolean(sessionSecret && sessionSecret.length >= 32);
  const usingDevFallback = !hasSessionSecret && process.env.NODE_ENV !== "production";
  const supabaseConfigured = isSupabaseConfigured();
  const sessionConfigured = hasSessionSecret || usingDevFallback;

  const ownerEmail = process.env.UC_OWNER_EMAIL || "akarshsingh4@gmail.com";

  return NextResponse.json({
    status: sessionConfigured && supabaseConfigured ? "ok" : "misconfigured",
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || "development",
    config: {
      sessionSecret: hasSessionSecret
        ? "configured"
        : usingDevFallback
          ? "dev-fallback"
          : "missing",
      supabase: supabaseConfigured ? "configured" : "missing",
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
        ? ["Canonical Supabase configuration is incomplete — workspace requests fail closed until SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY are configured."]
        : []),
    ],
    dataLayer: "supabase",
  });
}
