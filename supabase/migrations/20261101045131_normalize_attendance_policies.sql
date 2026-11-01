-- Older Staff rows predate the automatic geofence controls. Keep any
-- configured values, fill the canonical defaults, and remove retired keys so
-- Field Mode, Visit maps, Attendance and Payroll all read the same policy.
update public."entity_master_staff"
set
  data = jsonb_set(
    data,
    '{attendance_policy}',
    (
      jsonb_build_object(
        'office_name', 'Office location not configured',
        'geofence_radius_m', 120,
        'visit_geofence_radius_m', 120,
        'max_gps_accuracy_m', 75,
        'standard_check_in_time', '09:30',
        'minimum_half_day_minutes', 240,
        'auto_present_from_gps', true,
        'auto_geofence_enabled', true,
        'auto_check_in_enabled', true,
        'auto_check_out_enabled', true,
        'auto_entry_dwell_seconds', 60,
        'auto_exit_dwell_seconds', 180,
        'auto_exit_buffer_m', 60,
        'auto_absent_enabled', true,
        'auto_absent_after_minutes', 90,
        'late_grace_minutes', 20,
        'absent_deduction_enabled', true,
        'absent_deduction_days', 1
      ) || coalesce(data->'attendance_policy', '{}'::jsonb)
    ) - 'id' - 'grace_period_minutes',
    true
  ),
  revision = revision + 1,
  updated_at = now()
where
  data->'attendance_policy' is null
  or not (data->'attendance_policy' ?& array[
    'visit_geofence_radius_m',
    'max_gps_accuracy_m',
    'auto_entry_dwell_seconds',
    'auto_exit_dwell_seconds',
    'auto_exit_buffer_m'
  ])
  or data->'attendance_policy' ?| array['id', 'grace_period_minutes'];
