-- Isolated fixtures; the final rollback preserves all production data.
BEGIN;
DO $test$
DECLARE
  remaining jsonb := '[{"id":"audit-delete-keep","name":"Standard"}]';
BEGIN
  INSERT INTO public.entity_work_definitions(collection,id,workspace_id,data) VALUES
    ('master.workCategories','audit-delete-cat','taxonomy-audit-test','{"id":"audit-delete-cat","name":"Category"}'),
    ('master.workSubcategories','audit-delete-sub','taxonomy-audit-test','{"id":"audit-delete-sub","category_id":"audit-delete-cat","name":"Work","work_types":[{"id":"audit-delete-keep","name":"Standard"},{"id":"audit-delete-old","name":"Old"}]}');
  INSERT INTO public."entity_auditLog"(id,workspace_id,data) VALUES
    ('audit-delete-log','taxonomy-audit-test','{"id":"audit-delete-log","after":{"work_type_id":"audit-delete-old"}}');
  INSERT INTO public.entity_master_contractors(id,workspace_id,data) VALUES
    ('audit-delete-contractor','taxonomy-audit-test','{"id":"audit-delete-contractor","work_capabilities":[{"subcategory_id":"audit-delete-sub","work_type_rates":[{"work_type_id":"audit-delete-old","material_rate":10,"labour_rate":5}]}]}');
  BEGIN
    UPDATE public.entity_work_definitions SET data=jsonb_set(data,'{work_types}',remaining)
      WHERE workspace_id='taxonomy-audit-test' AND collection='master.workSubcategories' AND id='audit-delete-sub';
    RAISE EXCEPTION 'Live reference was not protected';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  DELETE FROM public.entity_master_contractors WHERE workspace_id='taxonomy-audit-test' AND id='audit-delete-contractor';
  UPDATE public.entity_work_definitions SET data=jsonb_set(data,'{work_types}',remaining)
    WHERE workspace_id='taxonomy-audit-test' AND collection='master.workSubcategories' AND id='audit-delete-sub';
  IF (SELECT data->'after'->>'work_type_id' FROM public."entity_auditLog" WHERE workspace_id='taxonomy-audit-test' AND id='audit-delete-log') <> 'audit-delete-old'
    THEN RAISE EXCEPTION 'Audit history was changed'; END IF;
END;
$test$;
ROLLBACK;
