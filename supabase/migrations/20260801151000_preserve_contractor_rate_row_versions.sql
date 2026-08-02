-- Refine the Contractor-rate operation expander so existing projected rows that
-- still exist are updated in place. Only projection rows that truly disappear
-- are deleted. This preserves per-row optimistic-concurrency revisions.

begin;

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
  v_projected_row jsonb;
  v_id text;
  v_contractor_id text;
  v_subcategory_id text;
  v_affected_ids text[] := array[]::text[];
  v_deleted_contractor_ids text[] := array[]::text[];
  v_projection_ids text[] := array[]::text[];
  v_rate_delete_ids text[] := array[]::text[];
  v_projection_rows jsonb := '[]'::jsonb;
  v_contractor_projection jsonb;
  v_preserved_rate_rows jsonb := '[]'::jsonb;
  v_output jsonb := '[]'::jsonb;
  v_existing_id text;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';
  end if;

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

      -- Delete only old mapped rows no longer represented by the canonical
      -- capabilities. Rows whose stable ID still exists are ordinary upserts.
      for v_existing_id in
        select r.id
          from public."entity_master_contractorRates" r
         where r.workspace_id = p_workspace_id
           and r.data ->> 'contractor_id' = v_contractor_id
           and nullif(btrim(coalesce(r.data ->> 'work_subcategory_id', '')), '') is not null
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
    return p_operations;
  end if;

  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    if v_op ->> 'collection' <> 'master.contractorRates' then
      v_output := v_output || jsonb_build_array(v_op);
      continue;
    end if;

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

comment on function public.uc_expand_contractor_rate_operations(text, jsonb) is
  'Injects canonical Contractor rate projection writes while deleting only projection rows that actually disappear, preserving stable row revisions.';

commit;
