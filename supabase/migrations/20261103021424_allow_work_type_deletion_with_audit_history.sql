CREATE OR REPLACE FUNCTION public.uc_taxonomy_reference_table(target_workspace_id text, target_id text, definition_table regclass, definition_id text, definition_collection text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  candidate record;
  found_reference boolean;
begin
  for candidate in
    select c.oid::regclass as table_ref, c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      -- Work-type snapshots are history, not live references. Keep category/subcategory deletion rules unchanged.
      and not (c.relname = 'entity_auditLog'
        and definition_collection = 'master.workSubcategories'
        and target_id <> definition_id)
      and c.relname like 'entity\_%' escape '\'
      and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attname = 'data' and not a.attisdropped)
      and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attname = 'workspace_id' and not a.attisdropped)
      and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attname = 'id' and not a.attisdropped)
  loop
    if candidate.table_ref = definition_table then
      execute format(
        'select exists (select 1 from %s where workspace_id = $1 and NOT (id = $3 and collection = $4) and jsonb_path_exists(data, ''$.** ? (@ == $target)'', jsonb_build_object(''target'', to_jsonb($2))))',
        candidate.table_ref
      ) into found_reference using target_workspace_id, target_id, definition_id, definition_collection;
    else
      execute format(
        'select exists (select 1 from %s where workspace_id = $1 and jsonb_path_exists(data, ''$.** ? (@ == $target)'', jsonb_build_object(''target'', to_jsonb($2))))',
        candidate.table_ref
      ) into found_reference using target_workspace_id, target_id;
    end if;

    if found_reference then
      return candidate.relname;
    end if;
  end loop;
  return null;
end;
$function$
;
