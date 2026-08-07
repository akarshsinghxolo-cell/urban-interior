-- Keep Staff authorization lookup indexed and workspace-scoped.
-- Supabase Auth user IDs remain inside the canonical Staff JSON payload; this
-- generated column avoids transferring/scanning every Staff row during login
-- and silent session renewal.

alter table public.entity_master_staff
  add column if not exists auth_user_id_gen text
  generated always as (nullif(data ->> 'auth_user_id', '')) stored;

create unique index if not exists entity_master_staff_workspace_auth_user_idx
  on public.entity_master_staff (workspace_id, auth_user_id_gen)
  where auth_user_id_gen is not null;
