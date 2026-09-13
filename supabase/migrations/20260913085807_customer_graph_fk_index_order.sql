-- Reorder Customer/Site relationship indexes so the referenced FK column is
-- the leading key. This covers FK maintenance and still supports workspace-
-- scoped equality lookups when both predicates are supplied.
do $$
declare
  r record;
  v_index text;
begin
  for r in select * from (values
    ('entity_sites'), ('entity_workRequired'), ('entity_quotations'), ('entity_acceptedScopes'),
    ('entity_workOrders'), ('entity_visits'), ('entity_tasks'), ('entity_followups'),
    ('entity_actions'), ('entity_risks'), ('entity_blocked'), ('entity_payments'),
    ('entity_invoices'), ('entity_customerReceipts'), ('entity_contractorBills'),
    ('entity_commissions'), ('entity_variationRequests'), ('entity_commSends'),
    ('entity_entityReferenceAssignments')
  ) as t(table_name)
  loop
    v_index := r.table_name || '_customer_id_idx';
    execute format('drop index if exists public.%I', v_index);
    execute format('create index %I on public.%I(customer_id_gen, workspace_id)', v_index, r.table_name);
  end loop;

  for r in select * from (values
    ('entity_areas'), ('entity_workRequired'), ('entity_quotations'), ('entity_acceptedScopes'),
    ('entity_workOrders'), ('entity_visits'), ('entity_tasks'), ('entity_followups'),
    ('entity_actions'), ('entity_risks'), ('entity_blocked'), ('entity_payments'),
    ('entity_invoices'), ('entity_customerReceipts'), ('entity_contractorBills'),
    ('entity_commissions'), ('entity_variationRequests'), ('entity_commSends'),
    ('entity_entityReferenceAssignments')
  ) as t(table_name)
  loop
    v_index := r.table_name || '_site_id_idx';
    execute format('drop index if exists public.%I', v_index);
    execute format('create index %I on public.%I(site_id_gen, workspace_id)', v_index, r.table_name);
  end loop;
end $$;

-- The private contact identity table is now the single transactional uniqueness
-- source across primary phone, WhatsApp, alternate phone and email.
drop index if exists public.entity_customers_phone_uidx;
drop index if exists public.entity_customers_email_uidx;

notify pgrst, 'reload schema';