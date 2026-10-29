-- Run after shared_domain_connections and shared_business_keys. Retains no rows.
BEGIN;
SET CONSTRAINTS ALL IMMEDIATE;

DO $test$
DECLARE
  kind text;
  child jsonb;
BEGIN
  INSERT INTO public.entity_customers(id,workspace_id,data) VALUES
    ('connect-customer-a','connect-review','{"id":"connect-customer-a","name":"Connection A"}'),
    ('connect-customer-b','connect-review','{"id":"connect-customer-b","name":"Connection B"}');
  INSERT INTO public.entity_sites(id,workspace_id,data) VALUES
    ('connect-site-a','connect-review','{"id":"connect-site-a","customer_id":"connect-customer-a"}');
  INSERT INTO public.entity_project_work(collection,id,workspace_id,data) VALUES
    ('workRequired','connect-work','connect-review','{"id":"connect-work","customer_id":"connect-customer-a","site_id":"connect-site-a","title":"Connection work","work_subcategory_ids":[],"work_type_ids":[],"status":"in_progress"}'),
    ('workOrders','connect-work','connect-review','{"id":"connect-work","customer_id":"connect-customer-a","site_id":"connect-site-a","status":"scheduled"}');
  INSERT INTO public.entity_commercial_documents(collection,id,workspace_id,data) VALUES
    ('quotations','connect-quote','connect-review','{"id":"connect-quote","customer_id":"connect-customer-a","site_id":"connect-site-a"}');
  INSERT INTO public.entity_project_work(collection,id,workspace_id,data) VALUES
    ('acceptedScopes','connect-scope','connect-review','{"id":"connect-scope","customer_id":"connect-customer-a","site_id":"connect-site-a","work_required_id":"connect-work","quotation_id":"connect-quote","work_order_id":"connect-work"}');

  -- All individual IDs exist; the compound relationship must still reject
  -- pairing Customer B with a Site owned by Customer A, for every project kind.
  FOREACH kind IN ARRAY ARRAY['workRequired','acceptedScopes','workOrders'] LOOP
    child := jsonb_build_object('id','connect-invalid-' || kind,
      'customer_id','connect-customer-b','site_id','connect-site-a','title','Wrong context','work_subcategory_ids','[]'::jsonb,'work_type_ids','[]'::jsonb);
    IF kind='acceptedScopes' THEN
      child := child || '{"work_required_id":"connect-work","quotation_id":"connect-quote"}'::jsonb;
    END IF;
    BEGIN
      INSERT INTO public.entity_project_work(collection,id,workspace_id,data)
      VALUES (kind,child->>'id','connect-review',child);
      RAISE EXCEPTION 'Wrong Site/Customer combination accepted for %',kind;
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  END LOOP;

  BEGIN
    INSERT INTO public.entity_project_work(collection,id,workspace_id,data) VALUES
      ('acceptedScopes','connect-wrong-kind','connect-review','{"id":"connect-wrong-kind","customer_id":"connect-customer-a","site_id":"connect-site-a","work_required_id":"connect-scope","quotation_id":"connect-quote"}');
    RAISE EXCEPTION 'Accepted Scope incorrectly satisfied a Work Required parent';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.entity_project_work(collection,id,workspace_id,data) VALUES
      ('workRequired','connect-cross-workspace','connect-other','{"id":"connect-cross-workspace","customer_id":"connect-customer-a","site_id":"connect-site-a","title":"Cross workspace","work_subcategory_ids":[],"work_type_ids":[]}');
    RAISE EXCEPTION 'Project links crossed workspace boundary';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  INSERT INTO public.entity_financial_documents(collection,id,workspace_id,data) VALUES
    ('payments','connect-schedule','connect-review','{"id":"connect-schedule","customer_id":"connect-customer-a","site_id":"connect-site-a","amount":40,"status":"overdue","due_date":"2000-01-01","balance_amount":999}'),
    ('invoices','connect-schedule','connect-review','{"id":"connect-schedule","customer_id":"connect-customer-a","site_id":"connect-site-a","amount":70,"status":"issued","due_date":"2000-01-01","balance_amount":70}');
  INSERT INTO public."entity_master_sourcePartners"(id,workspace_id,data) VALUES
    ('connect-partner','connect-review','{"id":"connect-partner","name":"Connection Partner"}');
  INSERT INTO public.entity_financial_documents(collection,id,workspace_id,data) VALUES
    ('commissions','connect-commission','connect-review','{"id":"connect-commission","source_partner_id":"connect-partner","customer_id":"connect-customer-a","amount":5,"status":"accrued"}');

  INSERT INTO public.entity_master_units(id,workspace_id,data) VALUES
    ('connect-unit','connect-review','{"id":"connect-unit","name":"Piece"}');
  INSERT INTO public.entity_catalogue_items(collection,id,workspace_id,data) VALUES
    ('master.articles','connect-article-a','connect-review','{"id":"connect-article-a","name":"Connection Material","unit_id":"connect-unit","default_unit_id":"connect-unit"}'),
    ('master.articles','connect-article-b','connect-review','{"id":"connect-article-b","name":"Other Connection Material","unit_id":"connect-unit","default_unit_id":"connect-unit"}');
  BEGIN
    INSERT INTO public.entity_catalogue_items(collection,id,workspace_id,data) VALUES
      ('master.articles','connect-article-duplicate','connect-review','{"id":"connect-article-duplicate","name":"  CONNECTION    MATERIAL  "}');
    RAISE EXCEPTION 'Normalized duplicate Article name accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- Canonical names are workspace-local, not a global business restriction.
  INSERT INTO public.entity_catalogue_items(collection,id,workspace_id,data) VALUES
    ('master.articles','connect-article-other-workspace','connect-other','{"id":"connect-article-other-workspace","name":"Connection Material"}');
  INSERT INTO public.entity_catalogue_items(collection,id,workspace_id,data) VALUES
    ('master.articleVariants','connect-variant','connect-review','{"id":"connect-variant","article_id":"connect-article-a","name":"Grade A"}'),
    ('master.articleVariants','connect-other-variant','connect-review','{"id":"connect-other-variant","article_id":"connect-article-b","name":"Grade A"}');
  BEGIN
    INSERT INTO public.entity_catalogue_items(collection,id,workspace_id,data) VALUES
      ('master.articleVariants','connect-variant-duplicate','connect-review','{"id":"connect-variant-duplicate","article_id":"connect-article-a","name":" grade   a "}');
    RAISE EXCEPTION 'Duplicate Article variant accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  INSERT INTO public.entity_work_definitions(collection,id,workspace_id,data) VALUES
    ('master.workCategories','connect-category','connect-review','{"id":"connect-category","name":"Connection category"}'),
    ('master.workSubcategories','connect-subcategory','connect-review','{"id":"connect-subcategory","name":"Connection work","category_id":"connect-category","unit_id":"connect-unit","work_types":[{"id":"connect-type","name":"Standard","unit_id":"connect-unit"}]}');
  INSERT INTO public."entity_master_subcategoryArticleMap"(id,workspace_id,data) VALUES
    ('connect-material','connect-review','{"id":"connect-material","work_required_id":"connect-subcategory","article_id":"connect-article-a","unit_id":"connect-unit","reference_rate":10}');
  BEGIN
    INSERT INTO public."entity_master_subcategoryArticleMap"(id,workspace_id,data) VALUES
      ('connect-material-duplicate','connect-review','{"id":"connect-material-duplicate","work_required_id":"connect-subcategory","article_id":"connect-article-a","unit_id":"connect-unit","reference_rate":20}');
    RAISE EXCEPTION 'Duplicate scoped material accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  INSERT INTO public.entity_master_vendors(id,workspace_id,data) VALUES
    ('connect-vendor','connect-review','{"id":"connect-vendor","name":"Connection Vendor"}');
  INSERT INTO public.entity_rate_cards(collection,id,workspace_id,data) VALUES
    ('master.vendorRates','connect-rate','connect-review','{"id":"connect-rate","vendor_id":"connect-vendor","article_id":"connect-article-a","quoted_rate":10,"status":"active"}'),
    ('master.vendorRates','connect-inactive-rate','connect-review','{"id":"connect-inactive-rate","vendor_id":"connect-vendor","article_id":"connect-article-a","quoted_rate":5,"status":"inactive"}'),
    ('master.vendorRates','connect-variant-rate','connect-review','{"id":"connect-variant-rate","vendor_id":"connect-vendor","article_id":"connect-article-a","variant_id":"connect-variant","quoted_rate":15,"status":"active"}');
  BEGIN
    INSERT INTO public.entity_rate_cards(collection,id,workspace_id,data) VALUES
      ('master.vendorRates','connect-rate-duplicate','connect-review','{"id":"connect-rate-duplicate","vendor_id":"connect-vendor","article_id":"connect-article-a","variant_id":"","quoted_rate":12,"status":"active"}');
    RAISE EXCEPTION 'Duplicate active Vendor rate accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- A replacement may be inserted before the old rate is retired within one
  -- atomic save. Check uniqueness at transaction end, keeping history intact.
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO public.entity_rate_cards(collection,id,workspace_id,data) VALUES
    ('master.vendorRates','connect-replacement-rate','connect-review','{"id":"connect-replacement-rate","vendor_id":"connect-vendor","article_id":"connect-article-a","quoted_rate":18,"status":"active"}');
  UPDATE public.entity_rate_cards SET data=jsonb_set(data,'{status}','"inactive"')
    WHERE collection='master.vendorRates' AND id='connect-rate';
  SET CONSTRAINTS ALL IMMEDIATE;

  INSERT INTO public.entity_reference_libraries(collection,id,workspace_id,data) VALUES
    ('master.catalogues','connect-catalogue','connect-review','{"id":"connect-catalogue","title":"Connection catalogue"}');
  INSERT INTO public.entity_resource_links(collection,id,workspace_id,data) VALUES
    ('master.catalogueArticleVendorLinks','connect-resource','connect-review','{"id":"connect-resource","catalogue_id":"connect-catalogue","article_id":"connect-article-a","vendor_id":"connect-vendor","variant_id":"connect-variant"}'),
    ('entityReferenceAssignments','connect-resource','connect-review','{"id":"connect-resource"}');
  BEGIN
    INSERT INTO public.entity_resource_links(collection,id,workspace_id,data) VALUES
      ('master.catalogueArticleVendorLinks','connect-invalid-catalogue','connect-review','{"id":"connect-invalid-catalogue","catalogue_id":"connect-article-a","article_id":"connect-article-a"}');
    RAISE EXCEPTION 'Article incorrectly satisfied catalogue parent';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  IF (public.get_workspace_health_summary_v2('connect-review')->'operations'->>'activeWorkOrders')::integer <> 1
    OR (public.get_workspace_health_summary_v2('connect-review')->'finance'->>'overdueInvoiceValue')::numeric <> 70
  THEN RAISE EXCEPTION 'Shared work/finance aggregates mixed logical kinds'; END IF;

  IF has_table_privilege('anon','public.entity_project_work','SELECT')
    OR has_table_privilege('authenticated','public.entity_project_work','SELECT')
    OR NOT has_table_privilege('service_role','public.entity_project_work','SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'Shared project storage grants changed authorization boundaries'; END IF;
END $test$;

ROLLBACK;
