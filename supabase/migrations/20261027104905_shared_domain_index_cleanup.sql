BEGIN;
SET LOCAL lock_timeout = '5s';

-- Expansion added an index already supplied by phase one. Keep the original
-- index, including all FK dependencies; remove only the unused duplicate.
DO $$
BEGIN
  IF to_regclass('public.s2_1ce0b1450d6833b31a0c9a70') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT FROM pg_index redundant
    JOIN pg_index retained ON retained.indexrelid = 'public.sd_44ff63571de21bad4b16'::regclass
    WHERE redundant.indexrelid = 'public.s2_1ce0b1450d6833b31a0c9a70'::regclass
      AND redundant.indrelid = retained.indrelid
      AND retained.indisvalid AND retained.indisunique AND redundant.indisunique
      AND redundant.indkey = retained.indkey
      AND redundant.indclass = retained.indclass
      AND redundant.indcollation = retained.indcollation
      AND redundant.indoption = retained.indoption
      AND redundant.indpred IS NULL AND retained.indpred IS NULL
      AND redundant.indexprs IS NULL AND retained.indexprs IS NULL
  ) OR EXISTS (
    SELECT FROM pg_depend
    WHERE refclassid = 'pg_class'::regclass
      AND refobjid = 'public.s2_1ce0b1450d6833b31a0c9a70'::regclass
  ) THEN
    RAISE EXCEPTION 'Commercial document index cleanup preconditions failed';
  END IF;
END $$;

DROP INDEX IF EXISTS public.s2_1ce0b1450d6833b31a0c9a70;
COMMIT;
