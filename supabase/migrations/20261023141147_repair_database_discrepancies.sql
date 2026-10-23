-- Preserve duplicate attendance evidence on the surviving daily summary, then
-- keep one operational record per staff/date. Prefer a manually corrected row;
-- otherwise retain the most recently updated auto record.
with ranked as (
  select id, workspace_id,
         row_number() over (
           partition by workspace_id, data ->> 'staff_id', data ->> 'date'
           order by case when data ->> 'auto_generated' = 'true' then 1 else 0 end,
                    revision desc, updated_at desc, id desc
         ) as position,
         first_value(id) over (
           partition by workspace_id, data ->> 'staff_id', data ->> 'date'
           order by case when data ->> 'auto_generated' = 'true' then 1 else 0 end,
                    revision desc, updated_at desc, id desc
         ) as keeper_id
  from public.entity_attendance
  where nullif(btrim(data ->> 'staff_id'), '') is not null
    and nullif(btrim(data ->> 'date'), '') is not null
), duplicate_evidence as (
  select workspace_id, keeper_id, jsonb_agg(to_jsonb(id) order by id) as duplicate_ids
  from ranked
  where position > 1
  group by workspace_id, keeper_id
)
update public.entity_attendance attendance
set data = jsonb_set(
      attendance.data,
      '{deduplicated_record_ids}',
      coalesce(attendance.data -> 'deduplicated_record_ids', '[]'::jsonb) || evidence.duplicate_ids,
      true
    ),
    revision = attendance.revision + 1,
    updated_at = now()
from duplicate_evidence evidence
where attendance.workspace_id = evidence.workspace_id
  and attendance.id = evidence.keeper_id;

with ranked as (
  select id, workspace_id,
         row_number() over (
           partition by workspace_id, data ->> 'staff_id', data ->> 'date'
           order by case when data ->> 'auto_generated' = 'true' then 1 else 0 end,
                    revision desc, updated_at desc, id desc
         ) as position
  from public.entity_attendance
  where nullif(btrim(data ->> 'staff_id'), '') is not null
    and nullif(btrim(data ->> 'date'), '') is not null
)
delete from public.entity_attendance attendance
using ranked
where attendance.workspace_id = ranked.workspace_id
  and attendance.id = ranked.id
  and ranked.position > 1;

create unique index if not exists entity_attendance_workspace_staff_date_uidx
on public.entity_attendance (workspace_id, (data ->> 'staff_id'), (data ->> 'date'))
where nullif(btrim(data ->> 'staff_id'), '') is not null
  and nullif(btrim(data ->> 'date'), '') is not null;

-- Reconcile top-level Work Required selections with the detailed alternatives
-- already stored beneath them. Detailed work is protected history, so the
-- missing selections are restored rather than deleting measured lines.
with pair_values as (
  select work.workspace_id, work.id,
         item ->> 'subcategory_id' as subcategory_id,
         item ->> 'work_type_id' as work_type_id
  from public."entity_workRequired" work
  cross join lateral jsonb_array_elements(coalesce(work.data -> 'structured_items', '[]'::jsonb)) item
  union all
  select work.workspace_id, work.id,
         pair ->> 'subcategory_id', pair ->> 'work_type_id'
  from public."entity_workRequired" work
  cross join lateral jsonb_array_elements(coalesce(work.data -> 'structured_items', '[]'::jsonb)) item
  cross join lateral jsonb_array_elements(coalesce(item -> 'option_pairs', '[]'::jsonb)) pair
), reconciled as (
  select work.workspace_id, work.id,
         (select coalesce(jsonb_agg(to_jsonb(value) order by value), '[]'::jsonb)
          from (select distinct value from (
            select jsonb_array_elements_text(coalesce(work.data -> 'work_subcategory_ids', '[]'::jsonb)) value
            union all
            select subcategory_id from pair_values pairs
            where pairs.workspace_id = work.workspace_id and pairs.id = work.id
          ) values_union where nullif(btrim(value), '') is not null) values_distinct) as subcategory_ids,
         (select coalesce(jsonb_agg(to_jsonb(value) order by value), '[]'::jsonb)
          from (select distinct value from (
            select jsonb_array_elements_text(coalesce(work.data -> 'work_type_ids', '[]'::jsonb)) value
            union all
            select work_type_id from pair_values pairs
            where pairs.workspace_id = work.workspace_id and pairs.id = work.id
          ) values_union where nullif(btrim(value), '') is not null) values_distinct) as work_type_ids
  from public."entity_workRequired" work
)
update public."entity_workRequired" work
set data = jsonb_set(jsonb_set(work.data, '{work_subcategory_ids}', reconciled.subcategory_ids, true), '{work_type_ids}', reconciled.work_type_ids, true),
    revision = work.revision + 1,
    updated_at = now()
from reconciled
where work.workspace_id = reconciled.workspace_id
  and work.id = reconciled.id
  and (work.data -> 'work_subcategory_ids' is distinct from reconciled.subcategory_ids
    or work.data -> 'work_type_ids' is distinct from reconciled.work_type_ids);

alter table public."entity_workRequired"
  drop constraint if exists entity_workrequired_data_shape_chk;

alter table public."entity_workRequired"
  add constraint entity_workrequired_data_shape_chk check (
    jsonb_typeof(data) = 'object'
    and data ->> 'id' = id
    and coalesce(btrim(data ->> 'customer_id'), '') <> ''
    and coalesce(btrim(data ->> 'title'), '') <> ''
    and (data -> 'area_ids' is null or jsonb_typeof(data -> 'area_ids') = 'array')
    and jsonb_typeof(data -> 'work_subcategory_ids') = 'array'
    and jsonb_typeof(data -> 'work_type_ids') = 'array'
    and (
      (jsonb_array_length(data -> 'work_subcategory_ids') = 0 and jsonb_array_length(data -> 'work_type_ids') = 0)
      or
      (jsonb_array_length(data -> 'work_subcategory_ids') > 0 and jsonb_array_length(data -> 'work_type_ids') > 0)
    )
  );

-- Cancelled documents keep their historical reference. Current commercial
-- documents must have a unique workspace-visible number.
create unique index if not exists entity_quotations_workspace_active_number_uidx
on public.entity_quotations (workspace_id, (data ->> 'quotation_no'))
where coalesce(data ->> 'status', '') <> 'cancelled'
  and nullif(btrim(data ->> 'quotation_no'), '') is not null;

update public.uc_upload_items
set status = 'failed_permanent',
    last_error_code = 'SESSION_EXPIRED',
    last_error_message = 'The upload session expired. Select the file again to restart the upload.',
    session_uri = null,
    updated_at = now()
where status in ('queued', 'uploading', 'paused', 'failed_retryable')
  and session_expires_at < now();

update public.entity_workspace_revision
set revision = revision + 1, updated_at = now();
