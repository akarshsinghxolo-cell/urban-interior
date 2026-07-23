create or replace function public.commit_workspace_operations(
  p_workspace_id text,
  p_expected_workspace_revision integer,
  p_operations jsonb,
  p_expected_row_versions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_workspace_revision integer;
  next_workspace_revision integer;
  op jsonb;
  row_data jsonb;
  row_id text;
  table_name text;
  collection_name text;
  version_key text;
  expected_row_revision integer;
  actual_row_revision integer;
  new_row_revision integer;
  operation_index integer;
  upserted_count integer := 0;
  deleted_count integer := 0;
  bumped_versions jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';
  end if;

  insert into public.entity_workspace_revision (id, workspace_id, revision, updated_at)
  values (p_workspace_id, p_workspace_id, 0, now())
  on conflict (id) do nothing;

  select revision into current_workspace_revision
    from public.entity_workspace_revision
   where id = p_workspace_id
   for update;

  if current_workspace_revision is distinct from p_expected_workspace_revision then
    raise exception using errcode = '40001', message = 'WORKSPACE_CONFLICT';
  end if;

  for op in select value from jsonb_array_elements(p_operations)
  loop
    table_name := op ->> 'table';
    collection_name := op ->> 'collection';
    if table_name is null or collection_name is null
       or table_name !~ '^entity_[A-Za-z0-9_]+$'
       or to_regclass(format('public.%I', table_name)) is null then
      raise exception using errcode = '22023', message = 'INVALID_COLLECTION';
    end if;

    for row_data in select value from jsonb_array_elements(coalesce(op -> 'upsert', '[]'::jsonb))
    loop
      row_id := row_data ->> 'id';
      if row_id is null or btrim(row_id) = '' then
        raise exception using errcode = '22023', message = 'INVALID_ROW_ID';
      end if;
      version_key := collection_name || ':' || row_id;
      expected_row_revision := case
        when p_expected_row_versions ? version_key then (p_expected_row_versions ->> version_key)::integer
        when p_expected_row_versions ? row_id then (p_expected_row_versions ->> row_id)::integer
        else null
      end;
      actual_row_revision := null;
      execute format('select revision from public.%I where workspace_id = $1 and id = $2 for update', table_name)
        into actual_row_revision using p_workspace_id, row_id;
      if expected_row_revision is not null and actual_row_revision is distinct from expected_row_revision then
        raise exception using errcode = '40001', message = 'ROW_CONFLICT:' || version_key;
      end if;
    end loop;

    for row_id in select value #>> '{}' from jsonb_array_elements(coalesce(op -> 'deleteIds', '[]'::jsonb))
    loop
      version_key := collection_name || ':' || row_id;
      expected_row_revision := case
        when p_expected_row_versions ? version_key then (p_expected_row_versions ->> version_key)::integer
        when p_expected_row_versions ? row_id then (p_expected_row_versions ->> row_id)::integer
        else null
      end;
      actual_row_revision := null;
      execute format('select revision from public.%I where workspace_id = $1 and id = $2 for update', table_name)
        into actual_row_revision using p_workspace_id, row_id;
      if expected_row_revision is not null and actual_row_revision is distinct from expected_row_revision then
        raise exception using errcode = '40001', message = 'ROW_CONFLICT:' || version_key;
      end if;
    end loop;
  end loop;

  if jsonb_array_length(p_operations) > 0 then
    for operation_index in reverse jsonb_array_length(p_operations) - 1 .. 0
    loop
      op := p_operations -> operation_index;
      table_name := op ->> 'table';
      for row_id in select value #>> '{}' from jsonb_array_elements(coalesce(op -> 'deleteIds', '[]'::jsonb))
      loop
        execute format('delete from public.%I where workspace_id = $1 and id = $2', table_name)
          using p_workspace_id, row_id;
        if found then deleted_count := deleted_count + 1; end if;
      end loop;
    end loop;
  end if;

  for op in select value from jsonb_array_elements(p_operations)
  loop
    table_name := op ->> 'table';
    collection_name := op ->> 'collection';
    for row_data in select value from jsonb_array_elements(coalesce(op -> 'upsert', '[]'::jsonb))
    loop
      row_id := row_data ->> 'id';
      actual_row_revision := null;
      execute format('select revision from public.%I where workspace_id = $1 and id = $2', table_name)
        into actual_row_revision using p_workspace_id, row_id;
      if actual_row_revision is null then
        new_row_revision := 0;
        execute format('insert into public.%I (id, workspace_id, revision, data, updated_at) values ($1, $2, 0, $3, now())', table_name)
          using row_id, p_workspace_id, row_data;
      else
        new_row_revision := actual_row_revision + 1;
        execute format('update public.%I set data = $3, revision = $4, updated_at = now() where workspace_id = $1 and id = $2', table_name)
          using p_workspace_id, row_id, row_data, new_row_revision;
      end if;
      upserted_count := upserted_count + 1;
      bumped_versions := bumped_versions
        || jsonb_build_object(collection_name || ':' || row_id, new_row_revision)
        || jsonb_build_object(row_id, new_row_revision);
    end loop;
  end loop;

  next_workspace_revision := current_workspace_revision + 1;
  update public.entity_workspace_revision
     set revision = next_workspace_revision, updated_at = now()
   where id = p_workspace_id;

  return jsonb_build_object(
    'upserted', upserted_count,
    'deleted', deleted_count,
    'conflicts', 0,
    'bumpedRowVersions', bumped_versions,
    'newRevision', next_workspace_revision
  );
end;
$$;

revoke all on function public.commit_workspace_operations(text, integer, jsonb, jsonb) from public;
grant execute on function public.commit_workspace_operations(text, integer, jsonb, jsonb) to service_role;
