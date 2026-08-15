-- Canonical Customer conversation identity.
--
-- The application now uses exactly one generic Customer thread record_id:
--   customer-conversation:<customer_id>
--
-- Older bare Customer IDs are migrated once so runtime code does not need a
-- second read/write compatibility path. Only IDs backed by a canonical
-- Customer row are converted. This migration is idempotent.

with migrated as (
  update public."entity_threads" as thread
  set data = jsonb_set(
        thread.data,
        '{record_id}',
        to_jsonb('customer-conversation:' || (thread.data->>'record_id')),
        true
      ),
      revision = thread.revision + 1,
      updated_at = now(),
      updated_by = 'migration:canonical_customer_thread_identity'
  where coalesce(thread.data->>'kind', thread.data->>'record_type') = 'generic'
    and thread.data->>'record_id' like 'cust-%'
    and exists (
      select 1
      from public."entity_customers" as customer
      where customer.workspace_id = thread.workspace_id
        and customer.id = thread.data->>'record_id'
    )
  returning thread.workspace_id
),
affected as (
  select distinct workspace_id from migrated
)
update public.entity_workspace_revision as revision_row
set revision = revision_row.revision + 1,
    updated_at = now()
from affected
where revision_row.workspace_id = affected.workspace_id;
