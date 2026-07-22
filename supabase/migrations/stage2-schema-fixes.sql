-- ============================================================================
-- Stage 2 — DB Schema Fixes (SELF-CONTAINED, idempotent, safe to re-run)
-- ============================================================================
-- ROOT CAUSE NOTE:
--   The add-fk-constraints-complete.sql migration (188 _gen columns + 187 FKs)
--   was committed to git but NEVER run on the live Supabase DB. As a result,
--   NO _gen columns exist. This file creates ONLY the columns needed for the
--   Stage 2 fixes (abandoned_contractor_id_gen + auth_user_id_gen), plus the
--   RPC function. The full 188-column FK migration can be run separately.
--
-- HOW TO RUN:
--   Paste this ENTIRE file into Supabase Dashboard → SQL Editor → Run.
--   Fully idempotent (IF NOT EXISTS) — safe to re-run.
--
-- NOTE on CONCURRENTLY:
--   If you get "CREATE INDEX CONCURRENTLY cannot run inside a transaction
--   block", remove the word CONCURRENTLY from the index statements.
-- ============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2.1  Missing FK: entity_workOrders.abandoned_contractor_id  (H12)        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Step 1: Create the generated column (doesn't exist on live DB)
ALTER TABLE "entity_workOrders" ADD COLUMN IF NOT EXISTS "abandoned_contractor_id_gen" text
    GENERATED ALWAYS AS (NULLIF(data->>'abandoned_contractor_id', '')) STORED;

-- Step 2: Drop any existing constraint (safe — no-op if not present)
ALTER TABLE "entity_workOrders" DROP CONSTRAINT IF EXISTS "entity_workOrders_abandoned_contractor_id_fkey";

-- Step 3: Add the FK constraint (references entity_master_contractors which EXISTS)
ALTER TABLE "entity_workOrders" ADD CONSTRAINT "entity_workOrders_abandoned_contractor_id_fkey"
    FOREIGN KEY ("abandoned_contractor_id_gen") REFERENCES "entity_master_contractors"(id) NOT VALID;

-- Step 4: Index the _gen column for FK enforcement performance
CREATE INDEX IF NOT EXISTS "idx_entity_workOrders_abandoned_contractor_id_gen"
    ON "entity_workOrders" ("abandoned_contractor_id_gen");

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2.3  auth_user_id_gen column + index on entity_master_staff  (H1)        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- The login flow (auth.ts) uses this for O(1) staff lookup at sign-in.
-- Currently loads ALL staff rows and filters in JS — O(N) and DOS-able.

ALTER TABLE "entity_master_staff" ADD COLUMN IF NOT EXISTS "auth_user_id_gen" text
    GENERATED ALWAYS AS (NULLIF(data->>'auth_user_id', '')) STORED;

CREATE INDEX IF NOT EXISTS "idx_entity_master_staff_auth_user_id"
    ON "entity_master_staff" ("auth_user_id_gen");

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2.4  RPC: get_auth_user_by_email  (H22 — O(1) signup user lookup)        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- The signup flow (auth-users.ts:findAuthUserByEmail) paginates ALL auth users
-- via listUsers — O(N) and DOS-able. This RPC does an O(1) lookup using the
-- unique index on auth.users.email. SECURITY DEFINER required because
-- auth.users is not readable via anon/authenticated roles.

CREATE OR REPLACE FUNCTION public.get_auth_user_by_email(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  -- NOTE: auth.users uses raw_user_meta_data (not user_metadata, which is the
  -- SDK's JS alias). raw_app_meta_data is the app metadata column.
  SELECT json_build_object(
    'id', u.id::text,
    'email', u.email,
    'email_confirmed_at', u.email_confirmed_at,
    'created_at', u.created_at,
    'user_metadata', u.raw_user_meta_data
  )
  INTO result
  FROM auth.users u
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
  RETURN result;
END;
$$;

-- Allow only the service role (server-side admin client) to call this.
REVOKE ALL ON FUNCTION public.get_auth_user_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_by_email(text) TO service_role;

-- ============================================================================
-- NOTE: The 188 indexes on all other _gen FK columns (Systemic #4) are
-- SKIPPED here because those columns don't exist on the live DB yet. To get
-- the full FK migration (188 _gen columns + 187 FK constraints + indexes),
-- run supabase/migrations/add-fk-constraints-complete.sql separately AFTER
-- this file. That migration is large (~2000 statements) — run it in the SQL
-- Editor in one go, or in batches if it times out.
-- ============================================================================
