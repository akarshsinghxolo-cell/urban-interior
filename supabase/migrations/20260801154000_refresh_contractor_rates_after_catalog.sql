-- Refresh Contractor Rate compatibility rows after the canonical work catalog
-- has been persisted. The earlier Contractor convergence runs before the catalog
-- seed, so existing capabilities may initially project without unit/article
-- context. This final pass enriches those rows from the now-persisted catalog.
--
-- Stable projected rows keep their optimistic-concurrency revision when their
-- JSON payload is unchanged. Unmapped legacy/custom rows are preserved.

begin;

-- Rate comparison/read paths commonly filter by workspace + contractor + work.
-- The JSON expression index keeps those lookups bounded as the directory grows.
create index if not exists entity_master_contractor_rates_lookup_idx
  on public."entity_master_contractorRates" (
    workspace_id,
    ((data ->> 'contractor_id')),
    ((data ->> 'work_subcategory_id'))
  );

do $refresh_after_catalog$
declare
  v_workspace record;
  v_contractor record;
  v_projection jsonb;
  v_rate jsonb;
  v_keep_ids text[];
  v_rate_id text;
  v_row_changed boolean;
  v_changed boolean;
  v_deleted integer;
  v_next_revision integer;
begin
  for v_workspace in
    select id, workspace_id, revision
      from public.entity_workspace_revision
      for update
  loop
    v_keep_ids := array[]::text[];
    v_changed := false;

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
        v_rate_id := nullif(btrim(coalesce(v_rate ->> 'id', '')), '');
        if v_rate_id is null then
          continue;
        end if;
        if not (v_rate_id = any(v_keep_ids)) then
          v_keep_ids := array_append(v_keep_ids, v_rate_id);
        end if;

        v_row_changed := false;
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
          data = excluded.data
        where public."entity_master_contractorRates".workspace_id is distinct from excluded.workspace_id
           or public."entity_master_contractorRates".data is distinct from excluded.data
        returning true into v_row_changed;

        v_changed := v_changed or coalesce(v_row_changed, false);
      end loop;
    end loop;

    -- Only mapped compatibility rows participate in the projection. Custom
    -- legacy rows without work_subcategory_id remain untouched.
    delete from public."entity_master_contractorRates" r
     where r.workspace_id = v_workspace.workspace_id
       and nullif(btrim(coalesce(r.data ->> 'work_subcategory_id', '')), '') is not null
       and not (r.id = any(v_keep_ids));
    get diagnostics v_deleted = row_count;
    v_changed := v_changed or v_deleted > 0;

    if v_changed then
      v_next_revision := v_workspace.revision + 1;

      -- This migration performs a database-side compatibility rebuild rather
      -- than a normal client operation batch. A baseline forces already-open
      -- clients to reload once and then continue from a contiguous journal.
      insert into public.entity_workspace_change_batches (
        workspace_id, revision, operations, row_versions, is_baseline, created_at
      ) values (
        v_workspace.workspace_id,
        v_next_revision,
        '[]'::jsonb,
        '{}'::jsonb,
        true,
        now()
      )
      on conflict (workspace_id, revision) do update set
        operations = '[]'::jsonb,
        row_versions = '{}'::jsonb,
        is_baseline = true;

      update public.entity_workspace_revision
         set revision = v_next_revision,
             updated_at = now()
       where id = v_workspace.id;
    end if;
  end loop;
end;
$refresh_after_catalog$;

comment on index public.entity_master_contractor_rates_lookup_idx is
  'Supports Contractor Rate directory filters by workspace, contractor and work subcategory.';

commit;
