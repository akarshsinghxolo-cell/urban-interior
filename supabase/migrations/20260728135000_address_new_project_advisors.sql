-- Resolve actionable advisor findings exposed by a clean installation.

create index if not exists uc_user_roles_approved_by_idx
  on public.uc_user_roles (approved_by)
  where approved_by is not null;

drop policy if exists "Users can read their own UC role" on public.uc_user_roles;
create policy "Users can read their own UC role"
  on public.uc_user_roles for select to authenticated
  using ((select auth.uid()) = user_id);

-- Both names covered the exact same partial fingerprint lookup. Keep the more
-- explicit final-contract name and remove the older compatibility name.
drop index if exists public.uc_upload_items_fingerprint_idx;
