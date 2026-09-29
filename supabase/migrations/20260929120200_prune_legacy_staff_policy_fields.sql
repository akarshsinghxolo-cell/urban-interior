update public.entity_master_staff
set data = jsonb_set(
  data,
  '{attendance_policy}',
  (data->'attendance_policy') - 'id'::text - 'grace_period_minutes'::text,
  true
)
where jsonb_typeof(data->'attendance_policy') = 'object'
  and ((data->'attendance_policy') ? 'id' or (data->'attendance_policy') ? 'grace_period_minutes');
