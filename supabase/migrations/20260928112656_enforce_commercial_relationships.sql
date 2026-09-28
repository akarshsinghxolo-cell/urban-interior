-- Applied migration version matches Supabase history.
-- Business JSON remains the only writable truth. Generated columns merely let
-- PostgreSQL enforce links in the same workspace, including direct API writes.
-- No rows are rewritten/deleted; a pre-existing orphan aborts this migration.
-- Deferred NO ACTION preserves atomic multi-record saves in either write order.
set lock_timeout = '5s';
set statement_timeout = '60s';

do $migration$
declare
  link record;
  child_table text;
  parent_table text;
  column_name text;
  constraint_name text;
begin
  for link in select * from (values
    ('workOrders', 'contractor_id', 'master_contractors', false),
    ('purchaseOrders', 'vendor_id', 'master_vendors', true),
    ('purchaseOrders', 'work_order_id', 'workOrders', false),
    ('purchaseOrders', 'site_id', 'sites', false),
    ('grns', 'po_id', 'purchaseOrders', true),
    ('grns', 'vendor_id', 'master_vendors', true),
    ('grns', 'work_order_id', 'workOrders', false),
    ('grns', 'site_id', 'sites', false),
    ('vendorBills', 'po_id', 'purchaseOrders', true),
    ('vendorBills', 'grn_id', 'grns', true),
    ('vendorBills', 'vendor_id', 'master_vendors', true),
    ('vendorBills', 'work_order_id', 'workOrders', false),
    ('vendorBills', 'site_id', 'sites', false),
    ('vendorPayments', 'vendor_bill_id', 'vendorBills', true),
    ('vendorPayments', 'vendor_id', 'master_vendors', true),
    ('vendorPayments', 'work_order_id', 'workOrders', false),
    ('vendorPayments', 'site_id', 'sites', false),
    ('contractorBills', 'work_order_id', 'workOrders', true),
    ('contractorBills', 'contractor_id', 'master_contractors', true),
    ('contractorPayments', 'contractor_bill_id', 'contractorBills', true),
    ('contractorPayments', 'contractor_id', 'master_contractors', true),
    ('contractorPayments', 'work_order_id', 'workOrders', true),
    ('contractorPayments', 'site_id', 'sites', true),
    ('workOrderCostLines', 'work_order_id', 'workOrders', true),
    ('invoices', 'work_order_id', 'workOrders', false),
    ('invoices', 'payment_id', 'payments', false),
    ('payments', 'work_order_id', 'workOrders', false),
    ('payments', 'invoice_id', 'invoices', false),
    ('customerReceipts', 'invoice_id', 'invoices', true),
    ('customerReceipts', 'payment_id', 'payments', false),
    ('customerReceipts', 'work_order_id', 'workOrders', false),
    ('attendance', 'work_order_id', 'workOrders', false),
    ('salaryAdjustments', 'work_order_id', 'workOrders', false)
  ) as links(child, field, parent, required)
  loop
    child_table := 'entity_' || link.child;
    parent_table := 'entity_' || link.parent;
    column_name := link.field || '_gen';
    constraint_name := 'graph_' || link.child || '_' || link.field;
    execute format('alter table public.%I add column if not exists %I text generated always as (nullif(data ->> %L, '''')) stored', child_table, column_name, link.field);
    execute format('create unique index if not exists %I on public.%I (workspace_id, id)', parent_table || '_workspace_identity', parent_table);
    execute format('create index if not exists %I on public.%I (workspace_id, %I)', constraint_name || '_idx', child_table, column_name);
    if not exists (select 1 from pg_constraint where conrelid = format('public.%I', child_table)::regclass and conname = constraint_name) then
      execute format('alter table public.%I add constraint %I foreign key (workspace_id, %I) references public.%I (workspace_id, id) on delete no action deferrable initially deferred', child_table, constraint_name, column_name, parent_table);
    end if;
    if link.required and not exists (select 1 from pg_constraint where conrelid = format('public.%I', child_table)::regclass and conname = constraint_name || '_required') then
      execute format('alter table public.%I add constraint %I check (%I is not null and workspace_id is not null)', child_table, constraint_name || '_required', column_name);
    end if;
  end loop;
end;
$migration$;

-- Existence alone is insufficient: a payment for Vendor A must not settle
-- Vendor B's bill. These composite keys also protect edits to parent records.
do $migration$
declare
  link record;
begin
  for link in select * from (values
    ('grns', 'purchaseOrders', 'po_vendor', 'po_id_gen, vendor_id_gen', 'id, vendor_id_gen'),
    ('vendorBills', 'purchaseOrders', 'po_vendor', 'po_id_gen, vendor_id_gen', 'id, vendor_id_gen'),
    ('vendorBills', 'grns', 'grn_po_vendor', 'grn_id_gen, po_id_gen, vendor_id_gen', 'id, po_id_gen, vendor_id_gen'),
    ('vendorPayments', 'vendorBills', 'bill_vendor', 'vendor_bill_id_gen, vendor_id_gen', 'id, vendor_id_gen'),
    ('contractorPayments', 'contractorBills', 'bill_contractor_job', 'contractor_bill_id_gen, contractor_id_gen, work_order_id_gen, site_id_gen', 'id, contractor_id_gen, work_order_id_gen, site_id_gen')
  ) as links(child, parent, key_name, child_columns, parent_columns)
  loop
    execute format('create unique index if not exists %I on public.%I (workspace_id, %s)', 'graph_' || link.parent || '_' || link.key_name || '_identity', 'entity_' || link.parent, link.parent_columns);
    execute format('create index if not exists %I on public.%I (workspace_id, %s)', 'graph_' || link.child || '_' || link.key_name || '_idx', 'entity_' || link.child, link.child_columns);
    if not exists (select 1 from pg_constraint where conrelid = format('public.%I', 'entity_' || link.child)::regclass and conname = 'graph_' || link.child || '_' || link.key_name) then
      execute format('alter table public.%I add constraint %I foreign key (workspace_id, %s) references public.%I (workspace_id, %s) on delete no action deferrable initially deferred', 'entity_' || link.child, 'graph_' || link.child || '_' || link.key_name, link.child_columns, 'entity_' || link.parent, link.parent_columns);
    end if;
  end loop;
end;
$migration$;
