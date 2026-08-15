-- Canonical Customer conversation identity.
--
-- The application now uses exactly one generic Customer thread record_id:
--   customer-conversation:<customer_id>
--
-- Older bare Customer IDs are migrated once so runtime code does not need a
-- second read/write compatibility path. This migration is idempotent.

with migrated as (
  update public."entity_threads"
  set data = jsonb_set(
        data,
        '{record_id}',
        to_jsonb('customer-conversation:' || (data->>'record_id')),
        true
      ),
      revision = revision + 1,
      updated_at = now(),
      updated_by = 'migration:canonical_customer_thread_identity'
  where coalesce(data->>'kind', data->>'record_type') = 'generic'
    and data->>'record_id' like 'cust-%'
  returning workspace_id
),
affected as (
  select distinct workspace_id from migrated
)
update public.entity_workspace_revision as revision_row
set revision = revision_row.revision + 1,
    updated_at = now()
from affected
where revision_row.workspace_id = affected.workspace_id;
