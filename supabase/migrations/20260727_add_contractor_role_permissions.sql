-- Give contractor records an independent permission group instead of coupling
-- contractor access to the broader Master Setup permission.
with permission_rows (
  role_key, can_view, can_create, can_update, can_approve, can_delete
) as (
  values
    ('OWNER', true, true, true, true, true),
    ('OPERATIONS_MANAGER', true, true, true, true, false),
    ('FIELD_STAFF', false, false, false, false, false),
    ('SALES_TELECALLER', false, false, false, false, false),
    ('PROCUREMENT_STAFF', false, false, false, false, false),
    ('FINANCE', false, false, false, false, false),
    ('ACCOUNTS_ADMIN', false, false, false, false, false)
)
insert into public."entity_staffRolePermissions" (
  id, workspace_id, revision, updated_at, updated_by, data
)
select
  'perm-' || lower(role_key) || '-contractors',
  'default',
  1,
  now(),
  'Contractor permission group migration',
  jsonb_build_object(
    'id', 'perm-' || lower(role_key) || '-contractors',
    'role_key', role_key,
    'module_key', 'contractors',
    'module_label', 'Contractors',
    'can_view', can_view,
    'can_create', can_create,
    'can_update', can_update,
    'can_approve', can_approve,
    'can_delete', can_delete,
    'updated_at', now()::text
  )
from permission_rows
on conflict (id) do nothing;

update public.entity_workspace_revision
set revision = revision + 1,
    updated_at = now()
where id = 'default';
