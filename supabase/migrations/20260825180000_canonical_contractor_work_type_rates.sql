-- Contractor work-type quotes are the single rate source.
-- Master Setup stores work-type identity only and derives averages from the
-- Contractor Rate projection. Vendor Article data is deliberately untouched.

begin;

update public."entity_master_workSubcategories" s
   set data = (s.data - 'material_rate' - 'labour_rate') || jsonb_build_object(
         'work_types',
         coalesce((
           select jsonb_agg(work_type.value - 'material_rate' - 'labour_rate' order by work_type.ordinality)
             from jsonb_array_elements(
               case when jsonb_typeof(s.data -> 'work_types') = 'array'
                 then s.data -> 'work_types' else '[]'::jsonb end
             ) with ordinality as work_type(value, ordinality)
         ), jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
           'id', 'wt-' || s.id || '-standard',
           'name', 'Standard',
           'unit_id', coalesce(nullif(btrim(s.data ->> 'unit_id'), ''), 'pcs'),
           'notes', nullif(btrim(s.data ->> 'notes'), ''),
           'created_at', coalesce(s.data ->> 'created_at', s.updated_at::text),
           'updated_at', now()::text
         ))))
       ),
       revision = s.revision + 1,
       updated_at = now(),
       updated_by = 'canonical-contractor-rates';

update public.entity_master_contractors c
   set data = (
         c.data
           - 'business_gst' - 'pan' - 'bank_account' - 'ifsc' - 'bank_verified'
           - 'supervisor_name' - 'supervisor_phone' - 'concurrent_site_limit'
           - 'earliest_mobilisation_date' - 'labour_registration_no'
           - 'insurance_expiry' - 'pf_no' - 'esi_no' - 'capabilities_v2'
       ) || jsonb_build_object(
         'work_capabilities',
         coalesce((
           select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'subcategory_id', nullif(btrim(capability.value ->> 'subcategory_id'), ''),
             'subcategory_name', nullif(btrim(capability.value ->> 'subcategory_name'), ''),
             'work_type_rates', coalesce((
               select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'work_type_id', nullif(btrim(rate.value ->> 'work_type_id'), ''),
                 'work_type_name', nullif(btrim(rate.value ->> 'work_type_name'), ''),
                 'unit_id', coalesce(
                   nullif(btrim(rate.value ->> 'unit_id'), ''),
                   (
                     select nullif(btrim(work_type.value ->> 'unit_id'), '')
                       from public."entity_master_workSubcategories" subcategory
                       cross join lateral jsonb_array_elements(
                         case when jsonb_typeof(subcategory.data -> 'work_types') = 'array'
                           then subcategory.data -> 'work_types' else '[]'::jsonb end
                       ) as work_type(value)
                      where subcategory.workspace_id = c.workspace_id
                        and subcategory.id = capability.value ->> 'subcategory_id'
                        and work_type.value ->> 'id' = rate.value ->> 'work_type_id'
                      limit 1
                   ),
                   (
                     select nullif(btrim(subcategory.data ->> 'unit_id'), '')
                       from public."entity_master_workSubcategories" subcategory
                      where subcategory.workspace_id = c.workspace_id
                        and subcategory.id = capability.value ->> 'subcategory_id'
                      limit 1
                   )
                 ),
                 'material_rate', nullif(rate.value -> 'material_rate', 'null'::jsonb),
                 'labour_rate', nullif(rate.value -> 'labour_rate', 'null'::jsonb),
                 'notes', nullif(btrim(rate.value ->> 'notes'), '')
               )) order by rate.ordinality)
                 from jsonb_array_elements(
                   case when jsonb_typeof(capability.value -> 'work_type_rates') = 'array'
                     then capability.value -> 'work_type_rates' else '[]'::jsonb end
                 ) with ordinality as rate(value, ordinality)
                where nullif(btrim(rate.value ->> 'work_type_id'), '') is not null
                  and nullif(btrim(rate.value ->> 'work_type_name'), '') is not null
             ), '[]'::jsonb)
           )) order by capability.ordinality)
             from jsonb_array_elements(
               case when jsonb_typeof(c.data -> 'work_capabilities') = 'array'
                 then c.data -> 'work_capabilities' else '[]'::jsonb end
             ) with ordinality as capability(value, ordinality)
            where nullif(btrim(capability.value ->> 'subcategory_id'), '') is not null
         ), '[]'::jsonb),
         'compliance_documents',
         coalesce((
           select jsonb_agg(document.value order by document.ordinality)
             from jsonb_array_elements(
               case when jsonb_typeof(c.data -> 'compliance_documents') = 'array'
                 then c.data -> 'compliance_documents' else '[]'::jsonb end
             ) with ordinality as document(value, ordinality)
            where coalesce(document.value ->> 'source', '') <> 'contractor_profile'
         ), '[]'::jsonb)
       ),
       revision = c.revision + 1,
       updated_at = now(),
       updated_by = 'canonical-contractor-rates';

create or replace function public.uc_contractor_rate_projection_rows(
  p_workspace_id text,
  p_contractor jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_rows jsonb := '[]'::jsonb;
  v_capability jsonb;
  v_work_type_rate jsonb;
  v_contractor_id text := nullif(btrim(coalesce(p_contractor ->> 'id', '')), '');
  v_subcategory_id text;
  v_subcategory_name text;
  v_work_type_id text;
  v_work_type_name text;
  v_unit_id text;
  v_material jsonb;
  v_labour jsonb;
  v_total numeric;
begin
  if v_contractor_id is null then return v_rows; end if;

  for v_capability in
    select value from jsonb_array_elements(
      case when jsonb_typeof(p_contractor -> 'work_capabilities') = 'array'
        then p_contractor -> 'work_capabilities' else '[]'::jsonb end
    )
  loop
    v_subcategory_id := nullif(btrim(coalesce(v_capability ->> 'subcategory_id', '')), '');
    if v_subcategory_id is null then continue; end if;
    v_subcategory_name := nullif(btrim(coalesce(v_capability ->> 'subcategory_name', '')), '');

    for v_work_type_rate in
      select value from jsonb_array_elements(
        case when jsonb_typeof(v_capability -> 'work_type_rates') = 'array'
          then v_capability -> 'work_type_rates' else '[]'::jsonb end
      )
    loop
      v_work_type_id := nullif(btrim(coalesce(v_work_type_rate ->> 'work_type_id', '')), '');
      v_work_type_name := nullif(btrim(coalesce(v_work_type_rate ->> 'work_type_name', '')), '');
      v_material := nullif(v_work_type_rate -> 'material_rate', 'null'::jsonb);
      v_labour := nullif(v_work_type_rate -> 'labour_rate', 'null'::jsonb);
      if v_work_type_id is null or v_work_type_name is null or (v_material is null and v_labour is null) then continue; end if;

      v_unit_id := coalesce(
        nullif(btrim(v_work_type_rate ->> 'unit_id'), ''),
        (
          select nullif(btrim(work_type.value ->> 'unit_id'), '')
            from public."entity_master_workSubcategories" subcategory
            cross join lateral jsonb_array_elements(
              case when jsonb_typeof(subcategory.data -> 'work_types') = 'array'
                then subcategory.data -> 'work_types' else '[]'::jsonb end
            ) as work_type(value)
           where subcategory.workspace_id = p_workspace_id
             and subcategory.id = v_subcategory_id
             and work_type.value ->> 'id' = v_work_type_id
           limit 1
        ),
        (
          select nullif(btrim(subcategory.data ->> 'unit_id'), '')
            from public."entity_master_workSubcategories" subcategory
           where subcategory.workspace_id = p_workspace_id
             and subcategory.id = v_subcategory_id
           limit 1
        )
      );
      v_total := coalesce((v_material #>> '{}')::numeric, 0) + coalesce((v_labour #>> '{}')::numeric, 0);

      v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', 'crate-' || v_contractor_id || '-' || v_subcategory_id || '-' || v_work_type_id,
        'contractor_id', v_contractor_id,
        'trade', coalesce(v_subcategory_name, 'Contractor rate') || ' · ' || v_work_type_name,
        'rate', v_total,
        'unit_id', v_unit_id,
        'work_subcategory_id', v_subcategory_id,
        'work_subcategory_name', v_subcategory_name,
        'work_type_id', v_work_type_id,
        'work_type_name', v_work_type_name,
        'material_rate', v_material,
        'labour_rate', v_labour,
        'notes', nullif(btrim(v_work_type_rate ->> 'notes'), '')
      )));
    end loop;
  end loop;

  return v_rows;
end;
$function$;

revoke all on function public.uc_contractor_rate_projection_rows(text, jsonb)
  from public, anon, authenticated, service_role;

do $rebuild_canonical_contractor_rates$
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
    select id, workspace_id, revision from public.entity_workspace_revision for update
  loop
    v_keep_ids := array[]::text[];
    for v_contractor in
      select id, data from public.entity_master_contractors where workspace_id = v_workspace.workspace_id
    loop
      v_projection := public.uc_contractor_rate_projection_rows(v_workspace.workspace_id, v_contractor.data);
      for v_rate in select value from jsonb_array_elements(v_projection)
      loop
        v_rate_id := nullif(btrim(coalesce(v_rate ->> 'id', '')), '');
        if v_rate_id is null then continue; end if;
        if not (v_rate_id = any(v_keep_ids)) then v_keep_ids := array_append(v_keep_ids, v_rate_id); end if;
        insert into public."entity_master_contractorRates" (id, workspace_id, revision, updated_at, updated_by, data)
        values (v_rate_id, v_workspace.workspace_id, 0, now(), 'canonical-contractor-rates', v_rate)
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
    insert into public.entity_workspace_change_batches (workspace_id, revision, operations, row_versions, is_baseline, created_at)
    values (v_workspace.workspace_id, v_next_revision, '[]'::jsonb, '{}'::jsonb, true, now())
    on conflict (workspace_id, revision) do update set operations = '[]'::jsonb, row_versions = '{}'::jsonb, is_baseline = true;
    update public.entity_workspace_revision set revision = v_next_revision, updated_at = now() where id = v_workspace.id;
  end loop;
end;
$rebuild_canonical_contractor_rates$;

comment on function public.uc_contractor_rate_projection_rows(text, jsonb) is
  'Projects canonical Contractor work-type material/labour quotes. Master rates are derived averages; Vendor Articles are outside this projection.';

commit;
