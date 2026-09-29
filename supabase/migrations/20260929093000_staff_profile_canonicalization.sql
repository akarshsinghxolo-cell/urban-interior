-- Canonical Staff profile hardening.
-- Staff identity remains in entity_master_staff; documents remain in
-- entity_staffDocuments + entity_master_fileAssets. Only file bytes move to
-- the private Supabase Storage bucket below.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-documents',
  'staff-documents',
  false,
  15728640,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

with normalized as (
  select
    id,
    workspace_id,
    data,
    coalesce(data->'attendance_policy', '{}'::jsonb) as policy,
    coalesce(data->'attendance_policy'->>'auto_absent_after_minutes', '') as current_minutes,
    coalesce(data->'attendance_policy'->>'auto_absent_after', '') as legacy_auto_absent,
    coalesce(data->'attendance_policy'->>'standard_check_in_time', '09:30') as check_in
  from public.entity_master_staff
)
update public.entity_master_staff as staff
set
  data = (
    (
      normalized.data
      - 'document_ids'
      - 'salary_type'
    )
    || jsonb_build_object(
      'salary_type',
      case
        when normalized.data->>'salary_type' in ('monthly','daily_wage') then normalized.data->>'salary_type'
        when coalesce(nullif(normalized.data->>'monthly_salary','')::numeric, 0) > 0 then 'monthly'
        when coalesce(nullif(normalized.data->>'daily_wage','')::numeric, 0) > 0 then 'daily_wage'
        else 'monthly'
      end
    )
    || jsonb_build_object(
      'attendance_policy',
      (
        normalized.policy - 'auto_absent_after' - 'auto_absent_after_minutes'
      )
      || jsonb_build_object(
        'auto_absent_after_minutes',
        case
          when normalized.current_minutes ~ '^\d+$'
            then greatest(0, normalized.current_minutes::int)
          when normalized.legacy_auto_absent ~ '^\d+$'
            then greatest(0, normalized.legacy_auto_absent::int)
          when normalized.legacy_auto_absent ~ '^\d{1,2}:\d{2}$'
            and normalized.check_in ~ '^\d{1,2}:\d{2}$'
            then greatest(
              0,
              (
                split_part(normalized.legacy_auto_absent, ':', 1)::int * 60
                + split_part(normalized.legacy_auto_absent, ':', 2)::int
              )
              -
              (
                split_part(normalized.check_in, ':', 1)::int * 60
                + split_part(normalized.check_in, ':', 2)::int
              )
            )
          else 90
        end
      )
    )
  ),
  updated_at = now()
from normalized
where staff.id = normalized.id
  and staff.workspace_id = normalized.workspace_id;
