-- scope_lines is the persisted quotation line list. The application derives
-- the legacy items view during hydration for remaining compatibility readers.
update public.entity_quotations
set data = data - 'items',
    revision = revision + 1,
    updated_at = now()
where data ? 'items';

update public.entity_workspace_revision
set revision = revision + 1, updated_at = now();
