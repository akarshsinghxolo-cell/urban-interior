-- Remove authentication credential/reset fields from workspace operation payloads
-- BEFORE the sealed atomic commit implementation writes entity rows and the
-- change journal. The table trigger remains a second line of defense.

begin;

create or replace function public.uc_sanitize_workspace_operations(p_operations jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_op jsonb;
  v_row jsonb;
  v_upsert jsonb;
  v_output jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';
  end if;

  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    if v_op ->> 'collection' = 'master.staff' then
      v_upsert := '[]'::jsonb;
      for v_row in select value from jsonb_array_elements(coalesce(v_op -> 'upsert', '[]'::jsonb))
      loop
        v_upsert := v_upsert || jsonb_build_array(
          v_row - 'temporary_password' - 'force_password_change'
        );
      end loop;
      v_op := jsonb_set(v_op, '{upsert}', v_upsert, true);
    end if;
    v_output := v_output || jsonb_build_array(v_op);
  end loop;

  return v_output;
end;
$function$;

revoke all on function public.uc_sanitize_workspace_operations(jsonb)
  from public, anon, authenticated, service_role;

-- Final public wrapper: validate routing, sanitize sensitive operation data,
-- expand database-maintained Contractor rate projections, then mark provenance
-- and delegate to the sealed atomic implementation.
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

  v_operations := public.uc_sanitize_workspace_operations(p_operations);
  v_operations := public.uc_expand_contractor_rate_operations(p_workspace_id, v_operations);
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

comment on function public.uc_sanitize_workspace_operations(jsonb) is
  'Removes Staff password/reset fields from workspace operation payloads before entity persistence and change-journal creation.';

commit;
