-- Native business identity and project ownership checks. Payloads are unchanged.
-- Deferred uniqueness permits valid multi-row replacements/renames in one atomic save.

BEGIN;

SET LOCAL lock_timeout = '15s';

SET LOCAL statement_timeout = '120s';

LOCK TABLE public.entity_workspace_revision IN ACCESS EXCLUSIVE MODE;

CREATE UNIQUE INDEX uc_site_customer_identity ON public.entity_sites (workspace_id,id,customer_id_gen);

CREATE INDEX "uc_workrequired_site_customer_support" ON public.entity_project_work (workspace_id,"s3_6fc8b17aae6d46b1d13a031e","s3_2aaddbfe67bdafd733ff86e1");

ALTER TABLE public.entity_project_work ADD CONSTRAINT "uc_workrequired_site_customer" FOREIGN KEY (workspace_id,"s3_6fc8b17aae6d46b1d13a031e","s3_2aaddbfe67bdafd733ff86e1") REFERENCES public.entity_sites (workspace_id,id,customer_id_gen) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "uc_acceptedscopes_site_customer_support" ON public.entity_project_work (workspace_id,"s3_9b63066cfa8c01d579fb2068","s3_f2308fd3081e61b99708e8c7");

ALTER TABLE public.entity_project_work ADD CONSTRAINT "uc_acceptedscopes_site_customer" FOREIGN KEY (workspace_id,"s3_9b63066cfa8c01d579fb2068","s3_f2308fd3081e61b99708e8c7") REFERENCES public.entity_sites (workspace_id,id,customer_id_gen) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "uc_workorders_site_customer_support" ON public.entity_project_work (workspace_id,"s3_92800d563b5984e547403d99","s3_f81a7c076373446ffc1406ed");

ALTER TABLE public.entity_project_work ADD CONSTRAINT "uc_workorders_site_customer" FOREIGN KEY (workspace_id,"s3_92800d563b5984e547403d99","s3_f81a7c076373446ffc1406ed") REFERENCES public.entity_sites (workspace_id,id,customer_id_gen) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_catalogue_items" ADD COLUMN "uc_article_name" text GENERATED ALWAYS AS (CASE WHEN collection='master.articles' THEN nullif(lower(btrim(regexp_replace(coalesce(data->>'name',''),'[[:space:]]+',' ','g'))),'') ELSE NULL::text END) STORED;

ALTER TABLE public."entity_catalogue_items" ADD CONSTRAINT "uc_article_canonical_name" UNIQUE ("workspace_id", "uc_article_name") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_catalogue_items" ADD COLUMN "uc_variant_article" text GENERATED ALWAYS AS (CASE WHEN collection='master.articleVariants' THEN nullif(data->>'article_id','') ELSE NULL::text END) STORED;

ALTER TABLE public."entity_catalogue_items" ADD COLUMN "uc_variant_name" text GENERATED ALWAYS AS (CASE WHEN collection='master.articleVariants' THEN nullif(lower(btrim(regexp_replace(coalesce(data->>'name',''),'[[:space:]]+',' ','g'))),'') ELSE NULL::text END) STORED;

ALTER TABLE public."entity_catalogue_items" ADD CONSTRAINT "uc_article_variant_identity" UNIQUE ("workspace_id", "uc_variant_article", "uc_variant_name") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_master_subcategoryArticleMap" ADD CONSTRAINT "uc_scoped_material_identity" UNIQUE ("workspace_id", "fk_6e9bdb1ecfdba3041d6b95", "fk_b36ddbb4bc654531c3c1cc") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_rate_cards" ADD COLUMN "uc_active_vendor" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRates' AND coalesce(data->>'status','active')='active' THEN nullif(data->>'vendor_id','') ELSE NULL::text END) STORED;

ALTER TABLE public."entity_rate_cards" ADD COLUMN "uc_active_article" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRates' AND coalesce(data->>'status','active')='active' THEN nullif(data->>'article_id','') ELSE NULL::text END) STORED;

ALTER TABLE public."entity_rate_cards" ADD COLUMN "uc_active_variant" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRates' AND coalesce(data->>'status','active')='active' THEN coalesce(nullif(data->>'variant_id',''),'') ELSE NULL::text END) STORED;

ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "uc_active_vendor_rate_identity" UNIQUE ("workspace_id", "uc_active_vendor", "uc_active_article", "uc_active_variant") DEFERRABLE INITIALLY DEFERRED;

SET CONSTRAINTS ALL IMMEDIATE;

NOTIFY pgrst, 'reload schema';

COMMIT;
