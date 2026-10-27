-- Run after shared_domain_expansion and shared_domain_foreign_keys. Retains no records.
BEGIN;
SET CONSTRAINTS ALL IMMEDIATE;

DO $test$
DECLARE
  before_revision integer;
BEGIN
  INSERT INTO public.entity_customers(id,workspace_id,data) VALUES
    ('fk-customer','fk-review','{"id":"fk-customer","name":"FK review","status":"active"}');
  INSERT INTO public.entity_sites(id,workspace_id,data) VALUES
    ('fk-site','fk-review','{"id":"fk-site","customer_id":"fk-customer"}');
  BEGIN
    INSERT INTO public.entity_sites(id,workspace_id,data) VALUES
      ('fk-cross-site','fk-other','{"id":"fk-cross-site","customer_id":"fk-customer"}');
    RAISE EXCEPTION 'Customer reference crossed workspace boundary';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  INSERT INTO public.entity_catalogue_items(collection,id,workspace_id,data) VALUES
    ('master.articles','fk-article','fk-review','{"id":"fk-article"}'),
    ('master.articleVariants','fk-variant','fk-review','{"id":"fk-variant","article_id":"fk-article"}');
  BEGIN
    INSERT INTO public.entity_catalogue_items(collection,id,workspace_id,data) VALUES
      ('master.articleVariants','fk-wrong-kind-variant','fk-review','{"id":"fk-wrong-kind-variant","article_id":"fk-variant"}');
    RAISE EXCEPTION 'Variant accepted as parent article';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.entity_catalogue_items(collection,id,workspace_id,data) VALUES
      ('master.articleVariants','fk-cross-variant','fk-other','{"id":"fk-cross-variant","article_id":"fk-article"}');
    RAISE EXCEPTION 'Variant crossed article workspace';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    DELETE FROM public.entity_catalogue_items WHERE collection='master.articles' AND id='fk-article';
    RAISE EXCEPTION 'Referenced article deleted without journalled child cleanup';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  IF NOT EXISTS (SELECT FROM public.entity_catalogue_items WHERE collection='master.articleVariants' AND id='fk-variant')
  THEN RAISE EXCEPTION 'Database silently cascaded a business record'; END IF;

  INSERT INTO public."entity_master_fileAssets"(id,workspace_id,data) VALUES
    ('fk-file','fk-review','{"id":"fk-file"}');
  INSERT INTO public.entity_resource_links(collection,id,workspace_id,data) VALUES
    ('entityReferenceAssignments','fk-link','fk-review','{"id":"fk-link","file_asset_id":"unrelated-field"}'),
    ('entityFileAttachments','fk-link','fk-review','{"id":"fk-link","file_asset_id":"fk-file"}');
  BEGIN
    INSERT INTO public.entity_resource_links(collection,id,workspace_id,data) VALUES
      ('entityFileAttachments','fk-missing-file','fk-review','{"id":"fk-missing-file","file_asset_id":"missing-file"}');
    RAISE EXCEPTION 'Attachment accepted missing file';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  INSERT INTO public."entity_master_storageAccounts"(id,workspace_id,data) VALUES
    ('fk-account','fk-review','{"id":"fk-account"}');
  INSERT INTO public.entity_storage_structure(collection,id,workspace_id,data) VALUES
    ('master.storageFolderTemplates','fk-template','fk-review','{"id":"fk-template"}'),
    ('master.storageFolderInstances','fk-folder','fk-review','{"id":"fk-folder","template_id":"fk-template","storage_account_id":"fk-account"}');
  BEGIN
    INSERT INTO public.entity_storage_structure(collection,id,workspace_id,data) VALUES
      ('master.storageFolderInstances','fk-invalid-folder','fk-review','{"id":"fk-invalid-folder","template_id":"fk-folder","storage_account_id":"fk-account"}');
    RAISE EXCEPTION 'Folder instance accepted as template';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  INSERT INTO public.entity_master_staff(id,workspace_id,data) VALUES
    ('fk-staff','fk-review','{"id":"fk-staff","name":"FK staff","status":"active"}');
  INSERT INTO public.entity_financial_documents(collection,id,workspace_id,data) VALUES
    ('payrollPeriods','fk-period','fk-review','{"id":"fk-period"}'),
    ('invoices','fk-not-period','fk-review','{"id":"fk-not-period","customer_id":"fk-customer"}');
  INSERT INTO public.entity_staff_records(collection,id,workspace_id,data) VALUES
    ('payrollLines','fk-payroll','fk-review','{"id":"fk-payroll","staff_id":"fk-staff","payroll_period_id":"fk-period"}');
  BEGIN
    INSERT INTO public.entity_staff_records(collection,id,workspace_id,data) VALUES
      ('payrollLines','fk-invalid-payroll','fk-review','{"id":"fk-invalid-payroll","staff_id":"fk-staff","payroll_period_id":"fk-not-period"}');
    RAISE EXCEPTION 'Invoice accepted as payroll period';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.entity_staff_records(collection,id,workspace_id,data) VALUES
      ('staffDocuments','fk-invalid-document','fk-review','{"id":"fk-invalid-document","staff_id":"fk-staff","file_asset_id":"missing-file"}');
    RAISE EXCEPTION 'Staff document accepted missing file';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  INSERT INTO public.entity_master_vendors(id,workspace_id,data) VALUES
    ('fk-vendor','fk-review','{"id":"fk-vendor"}');
  INSERT INTO public.entity_rate_cards(collection,id,workspace_id,data) VALUES
    ('master.vendorRates','fk-rate','fk-review','{"id":"fk-rate","vendor_id":"fk-vendor","article_id":"fk-article"}'),
    ('master.customerRateSuggestions','fk-not-vendor-rate','fk-review','{"id":"fk-not-vendor-rate"}');
  BEGIN
    INSERT INTO public.entity_rate_cards(collection,id,workspace_id,data) VALUES
      ('master.vendorRateHistories','fk-invalid-rate-history','fk-review','{"id":"fk-invalid-rate-history","vendor_rate_id":"fk-not-vendor-rate","vendor_id":"fk-vendor","article_id":"fk-article"}');
    RAISE EXCEPTION 'Customer rate suggestion accepted as vendor rate';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  INSERT INTO public.entity_areas(id,workspace_id,data) VALUES
    ('fk-area','fk-review','{"id":"fk-area","site_id":"fk-site"}');
  INSERT INTO public.entity_site_records(collection,id,workspace_id,data) VALUES
    ('executionLogs','fk-not-drawing','fk-review','{"id":"fk-not-drawing"}');
  BEGIN
    INSERT INTO public.entity_site_records(collection,id,workspace_id,data) VALUES
      ('measurementRevisions','fk-invalid-measurement','fk-review','{"id":"fk-invalid-measurement","site_id":"fk-site","area_id":"fk-area","drawing_id":"fk-not-drawing"}');
    RAISE EXCEPTION 'Execution log accepted as drawing';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  -- Deferral allows parent/child changes in either order within a journalled commit.
  SET CONSTRAINTS ALL DEFERRED;
  PERFORM public.commit_workspace_operations('fk-batch',0,'[
    {"collection":"master.articleVariants","table":"entity_catalogue_items","upsert":[{"id":"fk-batch-variant","article_id":"fk-batch-article"}]},
    {"collection":"master.articles","table":"entity_catalogue_items","upsert":[{"id":"fk-batch-article"}]}
  ]'::jsonb);
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT revision INTO before_revision FROM public.entity_workspace_revision WHERE id='fk-batch';
  BEGIN
    SET CONSTRAINTS ALL DEFERRED;
    PERFORM public.commit_workspace_operations('fk-batch',before_revision,'[
      {"collection":"master.articleVariants","table":"entity_catalogue_items","upsert":[{"id":"fk-batch-orphan","article_id":"missing-article"}]}
    ]'::jsonb);
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Deferred orphan accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  IF (SELECT revision FROM public.entity_workspace_revision WHERE id='fk-batch') <> before_revision
     OR (SELECT count(*) FROM public.entity_workspace_change_batches WHERE workspace_id='fk-batch') <> 1
     OR EXISTS (SELECT FROM public.entity_catalogue_items WHERE id='fk-batch-orphan')
  THEN RAISE EXCEPTION 'Failed FK commit left a partial row, revision or journal'; END IF;
END;
$test$;

ROLLBACK;
