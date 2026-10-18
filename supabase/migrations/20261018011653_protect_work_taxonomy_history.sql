create or replace function public.uc_taxonomy_reference_table(
  target_workspace_id text,
  target_id text,
  definition_table regclass,
  definition_id text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
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
      and c.relname like 'entity\_%' escape '\'
      and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attname = 'data' and not a.attisdropped)
      and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attname = 'workspace_id' and not a.attisdropped)
      and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attname = 'id' and not a.attisdropped)
  loop
    if candidate.table_ref = definition_table then
      execute format(
        'select exists (select 1 from %s where workspace_id = $1 and id <> $3 and jsonb_path_exists(data, ''$.** ? (@ == $target)'', jsonb_build_object(''target'', to_jsonb($2))))',
        candidate.table_ref
      ) into found_reference using target_workspace_id, target_id, definition_id;
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
$$;

create or replace function public.uc_guard_work_category_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  referenced_by text;
begin
  if tg_op = 'DELETE' then
    referenced_by := public.uc_taxonomy_reference_table(old.workspace_id, old.id, tg_relid, old.id);
    if referenced_by is not null then
      raise exception 'Work category % is still referenced by %. Archive it instead.', old.id, referenced_by using errcode = '23503';
    end if;
    return old;
  end if;

  if coalesce(new.data ->> 'status', 'active') not in ('active', 'archived') then
    raise exception 'Work category status must be active or archived.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.uc_guard_work_subcategory_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  referenced_by text;
  removed_work_type_id text;
  category_id text;
begin
  if tg_op = 'DELETE' then
    referenced_by := public.uc_taxonomy_reference_table(old.workspace_id, old.id, tg_relid, old.id);
    if referenced_by is not null then
      raise exception 'Work subcategory % is still referenced by %. Archive it instead.', old.id, referenced_by using errcode = '23503';
    end if;
    return old;
  end if;

  category_id := nullif(btrim(new.data ->> 'category_id'), '');
  if category_id is null or not exists (
    select 1
    from public."entity_master_workCategories" category
    where category.workspace_id = new.workspace_id and category.id = category_id
  ) then
    raise exception 'Work subcategory % must reference an existing category.', new.id using errcode = '23503';
  end if;
  if coalesce(new.data ->> 'status', 'active') not in ('active', 'archived') then
    raise exception 'Work subcategory status must be active or archived.' using errcode = '23514';
  end if;
  if jsonb_typeof(new.data -> 'work_types') <> 'array' or jsonb_array_length(new.data -> 'work_types') = 0 then
    raise exception 'Work subcategory % must keep at least one work type.', new.id using errcode = '23514';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(new.data -> 'work_types') work_type
    where coalesce(work_type ->> 'status', 'active') = 'active'
  ) then
    raise exception 'Work subcategory % must keep at least one active work type.', new.id using errcode = '23514';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(new.data -> 'work_types') work_type
    where nullif(btrim(work_type ->> 'id'), '') is null
      or nullif(btrim(work_type ->> 'name'), '') is null
      or coalesce(work_type ->> 'status', 'active') not in ('active', 'archived')
  ) then
    raise exception 'Every work type requires an id, name and valid lifecycle status.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    for removed_work_type_id in
      select old_work_type ->> 'id'
      from jsonb_array_elements(coalesce(old.data -> 'work_types', '[]'::jsonb)) old_work_type
      where not exists (
        select 1
        from jsonb_array_elements(new.data -> 'work_types') new_work_type
        where new_work_type ->> 'id' = old_work_type ->> 'id'
      )
    loop
      referenced_by := public.uc_taxonomy_reference_table(new.workspace_id, removed_work_type_id, tg_relid, new.id);
      if referenced_by is not null then
        raise exception 'Work type % is still referenced by %. Archive it instead.', removed_work_type_id, referenced_by using errcode = '23503';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists entity_master_work_categories_history_guard on public."entity_master_workCategories";
create trigger entity_master_work_categories_history_guard
before insert or update or delete on public."entity_master_workCategories"
for each row execute function public.uc_guard_work_category_history();

drop trigger if exists entity_master_work_subcategories_history_guard on public."entity_master_workSubcategories";
create trigger entity_master_work_subcategories_history_guard
before insert or update or delete on public."entity_master_workSubcategories"
for each row execute function public.uc_guard_work_subcategory_history();
