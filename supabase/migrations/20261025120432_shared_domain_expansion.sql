-- Shared domain expansion: 73 -> 52 public tables; preserve 80 logical collections.
-- Full envelopes are compared before dropping source tables. No CASCADE or compatibility views.

BEGIN;

SET LOCAL lock_timeout = '15s';

SET LOCAL statement_timeout = '120s';

LOCK TABLE public.entity_workspace_revision IN ACCESS EXCLUSIVE MODE;

SET CONSTRAINTS ALL IMMEDIATE;

LOCK TABLE public."entity_attendance", public."entity_commercial_documents", public."entity_dispatches", public."entity_drawings", public."entity_entityFileAttachments", public."entity_entityReferenceAssignments", public."entity_executionLogs", public."entity_financial_documents", public."entity_followups", public."entity_grns", public."entity_leaveRequests", public."entity_master_articleVariants", public."entity_master_articles", public."entity_master_storageFolderInstances", public."entity_master_storageFolderTemplates", public."entity_master_vendorRateHistories", public."entity_master_workCategories", public."entity_master_workOptionGroups", public."entity_master_workOptionValues", public."entity_master_workSubcategories", public."entity_measurementRevisions", public."entity_payrollLines", public."entity_payrollPeriods", public."entity_policy_rules", public."entity_rate_cards", public."entity_recurringTasks", public."entity_salaryAdjustments", public."entity_staffDocuments", public."entity_tasks", public."entity_variationRequests", public."entity_visits", public."entity_workflow_controls" IN ACCESS EXCLUSIVE MODE;

DO $preflight$ BEGIN IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') <> 73 THEN RAISE EXCEPTION 'Expected 73 public tables before shared-domain expansion'; END IF; END $preflight$;

CREATE TABLE public."entity_catalogue_items" (collection text NOT NULL, "id" text NOT NULL, "workspace_id" text DEFAULT 'default'::text NOT NULL, "revision" bigint DEFAULT 0 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_by" text, "data" jsonb NOT NULL, PRIMARY KEY(collection,id));

ALTER TABLE public."entity_catalogue_items" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_catalogue_items" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_catalogue_items" TO service_role;

COMMENT ON TABLE public."entity_catalogue_items" IS 'Typed shared domain storage. Server-only workspace APIs enforce logical collection permissions; IDs and financial history retain their owners.';

CREATE TABLE public."entity_resource_links" (collection text NOT NULL, "id" text NOT NULL, "workspace_id" text DEFAULT 'default'::text NOT NULL, "revision" bigint DEFAULT 0 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_by" text, "data" jsonb NOT NULL, PRIMARY KEY(collection,id));

ALTER TABLE public."entity_resource_links" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_resource_links" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_resource_links" TO service_role;

COMMENT ON TABLE public."entity_resource_links" IS 'Typed shared domain storage. Server-only workspace APIs enforce logical collection permissions; IDs and financial history retain their owners.';

CREATE TABLE public."entity_site_records" (collection text NOT NULL, "id" text NOT NULL, "workspace_id" text DEFAULT 'default'::text NOT NULL, "revision" bigint DEFAULT 0 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_by" text, "data" jsonb NOT NULL, PRIMARY KEY(collection,id));

ALTER TABLE public."entity_site_records" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_site_records" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_site_records" TO service_role;

COMMENT ON TABLE public."entity_site_records" IS 'Typed shared domain storage. Server-only workspace APIs enforce logical collection permissions; IDs and financial history retain their owners.';

CREATE TABLE public."entity_staff_records" (collection text NOT NULL, "id" text NOT NULL, "workspace_id" text DEFAULT 'default'::text NOT NULL, "revision" bigint DEFAULT 0 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_by" text, "data" jsonb NOT NULL, PRIMARY KEY(collection,id));

ALTER TABLE public."entity_staff_records" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_staff_records" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_staff_records" TO service_role;

COMMENT ON TABLE public."entity_staff_records" IS 'Typed shared domain storage. Server-only workspace APIs enforce logical collection permissions; IDs and financial history retain their owners.';

CREATE TABLE public."entity_storage_structure" (collection text NOT NULL, "id" text NOT NULL, "workspace_id" text DEFAULT 'default'::text NOT NULL, "revision" bigint DEFAULT 0 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_by" text, "data" jsonb NOT NULL, PRIMARY KEY(collection,id));

ALTER TABLE public."entity_storage_structure" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_storage_structure" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_storage_structure" TO service_role;

COMMENT ON TABLE public."entity_storage_structure" IS 'Typed shared domain storage. Server-only workspace APIs enforce logical collection permissions; IDs and financial history retain their owners.';

CREATE TABLE public."entity_work_definitions" (collection text NOT NULL, "id" text NOT NULL, "workspace_id" text DEFAULT 'default'::text NOT NULL, "revision" bigint DEFAULT 0 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_by" text, "data" jsonb NOT NULL, PRIMARY KEY(collection,id));

ALTER TABLE public."entity_work_definitions" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_work_definitions" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_work_definitions" TO service_role;

COMMENT ON TABLE public."entity_work_definitions" IS 'Typed shared domain storage. Server-only workspace APIs enforce logical collection permissions; IDs and financial history retain their owners.';

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "entity_commercial_documents_collection_check";

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "entity_commercial_documents_collection_check" CHECK (collection IN ('quotations', 'boqs', 'vendorRfqs', 'vendorBids', 'contractorBids', 'purchaseOrders', 'contractorSettlements', 'grns', 'dispatches'));

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "entity_financial_documents_collection_check";

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "entity_financial_documents_collection_check" CHECK (collection IN ('invoices', 'vendorBills', 'contractorBills', 'payrollPeriods'));

ALTER TABLE public."entity_policy_rules" DROP CONSTRAINT "entity_policy_rules_collection_check";

ALTER TABLE public."entity_policy_rules" ADD CONSTRAINT "entity_policy_rules_collection_check" CHECK (collection IN ('approvalPolicies', 'automationRules', 'master.commissionRules', 'recurringTasks'));

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "entity_rate_cards_collection_check";

ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "entity_rate_cards_collection_check" CHECK (collection IN ('master.vendorRates', 'master.contractorRates', 'master.customerRateSuggestions', 'master.vendorRateHistories'));

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "entity_workflow_controls_collection_check";

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "entity_workflow_controls_collection_check" CHECK (collection IN ('actions', 'risks', 'blocked', 'tasks', 'followups', 'visits'));

ALTER TABLE public."entity_catalogue_items" ADD CONSTRAINT "entity_catalogue_items_collection_check" CHECK (collection IN ('master.articles', 'master.articleVariants'));

ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "entity_resource_links_collection_check" CHECK (collection IN ('entityFileAttachments', 'entityReferenceAssignments'));

ALTER TABLE public."entity_site_records" ADD CONSTRAINT "entity_site_records_collection_check" CHECK (collection IN ('measurementRevisions', 'drawings', 'executionLogs', 'variationRequests'));

ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "entity_staff_records_collection_check" CHECK (collection IN ('attendance', 'payrollLines', 'leaveRequests', 'salaryAdjustments', 'staffDocuments'));

ALTER TABLE public."entity_storage_structure" ADD CONSTRAINT "entity_storage_structure_collection_check" CHECK (collection IN ('master.storageFolderTemplates', 'master.storageFolderInstances'));

ALTER TABLE public."entity_work_definitions" ADD CONSTRAINT "entity_work_definitions_collection_check" CHECK (collection IN ('master.workCategories', 'master.workSubcategories', 'master.workOptionGroups', 'master.workOptionValues'));

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "po_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'po_id'::text), ''::text)) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "sd_989b10de1fd234494cb0" text GENERATED ALWAYS AS ('purchaseOrders'::text) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "sd_7a96ce1039e7d83685ee" text GENERATED ALWAYS AS ('purchaseOrders'::text) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "assigned_staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'assigned_staff_id'::text)), ''::text)) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "source_followup_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'source_followup_id'::text), ''::text)) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'assigned_staff_id'::text)), ''::text)) STORED;

ALTER TABLE public."entity_policy_rules" ADD COLUMN "assigned_staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'assigned_staff_id'::text)), ''::text)) STORED;

ALTER TABLE public."entity_site_records" ADD COLUMN "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED;

ALTER TABLE public."entity_site_records" ADD COLUMN "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED;

ALTER TABLE public."entity_resource_links" ADD COLUMN "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED;

ALTER TABLE public."entity_resource_links" ADD COLUMN "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED;

ALTER TABLE public."entity_staff_records" ADD COLUMN "staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'staff_id'::text)), ''::text)) STORED;

ALTER TABLE public."entity_staff_records" ADD COLUMN "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "s2_9b6a09bfad63ee623f9e2da9" CHECK (collection <> 'grns' OR (((po_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "s2_dc91b904093e59b3674ab46a" CHECK (collection <> 'grns' OR (((vendor_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

CREATE INDEX "s2_f48c3d0d54c70c53c261e23d" ON public."entity_commercial_documents" USING btree (updated_at DESC) WHERE collection = 'grns';

CREATE INDEX "s2_6984f8682315eb1025f1f638" ON public."entity_commercial_documents" USING btree (workspace_id) WHERE collection = 'grns';

CREATE UNIQUE INDEX "s2_ee538f324aaba5d24ed3bde3" ON public."entity_commercial_documents" USING btree (workspace_id, id) WHERE collection = 'grns';

CREATE INDEX "s2_e368fdc5e39230d2491b380b" ON public."entity_commercial_documents" USING btree (workspace_id, po_id_gen) WHERE collection = 'grns';

CREATE INDEX "s2_2e9cf9cc816ffe8c18bf8fff" ON public."entity_commercial_documents" USING btree (workspace_id, vendor_id_gen) WHERE collection = 'grns';

CREATE INDEX "s2_b937d776b648b8b91649f4aa" ON public."entity_commercial_documents" USING btree (workspace_id, work_order_id_gen) WHERE collection = 'grns';

CREATE INDEX "s2_15a74aaa83ad1fe81267dfc2" ON public."entity_commercial_documents" USING btree (workspace_id, site_id_gen) WHERE collection = 'grns';

CREATE INDEX "s2_8cb493b5ac45615c7ce24228" ON public."entity_commercial_documents" USING btree (workspace_id, po_id_gen, vendor_id_gen) WHERE collection = 'grns';

CREATE UNIQUE INDEX "s2_094474dfee836bf2fab28fec" ON public."entity_commercial_documents" USING btree (workspace_id, id, po_id_gen, vendor_id_gen) WHERE collection = 'grns';

CREATE INDEX "s2_d8a32e82abc88f5d833406eb" ON public."entity_commercial_documents" USING btree (sd_989b10de1fd234494cb0, workspace_id, po_id_gen) WHERE collection = 'grns';

CREATE INDEX "s2_8dbf2d7edfcc11db808855dc" ON public."entity_commercial_documents" USING btree (sd_7a96ce1039e7d83685ee, workspace_id, po_id_gen, vendor_id_gen) WHERE collection = 'grns';

CREATE INDEX "s2_79108bfcf3540fa665690929" ON public."entity_commercial_documents" USING btree (updated_at DESC) WHERE collection = 'dispatches';

CREATE INDEX "s2_9f69cdda5bbd44bcdc65ac74" ON public."entity_commercial_documents" USING btree (workspace_id) WHERE collection = 'dispatches';

CREATE INDEX "s2_4f3e5def754c8324e4d65e12" ON public."entity_financial_documents" USING btree (updated_at DESC) WHERE collection = 'payrollPeriods';

CREATE INDEX "s2_94e4fb58c6176277bb7e577f" ON public."entity_financial_documents" USING btree (workspace_id) WHERE collection = 'payrollPeriods';

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_d980c1d9df92f4a58d735ea9" CHECK (collection <> 'tasks' OR (((COALESCE((data ->> 'task_type'::text), ''::text) <> 'followup_recovery'::text) OR (source_followup_id_gen IS NOT NULL))));

CREATE INDEX "s2_192396aa0f835acd0f7c5417" ON public."entity_workflow_controls" USING btree (workspace_id, assigned_staff_id) WHERE collection = 'tasks' AND ((assigned_staff_id IS NOT NULL));

CREATE INDEX "s2_32783a3986b90c81fc069c45" ON public."entity_workflow_controls" USING btree (updated_at DESC) WHERE collection = 'tasks';

CREATE INDEX "s2_7523705e43dc81e3a4dd3e87" ON public."entity_workflow_controls" USING btree (workspace_id) WHERE collection = 'tasks';

CREATE INDEX "s2_3c20d203d2d167cd18f8ac04" ON public."entity_workflow_controls" USING btree (customer_id_gen, workspace_id) WHERE collection = 'tasks';

CREATE INDEX "s2_e1e2a95d421f0fdc3de2bae6" ON public."entity_workflow_controls" USING btree (site_id_gen, workspace_id) WHERE collection = 'tasks';

CREATE UNIQUE INDEX "s2_d2c87cbf1ec56e144f07cc29" ON public."entity_workflow_controls" USING btree (workspace_id, source_followup_id_gen) WHERE collection = 'tasks' AND (((source_followup_id_gen IS NOT NULL) AND ((data ->> 'status'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text]))));

CREATE INDEX "s2_7034fd6f48b2a8ca55baead0" ON public."entity_workflow_controls" USING btree (workspace_id, assigned_staff_id) WHERE collection = 'followups' AND ((assigned_staff_id IS NOT NULL));

CREATE INDEX "s2_69fa05c538d5913db7428773" ON public."entity_workflow_controls" USING btree (updated_at DESC) WHERE collection = 'followups';

CREATE INDEX "s2_73d1f8a0d07107124e633c1b" ON public."entity_workflow_controls" USING btree (workspace_id) WHERE collection = 'followups';

CREATE INDEX "s2_2bcebfa627912cae527940f3" ON public."entity_workflow_controls" USING btree (customer_id_gen, workspace_id) WHERE collection = 'followups';

CREATE INDEX "s2_2bfa7af91474d701251d2233" ON public."entity_workflow_controls" USING btree (site_id_gen, workspace_id) WHERE collection = 'followups';

CREATE UNIQUE INDEX "s2_3db623fe4db4786251242044" ON public."entity_workflow_controls" USING btree (workspace_id, id) WHERE collection = 'followups';

CREATE INDEX "s2_6ecad0d54c2d20cf778192d4" ON public."entity_workflow_controls" USING btree (workspace_id, staff_id) WHERE collection = 'visits' AND ((staff_id IS NOT NULL));

CREATE INDEX "s2_b034b3a6e7fb216f3b1a297a" ON public."entity_workflow_controls" USING btree (updated_at DESC) WHERE collection = 'visits';

CREATE INDEX "s2_5e670efc29d25cacc64c26bc" ON public."entity_workflow_controls" USING btree (workspace_id) WHERE collection = 'visits';

CREATE INDEX "s2_e30ff9aa4cf7ca748b4de445" ON public."entity_workflow_controls" USING btree (customer_id_gen, workspace_id) WHERE collection = 'visits';

CREATE INDEX "s2_9095140471b1a42f2eb311cd" ON public."entity_workflow_controls" USING btree (site_id_gen, workspace_id) WHERE collection = 'visits';

CREATE INDEX "s2_9f29067cb8b84f01bf816961" ON public."entity_rate_cards" USING btree (updated_at DESC) WHERE collection = 'master.vendorRateHistories';

CREATE INDEX "s2_8c4d6ff6357f7e5f38c4bf83" ON public."entity_rate_cards" USING btree (workspace_id) WHERE collection = 'master.vendorRateHistories';

CREATE INDEX "s2_60a0f9ef329104eb2accbe17" ON public."entity_policy_rules" USING btree (updated_at DESC) WHERE collection = 'recurringTasks';

CREATE INDEX "s2_74711cec991603167a548db3" ON public."entity_policy_rules" USING btree (workspace_id) WHERE collection = 'recurringTasks';

CREATE INDEX "s2_73ad3c699146d004f2cf40be" ON public."entity_policy_rules" USING btree (workspace_id, assigned_staff_id) WHERE collection = 'recurringTasks' AND ((assigned_staff_id IS NOT NULL));

CREATE INDEX "s2_b596b9a85e613ae6085f6073" ON public."entity_work_definitions" USING btree (updated_at DESC) WHERE collection = 'master.workCategories';

CREATE INDEX "s2_beb070d6a7ff928de2d9f97b" ON public."entity_work_definitions" USING btree (workspace_id) WHERE collection = 'master.workCategories';

CREATE INDEX "s2_a4973a8ea916421e358f25b0" ON public."entity_work_definitions" USING btree (updated_at DESC) WHERE collection = 'master.workSubcategories';

CREATE INDEX "s2_6ade4a3999ed2eb68d3769f7" ON public."entity_work_definitions" USING btree (workspace_id) WHERE collection = 'master.workSubcategories';

CREATE INDEX "s2_b9d8efcc1438fc4edae4f1e3" ON public."entity_work_definitions" USING btree (updated_at DESC) WHERE collection = 'master.workOptionGroups';

CREATE INDEX "s2_0ce21cc1d4d37f66ec11fd91" ON public."entity_work_definitions" USING btree (workspace_id) WHERE collection = 'master.workOptionGroups';

CREATE INDEX "s2_b79a8ea4b036b22eaf86a1b8" ON public."entity_work_definitions" USING btree (updated_at DESC) WHERE collection = 'master.workOptionValues';

CREATE INDEX "s2_e01ad0473633ca6f99ebb08f" ON public."entity_work_definitions" USING btree (workspace_id) WHERE collection = 'master.workOptionValues';

CREATE INDEX "s2_5e7a1be65494689d402f5e51" ON public."entity_site_records" USING btree (updated_at DESC) WHERE collection = 'measurementRevisions';

CREATE INDEX "s2_49b09fd6aca2397c7800a97a" ON public."entity_site_records" USING btree (workspace_id) WHERE collection = 'measurementRevisions';

CREATE INDEX "s2_b467cc79d235cf85cc2053b1" ON public."entity_site_records" USING btree (updated_at DESC) WHERE collection = 'drawings';

CREATE INDEX "s2_ff587f2365bd9aeaf8c551e8" ON public."entity_site_records" USING btree (workspace_id) WHERE collection = 'drawings';

CREATE INDEX "s2_0c6f5ec709baed06147b96c8" ON public."entity_site_records" USING btree (updated_at DESC) WHERE collection = 'executionLogs';

CREATE INDEX "s2_1d753185c9bc9de934f7000f" ON public."entity_site_records" USING btree (workspace_id) WHERE collection = 'executionLogs';

CREATE INDEX "s2_ff9d80de8d81076d056cf5e8" ON public."entity_site_records" USING btree (updated_at DESC) WHERE collection = 'variationRequests';

CREATE INDEX "s2_f0a2700f718f5cc124fbbba6" ON public."entity_site_records" USING btree (workspace_id) WHERE collection = 'variationRequests';

CREATE INDEX "s2_f9dcd103ec03bdf419bb252e" ON public."entity_site_records" USING btree (customer_id_gen, workspace_id) WHERE collection = 'variationRequests';

CREATE INDEX "s2_8634756e29b8f077135daaf7" ON public."entity_site_records" USING btree (site_id_gen, workspace_id) WHERE collection = 'variationRequests';

CREATE INDEX "s2_207412b0b1b7313806f93d86" ON public."entity_catalogue_items" USING btree (updated_at DESC) WHERE collection = 'master.articles';

CREATE INDEX "s2_32dee0464e888d35cf60c077" ON public."entity_catalogue_items" USING btree (workspace_id) WHERE collection = 'master.articles';

CREATE INDEX "s2_d91d963072de82c840d20acc" ON public."entity_catalogue_items" USING btree (updated_at DESC) WHERE collection = 'master.articleVariants';

CREATE INDEX "s2_62a77065e9b37b6f7db24cc8" ON public."entity_catalogue_items" USING btree (workspace_id) WHERE collection = 'master.articleVariants';

CREATE INDEX "s2_18ae1971888688935812ad58" ON public."entity_resource_links" USING btree (updated_at DESC) WHERE collection = 'entityFileAttachments';

CREATE INDEX "s2_ad40dbae4cb792a1521ab2eb" ON public."entity_resource_links" USING btree (workspace_id) WHERE collection = 'entityFileAttachments';

CREATE INDEX "s2_db49db903955d5b0d7c1a537" ON public."entity_resource_links" USING btree (updated_at DESC) WHERE collection = 'entityReferenceAssignments';

CREATE INDEX "s2_50b8cc44846dc67b1c6facf3" ON public."entity_resource_links" USING btree (workspace_id) WHERE collection = 'entityReferenceAssignments';

CREATE INDEX "s2_724b14e059d5142114c4e7a2" ON public."entity_resource_links" USING btree (customer_id_gen, workspace_id) WHERE collection = 'entityReferenceAssignments';

CREATE INDEX "s2_8e6b379a660a8e8e35911e8d" ON public."entity_resource_links" USING btree (site_id_gen, workspace_id) WHERE collection = 'entityReferenceAssignments';

CREATE INDEX "s2_2f094260b59f3c711370ded7" ON public."entity_staff_records" USING btree (workspace_id, staff_id) WHERE collection = 'attendance' AND ((staff_id IS NOT NULL));

CREATE INDEX "s2_63c49111b5f33cd519c72acc" ON public."entity_staff_records" USING btree (updated_at DESC) WHERE collection = 'attendance';

CREATE INDEX "s2_c516806ad891269985cc920d" ON public."entity_staff_records" USING btree (workspace_id) WHERE collection = 'attendance';

CREATE INDEX "s2_1d354ed9d3c662a84da52973" ON public."entity_staff_records" USING btree (workspace_id, work_order_id_gen) WHERE collection = 'attendance';

CREATE UNIQUE INDEX "s2_4d56b8b6ff5d7b010a955c0f" ON public."entity_staff_records" USING btree (workspace_id, ((data ->> 'staff_id'::text)), ((data ->> 'date'::text))) WHERE collection = 'attendance' AND (((NULLIF(btrim((data ->> 'staff_id'::text)), ''::text) IS NOT NULL) AND (NULLIF(btrim((data ->> 'date'::text)), ''::text) IS NOT NULL)));

CREATE INDEX "s2_6d507ec8883d5a1166e69706" ON public."entity_staff_records" USING btree (updated_at DESC) WHERE collection = 'payrollLines';

CREATE INDEX "s2_c7b680e774b25b5899d40e45" ON public."entity_staff_records" USING btree (workspace_id) WHERE collection = 'payrollLines';

CREATE INDEX "s2_108201b1fafe1b9b19fef799" ON public."entity_staff_records" USING btree (workspace_id, staff_id) WHERE collection = 'payrollLines' AND ((staff_id IS NOT NULL));

CREATE INDEX "s2_88c4560e6d7a204b55e65704" ON public."entity_staff_records" USING btree (updated_at DESC) WHERE collection = 'leaveRequests';

CREATE INDEX "s2_3302b7d6a41fa92924a31c75" ON public."entity_staff_records" USING btree (workspace_id) WHERE collection = 'leaveRequests';

CREATE INDEX "s2_5d8cf70729820ce5b36a133e" ON public."entity_staff_records" USING btree (workspace_id, staff_id) WHERE collection = 'leaveRequests' AND ((staff_id IS NOT NULL));

CREATE INDEX "s2_dfa00c5efb020a2e4edb0fb9" ON public."entity_staff_records" USING btree (updated_at DESC) WHERE collection = 'salaryAdjustments';

CREATE INDEX "s2_d09a4bfae3c81efa756548b2" ON public."entity_staff_records" USING btree (workspace_id) WHERE collection = 'salaryAdjustments';

CREATE INDEX "s2_3dcd56999b01a0bf0a5def6e" ON public."entity_staff_records" USING btree (workspace_id, staff_id) WHERE collection = 'salaryAdjustments' AND ((staff_id IS NOT NULL));

CREATE INDEX "s2_d025390b3891b9b7ce8d6403" ON public."entity_staff_records" USING btree (workspace_id, work_order_id_gen) WHERE collection = 'salaryAdjustments';

CREATE INDEX "s2_d02d2e09c776a45c4171f905" ON public."entity_staff_records" USING btree (updated_at DESC) WHERE collection = 'staffDocuments';

CREATE INDEX "s2_97ebe0f9bcb418562f17ec4c" ON public."entity_staff_records" USING btree (workspace_id) WHERE collection = 'staffDocuments';

CREATE INDEX "s2_56f344dfff822f078d11f531" ON public."entity_storage_structure" USING btree (updated_at DESC) WHERE collection = 'master.storageFolderTemplates';

CREATE INDEX "s2_1030248b4dd6a99eacf103bd" ON public."entity_storage_structure" USING btree (workspace_id) WHERE collection = 'master.storageFolderTemplates';

CREATE INDEX "s2_fd5bea672901311ab89f3f01" ON public."entity_storage_structure" USING btree (updated_at DESC) WHERE collection = 'master.storageFolderInstances';

CREATE INDEX "s2_8b6e6e0bb313d107ba37d9b6" ON public."entity_storage_structure" USING btree (workspace_id) WHERE collection = 'master.storageFolderInstances';

ALTER TABLE public."entity_payrollLines" DROP CONSTRAINT "entity_payroll_lines_staff_fkey";

ALTER TABLE public."entity_recurringTasks" DROP CONSTRAINT "entity_recurring_tasks_assigned_staff_fkey";

ALTER TABLE public."entity_salaryAdjustments" DROP CONSTRAINT "entity_salary_adjustments_staff_fkey";

ALTER TABLE public."entity_leaveRequests" DROP CONSTRAINT "entity_leave_requests_staff_fkey";

ALTER TABLE public."entity_attendance" DROP CONSTRAINT "entity_attendance_staff_fkey";

ALTER TABLE public."entity_followups" DROP CONSTRAINT "entity_followups_assigned_staff_fkey";

ALTER TABLE public."entity_tasks" DROP CONSTRAINT "entity_tasks_assigned_staff_fkey";

ALTER TABLE public."entity_visits" DROP CONSTRAINT "entity_visits_staff_fkey";

ALTER TABLE public."entity_visits" DROP CONSTRAINT "entity_visits_customer_id_fkey";

ALTER TABLE public."entity_tasks" DROP CONSTRAINT "entity_tasks_customer_id_fkey";

ALTER TABLE public."entity_followups" DROP CONSTRAINT "entity_followups_customer_id_fkey";

ALTER TABLE public."entity_variationRequests" DROP CONSTRAINT "entity_variationRequests_customer_id_fkey";

ALTER TABLE public."entity_entityReferenceAssignments" DROP CONSTRAINT "entity_entityReferenceAssignments_customer_id_fkey";

ALTER TABLE public."entity_visits" DROP CONSTRAINT "entity_visits_site_id_fkey";

ALTER TABLE public."entity_tasks" DROP CONSTRAINT "entity_tasks_site_id_fkey";

ALTER TABLE public."entity_followups" DROP CONSTRAINT "entity_followups_site_id_fkey";

ALTER TABLE public."entity_variationRequests" DROP CONSTRAINT "entity_variationRequests_site_id_fkey";

ALTER TABLE public."entity_entityReferenceAssignments" DROP CONSTRAINT "entity_entityReferenceAssignments_site_id_fkey";

ALTER TABLE public."entity_grns" DROP CONSTRAINT "graph_grns_vendor_id";

ALTER TABLE public."entity_grns" DROP CONSTRAINT "graph_grns_work_order_id";

ALTER TABLE public."entity_grns" DROP CONSTRAINT "graph_grns_site_id";

ALTER TABLE public."entity_attendance" DROP CONSTRAINT "graph_attendance_work_order_id";

ALTER TABLE public."entity_salaryAdjustments" DROP CONSTRAINT "graph_salaryAdjustments_work_order_id";

ALTER TABLE public."entity_tasks" DROP CONSTRAINT "entity_tasks_source_followup_fk";

ALTER TABLE public."entity_grns" DROP CONSTRAINT "sd_9f7b08682e345e9e02c1";

ALTER TABLE public."entity_grns" DROP CONSTRAINT "sd_0638ac61fbe5582587e8";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_1fb85c7491001f1cca74";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_47469765d8513dcd288a";

INSERT INTO public."entity_commercial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'grns', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_grns";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_grns" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='grns') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='grns' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_grns")) THEN RAISE EXCEPTION 'Row envelope mismatch for grns'; END IF; END $copy$;

INSERT INTO public."entity_commercial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'dispatches', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_dispatches";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_dispatches" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='dispatches') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='dispatches' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_dispatches")) THEN RAISE EXCEPTION 'Row envelope mismatch for dispatches'; END IF; END $copy$;

INSERT INTO public."entity_financial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'payrollPeriods', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_payrollPeriods";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_payrollPeriods" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='payrollPeriods') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='payrollPeriods' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_payrollPeriods")) THEN RAISE EXCEPTION 'Row envelope mismatch for payrollPeriods'; END IF; END $copy$;

INSERT INTO public."entity_workflow_controls" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'tasks', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_tasks";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_tasks" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='tasks') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='tasks' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_tasks")) THEN RAISE EXCEPTION 'Row envelope mismatch for tasks'; END IF; END $copy$;

INSERT INTO public."entity_workflow_controls" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'followups', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_followups";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_followups" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='followups') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='followups' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_followups")) THEN RAISE EXCEPTION 'Row envelope mismatch for followups'; END IF; END $copy$;

INSERT INTO public."entity_workflow_controls" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'visits', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_visits";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_visits" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='visits') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='visits' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_visits")) THEN RAISE EXCEPTION 'Row envelope mismatch for visits'; END IF; END $copy$;

INSERT INTO public."entity_rate_cards" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.vendorRateHistories', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_vendorRateHistories";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_vendorRateHistories" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.vendorRateHistories') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.vendorRateHistories' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_vendorRateHistories")) THEN RAISE EXCEPTION 'Row envelope mismatch for master.vendorRateHistories'; END IF; END $copy$;

INSERT INTO public."entity_policy_rules" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'recurringTasks', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_recurringTasks";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_recurringTasks" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='recurringTasks') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='recurringTasks' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_recurringTasks")) THEN RAISE EXCEPTION 'Row envelope mismatch for recurringTasks'; END IF; END $copy$;

INSERT INTO public."entity_work_definitions" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.workCategories', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_workCategories";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_workCategories" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_work_definitions" WHERE collection='master.workCategories') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_work_definitions" WHERE collection='master.workCategories' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_workCategories")) THEN RAISE EXCEPTION 'Row envelope mismatch for master.workCategories'; END IF; END $copy$;

INSERT INTO public."entity_work_definitions" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.workSubcategories', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_workSubcategories";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_workSubcategories" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_work_definitions" WHERE collection='master.workSubcategories') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_work_definitions" WHERE collection='master.workSubcategories' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_workSubcategories")) THEN RAISE EXCEPTION 'Row envelope mismatch for master.workSubcategories'; END IF; END $copy$;

INSERT INTO public."entity_work_definitions" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.workOptionGroups', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_workOptionGroups";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_workOptionGroups" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_work_definitions" WHERE collection='master.workOptionGroups') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_work_definitions" WHERE collection='master.workOptionGroups' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_workOptionGroups")) THEN RAISE EXCEPTION 'Row envelope mismatch for master.workOptionGroups'; END IF; END $copy$;

INSERT INTO public."entity_work_definitions" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.workOptionValues', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_workOptionValues";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_workOptionValues" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_work_definitions" WHERE collection='master.workOptionValues') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_work_definitions" WHERE collection='master.workOptionValues' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_workOptionValues")) THEN RAISE EXCEPTION 'Row envelope mismatch for master.workOptionValues'; END IF; END $copy$;

INSERT INTO public."entity_site_records" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'measurementRevisions', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_measurementRevisions";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_measurementRevisions" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_site_records" WHERE collection='measurementRevisions') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_site_records" WHERE collection='measurementRevisions' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_measurementRevisions")) THEN RAISE EXCEPTION 'Row envelope mismatch for measurementRevisions'; END IF; END $copy$;

INSERT INTO public."entity_site_records" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'drawings', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_drawings";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_drawings" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_site_records" WHERE collection='drawings') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_site_records" WHERE collection='drawings' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_drawings")) THEN RAISE EXCEPTION 'Row envelope mismatch for drawings'; END IF; END $copy$;

INSERT INTO public."entity_site_records" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'executionLogs', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_executionLogs";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_executionLogs" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_site_records" WHERE collection='executionLogs') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_site_records" WHERE collection='executionLogs' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_executionLogs")) THEN RAISE EXCEPTION 'Row envelope mismatch for executionLogs'; END IF; END $copy$;

INSERT INTO public."entity_site_records" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'variationRequests', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_variationRequests";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_variationRequests" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_site_records" WHERE collection='variationRequests') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_site_records" WHERE collection='variationRequests' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_variationRequests")) THEN RAISE EXCEPTION 'Row envelope mismatch for variationRequests'; END IF; END $copy$;

INSERT INTO public."entity_catalogue_items" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.articles', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_articles";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_articles" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_catalogue_items" WHERE collection='master.articles') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_catalogue_items" WHERE collection='master.articles' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_articles")) THEN RAISE EXCEPTION 'Row envelope mismatch for master.articles'; END IF; END $copy$;

INSERT INTO public."entity_catalogue_items" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.articleVariants', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_articleVariants";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_articleVariants" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_catalogue_items" WHERE collection='master.articleVariants') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_catalogue_items" WHERE collection='master.articleVariants' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_articleVariants")) THEN RAISE EXCEPTION 'Row envelope mismatch for master.articleVariants'; END IF; END $copy$;

INSERT INTO public."entity_resource_links" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'entityFileAttachments', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_entityFileAttachments";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_entityFileAttachments" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_resource_links" WHERE collection='entityFileAttachments') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_resource_links" WHERE collection='entityFileAttachments' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_entityFileAttachments")) THEN RAISE EXCEPTION 'Row envelope mismatch for entityFileAttachments'; END IF; END $copy$;

INSERT INTO public."entity_resource_links" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'entityReferenceAssignments', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_entityReferenceAssignments";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_entityReferenceAssignments" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_resource_links" WHERE collection='entityReferenceAssignments') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_resource_links" WHERE collection='entityReferenceAssignments' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_entityReferenceAssignments")) THEN RAISE EXCEPTION 'Row envelope mismatch for entityReferenceAssignments'; END IF; END $copy$;

INSERT INTO public."entity_staff_records" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'attendance', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_attendance";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_attendance" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staff_records" WHERE collection='attendance') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staff_records" WHERE collection='attendance' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_attendance")) THEN RAISE EXCEPTION 'Row envelope mismatch for attendance'; END IF; END $copy$;

INSERT INTO public."entity_staff_records" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'payrollLines', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_payrollLines";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_payrollLines" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staff_records" WHERE collection='payrollLines') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staff_records" WHERE collection='payrollLines' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_payrollLines")) THEN RAISE EXCEPTION 'Row envelope mismatch for payrollLines'; END IF; END $copy$;

INSERT INTO public."entity_staff_records" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'leaveRequests', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_leaveRequests";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_leaveRequests" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staff_records" WHERE collection='leaveRequests') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staff_records" WHERE collection='leaveRequests' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_leaveRequests")) THEN RAISE EXCEPTION 'Row envelope mismatch for leaveRequests'; END IF; END $copy$;

INSERT INTO public."entity_staff_records" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'salaryAdjustments', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_salaryAdjustments";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_salaryAdjustments" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staff_records" WHERE collection='salaryAdjustments') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staff_records" WHERE collection='salaryAdjustments' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_salaryAdjustments")) THEN RAISE EXCEPTION 'Row envelope mismatch for salaryAdjustments'; END IF; END $copy$;

INSERT INTO public."entity_staff_records" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'staffDocuments', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staffDocuments";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staffDocuments" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staff_records" WHERE collection='staffDocuments') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staff_records" WHERE collection='staffDocuments' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_staffDocuments")) THEN RAISE EXCEPTION 'Row envelope mismatch for staffDocuments'; END IF; END $copy$;

INSERT INTO public."entity_storage_structure" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.storageFolderTemplates', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_storageFolderTemplates";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_storageFolderTemplates" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_storage_structure" WHERE collection='master.storageFolderTemplates') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_storage_structure" WHERE collection='master.storageFolderTemplates' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_storageFolderTemplates")) THEN RAISE EXCEPTION 'Row envelope mismatch for master.storageFolderTemplates'; END IF; END $copy$;

INSERT INTO public."entity_storage_structure" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.storageFolderInstances', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_storageFolderInstances";

DO $copy$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_storageFolderInstances" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_storage_structure" WHERE collection='master.storageFolderInstances') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_storage_structure" WHERE collection='master.storageFolderInstances' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_storageFolderInstances")) THEN RAISE EXCEPTION 'Row envelope mismatch for master.storageFolderInstances'; END IF; END $copy$;

ALTER TABLE public."entity_staff_records" ADD COLUMN "s2_4e3713748e3d511b77c272b9" text GENERATED ALWAYS AS (CASE WHEN collection='payrollLines' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD COLUMN "s2_9499318aaf65f04d091da518" text GENERATED ALWAYS AS (CASE WHEN collection='payrollLines' THEN (NULLIF(btrim((data ->> 'staff_id'::text)), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "s2_026b1fac3485aeddac9c45e1" FOREIGN KEY ("s2_4e3713748e3d511b77c272b9", "s2_9499318aaf65f04d091da518") REFERENCES public."entity_master_staff" ("workspace_id", "id") ON DELETE RESTRICT;

CREATE INDEX "s2_bd7fedc1a36ac153b6df2d5a" ON public."entity_staff_records" ("s2_4e3713748e3d511b77c272b9", "s2_9499318aaf65f04d091da518");

ALTER TABLE public."entity_policy_rules" ADD COLUMN "s2_9dde35f9e65701926270a2ad" text GENERATED ALWAYS AS (CASE WHEN collection='recurringTasks' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_policy_rules" ADD COLUMN "s2_0be7dff47ce8d5648e3ceda8" text GENERATED ALWAYS AS (CASE WHEN collection='recurringTasks' THEN (NULLIF(btrim((data ->> 'assigned_staff_id'::text)), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_policy_rules" ADD CONSTRAINT "s2_1a3995b0792b54f006cbf00b" FOREIGN KEY ("s2_9dde35f9e65701926270a2ad", "s2_0be7dff47ce8d5648e3ceda8") REFERENCES public."entity_master_staff" ("workspace_id", "id") ON DELETE RESTRICT;

CREATE INDEX "s2_a818dc4e1d223f19719ee15d" ON public."entity_policy_rules" ("s2_9dde35f9e65701926270a2ad", "s2_0be7dff47ce8d5648e3ceda8");

ALTER TABLE public."entity_staff_records" ADD COLUMN "s2_2589aad033bfbcba9dcd6375" text GENERATED ALWAYS AS (CASE WHEN collection='salaryAdjustments' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD COLUMN "s2_a3a5c69e43176f3451ff3a81" text GENERATED ALWAYS AS (CASE WHEN collection='salaryAdjustments' THEN (NULLIF(btrim((data ->> 'staff_id'::text)), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "s2_25b6c5e71a4b71a8252e4c9c" FOREIGN KEY ("s2_2589aad033bfbcba9dcd6375", "s2_a3a5c69e43176f3451ff3a81") REFERENCES public."entity_master_staff" ("workspace_id", "id") ON DELETE RESTRICT;

CREATE INDEX "s2_de8af5a23a25691c3dc75578" ON public."entity_staff_records" ("s2_2589aad033bfbcba9dcd6375", "s2_a3a5c69e43176f3451ff3a81");

ALTER TABLE public."entity_staff_records" ADD COLUMN "s2_778de537e9b6b5f49d09fffa" text GENERATED ALWAYS AS (CASE WHEN collection='leaveRequests' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD COLUMN "s2_f75b4cb52a1b829e53ef4304" text GENERATED ALWAYS AS (CASE WHEN collection='leaveRequests' THEN (NULLIF(btrim((data ->> 'staff_id'::text)), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "s2_ca18a7a979fcaac0a8994229" FOREIGN KEY ("s2_778de537e9b6b5f49d09fffa", "s2_f75b4cb52a1b829e53ef4304") REFERENCES public."entity_master_staff" ("workspace_id", "id") ON DELETE RESTRICT;

CREATE INDEX "s2_b24aac9ca39f09a2d98f607d" ON public."entity_staff_records" ("s2_778de537e9b6b5f49d09fffa", "s2_f75b4cb52a1b829e53ef4304");

ALTER TABLE public."entity_staff_records" ADD COLUMN "s2_e0e4a1b0d5c4677eb41ebdfe" text GENERATED ALWAYS AS (CASE WHEN collection='attendance' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD COLUMN "s2_e7aad5d06469da312bec7266" text GENERATED ALWAYS AS (CASE WHEN collection='attendance' THEN (NULLIF(btrim((data ->> 'staff_id'::text)), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "s2_25d3f264364a879096616736" FOREIGN KEY ("s2_e0e4a1b0d5c4677eb41ebdfe", "s2_e7aad5d06469da312bec7266") REFERENCES public."entity_master_staff" ("workspace_id", "id") ON DELETE RESTRICT;

CREATE INDEX "s2_31d60ae97a265ecd87719d3e" ON public."entity_staff_records" ("s2_e0e4a1b0d5c4677eb41ebdfe", "s2_e7aad5d06469da312bec7266");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_7a92509402262658d47b4020" text GENERATED ALWAYS AS (CASE WHEN collection='followups' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_827fb3a89c158e49e60f658c" text GENERATED ALWAYS AS (CASE WHEN collection='followups' THEN (NULLIF(btrim((data ->> 'assigned_staff_id'::text)), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_d6d9879c79d447d708c1aa0b" FOREIGN KEY ("s2_7a92509402262658d47b4020", "s2_827fb3a89c158e49e60f658c") REFERENCES public."entity_master_staff" ("workspace_id", "id") ON DELETE RESTRICT;

CREATE INDEX "s2_985b62472e0a238ba57e40aa" ON public."entity_workflow_controls" ("s2_7a92509402262658d47b4020", "s2_827fb3a89c158e49e60f658c");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_bf93df974f3b39a5823a58f7" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_58699b954e802fea7b4695c4" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN (NULLIF(btrim((data ->> 'assigned_staff_id'::text)), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_1cb188fe6908952db3bdc3f1" FOREIGN KEY ("s2_bf93df974f3b39a5823a58f7", "s2_58699b954e802fea7b4695c4") REFERENCES public."entity_master_staff" ("workspace_id", "id") ON DELETE RESTRICT;

CREATE INDEX "s2_b2f9326a6f038162976fbfad" ON public."entity_workflow_controls" ("s2_bf93df974f3b39a5823a58f7", "s2_58699b954e802fea7b4695c4");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_e5799bd2ff9479ef85c304ce" text GENERATED ALWAYS AS (CASE WHEN collection='visits' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_411d55d955bfaada4ff00bfd" text GENERATED ALWAYS AS (CASE WHEN collection='visits' THEN (NULLIF(btrim((data ->> 'assigned_staff_id'::text)), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_70a921c193d8ce7fdc31a0cc" FOREIGN KEY ("s2_e5799bd2ff9479ef85c304ce", "s2_411d55d955bfaada4ff00bfd") REFERENCES public."entity_master_staff" ("workspace_id", "id") ON DELETE RESTRICT;

CREATE INDEX "s2_aa9bf98d996358c3f02386d2" ON public."entity_workflow_controls" ("s2_e5799bd2ff9479ef85c304ce", "s2_411d55d955bfaada4ff00bfd");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_3eae69b34d9068725e0ea417" text GENERATED ALWAYS AS (CASE WHEN collection='visits' THEN (NULLIF((data ->> 'customer_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_a69cd7e475ff28a5849eff65" FOREIGN KEY ("s2_3eae69b34d9068725e0ea417") REFERENCES public."entity_customers" ("id");

CREATE INDEX "s2_a983aa89dda91cff415644e4" ON public."entity_workflow_controls" ("s2_3eae69b34d9068725e0ea417");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_8acb09aad7eb38518e71efab" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN (NULLIF((data ->> 'customer_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_5767eb76f3cc1c97c3c5b34d" FOREIGN KEY ("s2_8acb09aad7eb38518e71efab") REFERENCES public."entity_customers" ("id");

CREATE INDEX "s2_a58faabad719a666d4693a11" ON public."entity_workflow_controls" ("s2_8acb09aad7eb38518e71efab");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_addeb7dd1695402ac3f4dbee" text GENERATED ALWAYS AS (CASE WHEN collection='followups' THEN (NULLIF((data ->> 'customer_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_03f2367a46d0fbbbee804c73" FOREIGN KEY ("s2_addeb7dd1695402ac3f4dbee") REFERENCES public."entity_customers" ("id");

CREATE INDEX "s2_eddbaac5a394a267e4955cc8" ON public."entity_workflow_controls" ("s2_addeb7dd1695402ac3f4dbee");

ALTER TABLE public."entity_site_records" ADD COLUMN "s2_fbf14b5d31abe1937333f287" text GENERATED ALWAYS AS (CASE WHEN collection='variationRequests' THEN (NULLIF((data ->> 'customer_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_site_records" ADD CONSTRAINT "s2_aea09578fa2a23dd45c8f00f" FOREIGN KEY ("s2_fbf14b5d31abe1937333f287") REFERENCES public."entity_customers" ("id");

CREATE INDEX "s2_ed7cc64f74b1767881a79c6e" ON public."entity_site_records" ("s2_fbf14b5d31abe1937333f287");

ALTER TABLE public."entity_resource_links" ADD COLUMN "s2_e95cb94c8ea1b8aa43ea8ef5" text GENERATED ALWAYS AS (CASE WHEN collection='entityReferenceAssignments' THEN (NULLIF((data ->> 'customer_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "s2_8185d27cb19f18cb3687f6be" FOREIGN KEY ("s2_e95cb94c8ea1b8aa43ea8ef5") REFERENCES public."entity_customers" ("id");

CREATE INDEX "s2_9609d6486df1effe0813367c" ON public."entity_resource_links" ("s2_e95cb94c8ea1b8aa43ea8ef5");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_c8e0189a449e078d3d6e4f70" text GENERATED ALWAYS AS (CASE WHEN collection='visits' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_79384d3c4fd3d65aa3445c25" FOREIGN KEY ("s2_c8e0189a449e078d3d6e4f70") REFERENCES public."entity_sites" ("id");

CREATE INDEX "s2_edecb338a05aba50824a9301" ON public."entity_workflow_controls" ("s2_c8e0189a449e078d3d6e4f70");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_49411c7ef6f6bba4135b5fad" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_e8aea462266c77d9959b9582" FOREIGN KEY ("s2_49411c7ef6f6bba4135b5fad") REFERENCES public."entity_sites" ("id");

CREATE INDEX "s2_4dc2dee28c72d906e7da5d3f" ON public."entity_workflow_controls" ("s2_49411c7ef6f6bba4135b5fad");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_47e1df9c2b782b3434e9126a" text GENERATED ALWAYS AS (CASE WHEN collection='followups' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_c81ad6c6f44383862edc7e66" FOREIGN KEY ("s2_47e1df9c2b782b3434e9126a") REFERENCES public."entity_sites" ("id");

CREATE INDEX "s2_c6c63e3490ab3bfab8ad7431" ON public."entity_workflow_controls" ("s2_47e1df9c2b782b3434e9126a");

ALTER TABLE public."entity_site_records" ADD COLUMN "s2_1b2c72c70f3bf7d63e3ec173" text GENERATED ALWAYS AS (CASE WHEN collection='variationRequests' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_site_records" ADD CONSTRAINT "s2_1b4a6c0c040a470b284e434e" FOREIGN KEY ("s2_1b2c72c70f3bf7d63e3ec173") REFERENCES public."entity_sites" ("id");

CREATE INDEX "s2_7465c913e66b1ee35279660d" ON public."entity_site_records" ("s2_1b2c72c70f3bf7d63e3ec173");

ALTER TABLE public."entity_resource_links" ADD COLUMN "s2_2d6b1f960eadf05eb2ff22ed" text GENERATED ALWAYS AS (CASE WHEN collection='entityReferenceAssignments' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "s2_d707504078887d1b60fdca5e" FOREIGN KEY ("s2_2d6b1f960eadf05eb2ff22ed") REFERENCES public."entity_sites" ("id");

CREATE INDEX "s2_291cb8135bdde1622165b2d4" ON public."entity_resource_links" ("s2_2d6b1f960eadf05eb2ff22ed");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_ef556fe12cc31b2951559a47" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_8d17d94b45e441e88fc53b02" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN (NULLIF((data ->> 'vendor_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "s2_204497f492dcdfa14f2d63c0" FOREIGN KEY ("s2_ef556fe12cc31b2951559a47", "s2_8d17d94b45e441e88fc53b02") REFERENCES public."entity_master_vendors" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "s2_2c8bf433d0123a89f273946d" ON public."entity_commercial_documents" ("s2_ef556fe12cc31b2951559a47", "s2_8d17d94b45e441e88fc53b02");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_4e8435c0a073b8a797b19129" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_fe7678b905042359284bcadf" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN (NULLIF((data ->> 'work_order_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "s2_a5db8c3920744de37b276299" FOREIGN KEY ("s2_4e8435c0a073b8a797b19129", "s2_fe7678b905042359284bcadf") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "s2_ccb7f8741450e8764a34177d" ON public."entity_commercial_documents" ("s2_4e8435c0a073b8a797b19129", "s2_fe7678b905042359284bcadf");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_88f0bb2886aa4e47e1a3643b" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_8aa496ae31f1004d3cc002f1" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "s2_9d78e2be6017db6d26577137" FOREIGN KEY ("s2_88f0bb2886aa4e47e1a3643b", "s2_8aa496ae31f1004d3cc002f1") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "s2_d42660a7f1c9c7878feb949f" ON public."entity_commercial_documents" ("s2_88f0bb2886aa4e47e1a3643b", "s2_8aa496ae31f1004d3cc002f1");

ALTER TABLE public."entity_staff_records" ADD COLUMN "s2_1963899541d5597965d7eca9" text GENERATED ALWAYS AS (CASE WHEN collection='attendance' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD COLUMN "s2_c34f4a03b16c749011edbbd8" text GENERATED ALWAYS AS (CASE WHEN collection='attendance' THEN (NULLIF((data ->> 'work_order_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "s2_e4febfcbc2cfe61488e3bdb5" FOREIGN KEY ("s2_1963899541d5597965d7eca9", "s2_c34f4a03b16c749011edbbd8") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "s2_1aa36ae4159e1cc2e8052730" ON public."entity_staff_records" ("s2_1963899541d5597965d7eca9", "s2_c34f4a03b16c749011edbbd8");

ALTER TABLE public."entity_staff_records" ADD COLUMN "s2_fb456c92044008de09dc9893" text GENERATED ALWAYS AS (CASE WHEN collection='salaryAdjustments' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD COLUMN "s2_b721f4f121cf9744abf6abaa" text GENERATED ALWAYS AS (CASE WHEN collection='salaryAdjustments' THEN (NULLIF((data ->> 'work_order_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "s2_94ee4f30d869030acea3b809" FOREIGN KEY ("s2_fb456c92044008de09dc9893", "s2_b721f4f121cf9744abf6abaa") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "s2_72217c252537c378c4d8828a" ON public."entity_staff_records" ("s2_fb456c92044008de09dc9893", "s2_b721f4f121cf9744abf6abaa");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_c3014203fa6287687cd2ee86" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN 'followups' ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_d6ab0a70bd4b2bacb7bf6708" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "s2_ec498d96463513e398a236c6" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN (NULLIF((data ->> 'source_followup_id'::text), ''::text)) ELSE NULL END) STORED;

CREATE UNIQUE INDEX "s2_30f52aca5bd203e8a95c39ba" ON public."entity_workflow_controls" ("collection", "workspace_id", "id");

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_447b491010bb6312c642b300" FOREIGN KEY ("s2_c3014203fa6287687cd2ee86", "s2_d6ab0a70bd4b2bacb7bf6708", "s2_ec498d96463513e398a236c6") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") ON DELETE RESTRICT;

CREATE INDEX "s2_f3ab309e04f82051bd4702c4" ON public."entity_workflow_controls" ("s2_c3014203fa6287687cd2ee86", "s2_d6ab0a70bd4b2bacb7bf6708", "s2_ec498d96463513e398a236c6");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_7dc084f2c6c901390e759d97" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN ('purchaseOrders'::text) ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_cc30a8a37fb2f52e265d0ca9" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_fdfc249bf61164dd98b4b66b" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN (NULLIF((data ->> 'po_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "s2_5d19b667cd97120c07a40964" FOREIGN KEY ("s2_7dc084f2c6c901390e759d97", "s2_cc30a8a37fb2f52e265d0ca9", "s2_fdfc249bf61164dd98b4b66b") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "s2_499f078f97d4968b64824798" ON public."entity_commercial_documents" ("s2_7dc084f2c6c901390e759d97", "s2_cc30a8a37fb2f52e265d0ca9", "s2_fdfc249bf61164dd98b4b66b");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_9ad60a932867c7e3d2359107" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN ('purchaseOrders'::text) ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_10ee85ea8e17e4434cf1bcc6" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN "workspace_id" ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_d204fa2553c932f930ab31ce" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN (NULLIF((data ->> 'po_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "s2_7d1e06d57ab7d59213618849" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN (NULLIF((data ->> 'vendor_id'::text), ''::text)) ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "s2_6ea1bc17196cbada662affa8" FOREIGN KEY ("s2_9ad60a932867c7e3d2359107", "s2_10ee85ea8e17e4434cf1bcc6", "s2_d204fa2553c932f930ab31ce", "s2_7d1e06d57ab7d59213618849") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id", "vendor_id_gen") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "s2_5c4c01b4d22cbed333d0e3c0" ON public."entity_commercial_documents" ("s2_9ad60a932867c7e3d2359107", "s2_10ee85ea8e17e4434cf1bcc6", "s2_d204fa2553c932f930ab31ce", "s2_7d1e06d57ab7d59213618849");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "s2_63ff3eb712781c3a97771113" text GENERATED ALWAYS AS ('grns') STORED;

CREATE UNIQUE INDEX "s2_1ce0b1450d6833b31a0c9a70" ON public."entity_commercial_documents" ("collection", "workspace_id", "id");

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "s2_c25e1b65678de7f5382d67ba" FOREIGN KEY ("s2_63ff3eb712781c3a97771113", "sd_e312eb5c19f656dc911e", "grn_id_gen") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "s2_534ec202c8481aed23ca9d75" ON public."entity_financial_documents" ("s2_63ff3eb712781c3a97771113", "sd_e312eb5c19f656dc911e", "grn_id_gen");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "s2_d9c101d9d0fbaddfd30a578a" text GENERATED ALWAYS AS ('grns') STORED;

CREATE UNIQUE INDEX "s2_15b852820f5af008fa1258b0" ON public."entity_commercial_documents" ("collection", "workspace_id", "id", "po_id_gen", "vendor_id_gen");

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "s2_d56cb1dffc9d72a5bdd43c33" FOREIGN KEY ("s2_d9c101d9d0fbaddfd30a578a", "sd_3f5f54a6c54af5aa7a7e", "grn_id_gen", "po_id_gen", "vendor_id_gen") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id", "po_id_gen", "vendor_id_gen") DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "s2_583e95c3d530ed51b786a8fe" ON public."entity_financial_documents" ("s2_d9c101d9d0fbaddfd30a578a", "sd_3f5f54a6c54af5aa7a7e", "grn_id_gen", "po_id_gen", "vendor_id_gen");

CREATE INDEX "s2_95d3113e1d2450e518d02108" ON public."entity_catalogue_items" (workspace_id, collection, id);

CREATE INDEX "s2_c6a959867b56be47a8e408df" ON public."entity_catalogue_items" (workspace_id, collection, revision DESC, id);

CREATE INDEX "s2_d767567e435994dc3f6e4d3b" ON public."entity_resource_links" (workspace_id, collection, id);

CREATE INDEX "s2_59b85ff21874c1ae571af083" ON public."entity_resource_links" (workspace_id, collection, revision DESC, id);

CREATE INDEX "s2_1132764c20af32df4ba82efa" ON public."entity_site_records" (workspace_id, collection, id);

CREATE INDEX "s2_21ec369fc6719ec687125575" ON public."entity_site_records" (workspace_id, collection, revision DESC, id);

CREATE INDEX "s2_636af732818ca5359348be9b" ON public."entity_staff_records" (workspace_id, collection, id);

CREATE INDEX "s2_36889b6872d39dff01c6d417" ON public."entity_staff_records" (workspace_id, collection, revision DESC, id);

CREATE INDEX "s2_8dd34c4b78ad99e63e8ef6b7" ON public."entity_storage_structure" (workspace_id, collection, id);

CREATE INDEX "s2_930aa3d60f59460c08ff3fe3" ON public."entity_storage_structure" (workspace_id, collection, revision DESC, id);

CREATE INDEX "s2_d489f7112f264ef7d08f7643" ON public."entity_work_definitions" (workspace_id, collection, id);

CREATE INDEX "s2_27a319c287f9ba53da7246cd" ON public."entity_work_definitions" (workspace_id, collection, revision DESC, id);

CREATE OR REPLACE FUNCTION public.uc_guard_shared_service_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.data ? 'category_ids' then
    if jsonb_typeof(new.data->'category_ids') <> 'array' then raise exception 'Service categories must be an array'; end if;
    if exists(select 1 from jsonb_array_elements_text(new.data->'category_ids') category(value)
      where not exists(select 1 from (SELECT * FROM public."entity_work_definitions" WHERE collection='master.workCategories') c where c.workspace_id=new.workspace_id and c.id=category.value))
    then raise exception 'Shared service category does not exist' using errcode='23503'; end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.uc_collection_table(p_collection text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE p_collection
    WHEN 'customers' THEN 'entity_customers'
    WHEN 'sites' THEN 'entity_sites'
    WHEN 'areas' THEN 'entity_areas'
    WHEN 'workRequired' THEN 'entity_workRequired'
    WHEN 'measurementRevisions' THEN 'entity_site_records'
    WHEN 'quotations' THEN 'entity_commercial_documents'
    WHEN 'acceptedScopes' THEN 'entity_acceptedScopes'
    WHEN 'workOrders' THEN 'entity_workOrders'
    WHEN 'boqs' THEN 'entity_commercial_documents'
    WHEN 'vendorRfqs' THEN 'entity_commercial_documents'
    WHEN 'vendorBids' THEN 'entity_commercial_documents'
    WHEN 'purchaseOrders' THEN 'entity_commercial_documents'
    WHEN 'grns' THEN 'entity_commercial_documents'
    WHEN 'inventory' THEN 'entity_inventory'
    WHEN 'stockMovements' THEN 'entity_stockMovements'
    WHEN 'dispatches' THEN 'entity_commercial_documents'
    WHEN 'vendorBills' THEN 'entity_financial_documents'
    WHEN 'vendorPayments' THEN 'entity_money_movements'
    WHEN 'contractorBills' THEN 'entity_financial_documents'
    WHEN 'contractorPayments' THEN 'entity_money_movements'
    WHEN 'commissions' THEN 'entity_commissions'
    WHEN 'workOrderCostLines' THEN 'entity_workOrderCostLines'
    WHEN 'contractorBids' THEN 'entity_commercial_documents'
    WHEN 'contractorSettlements' THEN 'entity_commercial_documents'
    WHEN 'drawings' THEN 'entity_site_records'
    WHEN 'executionLogs' THEN 'entity_site_records'
    WHEN 'variationRequests' THEN 'entity_site_records'
    WHEN 'visits' THEN 'entity_workflow_controls'
    WHEN 'tasks' THEN 'entity_workflow_controls'
    WHEN 'followups' THEN 'entity_workflow_controls'
    WHEN 'actions' THEN 'entity_workflow_controls'
    WHEN 'payments' THEN 'entity_payments'
    WHEN 'invoices' THEN 'entity_financial_documents'
    WHEN 'customerReceipts' THEN 'entity_money_movements'
    WHEN 'blocked' THEN 'entity_workflow_controls'
    WHEN 'risks' THEN 'entity_workflow_controls'
    WHEN 'threads' THEN 'entity_threads'
    WHEN 'attendance' THEN 'entity_staff_records'
    WHEN 'staffRolePermissions' THEN 'entity_staffRolePermissions'
    WHEN 'leaveRequests' THEN 'entity_staff_records'
    WHEN 'payrollPeriods' THEN 'entity_financial_documents'
    WHEN 'payrollLines' THEN 'entity_staff_records'
    WHEN 'salaryAdjustments' THEN 'entity_staff_records'
    WHEN 'staffDocuments' THEN 'entity_staff_records'
    WHEN 'approvalPolicies' THEN 'entity_policy_rules'
    WHEN 'automationRules' THEN 'entity_policy_rules'
    WHEN 'recurringTasks' THEN 'entity_policy_rules'
    WHEN 'commSends' THEN 'entity_commSends'
    WHEN 'entityFileAttachments' THEN 'entity_resource_links'
    WHEN 'entityReferenceAssignments' THEN 'entity_resource_links'
    WHEN 'commercialTerms' THEN 'entity_commercial_settings'
    WHEN 'paymentTermTemplates' THEN 'entity_commercial_settings'
    WHEN 'taxConfigs' THEN 'entity_commercial_settings'
    WHEN 'validityConfigs' THEN 'entity_commercial_settings'
    WHEN 'auditLog' THEN 'entity_auditLog'
    WHEN 'master.units' THEN 'entity_master_units'
    WHEN 'master.workCategories' THEN 'entity_work_definitions'
    WHEN 'master.workSubcategories' THEN 'entity_work_definitions'
    WHEN 'master.articles' THEN 'entity_catalogue_items'
    WHEN 'master.articleVariants' THEN 'entity_catalogue_items'
    WHEN 'master.subcategoryArticleMap' THEN 'entity_master_subcategoryArticleMap'
    WHEN 'master.workOptionGroups' THEN 'entity_work_definitions'
    WHEN 'master.workOptionValues' THEN 'entity_work_definitions'
    WHEN 'master.vendors' THEN 'entity_master_vendors'
    WHEN 'master.contractors' THEN 'entity_master_contractors'
    WHEN 'master.staff' THEN 'entity_master_staff'
    WHEN 'master.sourcePartners' THEN 'entity_master_sourcePartners'
    WHEN 'master.commissionRules' THEN 'entity_policy_rules'
    WHEN 'master.vendorRates' THEN 'entity_rate_cards'
    WHEN 'master.contractorRates' THEN 'entity_rate_cards'
    WHEN 'master.customerRateSuggestions' THEN 'entity_rate_cards'
    WHEN 'master.vendorRateHistories' THEN 'entity_rate_cards'
    WHEN 'master.storageAccounts' THEN 'entity_master_storageAccounts'
    WHEN 'master.storageFolderTemplates' THEN 'entity_storage_structure'
    WHEN 'master.storageFolderInstances' THEN 'entity_storage_structure'
    WHEN 'master.fileAssets' THEN 'entity_master_fileAssets'
    WHEN 'master.catalogues' THEN 'entity_reference_libraries'
    WHEN 'master.catalogueArticleVendorLinks' THEN 'entity_master_catalogueArticleVendorLinks'
    WHEN 'master.pinterestBoards' THEN 'entity_reference_libraries'
    WHEN 'master.referenceMedia' THEN 'entity_reference_libraries'
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.commit_workspace_operations_internal(p_workspace_id text, p_expected_workspace_revision integer, p_operations jsonb, p_expected_row_versions jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  current_workspace_revision integer;
  next_workspace_revision integer;
  op jsonb;
  row_data jsonb;
  row_id text;
  table_name text;
  collection_name text;
  version_key text;
  expected_row_revision integer;
  actual_row_revision integer;
  new_row_revision integer;
  operation_index integer;
  shared_table boolean;
  affected_rows integer;
  upserted_count integer := 0;
  deleted_count integer := 0;
  bumped_versions jsonb := '{}'::jsonb;
  journal_operations jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_expected_row_versions, '{}'::jsonb)) as version(key)
    where position(':' in version.key) <= 1
       or length(split_part(version.key, ':', 2)) = 0
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ROW_VERSION_KEY';
  end if;

  insert into public.entity_workspace_revision (id, workspace_id, revision, updated_at)
  values (p_workspace_id, p_workspace_id, 0, now())
  on conflict (id) do nothing;

  select revision into current_workspace_revision
    from public.entity_workspace_revision
   where id = p_workspace_id
   for update;

  if current_workspace_revision is distinct from p_expected_workspace_revision then
    raise exception using errcode = '40001', message = 'WORKSPACE_CONFLICT';
  end if;

  for op in select value from jsonb_array_elements(p_operations)
  loop
    table_name := op ->> 'table';
    collection_name := op ->> 'collection';
    if table_name is null or collection_name is null
       or table_name IS DISTINCT FROM public.uc_collection_table(collection_name)
       or to_regclass(format('public.%I', table_name)) is null then
      raise exception using errcode = '22023', message = 'INVALID_COLLECTION';
    end if;

    for row_data in select value from jsonb_array_elements(coalesce(op -> 'upsert', '[]'::jsonb))
    loop
      row_id := row_data ->> 'id';
      if row_id is null or btrim(row_id) = '' then
        raise exception using errcode = '22023', message = 'INVALID_ROW_ID';
      end if;
      version_key := collection_name || ':' || row_id;
      expected_row_revision := case
        when p_expected_row_versions ? version_key then (p_expected_row_versions ->> version_key)::integer
        else null
      end;
      actual_row_revision := null;
      execute format('select revision from public.%I where workspace_id = $1 and id = $2%s for update', table_name, CASE WHEN table_name IN ('entity_commercial_settings', 'entity_reference_libraries', 'entity_rate_cards', 'entity_policy_rules', 'entity_commercial_documents', 'entity_workflow_controls', 'entity_financial_documents', 'entity_money_movements', 'entity_catalogue_items', 'entity_resource_links', 'entity_site_records', 'entity_staff_records', 'entity_storage_structure', 'entity_work_definitions') THEN ' and collection = $3' ELSE '' END)
        into actual_row_revision using p_workspace_id, row_id, collection_name;
      if expected_row_revision is not null and actual_row_revision is distinct from expected_row_revision then
        raise exception using errcode = '40001', message = 'ROW_CONFLICT:' || version_key;
      end if;
    end loop;

    for row_id in select value #>> '{}' from jsonb_array_elements(coalesce(op -> 'deleteIds', '[]'::jsonb))
    loop
      version_key := collection_name || ':' || row_id;
      expected_row_revision := case
        when p_expected_row_versions ? version_key then (p_expected_row_versions ->> version_key)::integer
        else null
      end;
      actual_row_revision := null;
      execute format('select revision from public.%I where workspace_id = $1 and id = $2%s for update', table_name, CASE WHEN table_name IN ('entity_commercial_settings', 'entity_reference_libraries', 'entity_rate_cards', 'entity_policy_rules', 'entity_commercial_documents', 'entity_workflow_controls', 'entity_financial_documents', 'entity_money_movements', 'entity_catalogue_items', 'entity_resource_links', 'entity_site_records', 'entity_staff_records', 'entity_storage_structure', 'entity_work_definitions') THEN ' and collection = $3' ELSE '' END)
        into actual_row_revision using p_workspace_id, row_id, collection_name;
      if expected_row_revision is not null and actual_row_revision is distinct from expected_row_revision then
        raise exception using errcode = '40001', message = 'ROW_CONFLICT:' || version_key;
      end if;
    end loop;
  end loop;

  if jsonb_array_length(p_operations) > 0 then
    for operation_index in reverse jsonb_array_length(p_operations) - 1 .. 0
    loop
      op := p_operations -> operation_index;
      table_name := op ->> 'table';
      collection_name := op ->> 'collection';
      for row_id in select value #>> '{}' from jsonb_array_elements(coalesce(op -> 'deleteIds', '[]'::jsonb))
      loop
        execute format('delete from public.%I where workspace_id = $1 and id = $2%s', table_name, CASE WHEN table_name IN ('entity_commercial_settings', 'entity_reference_libraries', 'entity_rate_cards', 'entity_policy_rules', 'entity_commercial_documents', 'entity_workflow_controls', 'entity_financial_documents', 'entity_money_movements', 'entity_catalogue_items', 'entity_resource_links', 'entity_site_records', 'entity_staff_records', 'entity_storage_structure', 'entity_work_definitions') THEN ' and collection = $3' ELSE '' END)
          using p_workspace_id, row_id, collection_name;
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        deleted_count := deleted_count + affected_rows;
      end loop;
    end loop;
  end if;

  for op in select value from jsonb_array_elements(p_operations)
  loop
    table_name := op ->> 'table';
    collection_name := op ->> 'collection';
    for row_data in select value from jsonb_array_elements(coalesce(op -> 'upsert', '[]'::jsonb))
    loop
      row_id := row_data ->> 'id';
      actual_row_revision := null;
      execute format('select revision from public.%I where workspace_id = $1 and id = $2%s', table_name, CASE WHEN table_name IN ('entity_commercial_settings', 'entity_reference_libraries', 'entity_rate_cards', 'entity_policy_rules', 'entity_commercial_documents', 'entity_workflow_controls', 'entity_financial_documents', 'entity_money_movements', 'entity_catalogue_items', 'entity_resource_links', 'entity_site_records', 'entity_staff_records', 'entity_storage_structure', 'entity_work_definitions') THEN ' and collection = $3' ELSE '' END)
        into actual_row_revision using p_workspace_id, row_id, collection_name;
      if actual_row_revision is null then
        new_row_revision := 0;
        IF table_name IN ('entity_commercial_settings', 'entity_reference_libraries', 'entity_rate_cards', 'entity_policy_rules', 'entity_commercial_documents', 'entity_workflow_controls', 'entity_financial_documents', 'entity_money_movements', 'entity_catalogue_items', 'entity_resource_links', 'entity_site_records', 'entity_staff_records', 'entity_storage_structure', 'entity_work_definitions') THEN
          EXECUTE format('insert into public.%I (id, workspace_id, collection, revision, data, updated_at) values ($1, $2, $4, 0, $3, now())', table_name) USING row_id, p_workspace_id, row_data, collection_name;
        ELSE
        execute format('insert into public.%I (id, workspace_id, revision, data, updated_at) values ($1, $2, 0, $3, now())', table_name)
          using row_id, p_workspace_id, row_data;
        END IF;
      else
        new_row_revision := actual_row_revision + 1;
        execute format('update public.%I set data = $3, revision = $4, updated_at = now() where workspace_id = $1 and id = $2%s', table_name, CASE WHEN table_name IN ('entity_commercial_settings', 'entity_reference_libraries', 'entity_rate_cards', 'entity_policy_rules', 'entity_commercial_documents', 'entity_workflow_controls', 'entity_financial_documents', 'entity_money_movements', 'entity_catalogue_items', 'entity_resource_links', 'entity_site_records', 'entity_staff_records', 'entity_storage_structure', 'entity_work_definitions') THEN ' and collection = $5' ELSE '' END)
          using p_workspace_id, row_id, row_data, new_row_revision, collection_name;
      end if;
      upserted_count := upserted_count + 1;
      version_key := collection_name || ':' || row_id;
      bumped_versions := bumped_versions || jsonb_build_object(version_key, new_row_revision);
    end loop;
  end loop;

  next_workspace_revision := current_workspace_revision + 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'collection', operation.value ->> 'collection',
        'upsert', coalesce(operation.value -> 'upsert', '[]'::jsonb),
        'deleteIds', coalesce(operation.value -> 'deleteIds', '[]'::jsonb)
      )
      order by operation.ordinality
    ),
    '[]'::jsonb
  )
  into journal_operations
  from jsonb_array_elements(p_operations) with ordinality as operation(value, ordinality);

  insert into public.entity_workspace_change_batches (
    workspace_id,
    revision,
    operations,
    row_versions,
    is_baseline,
    created_at
  ) values (
    p_workspace_id,
    next_workspace_revision,
    journal_operations,
    bumped_versions,
    false,
    now()
  );

  update public.entity_workspace_revision
     set revision = next_workspace_revision, updated_at = now()
   where id = p_workspace_id;

  return jsonb_build_object(
    'upserted', upserted_count,
    'deleted', deleted_count,
    'conflicts', 0,
    'bumpedRowVersions', bumped_versions,
    'newRevision', next_workspace_revision
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uc_contractor_rate_projection_rows(p_workspace_id text, p_contractor jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rows jsonb := '[]'::jsonb;
  v_capability jsonb;
  v_work_type_rate jsonb;
  v_contractor_id text := nullif(btrim(coalesce(p_contractor ->> 'id', '')), '');
  v_subcategory_id text;
  v_subcategory_name text;
  v_work_type_id text;
  v_work_type_name text;
  v_unit_id text;
  v_material jsonb;
  v_labour jsonb;
  v_total numeric;
begin
  if v_contractor_id is null then return v_rows; end if;

  for v_capability in
    select value from jsonb_array_elements(
      case when jsonb_typeof(p_contractor -> 'work_capabilities') = 'array'
        then p_contractor -> 'work_capabilities' else '[]'::jsonb end
    )
  loop
    v_subcategory_id := nullif(btrim(coalesce(v_capability ->> 'subcategory_id', '')), '');
    if v_subcategory_id is null then continue; end if;
    v_subcategory_name := nullif(btrim(coalesce(v_capability ->> 'subcategory_name', '')), '');

    for v_work_type_rate in
      select value from jsonb_array_elements(
        case when jsonb_typeof(v_capability -> 'work_type_rates') = 'array'
          then v_capability -> 'work_type_rates' else '[]'::jsonb end
      )
    loop
      v_work_type_id := nullif(btrim(coalesce(v_work_type_rate ->> 'work_type_id', '')), '');
      v_work_type_name := nullif(btrim(coalesce(v_work_type_rate ->> 'work_type_name', '')), '');
      v_material := nullif(v_work_type_rate -> 'material_rate', 'null'::jsonb);
      v_labour := nullif(v_work_type_rate -> 'labour_rate', 'null'::jsonb);
      if v_work_type_id is null or v_work_type_name is null or (v_material is null and v_labour is null) then continue; end if;

      v_unit_id := coalesce(
        nullif(btrim(v_work_type_rate ->> 'unit_id'), ''),
        (
          select nullif(btrim(work_type.value ->> 'unit_id'), '')
            from (SELECT * FROM public."entity_work_definitions" WHERE collection='master.workSubcategories') subcategory
            cross join lateral jsonb_array_elements(
              case when jsonb_typeof(subcategory.data -> 'work_types') = 'array'
                then subcategory.data -> 'work_types' else '[]'::jsonb end
            ) as work_type(value)
           where subcategory.workspace_id = p_workspace_id
             and subcategory.id = v_subcategory_id
             and work_type.value ->> 'id' = v_work_type_id
           limit 1
        ),
        (
          select nullif(btrim(subcategory.data ->> 'unit_id'), '')
            from (SELECT * FROM public."entity_work_definitions" WHERE collection='master.workSubcategories') subcategory
           where subcategory.workspace_id = p_workspace_id
             and subcategory.id = v_subcategory_id
           limit 1
        )
      );
      v_total := coalesce((v_material #>> '{}')::numeric, 0) + coalesce((v_labour #>> '{}')::numeric, 0);

      v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', 'crate-' || v_contractor_id || '-' || v_subcategory_id || '-' || v_work_type_id,
        'contractor_id', v_contractor_id,
        'trade', coalesce(v_subcategory_name, 'Contractor rate') || ' · ' || v_work_type_name,
        'rate', v_total,
        'unit_id', v_unit_id,
        'work_subcategory_id', v_subcategory_id,
        'work_subcategory_name', v_subcategory_name,
        'work_type_id', v_work_type_id,
        'work_type_name', v_work_type_name,
        'material_rate', v_material,
        'labour_rate', v_labour,
        'notes', nullif(btrim(v_work_type_rate ->> 'notes'), '')
      )));
    end loop;
  end loop;

  return v_rows;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_health_summary_v2(p_workspace_id text DEFAULT 'default'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with recursive
revision_state as (
  select coalesce(revision, 0)::bigint as revision
  from public.entity_workspace_revision
  where id = p_workspace_id
),
task_metrics as (
  select
    count(*) filter (where data->>'status' in ('todo', 'in_progress', 'review'))::bigint as open_tasks,
    count(*) filter (
      where data->>'status' in ('todo', 'in_progress', 'review')
        and nullif(data->>'due_date', '') is not null
        and data->>'due_date' < ((now() at time zone 'Asia/Kolkata')::date::text)
    )::bigint as overdue_tasks,
    count(*) filter (
      where data->>'status' in ('todo', 'in_progress', 'review')
        and data->>'due_date' = ((now() at time zone 'Asia/Kolkata')::date::text)
    )::bigint as due_today_tasks
  from (SELECT * FROM public."entity_workflow_controls" WHERE collection='tasks')
  where workspace_id = p_workspace_id
),
followup_metrics as (
  select count(*) filter (where data->>'status' in ('pending', 'scheduled', 'missed'))::bigint as active_followups
  from (SELECT * FROM public."entity_workflow_controls" WHERE collection='followups')
  where workspace_id = p_workspace_id
),
action_metrics as (
  select count(*) filter (where data->>'status' = 'pending')::bigint as pending_approvals
  from (SELECT * FROM public."entity_workflow_controls" WHERE collection='actions')
  where workspace_id = p_workspace_id
),
blocked_metrics as (
  select count(*) filter (where coalesce(data->'resolved', 'false'::jsonb) <> 'true'::jsonb)::bigint as unresolved_blocked
  from (SELECT * FROM public."entity_workflow_controls" WHERE collection='blocked')
  where workspace_id = p_workspace_id
),
risk_metrics as (
  select count(*)::bigint as open_risks
  from (SELECT * FROM public."entity_workflow_controls" WHERE collection='risks')
  where workspace_id = p_workspace_id
),
work_order_metrics as (
  select count(*) filter (where data->>'status' in ('in_progress', 'scheduled'))::bigint as active_work_orders
  from public."entity_workOrders"
  where workspace_id = p_workspace_id
),
visit_metrics as (
  select count(*) filter (where data->>'status' in ('scheduled', 'en_route', 'checked_in'))::bigint as active_visits
  from (SELECT * FROM public."entity_workflow_controls" WHERE collection='visits')
  where workspace_id = p_workspace_id
),
customer_metrics as (
  select count(*)::bigint as customers
  from public.entity_customers
  where workspace_id = p_workspace_id
),
po_metrics as (
  select count(*) filter (
    where data->'direct_award' = 'true'::jsonb
       or data->>'award_basis' = 'direct'
  )::bigint as direct_award_pos
  from (SELECT * FROM public."entity_commercial_documents" WHERE collection='purchaseOrders')
  where workspace_id = p_workspace_id
),
quotation_rows as materialized (
  select
    id,
    data,
    nullif(data->>'parent_quotation_id', '') as parent_id,
    case
      when coalesce(data->>'revision_no', '') ~ '^-?[0-9]+([.][0-9]+)?$'
        then (data->>'revision_no')::numeric
      else 0
    end as revision_no,
    coalesce(nullif(data->>'updated_at', ''), nullif(data->>'created_at', ''), '') as sort_time
  from (SELECT * FROM public."entity_commercial_documents" WHERE collection='quotations')
  where workspace_id = p_workspace_id
),
quotation_chain(origin_id, current_id, parent_id, path, depth) as (
  select id, id, parent_id, array[id]::text[], 0
  from quotation_rows
  union all
  select c.origin_id, parent.id, parent.parent_id, c.path || parent.id, c.depth + 1
  from quotation_chain c
  join quotation_rows parent on parent.id = c.parent_id
  where not (parent.id = any(c.path))
),
quotation_roots as (
  select distinct on (origin_id)
    origin_id,
    current_id as root_id
  from quotation_chain
  order by origin_id, depth desc
),
latest_quotations as (
  select distinct on (roots.root_id)
    quotation.id,
    quotation.data,
    quotation.revision_no,
    quotation.sort_time,
    roots.root_id
  from quotation_rows quotation
  join quotation_roots roots on roots.origin_id = quotation.id
  order by roots.root_id, quotation.revision_no desc, quotation.sort_time desc, quotation.id desc
),
quotation_metrics as (
  select
    count(*) filter (where data->>'status' in ('draft', 'sent'))::bigint as pipeline_quotations,
    coalesce(sum(
      case
        when data->>'status' in ('draft', 'sent') and jsonb_typeof(data->'total_amount') = 'number'
          then (data->>'total_amount')::numeric
        else 0
      end
    ), 0) as pipeline_value
  from latest_quotations
),
variation_metrics as (
  select count(*) filter (where data->>'revision_kind' in ('variation', 'renegotiation'))::bigint as variations
  from quotation_rows
),
receipt_rows as materialized (
  select
    case when jsonb_typeof(data->'amount') = 'number' then (data->>'amount')::numeric else 0 end as amount,
    case when nullif(data->>'received_at', '') is not null then (data->>'received_at')::timestamptz else null end as received_at
  from (SELECT * FROM public."entity_money_movements" WHERE collection='customerReceipts')
  where workspace_id = p_workspace_id
),
receipt_metrics as (
  select
    coalesce(sum(amount), 0) as total_received,
    coalesce(sum(amount) filter (
      where received_at >= date_trunc('month', now())
        and received_at <= now()
    ), 0) as month_revenue
  from receipt_rows
),
vendor_payment_metrics as (
  select coalesce(sum(
    case when jsonb_typeof(data->'amount') = 'number' then (data->>'amount')::numeric else 0 end
  ), 0) as total_paid_out
  from (SELECT * FROM public."entity_money_movements" WHERE collection='vendorPayments')
  where workspace_id = p_workspace_id
),
invoice_metrics as (
  select
    count(*) filter (
      where data->>'status' in ('issued', 'partial', 'overdue')
        and nullif(data->>'due_date', '') is not null
        and data->>'due_date' < ((now() at time zone 'Asia/Kolkata')::date::text)
    )::bigint as overdue_invoice_count,
    coalesce(sum(
      case
        when data->>'status' in ('issued', 'partial', 'overdue')
          and nullif(data->>'due_date', '') is not null
          and data->>'due_date' < ((now() at time zone 'Asia/Kolkata')::date::text)
          and jsonb_typeof(data->'balance_amount') = 'number'
          then (data->>'balance_amount')::numeric
        else 0
      end
    ), 0) as overdue_invoice_value
  from (SELECT * FROM public."entity_financial_documents" WHERE collection='invoices')
  where workspace_id = p_workspace_id
),
vendor_bill_metrics as (
  select
    count(*) filter (where data->>'status' in ('pending', 'approved', 'partly_paid'))::bigint as pending_vendor_bill_count,
    coalesce(sum(
      case
        when data->>'status' in ('pending', 'approved', 'partly_paid')
          and jsonb_typeof(data->'balance_amount') = 'number'
          then (data->>'balance_amount')::numeric
        else 0
      end
    ), 0) as pending_vendor_bill_value
  from (SELECT * FROM public."entity_financial_documents" WHERE collection='vendorBills')
  where workspace_id = p_workspace_id
),
revenue_days as (
  select generate_series(6, 0, -1) as day_offset
),
revenue_by_day as (
  select
    (received_at at time zone 'Asia/Kolkata')::date as day,
    sum(amount) as value
  from receipt_rows
  where received_at is not null
    and (received_at at time zone 'Asia/Kolkata')::date >= ((now() at time zone 'Asia/Kolkata')::date - 6)
    and (received_at at time zone 'Asia/Kolkata')::date <= (now() at time zone 'Asia/Kolkata')::date
  group by (received_at at time zone 'Asia/Kolkata')::date
),
revenue_series as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', ((now() at time zone 'Asia/Kolkata')::date - days.day_offset)::text,
        'value', coalesce(revenue.value, 0)
      )
      order by days.day_offset desc
    ),
    '[]'::jsonb
  ) as series
  from revenue_days days
  left join revenue_by_day revenue
    on revenue.day = ((now() at time zone 'Asia/Kolkata')::date - days.day_offset)
),
recent_activity as (
  select coalesce(jsonb_agg(item order by timestamp desc), '[]'::jsonb) as items
  from (
    select
      data->>'timestamp' as timestamp,
      jsonb_strip_nulls(jsonb_build_object(
        'id', data->>'id',
        'action', data->>'action',
        'kind', data->>'kind',
        'entityType', data->>'entity_type',
        'entityLabel', coalesce(nullif(data->>'entity_label', ''), data->>'entity_type'),
        'actor', coalesce(nullif(data->>'actor', ''), 'system'),
        'actorRole', data->>'actor_role',
        'sourceModule', data->>'source_module',
        'reason', data->>'reason',
        'timestamp', data->>'timestamp'
      )) as item
    from public."entity_auditLog"
    where workspace_id = p_workspace_id
    order by data->>'timestamp' desc nulls last
    limit 5
  ) recent
)
select jsonb_build_object(
  'revision', coalesce((select revision from revision_state), 0),
  'healthBadge', 'watch',
  'attentionCount',
    (select pending_approvals from action_metrics)
    + (select unresolved_blocked from blocked_metrics)
    + (select overdue_tasks from task_metrics)
    + (select open_risks from risk_metrics),
  'integrity', jsonb_build_object(
    'snapshotAvailable', false,
    'healthScore', 100,
    'totalIssues', 0,
    'critical', 0,
    'warning', 0,
    'info', 0,
    'totalRecords', 0,
    'totalReferences', 0,
    'businessRuleIssues', 0,
    'calculatedAt', null
  ),
  'operations', jsonb_build_object(
    'openTasks', (select open_tasks from task_metrics),
    'overdueTasks', (select overdue_tasks from task_metrics),
    'dueTodayTasks', (select due_today_tasks from task_metrics),
    'activeFollowups', (select active_followups from followup_metrics),
    'pendingApprovals', (select pending_approvals from action_metrics),
    'unresolvedBlocked', (select unresolved_blocked from blocked_metrics),
    'openRisks', (select open_risks from risk_metrics),
    'activeWorkOrders', (select active_work_orders from work_order_metrics),
    'activeVisits', (select active_visits from visit_metrics)
  ),
  'commercial', jsonb_build_object(
    'pipelineValue', (select pipeline_value from quotation_metrics),
    'pipelineQuotations', (select pipeline_quotations from quotation_metrics),
    'customers', (select customers from customer_metrics)
  ),
  'exceptions', jsonb_build_object(
    'directAwardPOs', (select direct_award_pos from po_metrics),
    'variations', (select variations from variation_metrics),
    'total', (select direct_award_pos from po_metrics) + (select variations from variation_metrics)
  ),
  'finance', jsonb_build_object(
    'cashPosition', (select total_received from receipt_metrics) - (select total_paid_out from vendor_payment_metrics),
    'monthRevenue', (select month_revenue from receipt_metrics),
    'overdueInvoiceValue', (select overdue_invoice_value from invoice_metrics),
    'overdueInvoiceCount', (select overdue_invoice_count from invoice_metrics),
    'pendingVendorBillValue', (select pending_vendor_bill_value from vendor_bill_metrics),
    'pendingVendorBillCount', (select pending_vendor_bill_count from vendor_bill_metrics),
    'totalReceived', (select total_received from receipt_metrics),
    'totalPaidOut', (select total_paid_out from vendor_payment_metrics),
    'revenueSeries', (select series from revenue_series)
  ),
  'recentActivity', (select items from recent_activity)
);
$function$
;

CREATE OR REPLACE FUNCTION public.uc_taxonomy_reference_table(target_workspace_id text, target_id text, definition_table regclass, definition_id text, definition_collection text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  candidate record;
  found_reference boolean;
begin
  for candidate in
    select c.oid::regclass as table_ref, c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'entity\_%' escape '\'
      and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attname = 'data' and not a.attisdropped)
      and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attname = 'workspace_id' and not a.attisdropped)
      and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attname = 'id' and not a.attisdropped)
  loop
    if candidate.table_ref = definition_table then
      execute format(
        'select exists (select 1 from %s where workspace_id = $1 and NOT (id = $3 and collection = $4) and jsonb_path_exists(data, ''$.** ? (@ == $target)'', jsonb_build_object(''target'', to_jsonb($2))))',
        candidate.table_ref
      ) into found_reference using target_workspace_id, target_id, definition_id, definition_collection;
    else
      execute format(
        'select exists (select 1 from %s where workspace_id = $1 and jsonb_path_exists(data, ''$.** ? (@ == $target)'', jsonb_build_object(''target'', to_jsonb($2))))',
        candidate.table_ref
      ) into found_reference using target_workspace_id, target_id;
    end if;

    if found_reference then
      return candidate.relname;
    end if;
  end loop;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uc_guard_work_category_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  referenced_by text;
begin
  if tg_op = 'DELETE' then
    referenced_by := public.uc_taxonomy_reference_table(old.workspace_id, old.id, tg_relid, old.id, old.collection);
    if referenced_by is not null then
      raise exception 'Work category % is still referenced by %. Archive it instead.', old.id, referenced_by using errcode = '23503';
    end if;
    return old;
  end if;

  if coalesce(new.data ->> 'status', 'active') not in ('active', 'archived') then
    raise exception 'Work category status must be active or archived.' using errcode = '23514';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uc_guard_work_subcategory_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  referenced_by text;
  removed_work_type_id text;
  category_id text;
begin
  if tg_op = 'DELETE' then
    referenced_by := public.uc_taxonomy_reference_table(old.workspace_id, old.id, tg_relid, old.id, old.collection);
    if referenced_by is not null then
      raise exception 'Work subcategory % is still referenced by %. Archive it instead.', old.id, referenced_by using errcode = '23503';
    end if;
    return old;
  end if;

  category_id := nullif(btrim(new.data ->> 'category_id'), '');
  if category_id is null or not exists (
    select 1
    from (SELECT * FROM public."entity_work_definitions" WHERE collection='master.workCategories') category
    where category.workspace_id = new.workspace_id and category.id = category_id
  ) then
    raise exception 'Work subcategory % must reference an existing category.', new.id using errcode = '23503';
  end if;
  if coalesce(new.data ->> 'status', 'active') not in ('active', 'archived') then
    raise exception 'Work subcategory status must be active or archived.' using errcode = '23514';
  end if;
  if jsonb_typeof(new.data -> 'work_types') <> 'array' or jsonb_array_length(new.data -> 'work_types') = 0 then
    raise exception 'Work subcategory % must keep at least one work type.', new.id using errcode = '23514';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(new.data -> 'work_types') work_type
    where coalesce(work_type ->> 'status', 'active') = 'active'
  ) then
    raise exception 'Work subcategory % must keep at least one active work type.', new.id using errcode = '23514';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(new.data -> 'work_types') work_type
    where nullif(btrim(work_type ->> 'id'), '') is null
      or nullif(btrim(work_type ->> 'name'), '') is null
      or coalesce(work_type ->> 'status', 'active') not in ('active', 'archived')
  ) then
    raise exception 'Every work type requires an id, name and valid lifecycle status.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    for removed_work_type_id in
      select old_work_type ->> 'id'
      from jsonb_array_elements(coalesce(old.data -> 'work_types', '[]'::jsonb)) old_work_type
      where not exists (
        select 1
        from jsonb_array_elements(new.data -> 'work_types') new_work_type
        where new_work_type ->> 'id' = old_work_type ->> 'id'
      )
    loop
      referenced_by := public.uc_taxonomy_reference_table(new.workspace_id, removed_work_type_id, tg_relid, new.id, new.collection);
      if referenced_by is not null then
        raise exception 'Work type % is still referenced by %. Archive it instead.', removed_work_type_id, referenced_by using errcode = '23503';
      end if;
    end loop;
  end if;
  return new;
end;
$function$
;

DROP FUNCTION public.uc_taxonomy_reference_table(text,text,regclass,text);

REVOKE ALL ON FUNCTION public.uc_taxonomy_reference_table(text,text,regclass,text,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.uc_taxonomy_reference_table(text,text,regclass,text,text) TO service_role;

CREATE TRIGGER s2_cc9494d33cf5743b66ea4292 BEFORE INSERT OR UPDATE OF data ON public."entity_workflow_controls" FOR EACH ROW WHEN (new.collection='tasks') EXECUTE FUNCTION uc_guard_staff_assignment('entity_tasks');

CREATE TRIGGER s2_09fb657560f7e2388545a095 BEFORE INSERT OR UPDATE OF data ON public."entity_workflow_controls" FOR EACH ROW WHEN (new.collection='followups') EXECUTE FUNCTION uc_guard_staff_assignment('entity_followups');

CREATE TRIGGER s2_653c9fe5d36335da19413d94 BEFORE INSERT OR UPDATE OF data ON public."entity_workflow_controls" FOR EACH ROW WHEN (new.collection='visits') EXECUTE FUNCTION uc_guard_staff_assignment('entity_visits');

CREATE TRIGGER s2_fc90c2d9e71ceb6fa34c7b2b BEFORE INSERT OR UPDATE OF data ON public."entity_policy_rules" FOR EACH ROW WHEN (new.collection='recurringTasks') EXECUTE FUNCTION uc_guard_staff_assignment('entity_recurringTasks');

CREATE TRIGGER s2_544dcfa68008a53123b17abe BEFORE INSERT OR UPDATE OF data ON public."entity_staff_records" FOR EACH ROW WHEN (new.collection='attendance') EXECUTE FUNCTION uc_normalize_staff_history_payload();

CREATE TRIGGER s2_bdf8fbf4762756a04a7b7c01 BEFORE INSERT OR UPDATE OF data ON public."entity_staff_records" FOR EACH ROW WHEN (new.collection='payrollLines') EXECUTE FUNCTION uc_normalize_staff_history_payload();

CREATE TRIGGER s2_d7255342d6af1fc3f4309f13 BEFORE INSERT OR UPDATE OF data ON public."entity_staff_records" FOR EACH ROW WHEN (new.collection='leaveRequests') EXECUTE FUNCTION uc_normalize_staff_history_payload();

CREATE TRIGGER s2_1d5f3971804cf93e8cb9abb2 BEFORE INSERT OR UPDATE OF data ON public."entity_staff_records" FOR EACH ROW WHEN (new.collection='salaryAdjustments') EXECUTE FUNCTION uc_normalize_staff_history_payload();

CREATE TRIGGER s2_cb3edd383419eacbe3f974e5 BEFORE INSERT OR UPDATE ON public."entity_work_definitions" FOR EACH ROW WHEN (new.collection='master.workCategories') EXECUTE FUNCTION uc_guard_work_category_history();

CREATE TRIGGER s2_b4f8d79f6ea53b21d57f5561 BEFORE DELETE ON public."entity_work_definitions" FOR EACH ROW WHEN (old.collection='master.workCategories') EXECUTE FUNCTION uc_guard_work_category_history();

CREATE TRIGGER s2_bb86a6c0d82f1ad48f0fbc6a BEFORE INSERT OR UPDATE ON public."entity_work_definitions" FOR EACH ROW WHEN (new.collection='master.workSubcategories') EXECUTE FUNCTION uc_guard_work_subcategory_history();

CREATE TRIGGER s2_b8e62b69c872b5a4b02df450 BEFORE DELETE ON public."entity_work_definitions" FOR EACH ROW WHEN (old.collection='master.workSubcategories') EXECUTE FUNCTION uc_guard_work_subcategory_history();

CREATE TRIGGER s2_79938e505b574613db958bd4 BEFORE INSERT OR UPDATE ON public."entity_work_definitions" FOR EACH ROW WHEN (new.collection='master.workSubcategories') EXECUTE FUNCTION uc_guard_shared_service_categories();

DROP TABLE public."entity_grns";

DROP TABLE public."entity_dispatches";

DROP TABLE public."entity_payrollPeriods";

DROP TABLE public."entity_tasks";

DROP TABLE public."entity_followups";

DROP TABLE public."entity_visits";

DROP TABLE public."entity_master_vendorRateHistories";

DROP TABLE public."entity_recurringTasks";

DROP TABLE public."entity_master_workCategories";

DROP TABLE public."entity_master_workSubcategories";

DROP TABLE public."entity_master_workOptionGroups";

DROP TABLE public."entity_master_workOptionValues";

DROP TABLE public."entity_measurementRevisions";

DROP TABLE public."entity_drawings";

DROP TABLE public."entity_executionLogs";

DROP TABLE public."entity_variationRequests";

DROP TABLE public."entity_master_articles";

DROP TABLE public."entity_master_articleVariants";

DROP TABLE public."entity_entityFileAttachments";

DROP TABLE public."entity_entityReferenceAssignments";

DROP TABLE public."entity_attendance";

DROP TABLE public."entity_payrollLines";

DROP TABLE public."entity_leaveRequests";

DROP TABLE public."entity_salaryAdjustments";

DROP TABLE public."entity_staffDocuments";

DROP TABLE public."entity_master_storageFolderTemplates";

DROP TABLE public."entity_master_storageFolderInstances";

DO $count$ BEGIN IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') <> 52 THEN RAISE EXCEPTION 'Expected 52 public tables after shared-domain expansion'; END IF; END $count$;

NOTIFY pgrst, 'reload schema';

COMMIT;
