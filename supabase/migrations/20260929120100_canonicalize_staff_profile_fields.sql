update public.entity_master_staff
set data =
  case
    when jsonb_typeof(data->'attendance_policy') = 'object' then
      jsonb_set(
        ((data #- '{attendance_policy,auto_absent_after}') - 'document_ids'::text),
        '{attendance_policy,auto_absent_after_minutes}',
        to_jsonb(
          case
            when coalesce(data->'attendance_policy'->>'auto_absent_after','') ~ '^\d+$'
              then greatest(0, (data->'attendance_policy'->>'auto_absent_after')::int)
            else 90
          end
        ),
        true
      )
    else data - 'document_ids'::text
  end
where data ? 'document_ids'
   or data->'attendance_policy' ? 'auto_absent_after';

update public.entity_master_staff
set data = jsonb_set(data, '{salary_type}', '"monthly"'::jsonb, true)
where coalesce(data->>'salary_type','') = ''
  and coalesce(nullif(data->>'monthly_salary','')::numeric,0) > 0;
