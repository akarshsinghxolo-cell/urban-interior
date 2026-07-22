-- Run this BEFORE the updated add-fk-constraints-complete.sql
-- Drops all existing FK constraints and generated columns so they can be
-- recreated with NULLIF (empty string → NULL).

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all FK constraints on entity_* tables
    FOR r IN (
        SELECT tc.constraint_name, tc.table_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name LIKE 'entity_%'
    ) LOOP
        EXECUTE format('ALTER TABLE "%s" DROP CONSTRAINT IF EXISTS %s;', r.table_name, r.constraint_name);
    END LOOP;

    -- Drop all generated columns ending in _gen on entity_* tables
    FOR r IN (
        SELECT column_name, table_name
        FROM information_schema.columns
        WHERE table_name LIKE 'entity_%'
          AND column_name LIKE '%_gen'
          AND is_generated = 'ALWAYS'
    ) LOOP
        EXECUTE format('ALTER TABLE "%s" DROP COLUMN IF EXISTS "%s";', r.table_name, r.column_name);
    END LOOP;
END $$;
