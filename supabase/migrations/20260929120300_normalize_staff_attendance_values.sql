update public.entity_master_staff
set data = jsonb_set(
  data,
  '{attendance_policy,standard_check_in_time}',
  to_jsonb(
    case
      when coalesce(data->'attendance_policy'->>'standard_check_in_time','') ~ '^\d{1,2}:\d{2}$'
        then lpad(split_part(data->'attendance_policy'->>'standard_check_in_time', ':', 1), 2, '0')
             || ':' || split_part(data->'attendance_policy'->>'standard_check_in_time', ':', 2)
      else '09:30'
    end
  ),
  true
)
where jsonb_typeof(data->'attendance_policy') = 'object';

update public.entity_master_staff
set data = jsonb_set(
  data,
  '{attendance_policy,absent_deduction_days}',
  '1'::jsonb,
  true
)
where jsonb_typeof(data->'attendance_policy') = 'object'
  and coalesce((data->'attendance_policy'->>'absent_deduction_enabled')::boolean, false)
  and coalesce(nullif(data->'attendance_policy'->>'absent_deduction_days','')::numeric,0) <= 0;
