-- Validate the completed transaction, not the intermediate catalogue update
-- before contractor and customer references have been reassigned.
DROP TRIGGER s2_bb86a6c0d82f1ad48f0fbc6a ON public.entity_work_definitions;
DROP TRIGGER s2_b8e62b69c872b5a4b02df450 ON public.entity_work_definitions;
CREATE CONSTRAINT TRIGGER s2_bb86a6c0d82f1ad48f0fbc6a
AFTER INSERT OR UPDATE ON public.entity_work_definitions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN (new.collection = 'master.workSubcategories')
EXECUTE FUNCTION public.uc_guard_work_subcategory_history();
CREATE CONSTRAINT TRIGGER s2_b8e62b69c872b5a4b02df450
AFTER DELETE ON public.entity_work_definitions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN (old.collection = 'master.workSubcategories')
EXECUTE FUNCTION public.uc_guard_work_subcategory_history();

CREATE OR REPLACE FUNCTION public.uc_taxonomy_reference_table(
  target_workspace_id text, target_id text, definition_table regclass,
  definition_id text, definition_collection text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  candidate record;
  found_reference boolean;
BEGIN
  FOR candidate IN
    SELECT c.oid::regclass AS table_ref, c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND starts_with(c.relname, 'entity_')
      -- Audit snapshots must survive deletion; they are not live associations.
      AND NOT (c.relname = 'entity_auditLog' AND definition_collection = 'master.workSubcategories')
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'data' AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'workspace_id' AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped)
  LOOP
    IF candidate.table_ref = definition_table THEN
      EXECUTE format(
        'select exists (select 1 from %s where workspace_id = $1 and NOT (id = $3 and collection = $4) and jsonb_path_exists(data, ''$.** ? (@ == $target)'', jsonb_build_object(''target'', to_jsonb($2))))', candidate.table_ref
      ) INTO found_reference USING target_workspace_id, target_id, definition_id, definition_collection;
    ELSE
      EXECUTE format(
        'select exists (select 1 from %s where workspace_id = $1 and jsonb_path_exists(data, ''$.** ? (@ == $target)'', jsonb_build_object(''target'', to_jsonb($2))))', candidate.table_ref
      ) INTO found_reference USING target_workspace_id, target_id;
    END IF;
    IF found_reference THEN RETURN candidate.relname; END IF;
  END LOOP;
  RETURN null;
END;
$$;
REVOKE ALL ON FUNCTION public.uc_taxonomy_reference_table(text,text,regclass,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uc_taxonomy_reference_table(text,text,regclass,text,text) TO service_role;
