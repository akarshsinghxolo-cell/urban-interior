-- Run against the canonical schema after shared_domain_tables. Always rolls back.
BEGIN;

DO $test$
DECLARE
  result jsonb;
BEGIN
  -- Reusing an ID across logical types must not merge independent records.
  result := public.commit_workspace_operations('shared-domain-test', 0, '[
    {"collection":"actions","table":"entity_workflow_controls","upsert":[{"id":"shared-id","status":"pending"}]},
    {"collection":"risks","table":"entity_workflow_controls","upsert":[{"id":"shared-id","title":"Risk"}]},
    {"collection":"blocked","table":"entity_workflow_controls","upsert":[{"id":"shared-id","resolved":false}]}
  ]'::jsonb);
  IF result->>'upserted' <> '3' THEN RAISE EXCEPTION 'shared insert count'; END IF;
  result := public.commit_workspace_operations('shared-domain-test', 1, '[
    {"collection":"actions","table":"entity_workflow_controls","upsert":[{"id":"shared-id","status":"approved"}]}
  ]'::jsonb, '{"actions:shared-id":0}'::jsonb);
  IF (SELECT count(*) FROM public.entity_workflow_controls WHERE id='shared-id' AND revision=0) <> 2
     OR (SELECT data->>'status' FROM public.entity_workflow_controls WHERE collection='actions' AND id='shared-id') <> 'approved'
  THEN RAISE EXCEPTION 'cross-collection update'; END IF;

  BEGIN
    PERFORM public.commit_workspace_operations('shared-domain-test', 2, '[
      {"collection":"actions","table":"entity_workflow_controls","upsert":[{"id":"shared-id"}]}
    ]'::jsonb, '{"actions:shared-id":0}'::jsonb);
    RAISE EXCEPTION 'stale revision accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;

  BEGIN
    PERFORM public.commit_workspace_operations('shared-domain-test', 2, '[
      {"collection":"customers","table":"entity_workflow_controls","upsert":[{"id":"forged"}]}
    ]'::jsonb);
    RAISE EXCEPTION 'forged collection accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  result := public.commit_workspace_operations('shared-domain-test', 2, '[
    {"collection":"risks","table":"entity_workflow_controls","deleteIds":["shared-id"]}
  ]'::jsonb, '{"risks:shared-id":0}'::jsonb);
  IF result->>'deleted' <> '1' OR (SELECT count(*) FROM public.entity_workflow_controls WHERE id='shared-id') <> 2
  THEN RAISE EXCEPTION 'cross-collection delete'; END IF;
  IF (SELECT count(*) FROM public.entity_workspace_change_batches WHERE workspace_id='shared-domain-test') <> 3
  THEN RAISE EXCEPTION 'journal not atomic'; END IF;

  -- Financial relationships retain their logical kind and workspace, even
  -- where the wrong kind has the right ID in the same physical table.
  INSERT INTO public.entity_customers(id,workspace_id,data) VALUES
    ('test-domain-customer','shared-domain-test','{"id":"test-domain-customer","name":"Test","status":"active"}');
  INSERT INTO public.entity_sites(id,workspace_id,data) VALUES
    ('test-domain-site','shared-domain-test','{"id":"test-domain-site","customer_id":"test-domain-customer"}');
  INSERT INTO public.entity_master_contractors(id,workspace_id,data) VALUES
    ('test-domain-contractor','shared-domain-test','{"id":"test-domain-contractor"}');
  INSERT INTO public."entity_workOrders"(id,workspace_id,data) VALUES
    ('test-domain-work','shared-domain-test','{"id":"test-domain-work","customer_id":"test-domain-customer","site_id":"test-domain-site","contractor_id":"test-domain-contractor"}');
  INSERT INTO public.entity_financial_documents(collection,id,workspace_id,data) VALUES
    ('contractorBills','wrong-kind','shared-domain-test','{"id":"wrong-kind","customer_id":"test-domain-customer","site_id":"test-domain-site","work_order_id":"test-domain-work","contractor_id":"test-domain-contractor"}');
  BEGIN
    INSERT INTO public.entity_money_movements(collection,id,workspace_id,data) VALUES
      ('customerReceipts','invalid-receipt','shared-domain-test','{"id":"invalid-receipt","invoice_id":"wrong-kind","customer_id":"test-domain-customer","site_id":"test-domain-site"}');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'wrong financial kind accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO public.entity_financial_documents(collection,id,workspace_id,data) VALUES
    ('invoices','right-kind','shared-domain-test','{"id":"right-kind","customer_id":"test-domain-customer","site_id":"test-domain-site"}');
  INSERT INTO public.entity_money_movements(collection,id,workspace_id,data) VALUES
    ('customerReceipts','valid-receipt','shared-domain-test','{"id":"valid-receipt","invoice_id":"right-kind","customer_id":"test-domain-customer","site_id":"test-domain-site","amount":200}');
  SET CONSTRAINTS ALL IMMEDIATE;

  -- A cash row in another workspace cannot reference this workspace's invoice.
  BEGIN
    INSERT INTO public.entity_money_movements(collection,id,workspace_id,data) VALUES
      ('customerReceipts','cross-workspace-receipt','other-domain-test','{"id":"cross-workspace-receipt","invoice_id":"right-kind","customer_id":"test-domain-customer","site_id":"test-domain-site"}');
    RAISE EXCEPTION 'cross workspace invoice accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (
      'entity_commercial_documents','entity_financial_documents','entity_money_movements',
      'entity_commercial_settings','entity_workflow_controls','entity_reference_libraries',
      'entity_rate_cards','entity_policy_rules'
    ) AND (NOT c.relrowsecurity OR has_table_privilege('anon',c.oid,'SELECT')
      OR has_table_privilege('authenticated',c.oid,'SELECT'))
  ) THEN RAISE EXCEPTION 'shared storage exposed'; END IF;

  -- Dashboard reads the same canonical receipt and does not mix bill kinds.
  result := public.get_workspace_health_summary_v2('shared-domain-test');
  IF result->'finance'->>'totalReceived' <> '200' THEN RAISE EXCEPTION 'shared health aggregate'; END IF;

  -- Moving approval rules does not remove their Staff assignment guard.
  INSERT INTO public.entity_master_staff(id,workspace_id,data) VALUES
    ('test-domain-staff','shared-domain-test','{"id":"test-domain-staff","name":"Test Staff","status":"active"}');
  BEGIN
    INSERT INTO public.entity_policy_rules(collection,id,workspace_id,data) VALUES
      ('approvalPolicies','invalid-policy','shared-domain-test','{"id":"invalid-policy","approver_id":"missing-staff"}');
    RAISE EXCEPTION 'invalid approver accepted';
  EXCEPTION WHEN foreign_key_violation OR invalid_parameter_value THEN NULL;
  END;
  INSERT INTO public.entity_policy_rules(collection,id,workspace_id,data) VALUES
    ('approvalPolicies','valid-policy','shared-domain-test','{"id":"valid-policy","approver_id":"test-domain-staff"}'),
    ('automationRules','unrelated-rule','shared-domain-test','{"id":"unrelated-rule","assigned_staff_id":"not-a-staff-assignment"}');

  INSERT INTO public.entity_master_units(id,workspace_id,data) VALUES
    ('test-unit','shared-domain-test','{"id":"test-unit","name":"Test unit","symbol":"tu"}');

  -- Contractor capabilities still own their rates. Only their projection is
  -- stored in the shared rate-card table, in the same atomic commit.
  result := public.commit_workspace_operations('shared-domain-test', 3, '[
    {"collection":"master.contractors","table":"entity_master_contractors","upsert":[
      {"id":"test-domain-contractor","work_capabilities":[{"subcategory_id":"test-subcategory","work_type_rates":[{"work_type_id":"test-type","work_type_name":"Test work","material_rate":20,"labour_rate":5,"unit_id":"test-unit"}]}]}
    ]}
  ]'::jsonb);
  IF (SELECT data->>'rate' FROM public.entity_rate_cards WHERE collection='master.contractorRates' AND id='crate-test-domain-contractor-test-subcategory-test-type') <> '25'
  THEN RAISE EXCEPTION 'contractor rate projection not shared'; END IF;
END;
$test$;

ROLLBACK;
