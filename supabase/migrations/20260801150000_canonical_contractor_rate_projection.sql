-- Make master.contractorRates a database-maintained compatibility/read
-- projection of the canonical Contractor work_capabilities array.
--
-- The application still exposes the collection to legacy screens, but any
-- workspace commit that creates, updates or deletes a Contractor now rewrites
-- the mapped rate rows inside the SAME atomic workspace revision. Custom legacy
-- rows without work_subcategory_id are preserved until deliberately removed.

begin;

create or replace function public.uc_contractor_rate_projection_rows(
  p_workspace_id text,
  p_contractor jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_rows jsonb := '[]'::jsonb;
  v_capabilities jsonb;
  v_capability jsonb;
  v_article_rates jsonb;
  v_article_rate jsonb;
  v_contractor_id text := nullif(btrim(coalesce(p_contractor ->> 'id', '')), '');
  v_subcategory_id text;
  v_subcategory_name text;
  v_unit_id text;
  v_article_id text;
  v_article_name text;
  v_scoped_material_id text;
  v_scoped_unit_id text;
  v_rate jsonb;
  v_has_default_rate boolean;
begin
  if v_contractor_id is null then
    return v_rows;
  end if;

  v_capabilities := case
    when jsonb_typeof(p_contractor -> 'work_capabilities') = 'array'
      then p_contractor -> 'work_capabilities'
    when jsonb_typeof(p_contractor -> 'capabilities_v2') = 'array'
      then p_contractor -> 'capabilities_v2'
    else '[]'::jsonb
  end;

  for v_capability in select value from jsonb_array_elements(v_capabilities)
  loop
    v_subcategory_id := nullif(btrim(coalesce(
      v_capability ->> 'subcategory_id',
      v_capability ->> 'work_subcategory_id',
      ''
    )), '');
    if v_subcategory_id is null then
      continue;
    end if;

    v_subcategory_name := nullif(btrim(coalesce(
      v_capability ->> 'subcategory_name',
      v_capability ->> 'work_subcategory_name',
      ''
    )), '');
    v_unit_id := nullif(btrim(coalesce(v_capability ->> 'unit_id', '')), '');
    if v_unit_id is null then
      select nullif(btrim(coalesce(s.data ->> 'unit_id', '')), '')
        into v_unit_id
        from public."entity_master_workSubcategories" s
       where s.workspace_id = p_workspace_id
         and s.id = v_subcategory_id
       limit 1;
    end if;

    v_article_rates := case
      when jsonb_typeof(v_capability -> 'article_rates') = 'array'
        then v_capability -> 'article_rates'
      else '[]'::jsonb
    end;

    v_has_default_rate :=
      nullif(v_capability -> 'labour_rate', 'null'::jsonb) is not null
      or nullif(v_capability -> 'with_material_rate', 'null'::jsonb) is not null;

    if v_has_default_rate or jsonb_array_length(v_article_rates) = 0 then
      v_rate := coalesce(
        nullif(v_capability -> 'labour_rate', 'null'::jsonb),
        nullif(v_capability -> 'with_material_rate', 'null'::jsonb),
        '0'::jsonb
      );
      v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', 'crate-' || v_contractor_id || '-' || v_subcategory_id,
        'contractor_id', v_contractor_id,
        'trade', coalesce(v_subcategory_name, 'Contractor rate'),
        'rate', v_rate,
        'unit_id', v_unit_id,
        'work_subcategory_id', v_subcategory_id,
        'work_subcategory_name', v_subcategory_name,
        'labour_rate', nullif(v_capability -> 'labour_rate', 'null'::jsonb),
        'with_material_rate', nullif(v_capability -> 'with_material_rate', 'null'::jsonb)
      )));
    end if;

    for v_article_rate in select value from jsonb_array_elements(v_article_rates)
    loop
      v_article_id := nullif(btrim(coalesce(v_article_rate ->> 'article_id', '')), '');
      if v_article_id is null then
        continue;
      end if;

      v_article_name := nullif(btrim(coalesce(v_article_rate ->> 'article_name', '')), '');
      v_scoped_material_id := null;
      v_scoped_unit_id := null;
      select m.id, nullif(btrim(coalesce(m.data ->> 'unit_id', '')), '')
        into v_scoped_material_id, v_scoped_unit_id
        from public."entity_master_subcategoryArticleMap" m
       where m.workspace_id = p_workspace_id
         and m.data ->> 'work_required_id' = v_subcategory_id
         and m.data ->> 'article_id' = v_article_id
       limit 1;

      if v_article_name is null then
        select nullif(btrim(coalesce(a.data ->> 'name', '')), '')
          into v_article_name
          from public.entity_master_articles a
         where a.workspace_id = p_workspace_id
           and a.id = v_article_id
         limit 1;
      end if;

      v_rate := coalesce(
        nullif(v_article_rate -> 'labour_rate', 'null'::jsonb),
        nullif(v_article_rate -> 'with_material_rate', 'null'::jsonb),
        '0'::jsonb
      );
      v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', 'crate-' || v_contractor_id || '-' || v_subcategory_id || '-' || v_article_id,
        'contractor_id', v_contractor_id,
        'trade', coalesce(v_subcategory_name, 'Contractor rate') || ' · ' || coalesce(v_article_name, 'Material'),
        'rate', v_rate,
        'unit_id', coalesce(v_scoped_unit_id, v_unit_id),
        'work_subcategory_id', v_subcategory_id,
        'work_subcategory_name', v_subcategory_name,
        'article_id', v_article_id,
        'article_name', v_article_name,
        'work_required_article_id', v_scoped_material_id,
        'labour_rate', nullif(v_article_rate -> 'labour_rate', 'null'::jsonb),
        'with_material_rate', nullif(v_article_rate -> 'with_material_rate', 'null'::jsonb)
      )));
    end loop;
  end loop;

  return v_rows;
end;
$function$;

revoke all on function public.uc_contractor_rate_projection_rows(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.uc_expand_contractor_rate_operations(
  p_workspace_id text,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_op jsonb;
  v_row jsonb;
  v_rate_row jsonb;
  v_id text;
  v_contractor_id text;
  v_subcategory_id text;
  v_affected_ids text[] := array[]::text[];
  v_deleted_contractor_ids text[] := array[]::text[];
  v_rate_delete_ids text[] := array[]::text[];
  v_projection_rows jsonb := '[]'::jsonb;
  v_preserved_rate_rows jsonb := '[]'::jsonb;
  v_output jsonb := '[]'::jsonb;
  v_existing_id text;
  v_has_rate_operation boolean := false;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';
  end if;

  -- First identify every Contractor touched by this workspace commit and build
  -- its new canonical rate projection.
  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    if v_op ->> 'collection' <> 'master.contractors' then
      continue;
    end if;

    for v_row in select value from jsonb_array_elements(coalesce(v_op -> 'upsert', '[]'::jsonb))
    loop
      v_contractor_id := nullif(btrim(coalesce(v_row ->> 'id', '')), '');
      if v_contractor_id is null then continue; end if;
      if not (v_contractor_id = any(v_affected_ids)) then
        v_affected_ids := array_append(v_affected_ids, v_contractor_id);
      end if;

      v_projection_rows := v_projection_rows
        || public.uc_contractor_rate_projection_rows(p_workspace_id, v_row);

      -- Mapped compatibility rows are fully replaceable from the canonical
      -- profile. Unmapped legacy custom rows remain untouched.
      for v_existing_id in
        select r.id
          from public."entity_master_contractorRates" r
         where r.workspace_id = p_workspace_id
           and r.data ->> 'contractor_id' = v_contractor_id
           and nullif(btrim(coalesce(r.data ->> 'work_subcategory_id', '')), '') is not null
      loop
        if not (v_existing_id = any(v_rate_delete_ids)) then
          v_rate_delete_ids := array_append(v_rate_delete_ids, v_existing_id);
        end if;
      end loop;
    end loop;

    for v_id in select value #>> '{}' from jsonb_array_elements(coalesce(v_op -> 'deleteIds', '[]'::jsonb))
    loop
      v_contractor_id := nullif(btrim(coalesce(v_id, '')), '');
      if v_contractor_id is null then continue; end if;
      if not (v_contractor_id = any(v_affected_ids)) then
        v_affected_ids := array_append(v_affected_ids, v_contractor_id);
      end if;
      if not (v_contractor_id = any(v_deleted_contractor_ids)) then
        v_deleted_contractor_ids := array_append(v_deleted_contractor_ids, v_contractor_id);
      end if;

      -- A deleted Contractor cannot retain even a legacy custom rate row.
      for v_existing_id in
        select r.id
          from public."entity_master_contractorRates" r
         where r.workspace_id = p_workspace_id
           and r.data ->> 'contractor_id' = v_contractor_id
      loop
        if not (v_existing_id = any(v_rate_delete_ids)) then
          v_rate_delete_ids := array_append(v_rate_delete_ids, v_existing_id);
        end if;
      end loop;
    end loop;
  end loop;

  if cardinality(v_affected_ids) = 0 then
    return p_operations;
  end if;

  -- Preserve unrelated/custom rate writes supplied by the caller, but discard
  -- mapped rows for affected Contractors so only the canonical projection wins.
  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    if v_op ->> 'collection' <> 'master.contractorRates' then
      v_output := v_output || jsonb_build_array(v_op);
      continue;
    end if;

    v_has_rate_operation := true;
    for v_rate_row in select value from jsonb_array_elements(coalesce(v_op -> 'upsert', '[]'::jsonb))
    loop
      v_contractor_id := nullif(btrim(coalesce(v_rate_row ->> 'contractor_id', '')), '');
      v_subcategory_id := nullif(btrim(coalesce(v_rate_row ->> 'work_subcategory_id', '')), '');
      if v_contractor_id = any(v_deleted_contractor_ids) then
        continue;
      end if;
      if v_contractor_id = any(v_affected_ids) and v_subcategory_id is not null then
        continue;
      end if;
      v_preserved_rate_rows := v_preserved_rate_rows || jsonb_build_array(v_rate_row);
    end loop;

    for v_id in select value #>> '{}' from jsonb_array_elements(coalesce(v_op -> 'deleteIds', '[]'::jsonb))
    loop
      if not (v_id = any(v_rate_delete_ids)) then
        v_rate_delete_ids := array_append(v_rate_delete_ids, v_id);
      end if;
    end loop;
  end loop;

  v_output := v_output || jsonb_build_array(jsonb_build_object(
    'collection', 'master.contractorRates',
    'table', 'entity_master_contractorRates',
    'upsert', v_preserved_rate_rows || v_projection_rows,
    'deleteIds', to_jsonb(v_rate_delete_ids)
  ));

  return v_output;
end;
$function$;

revoke all on function public.uc_expand_contractor_rate_operations(text, jsonb)
  from public, anon, authenticated, service_role;

-- Replace the validating public wrapper from the persistence-convergence
-- migration so it also injects the canonical rate projection before delegating
-- to the sealed atomic implementation.
create or replace function public.commit_workspace_operations(
  p_workspace_id text,
  p_expected_workspace_revision integer,
  p_operations jsonb,
  p_expected_row_versions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_op jsonb;
  v_collection text;
  v_table text;
  v_expected_table text;
  v_operations jsonb;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';
  end if;

  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    v_collection := nullif(btrim(v_op ->> 'collection'), '');
    v_table := nullif(btrim(v_op ->> 'table'), '');
    if v_collection is null or v_table is null then
      raise exception using errcode = '22023', message = 'INVALID_COLLECTION';
    end if;
    v_expected_table := 'entity_' || replace(v_collection, '.', '_');
    if v_table is distinct from v_expected_table
       or v_expected_table !~ '^entity_[A-Za-z0-9_]+$'
       or to_regclass(format('public.%I', v_expected_table)) is null then
      raise exception using errcode = '22023', message = 'INVALID_COLLECTION_TABLE';
    end if;
  end loop;

  v_operations := public.uc_expand_contractor_rate_operations(p_workspace_id, p_operations);
  perform set_config('uc.write_source', 'workspace-commit', true);

  return public.commit_workspace_operations_internal(
    p_workspace_id,
    p_expected_workspace_revision,
    v_operations,
    coalesce(p_expected_row_versions, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.commit_workspace_operations(text, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_workspace_operations(text, integer, jsonb, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- One-time live-data convergence.
-- ---------------------------------------------------------------------------
-- Existing work_capabilities pre-date the canonical store policy, so rebuild
-- mapped rate rows now. Then advance the workspace to a fresh baseline revision
-- so already-open clients do one safe reload and cannot retain a stale empty
-- contractorRates collection.
do $backfill$
declare
  v_workspace record;
  v_contractor record;
  v_projection jsonb;
  v_rate jsonb;
  v_keep_ids text[];
  v_rate_id text;
  v_current_revision integer;
  v_next_revision integer;
begin
  for v_workspace in
    select id, workspace_id, revision
      from public.entity_workspace_revision
      for update
  loop
    v_keep_ids := array[]::text[];

    for v_contractor in
      select id, data
        from public.entity_master_contractors
       where workspace_id = v_workspace.workspace_id
    loop
      v_projection := public.uc_contractor_rate_projection_rows(
        v_workspace.workspace_id,
        v_contractor.data
      );
      for v_rate in select value from jsonb_array_elements(v_projection)
      loop
        v_rate_id := v_rate ->> 'id';
        if not (v_rate_id = any(v_keep_ids)) then
          v_keep_ids := array_append(v_keep_ids, v_rate_id);
        end if;
        insert into public."entity_master_contractorRates" (
          id, workspace_id, revision, updated_at, updated_by, data
        ) values (
          v_rate_id,
          v_workspace.workspace_id,
          0,
          now(),
          'contractor-rate-projection',
          v_rate
        )
        on conflict (id) do update set
          workspace_id = excluded.workspace_id,
          revision = public."entity_master_contractorRates".revision + 1,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          data = excluded.data;
      end loop;
    end loop;

    delete from public."entity_master_contractorRates" r
     where r.workspace_id = v_workspace.workspace_id
       and nullif(btrim(coalesce(r.data ->> 'work_subcategory_id', '')), '') is not null
       and not (r.id = any(v_keep_ids));

    v_current_revision := v_workspace.revision;
    v_next_revision := v_current_revision + 1;

    insert into public.entity_workspace_change_batches (
      workspace_id, revision, operations, row_versions, is_baseline, created_at
    ) values (
      v_workspace.workspace_id,
      v_next_revision,
      '[]'::jsonb,
      '{}'::jsonb,
      true,
      now()
    );

    update public.entity_workspace_revision
       set revision = v_next_revision,
           updated_at = now()
     where id = v_workspace.id;
  end loop;
end;
$backfill$;

comment on function public.uc_contractor_rate_projection_rows(text, jsonb) is
  'Builds legacy/read contractorRates rows from canonical Contractor work_capabilities.';
comment on function public.uc_expand_contractor_rate_operations(text, jsonb) is
  'Injects Contractor rate projection writes/deletes into the same atomic workspace operation batch as Contractor profile changes.';

commit;
