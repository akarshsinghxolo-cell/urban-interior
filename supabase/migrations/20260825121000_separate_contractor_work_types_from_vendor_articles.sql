-- Separate the Contractor pricing taxonomy from Vendor material supply.
--
-- Work Subcategories own editable work-type rate rows (for example Budget,
-- Premium and Luxury). Contractors store labour rates against those work types.
-- Vendor Article, scoped-material and variant data is deliberately untouched.

begin;

-- Convert every legacy single rate row into a deterministic Standard work type.
update public."entity_master_workSubcategories" s
   set data = (s.data - 'material_rate' - 'labour_rate') || jsonb_build_object(
         'work_types',
         case
           when jsonb_typeof(s.data -> 'work_types') = 'array'
             and jsonb_array_length(s.data -> 'work_types') > 0
             then s.data -> 'work_types'
           else jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
             'id', 'wt-' || s.id || '-standard',
             'name', 'Standard',
             'unit_id', coalesce(nullif(btrim(s.data ->> 'unit_id'), ''), 'pcs'),
             'material_rate', nullif(s.data -> 'material_rate', 'null'::jsonb),
             'labour_rate', nullif(s.data -> 'labour_rate', 'null'::jsonb),
             'notes', nullif(btrim(s.data ->> 'notes'), ''),
             'created_at', coalesce(s.data ->> 'created_at', s.updated_at::text),
             'updated_at', now()::text
           )))
         end
       ),
       revision = s.revision + 1,
       updated_at = now(),
       updated_by = 'work-type-separation';

-- Migrate each Contractor capability to labour-only work-type rates. Existing
-- article, article-rate and with-material compatibility fields are removed.
update public.entity_master_contractors c
   set data = (c.data - 'capabilities_v2') || jsonb_build_object(
         'work_capabilities',
         coalesce((
           select jsonb_agg(
             (capability.value
               - 'labour_rate'
               - 'with_material_rate'
               - 'article_ids'
               - 'article_rates'
             ) || jsonb_build_object(
               'work_type_rates',
               case
                 when jsonb_typeof(capability.value -> 'work_type_rates') = 'array'
                   then capability.value -> 'work_type_rates'
                 when nullif(capability.value -> 'labour_rate', 'null'::jsonb) is not null
                   then jsonb_build_array(jsonb_build_object(
                     'work_type_id', 'wt-' || coalesce(
                       nullif(btrim(capability.value ->> 'subcategory_id'), ''),
                       nullif(btrim(capability.value ->> 'work_subcategory_id'), '')
                     ) || '-standard',
                     'work_type_name', 'Standard',
                     'labour_rate', capability.value -> 'labour_rate'
                   ))
                 else '[]'::jsonb
               end
             )
             order by capability.ordinality
           )
             from jsonb_array_elements(
               case when jsonb_typeof(c.data -> 'work_capabilities') = 'array'
                 then c.data -> 'work_capabilities' else '[]'::jsonb end
             ) with ordinality as capability(value, ordinality)
         ), '[]'::jsonb)
       ),
       revision = c.revision + 1,
       updated_at = now(),
       updated_by = 'work-type-separation';

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
  v_capability jsonb;
  v_work_type_rate jsonb;
  v_work_type jsonb;
  v_contractor_id text := nullif(btrim(coalesce(p_contractor ->> 'id', '')), '');
  v_subcategory_id text;
  v_subcategory_name text;
  v_work_type_id text;
  v_work_type_name text;
  v_unit_id text;
  v_rate jsonb;
begin
  if v_contractor_id is null then
    return v_rows;
  end if;

  for v_capability in
    select value
      from jsonb_array_elements(
        case when jsonb_typeof(p_contractor -> 'work_capabilities') = 'array'
          then p_contractor -> 'work_capabilities' else '[]'::jsonb end
      )
  loop
    v_subcategory_id := nullif(btrim(coalesce(
      v_capability ->> 'subcategory_id',
      v_capability ->> 'work_subcategory_id',
      ''
    )), '');
    if v_subcategory_id is null then continue; end if;

    v_subcategory_name := nullif(btrim(coalesce(
      v_capability ->> 'subcategory_name',
      v_capability ->> 'work_subcategory_name',
      ''
    )), '');

    for v_work_type_rate in
      select value
        from jsonb_array_elements(
          case when jsonb_typeof(v_capability -> 'work_type_rates') = 'array'
            then v_capability -> 'work_type_rates' else '[]'::jsonb end
        )
    loop
      v_work_type_id := nullif(btrim(coalesce(v_work_type_rate ->> 'work_type_id', '')), '');
      v_rate := nullif(v_work_type_rate -> 'labour_rate', 'null'::jsonb);
      if v_work_type_id is null or v_rate is null then continue; end if;

      v_work_type := null;
      select work_type.value
        into v_work_type
        from public."entity_master_workSubcategories" s
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(s.data -> 'work_types') = 'array'
            then s.data -> 'work_types' else '[]'::jsonb end
        ) as work_type(value)
       where s.workspace_id = p_workspace_id
         and s.id = v_subcategory_id
         and work_type.value ->> 'id' = v_work_type_id
       limit 1;
      if v_work_type is null then continue; end if;

      v_work_type_name := coalesce(
        nullif(btrim(v_work_type ->> 'name'), ''),
        nullif(btrim(v_work_type_rate ->> 'work_type_name'), ''),
        'Work type'
      );
      v_unit_id := coalesce(
        nullif(btrim(v_work_type ->> 'unit_id'), ''),
        nullif(btrim(v_capability ->> 'unit_id'), '')
      );

      v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', 'crate-' || v_contractor_id || '-' || v_subcategory_id || '-' || v_work_type_id,
        'contractor_id', v_contractor_id,
        'trade', coalesce(v_subcategory_name, 'Contractor rate') || ' · ' || v_work_type_name,
        'rate', v_rate,
        'unit_id', v_unit_id,
        'work_subcategory_id', v_subcategory_id,
        'work_subcategory_name', v_subcategory_name,
        'work_type_id', v_work_type_id,
        'work_type_name', v_work_type_name,
        'labour_rate', v_rate
      )));
    end loop;
  end loop;

  return v_rows;
end;
$function$;

revoke all on function public.uc_contractor_rate_projection_rows(text, jsonb)
  from public, anon, authenticated, service_role;

-- Rebuild the read-only Contractor Rate projection and force connected clients
-- to reload the migrated baseline once.
do $rebuild_work_type_rates$
declare
  v_workspace record;
  v_contractor record;
  v_projection jsonb;
  v_rate jsonb;
  v_keep_ids text[];
  v_rate_id text;
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
      v_projection := public.uc_contractor_rate_projection_rows(v_workspace.workspace_id, v_contractor.data);
      for v_rate in select value from jsonb_array_elements(v_projection)
      loop
        v_rate_id := nullif(btrim(coalesce(v_rate ->> 'id', '')), '');
        if v_rate_id is null then continue; end if;
        if not (v_rate_id = any(v_keep_ids)) then
          v_keep_ids := array_append(v_keep_ids, v_rate_id);
        end if;

        insert into public."entity_master_contractorRates" (
          id, workspace_id, revision, updated_at, updated_by, data
        ) values (
          v_rate_id, v_workspace.workspace_id, 0, now(), 'work-type-projection', v_rate
        )
        on conflict (id) do update set
          workspace_id = excluded.workspace_id,
          revision = public."entity_master_contractorRates".revision + 1,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          data = excluded.data
        where public."entity_master_contractorRates".workspace_id is distinct from excluded.workspace_id
           or public."entity_master_contractorRates".data is distinct from excluded.data;
      end loop;
    end loop;

    delete from public."entity_master_contractorRates" r
     where r.workspace_id = v_workspace.workspace_id
       and not (r.id = any(v_keep_ids));

    v_next_revision := v_workspace.revision + 1;
    insert into public.entity_workspace_change_batches (
      workspace_id, revision, operations, row_versions, is_baseline, created_at
    ) values (
      v_workspace.workspace_id, v_next_revision, '[]'::jsonb, '{}'::jsonb, true, now()
    )
    on conflict (workspace_id, revision) do update set
      operations = '[]'::jsonb,
      row_versions = '{}'::jsonb,
      is_baseline = true;

    update public.entity_workspace_revision
       set revision = v_next_revision,
           updated_at = now()
     where id = v_workspace.id;
  end loop;
end;
$rebuild_work_type_rates$;

comment on function public.uc_contractor_rate_projection_rows(text, jsonb) is
  'Builds labour-only Contractor rate rows from canonical Work Subcategory work types. Vendor Article data is outside this projection.';

commit;
