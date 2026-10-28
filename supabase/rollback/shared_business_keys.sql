-- Reverse these checks before shared_domain_connections. No business data is removed.

BEGIN;

SET LOCAL lock_timeout = '15s';

LOCK TABLE public.entity_workspace_revision IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.entity_project_work DROP CONSTRAINT "uc_workrequired_site_customer";

DROP INDEX public."uc_workrequired_site_customer_support";

ALTER TABLE public.entity_project_work DROP CONSTRAINT "uc_acceptedscopes_site_customer";

DROP INDEX public."uc_acceptedscopes_site_customer_support";

ALTER TABLE public.entity_project_work DROP CONSTRAINT "uc_workorders_site_customer";

DROP INDEX public."uc_workorders_site_customer_support";

ALTER TABLE public."entity_catalogue_items" DROP CONSTRAINT "uc_article_canonical_name";

ALTER TABLE public."entity_catalogue_items" DROP CONSTRAINT "uc_article_variant_identity";

ALTER TABLE public."entity_master_subcategoryArticleMap" DROP CONSTRAINT "uc_scoped_material_identity";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "uc_active_vendor_rate_identity";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "uc_active_variant";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "uc_active_article";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "uc_active_vendor";

ALTER TABLE public."entity_catalogue_items" DROP COLUMN "uc_variant_name";

ALTER TABLE public."entity_catalogue_items" DROP COLUMN "uc_variant_article";

ALTER TABLE public."entity_catalogue_items" DROP COLUMN "uc_article_name";

DROP INDEX public.uc_site_customer_identity;

NOTIFY pgrst, 'reload schema';

COMMIT;
