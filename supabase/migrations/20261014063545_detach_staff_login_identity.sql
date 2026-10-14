-- Disable a login and detach it from canonical Staff before Auth deletion.
-- The inactive role row remains until auth.admin.deleteUser succeeds, so a
-- failed Auth deletion is visible and safely retryable from User Approvals.
create or replace function public.detach_staff_login_identity(
  p_assignment_id uuid,
  p_user_id uuid,
  p_workspace_id text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role public.uc_user_roles%rowtype;
  v_staff public.entity_master_staff%rowtype;
  v_now timestamptz := now();
  v_workspace_revision bigint;
  v_next_workspace_revision bigint;
  v_data jsonb;
begin
  if p_assignment_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'MISSING_LOGIN_IDENTITY';
  end if;

  insert into public.entity_workspace_revision (id, workspace_id, revision, updated_at)
  values (p_workspace_id, p_workspace_id, 0, v_now)
  on conflict (id) do nothing;

  select revision
    into v_workspace_revision
    from public.entity_workspace_revision
   where id = p_workspace_id
   for update;

  select *
    into v_role
    from public.uc_user_roles
   where id = p_assignment_id
     and user_id = p_user_id
   for update;
  if not found or v_role.staff_id is null then
    raise exception using errcode = 'P0002', message = 'LOGIN_IDENTITY_NOT_FOUND';
  end if;

  select *
    into v_staff
    from public.entity_master_staff
   where workspace_id = p_workspace_id
     and id = v_role.staff_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CANONICAL_STAFF_NOT_FOUND';
  end if;

  if nullif(v_staff.data ->> 'auth_user_id', '') is not null
     and v_staff.data ->> 'auth_user_id' is distinct from p_user_id::text then
    raise exception using errcode = '23514', message = 'STAFF_LOGIN_IDENTITY_MISMATCH';
  end if;

  v_data := (v_staff.data - 'auth_user_id' - 'login_email' - 'temporary_password' - 'force_password_change')
    || jsonb_build_object(
      'login_enabled', false,
      'updated_at', v_now
    );

  update public.entity_master_staff
     set data = v_data,
         revision = revision + 1,
         updated_at = v_now,
         updated_by = nullif(btrim(coalesce(p_actor, '')), '')
   where id = v_staff.id
     and workspace_id = p_workspace_id;

  update public.uc_user_roles
     set status = 'inactive',
         approved_by = null,
         approved_at = null,
         updated_at = v_now
   where id = v_role.id;

  v_next_workspace_revision := v_workspace_revision + 1;
  update public.entity_workspace_revision
     set revision = v_next_workspace_revision,
         updated_at = v_now
   where id = p_workspace_id;

  return jsonb_build_object(
    'staffId', v_staff.id,
    'workspaceRevision', v_next_workspace_revision
  );
end;
$function$;

revoke all on function public.detach_staff_login_identity(uuid,uuid,text,text)
from public, anon, authenticated;
grant execute on function public.detach_staff_login_identity(uuid,uuid,text,text)
to service_role;

comment on function public.detach_staff_login_identity(uuid,uuid,text,text) is
  'Detaches a Staff login and disables access before the server deletes the Supabase Auth user.';
