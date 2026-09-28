-- Run with an administrative SQL connection after the commercial migration.
-- All fixtures are isolated and rolled back, including on assertion failure.
begin;
do $test$
declare
  prefix text := 'graph-test-' || gen_random_uuid()::text;
  workspace text := prefix;
begin
  -- Child-before-parent is supported within an atomic workspace save.
  insert into public."entity_vendorPayments" (id, workspace_id, data) values
    (prefix || '-payment', workspace, jsonb_build_object('vendor_bill_id', prefix || '-bill', 'vendor_id', prefix || '-vendor', 'amount', 10));
  insert into public."entity_vendorBills" (id, workspace_id, data) values
    (prefix || '-bill', workspace, jsonb_build_object('po_id', prefix || '-po', 'grn_id', prefix || '-grn', 'vendor_id', prefix || '-vendor'));
  insert into public.entity_grns (id, workspace_id, data) values
    (prefix || '-grn', workspace, jsonb_build_object('po_id', prefix || '-po', 'vendor_id', prefix || '-vendor'));
  insert into public."entity_purchaseOrders" (id, workspace_id, data) values
    (prefix || '-po', workspace, jsonb_build_object('vendor_id', prefix || '-vendor'));
  insert into public.entity_master_vendors (id, workspace_id, data) values
    (prefix || '-vendor', workspace, '{}'::jsonb),
    (prefix || '-other-vendor', workspace, '{}'::jsonb);
  set constraints all immediate;

  begin
    update public."entity_vendorPayments" set data = data || jsonb_build_object('vendor_id', prefix || '-other-vendor') where id = prefix || '-payment';
    raise exception 'FAIL: payment accepted another vendor''s bill';
  exception when foreign_key_violation then null;
  end;
  begin
    update public."entity_vendorBills" set data = data || jsonb_build_object('vendor_id', prefix || '-other-vendor') where id = prefix || '-bill';
    raise exception 'FAIL: bill accepted another vendor''s PO/GRN';
  exception when foreign_key_violation then null;
  end;
  begin
    update public."entity_vendorPayments" set workspace_id = prefix || '-other-workspace' where id = prefix || '-payment';
    raise exception 'FAIL: cross-workspace payment accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from public.entity_master_vendors where id = prefix || '-vendor';
    raise exception 'FAIL: referenced vendor was deleted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public."entity_vendorPayments" (id, workspace_id, data) values (prefix || '-unlinked', workspace, '{}'::jsonb);
    raise exception 'FAIL: payment accepted without a bill/partner';
  exception when check_violation then null;
  end;

  insert into public.entity_customers (id, workspace_id, data) values
    (prefix || '-customer', workspace, jsonb_build_object('id', prefix || '-customer', 'name', 'Graph test customer', 'status', 'active'));
  insert into public.entity_sites (id, workspace_id, data) values
    (prefix || '-site', workspace, jsonb_build_object('customer_id', prefix || '-customer'));
  insert into public.entity_master_contractors (id, workspace_id, data) values
    (prefix || '-contractor', workspace, '{}'::jsonb), (prefix || '-other-contractor', workspace, '{}'::jsonb);
  insert into public."entity_workOrders" (id, workspace_id, data) values
    (prefix || '-job', workspace, jsonb_build_object('customer_id', prefix || '-customer', 'site_id', prefix || '-site', 'contractor_id', prefix || '-contractor'));
  insert into public."entity_contractorBills" (id, workspace_id, data) values
    (prefix || '-ra', workspace, jsonb_build_object('customer_id', prefix || '-customer', 'site_id', prefix || '-site', 'work_order_id', prefix || '-job', 'contractor_id', prefix || '-contractor'));
  insert into public."entity_contractorPayments" (id, workspace_id, data) values
    (prefix || '-cp', workspace, jsonb_build_object('contractor_bill_id', prefix || '-ra', 'site_id', prefix || '-site', 'work_order_id', prefix || '-job', 'contractor_id', prefix || '-contractor', 'amount', 10));
  begin
    update public."entity_contractorPayments" set data = data || jsonb_build_object('contractor_id', prefix || '-other-contractor') where id = prefix || '-cp';
    raise exception 'FAIL: contractor payment accepted another contractor''s bill';
  exception when foreign_key_violation then null;
  end;
end;
$test$;
rollback;
select 'commercial relationship checks passed; all fixtures rolled back' as result;
