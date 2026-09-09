-- Ponytail cleanup: two 0-row private backups left by the 2026-09-09 live
-- quotations/workRequired cutover. Referenced by no code, migration, or view
-- in the repository (verified by grep). Deliberately NO CASCADE: an unexpected
-- dependency must abort loudly. Risk: none (both tables verified 0 rows live).
begin;
drop table if exists public.migration_backup_20260909_quotations;
drop table if exists public.migration_backup_20260909_workrequired;
commit;
