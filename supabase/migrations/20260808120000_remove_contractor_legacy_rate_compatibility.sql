-- Remove the final Contractor legacy compatibility paths.
--
-- Canonical Contractor source of truth:
--   entity_master_contractors.data -> work_capabilities
--
-- entity_master_contractorRates remains a derived read projection only.
-- capabilities_v2 and free-form rate rows are no longer accepted as alternate
-- Contractor capability/rate sources.

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
  v_projected_row jsonb;
  v_id text;
  v_contractor_id text;
  v_affected_ids text[] := array[]::text[];
  v_deleted_contractor_ids text[] := array[]::text[];
  v_projection_ids text[] := array[]::text[];
  v_rate_delete_ids text[] := array[]::text[];
  v_projection_rows jsonb := '[]'::jsonb;
  v_contractor_projection jsonb;
  v_output jsonb := '[]'::jsonb;
  v_existing_id text;
  v_has_rate_operation boolean := false;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';
  end if;

  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    if v_op ->> 'collection' = 'master.contractorRates' then
      v_has_rate_operation := true;
      continue;
    end if;
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

      v_contractor_projection := public.uc_contractor_rate_projection_rows(
        p_workspace_id,
        v_row
      );
      v_projection_rows := v_projection_rows || v_contractor_projection;

      for v_projected_row in select value from jsonb_array_elements(v_contractor_projection)
      loop
        v_id := nullif(btrim(coalesce(v_projected_row ->> 'id', '')), '');
        if v_id is not null and not (v_id = any(v_projection_ids)) then
          v_projection_ids := array_append(v_projection_ids, v_id);
        end if;
      end loop;

      for v_existing_id in
        select r.id
          from public."entity_master_contractorRates" r
         where r.workspace_id = p_workspace_id
           and r.data ->> 'contractor_id' = v_contractor_id
      loop
        if not (v_existing_id = any(v_projection_ids))
           and not (v_existing_id = any(v_rate_delete_ids)) then
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
    if v_has_rate_operation then
      raise exception using errcode = '22023', message = 'CONTRACTOR_RATES_READ_ONLY';
    end if;
    return p_operations;
  end if;

  -- Contractor Rates are projection output, never caller input. Preserve every
  -- non-rate operation and discard any supplied rate upserts/deletes.
  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    if v_op ->> 'collection' = 'master.contractorRates' then
      continue;
    end if;
    v_output := v_output || jsonb_build_array(v_op);
  end loop;

  v_output := v_output || jsonb_build_array(jsonb_build_object(
    'collection', 'master.contractorRates',
    'table', 'entity_master_contractorRates',
    'upsert', v_projection_rows,
    'deleteIds', to_jsonb(v_rate_delete_ids)
  ));

  return v_output;
end;
$function$;

revoke all on function public.uc_expand_contractor_rate_operations(text, jsonb)
  from public, anon, authenticated, service_role;

-- Clean any historical compatibility residue that may exist in a workspace.
do $cleanup$
declare
  v_workspace record;
  v_changed integer;
  v_removed_rates integer;
  v_removed_profiles integer;
  v_next_revision integer;
begin
  for v_workspace in
    select id, workspace_id, revision
      from public.entity_workspace_revision
      for update
  loop
    update public.entity_master_contractors c
       set data = c.data - 'capabilities_v2',
           revision = c.revision + 1,
           updated_at = now(),
           updated_by = 'contractor-legacy-cleanup'
     where c.workspace_id = v_workspace.workspace_id
       and c.data ? 'capabilities_v2';
    get diagnostics v_removed_profiles = row_count;

    delete from public."entity_master_contractorRates" r
     where r.workspace_id = v_workspace.workspace_id
       and nullif(btrim(coalesce(r.data ->> 'work_subcategory_id', '')), '') is null;
    get diagnostics v_removed_rates = row_count;

    v_changed := v_removed_profiles + v_removed_rates;
    if v_changed = 0 then
      continue;
    end if;

    v_next_revision := v_workspace.revision + 1;
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
$cleanup$;

comment on function public.uc_contractor_rate_projection_rows(text, jsonb) is
  'Builds Contractor rate read rows exclusively from canonical work_capabilities.';
comment on function public.uc_expand_contractor_rate_operations(text, jsonb) is
  'Makes Contractor Rates a read-only projection: direct rate operations are rejected unless accompanied by Contractor changes, and caller-supplied rate rows are discarded in favor of canonical work_capabilities.';

commit;
