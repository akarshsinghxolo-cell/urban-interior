#!/usr/bin/env bash
# ============================================================================
# Urban Castle — Relational schema setup runner
# ============================================================================
# Applies the full relational decomposition to Supabase in the correct order:
#   1. DDL (CREATE TABLE + indexes)  — migration-relational-tables.sql
#   2. RLS policies (ENABLE RLS + per-role policies) — rls-policies.sql
#   3. (Optional) RLS test cases — rls-test-cases.sql
#
# Usage:
#   bash supabase/apply-relational-schema.sh
#
# This is a convenience wrapper. You can also paste each file manually into
# the Supabase Dashboard → SQL Editor → Run, in the order above.
# ============================================================================
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Urban Castle Relational Schema Setup ==="
echo ""
echo "This script applies 3 SQL files to your Supabase project, in order:"
echo "  1. $DIR/migration-relational-tables.sql  (DDL: CREATE TABLE + indexes)"
echo "  2. $DIR/rls-policies.sql                 (RLS: ENABLE RLS + per-role policies)"
echo "  3. $DIR/rls-test-cases.sql              (optional: verify RLS works)"
echo ""
echo "=== Option A: apply via Supabase Dashboard ==="
echo "Open Supabase Dashboard → SQL Editor → New query."
echo "Paste each file's contents and click Run, in the order above."
echo ""
echo "=== Option B: apply via psql (if you have direct access) ==="
echo "  psql \"\$DATABASE_URL\" -f $DIR/migration-relational-tables.sql"
echo "  psql \"\$DATABASE_URL\" -f $DIR/rls-policies.sql"
echo "  psql \"\$DATABASE_URL\" -f $DIR/rls-test-cases.sql   # optional"
echo ""
echo "=== Files to apply (in order): ==="
for f in migration-relational-tables.sql rls-policies.sql rls-test-cases.sql; do
  if [ -f "$DIR/$f" ]; then
    lines=$(wc -l < "$DIR/$f")
    echo "  ✓ $DIR/$f ($lines lines)"
  else
    echo "  ✗ $DIR/$f (MISSING)"
  fi
done
echo ""
echo "After applying the schema, run the blob→tables migration:"
echo "  RDASH_USE_RELATIONAL=true bun run db:migrate-relational"
echo ""
echo "Done."
