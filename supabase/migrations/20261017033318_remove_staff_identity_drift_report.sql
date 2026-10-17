-- Staff and login access are managed directly through canonical Staff and
-- uc_user_roles. The derived drift report produced misleading duplicate-state
-- warnings and is no longer part of the access workflow.
drop view if exists public.staff_identity_drift_report;
