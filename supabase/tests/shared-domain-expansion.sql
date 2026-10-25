-- Exercise current storage, never retain test records in production.
BEGIN;
SET CONSTRAINTS ALL IMMEDIATE;

DO $test$
DECLARE
  result jsonb;
  before_finance jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (
      'entity_work_definitions','entity_site_records','entity_catalogue_items',
      'entity_resource_links','entity_staff_records','entity_storage_structure',
      'entity_workflow_controls','entity_policy_rules','entity_commercial_documents',
      'entity_financial_documents','entity_rate_cards'
    ) AND (NOT c.relrowsecurity OR has_table_privilege('anon',c.oid,'SELECT')
      OR has_table_privilege('authenticated',c.oid,'SELECT'))
  ) THEN RAISE EXCEPTION 'Expanded storage exposed to browser roles'; END IF;

  INSERT INTO public.entity_master_staff(id,workspace_id,data) VALUES
    ('expand-staff','expansion-test','{"id":"expand-staff","name":"Expansion Staff","status":"active"}');

  -- Workflow kinds retain distinct records, CAS keys and staff normalization.
  result := public.commit_workspace_operations('expansion-test',0,'[
    {"collection":"tasks","table":"entity_workflow_controls","upsert":[{"id":"expand-shared","assigned_to":"Expansion Staff"}]},
    {"collection":"followups","table":"entity_workflow_controls","upsert":[{"id":"expand-shared","assigned_staff_id":"expand-staff"}]},
    {"collection":"visits","table":"entity_workflow_controls","upsert":[{"id":"expand-shared","assignee_type":"contractor"}]}
  ]'::jsonb);
  IF result->>'upserted' <> '3' OR
    (SELECT data->>'assigned_staff_id' FROM public.entity_workflow_controls WHERE collection='tasks' AND id='expand-shared') <> 'expand-staff'
  THEN RAISE EXCEPTION 'Workflow identity or staff normalization changed'; END IF;
  result := public.commit_workspace_operations('expansion-test',1,'[
    {"collection":"tasks","table":"entity_workflow_controls","upsert":[{"id":"expand-shared","title":"Updated task","assigned_staff_id":"expand-staff"}]}
  ]'::jsonb,'{"tasks:expand-shared":0}'::jsonb);
  IF (SELECT count(*) FROM public.entity_workflow_controls WHERE id='expand-shared' AND revision=0) <> 2
  THEN RAISE EXCEPTION 'Workflow update crossed kind boundary'; END IF;
  BEGIN
    PERFORM public.commit_workspace_operations('expansion-test',2,'[
      {"collection":"tasks","table":"entity_workflow_controls","upsert":[{"id":"expand-shared"}]}
    ]'::jsonb,'{"tasks:expand-shared":0}'::jsonb);
    RAISE EXCEPTION 'Stale workflow CAS accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.commit_workspace_operations('expansion-test',2,'[
      {"collection":"tasks","table":"entity_staff_records","upsert":[{"id":"forged"}]}
    ]'::jsonb);
    RAISE EXCEPTION 'Forged physical table accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT count(*) FROM public.entity_workspace_change_batches WHERE workspace_id='expansion-test') <> 2
  THEN RAISE EXCEPTION 'Failed operation changed journal'; END IF;

  -- A recovery task must point to a follow-up, including when an action has that ID.
  INSERT INTO public.entity_workflow_controls(collection,id,workspace_id,data) VALUES
    ('actions','expand-wrong-followup','expansion-test','{"id":"expand-wrong-followup"}');
  BEGIN
    INSERT INTO public.entity_workflow_controls(collection,id,workspace_id,data) VALUES
      ('tasks','expand-invalid-recovery','expansion-test','{"id":"expand-invalid-recovery","task_type":"followup_recovery","source_followup_id":"expand-wrong-followup"}');
    RAISE EXCEPTION 'Action accepted as recovery follow-up';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  INSERT INTO public.entity_workflow_controls(collection,id,workspace_id,data) VALUES
    ('tasks','expand-valid-recovery','expansion-test','{"id":"expand-valid-recovery","task_type":"followup_recovery","source_followup_id":"expand-shared"}');
  BEGIN
    INSERT INTO public.entity_workflow_controls(collection,id,workspace_id,data) VALUES
      ('tasks','expand-cross-workspace','expansion-other','{"id":"expand-cross-workspace","task_type":"followup_recovery","source_followup_id":"expand-shared"}');
    RAISE EXCEPTION 'Cross-workspace follow-up accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    DELETE FROM public.entity_workflow_controls WHERE collection='followups' AND id='expand-shared';
    RAISE EXCEPTION 'Referenced follow-up deleted';
  EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.entity_policy_rules(collection,id,workspace_id,data) VALUES
      ('recurringTasks','expand-invalid-recurrence','expansion-test','{"id":"expand-invalid-recurrence","assigned_staff_id":"missing-staff"}');
    RAISE EXCEPTION 'Recurrence staff guard missing';
  EXCEPTION WHEN foreign_key_violation OR invalid_parameter_value THEN NULL; END;
  INSERT INTO public.entity_policy_rules(collection,id,workspace_id,data) VALUES
    ('recurringTasks','expand-recurrence','expansion-test','{"id":"expand-recurrence","assigned_staff_id":"expand-staff"}'),
    ('automationRules','expand-unrelated-rule','expansion-test','{"id":"expand-unrelated-rule","assigned_staff_id":"not-an-assignment"}');

  -- HR unique dates and staff history normalization stay scoped to their kind.
  INSERT INTO public.entity_staff_records(collection,id,workspace_id,data) VALUES
    ('attendance','expand-hr-shared','expansion-test','{"id":"expand-hr-shared","staff_id":"expand-staff","staff_name":"Old name","date":"2026-10-25"}'),
    ('payrollLines','expand-hr-shared','expansion-test','{"id":"expand-hr-shared","staff_id":"expand-staff","staff_name":"Old name","date":"2026-10-25"}'),
    ('staffDocuments','expand-document','expansion-test','{"id":"expand-document","staff_id":"expand-staff"}');
  IF EXISTS (SELECT 1 FROM public.entity_staff_records WHERE workspace_id='expansion-test' AND collection IN ('attendance','payrollLines') AND data ? 'staff_name')
  THEN RAISE EXCEPTION 'Staff history name normalization missing'; END IF;
  BEGIN
    INSERT INTO public.entity_staff_records(collection,id,workspace_id,data) VALUES
      ('attendance','expand-duplicate-date','expansion-test','{"id":"expand-duplicate-date","staff_id":"expand-staff","date":"2026-10-25"}');
    RAISE EXCEPTION 'Duplicate staff attendance accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- Shared taxonomy protects references to another kind even with the same ID.
  INSERT INTO public.entity_work_definitions(collection,id,workspace_id,data) VALUES
    ('master.workCategories','expand-definition','expansion-test','{"id":"expand-definition","name":"Category","status":"active"}'),
    ('master.workSubcategories','expand-definition','expansion-test','{"id":"expand-definition","category_id":"expand-definition","name":"Work","work_types":[{"id":"expand-work-type","name":"Work type","status":"active"}]}'),
    ('master.workOptionGroups','expand-not-category','expansion-test','{"id":"expand-not-category"}');
  BEGIN
    DELETE FROM public.entity_work_definitions WHERE collection='master.workCategories' AND id='expand-definition';
    RAISE EXCEPTION 'Category referenced by same-ID subcategory deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.entity_work_definitions(collection,id,workspace_id,data) VALUES
      ('master.workSubcategories','expand-invalid-category','expansion-test','{"id":"expand-invalid-category","category_id":"expand-not-category","work_types":[{"id":"test","name":"Test"}]}');
    RAISE EXCEPTION 'Option group accepted as category';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  -- Every new domain supports independent same-ID records through the atomic API.
  result := public.commit_workspace_operations('expansion-test',2,'[
    {"collection":"master.articles","table":"entity_catalogue_items","upsert":[{"id":"expand-catalogue","name":"Shared article"}]},
    {"collection":"master.articleVariants","table":"entity_catalogue_items","upsert":[{"id":"expand-catalogue","article_id":"expand-catalogue","name":"Variant"}]},
    {"collection":"master.storageFolderTemplates","table":"entity_storage_structure","upsert":[{"id":"expand-folder","purpose":"general"}]},
    {"collection":"master.storageFolderInstances","table":"entity_storage_structure","upsert":[{"id":"expand-folder","template_id":"expand-folder"}]},
    {"collection":"entityFileAttachments","table":"entity_resource_links","upsert":[{"id":"expand-link","entity_id":"expand-catalogue"}]},
    {"collection":"entityReferenceAssignments","table":"entity_resource_links","upsert":[{"id":"expand-link","entity_id":"expand-catalogue"}]},
    {"collection":"measurementRevisions","table":"entity_site_records","upsert":[{"id":"expand-record","status":"verified"}]},
    {"collection":"drawings","table":"entity_site_records","upsert":[{"id":"expand-record","status":"draft"}]},
    {"collection":"executionLogs","table":"entity_site_records","upsert":[{"id":"expand-record","status":"done"}]},
    {"collection":"variationRequests","table":"entity_site_records","upsert":[{"id":"expand-record","status":"pending"}]}
  ]'::jsonb);
  IF result->>'upserted' <> '10' OR
    (SELECT count(*) FROM public.entity_site_records WHERE id='expand-record') <> 4
  THEN RAISE EXCEPTION 'New-domain write isolation failed'; END IF;

  -- Financial totals must not count payroll as invoices or dispatches as GRNs.
  before_finance := public.get_workspace_health_summary_v2('expansion-test')->'finance';
  INSERT INTO public.entity_financial_documents(collection,id,workspace_id,data) VALUES
    ('payrollPeriods','expand-payroll','expansion-test','{"id":"expand-payroll","total":999999,"status":"approved"}');
  IF (public.get_workspace_health_summary_v2('expansion-test')->'finance') IS DISTINCT FROM before_finance
  THEN RAISE EXCEPTION 'Payroll leaked into customer/vendor financial totals'; END IF;
  INSERT INTO public.entity_master_vendors(id,workspace_id,data) VALUES
    ('expand-vendor','expansion-test','{"id":"expand-vendor"}');
  INSERT INTO public.entity_commercial_documents(collection,id,workspace_id,data) VALUES
    ('purchaseOrders','expand-po','expansion-test','{"id":"expand-po","vendor_id":"expand-vendor"}'),
    ('dispatches','expand-not-grn','expansion-test','{"id":"expand-not-grn"}');
  BEGIN
    INSERT INTO public.entity_financial_documents(collection,id,workspace_id,data) VALUES
      ('vendorBills','expand-invalid-bill','expansion-test','{"id":"expand-invalid-bill","vendor_id":"expand-vendor","po_id":"expand-po","grn_id":"expand-not-grn"}');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Dispatch accepted as goods receipt';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  INSERT INTO public.entity_commercial_documents(collection,id,workspace_id,data) VALUES
    ('grns','expand-grn','expansion-test','{"id":"expand-grn","vendor_id":"expand-vendor","po_id":"expand-po"}');
  INSERT INTO public.entity_financial_documents(collection,id,workspace_id,data) VALUES
    ('vendorBills','expand-valid-bill','expansion-test','{"id":"expand-valid-bill","vendor_id":"expand-vendor","po_id":"expand-po","grn_id":"expand-grn"}');
  SET CONSTRAINTS ALL IMMEDIATE;
  BEGIN
    INSERT INTO public.entity_site_records(collection,id,workspace_id,data) VALUES
      ('master.staff','expand-invalid-kind','expansion-test','{"id":"expand-invalid-kind"}');
    RAISE EXCEPTION 'Invalid collection discriminator accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$test$;

ROLLBACK;
