-- Reverse shared project connections using CURRENT rows. Reverse shared_business_keys first.

BEGIN;

SET LOCAL lock_timeout = '15s';

SET LOCAL statement_timeout = '120s';

LOCK TABLE public.entity_workspace_revision IN ACCESS EXCLUSIVE MODE;

SET CONSTRAINTS ALL IMMEDIATE;

LOCK TABLE public."entity_commSends", public."entity_commercial_documents", public."entity_financial_documents", public."entity_inventory", public."entity_money_movements", public."entity_policy_rules", public."entity_project_work", public."entity_resource_links", public."entity_site_records", public."entity_staff_records", public."entity_stockMovements", public."entity_storage_structure", public."entity_workOrderCostLines", public."entity_workflow_controls" IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public."entity_workOrderCostLines" DROP CONSTRAINT "s3_2b57b2e466283c3148a580f3";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_62e6cd04087468133b0cfc18";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_a9bdd66f7ee391e4b466e8ec";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_6de15ee2377c4b9524406a66";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "s3_3c76e64d4c70525eec4e4746";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "s3_ac00ff4343f0ae3adafcfc82";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "s3_ed68ee1d242aa29ab0fed0c5";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_a8833dd0293db17961a55c70";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_96fee35ada845c8f000817e5";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_3d648f73f0f388b7fa48d8c1";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "s3_e749d0a2377ef2d11e8af802";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_cadac854b8d29c48a57629af";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "s3_605fb4cfa4c2a432d566b780";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "s3_815b1214b6c7e46fc4d1abbc";

ALTER TABLE public."entity_staff_records" DROP CONSTRAINT "s3_c7303d16dac8c8d5cc3f498e";

ALTER TABLE public."entity_staff_records" DROP CONSTRAINT "s3_94055e7768cdca51cdf5fa5f";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_0908d94e7df9c5848dc66e9e";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_aff39ba92b912b585b9909da";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "s3_1ac822b99ff6d4c781ded67c";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_85c054e453c561835304c7f9";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_c62b93711c0ee1789ea3ec90";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_5f18c322e1b8402d6b4a2aa8";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_8e25ff769af5a43fe8fd4417";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_96c167ab78e621f8edcb840b";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_6b3b784cec210b55ff32afae";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_749946cbf44fbce8da0779cc";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "s3_60271a17c357e67b2be7ac1d";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "s3_1b46e315abd613e86c3bebc2";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "s3_ee69e1a8006220b17f0ad43e";

ALTER TABLE public."entity_inventory" DROP CONSTRAINT "s3_f277765a36950ff590643dc7";

ALTER TABLE public."entity_stockMovements" DROP CONSTRAINT "s3_1890448fd437168a28fb2ee1";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_21b2b1c72d9eb226bf4b33d4";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_aedc34f93ca3d957c9c9b412";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_8b94afa84b1bf06e911237ed";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_9442259b73baebc296bbb15a";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_9d2e652fec4f80ab9214c658";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "s3_cb1665c8a9d81b55c5ab08f8";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "s3_40333e3f15ee054840f8ae0c";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "s3_9bd1b75c5dd794c3590465d2";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "s3_d7938723a5df81f06674a8d2";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "s3_e8a4e35092536f7d930f491b";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "s3_df79ae2e007c865ecd6c284a";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s3_4af6be6cc78d1f152cd380e3";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s3_56b88749330582d574c962d6";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s3_ecfbab76bce000e601e98db4";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s3_b43ccd188793d44e250cff6b";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s3_cf5a1d1b0cc14a5df69d6544";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s3_272d398f1eedf56be08ced17";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_06445955d1a178ef5be3b38f";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_226c96e01d161c1ffd21a8e0";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_a9a42b73aaff125560dc23e5";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_88dfaa9ce653c4374c5cff0d";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_747a6ba9a55f57a16b861f13";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "s3_9c6ba28f7ed33d742b8f13af";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s3_f2d1e0f7e2203dc32ba5d04a";

ALTER TABLE public."entity_commSends" DROP CONSTRAINT "s3_38fdd63525a27a2fcba935e3";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "s3_1157553d8fb019582eb91917";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "s3_3c24cb94c7b11f28f71301fa";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "s3_039ff914d5f28a6aeced5a32";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "s3_c690735f9106f46600a7c257";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "s3_ddfe4931625d72cbc21e9387";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "s3_44e323487ff84ee73a2702df";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_f26d72715319c8fcbcfe3e24";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_01ab18ad9eb8ffc185021c3c";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_414d2f0717b57391a4a840b3";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_fbd9e006e574b5b1e7bed614";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "s3_4f6cece5f49b2f4d058537d7";

ALTER TABLE public."entity_policy_rules" DROP CONSTRAINT "s3_38ffffac87d8b7b32cb790ab";

ALTER TABLE public."entity_storage_structure" DROP CONSTRAINT "s3_07f6a1c79b9158f997092725";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "s3_ab0731cceb0a2a07774eacb3";

CREATE TABLE public."entity_workRequired" ("id" text NOT NULL, "workspace_id" text DEFAULT 'default'::text NOT NULL, "revision" bigint DEFAULT 0 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_by" text, "data" jsonb NOT NULL, "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED, "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED);

ALTER TABLE public."entity_workRequired" ADD CONSTRAINT "entity_workRequired_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_workRequired" ADD CONSTRAINT "entity_workrequired_data_shape_chk" CHECK (((jsonb_typeof(data) = 'object'::text) AND ((data ->> 'id'::text) = id) AND (COALESCE(btrim((data ->> 'customer_id'::text)), ''::text) <> ''::text) AND (COALESCE(btrim((data ->> 'title'::text)), ''::text) <> ''::text) AND (((data -> 'area_ids'::text) IS NULL) OR (jsonb_typeof((data -> 'area_ids'::text)) = 'array'::text)) AND (jsonb_typeof((data -> 'work_subcategory_ids'::text)) = 'array'::text) AND (jsonb_typeof((data -> 'work_type_ids'::text)) = 'array'::text) AND (((jsonb_array_length((data -> 'work_subcategory_ids'::text)) = 0) AND (jsonb_array_length((data -> 'work_type_ids'::text)) = 0)) OR ((jsonb_array_length((data -> 'work_subcategory_ids'::text)) > 0) AND (jsonb_array_length((data -> 'work_type_ids'::text)) > 0)))));

CREATE INDEX "entity_workRequired_updated_idx" ON public."entity_workRequired" USING btree (updated_at DESC);

CREATE INDEX "entity_workRequired_workspace_idx" ON public."entity_workRequired" USING btree (workspace_id);

CREATE INDEX "entity_workRequired_customer_id_idx" ON public."entity_workRequired" USING btree (customer_id_gen, workspace_id);

CREATE INDEX "entity_workRequired_site_id_idx" ON public."entity_workRequired" USING btree (site_id_gen, workspace_id);

CREATE INDEX fk_88352eda92bda6afee4a67 ON public."entity_workRequired" USING btree (workspace_id, customer_id_gen);

CREATE INDEX fk_aeef2fc04077a8131a1e41 ON public."entity_workRequired" USING btree (workspace_id, site_id_gen);

CREATE UNIQUE INDEX fk_a3c798826c9e2e7a2c64d3 ON public."entity_workRequired" USING btree (workspace_id, id);

ALTER TABLE public."entity_workRequired" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_workRequired" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT ON public."entity_workRequired" TO "postgres" WITH GRANT OPTION;

GRANT SELECT ON public."entity_workRequired" TO "postgres" WITH GRANT OPTION;

GRANT UPDATE ON public."entity_workRequired" TO "postgres" WITH GRANT OPTION;

GRANT DELETE ON public."entity_workRequired" TO "postgres" WITH GRANT OPTION;

GRANT TRUNCATE ON public."entity_workRequired" TO "postgres" WITH GRANT OPTION;

GRANT REFERENCES ON public."entity_workRequired" TO "postgres" WITH GRANT OPTION;

GRANT TRIGGER ON public."entity_workRequired" TO "postgres" WITH GRANT OPTION;

GRANT INSERT ON public."entity_workRequired" TO "service_role";

GRANT SELECT ON public."entity_workRequired" TO "service_role";

GRANT UPDATE ON public."entity_workRequired" TO "service_role";

GRANT DELETE ON public."entity_workRequired" TO "service_role";

GRANT TRUNCATE ON public."entity_workRequired" TO "service_role";

GRANT REFERENCES ON public."entity_workRequired" TO "service_role";

GRANT TRIGGER ON public."entity_workRequired" TO "service_role";

CREATE POLICY "entity_workRequired workspace read" ON public."entity_workRequired" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE TABLE public."entity_acceptedScopes" ("id" text NOT NULL, "workspace_id" text DEFAULT 'default'::text NOT NULL, "revision" bigint DEFAULT 0 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_by" text, "data" jsonb NOT NULL, "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED, "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED, "fk_9b5d1f805774ca81b771f6" text GENERATED ALWAYS AS (NULLIF((data #>> '{work_required_id}'::text[]), ''::text)) STORED, "fk_d08aebf50269477f5f3177" text GENERATED ALWAYS AS (NULLIF((data #>> '{quotation_id}'::text[]), ''::text)) STORED, "fk_0853d2f491d44bf1c48d8a" text GENERATED ALWAYS AS ('quotations'::text) STORED, "fk_907a82a54f99c5f559aea4" text GENERATED ALWAYS AS (NULLIF((data #>> '{work_order_id}'::text[]), ''::text)) STORED, "fk_383222e592db5fd66a634c" text GENERATED ALWAYS AS (NULLIF((data #>> '{contractor_bid_id}'::text[]), ''::text)) STORED, "fk_c54e2099ca843e0887abc9" text GENERATED ALWAYS AS ('contractorBids'::text) STORED);

ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "entity_acceptedScopes_pkey" PRIMARY KEY (id);

CREATE INDEX "entity_acceptedScopes_updated_idx" ON public."entity_acceptedScopes" USING btree (updated_at DESC);

CREATE INDEX "entity_acceptedScopes_workspace_idx" ON public."entity_acceptedScopes" USING btree (workspace_id);

CREATE INDEX "entity_acceptedScopes_customer_id_idx" ON public."entity_acceptedScopes" USING btree (customer_id_gen, workspace_id);

CREATE INDEX "entity_acceptedScopes_site_id_idx" ON public."entity_acceptedScopes" USING btree (site_id_gen, workspace_id);

CREATE INDEX fk_be437c6f8a128a0fc1c20e ON public."entity_acceptedScopes" USING btree (workspace_id, customer_id_gen);

CREATE INDEX fk_90b50d5c987b0b9c651b70 ON public."entity_acceptedScopes" USING btree (workspace_id, site_id_gen);

CREATE INDEX fk_8ca3e44149c479a9dca788 ON public."entity_acceptedScopes" USING btree (workspace_id, fk_9b5d1f805774ca81b771f6);

CREATE INDEX fk_dad1699df217b109370768 ON public."entity_acceptedScopes" USING btree (fk_0853d2f491d44bf1c48d8a, workspace_id, fk_d08aebf50269477f5f3177);

CREATE INDEX fk_e25ffb02fd176393f72d76 ON public."entity_acceptedScopes" USING btree (workspace_id, fk_907a82a54f99c5f559aea4);

CREATE UNIQUE INDEX fk_6c68aada900acf7d0cf906 ON public."entity_acceptedScopes" USING btree (workspace_id, id);

CREATE INDEX fk_916f17f661d7e449686f68 ON public."entity_acceptedScopes" USING btree (fk_c54e2099ca843e0887abc9, workspace_id, fk_383222e592db5fd66a634c);

ALTER TABLE public."entity_acceptedScopes" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_acceptedScopes" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT ON public."entity_acceptedScopes" TO "postgres" WITH GRANT OPTION;

GRANT SELECT ON public."entity_acceptedScopes" TO "postgres" WITH GRANT OPTION;

GRANT UPDATE ON public."entity_acceptedScopes" TO "postgres" WITH GRANT OPTION;

GRANT DELETE ON public."entity_acceptedScopes" TO "postgres" WITH GRANT OPTION;

GRANT TRUNCATE ON public."entity_acceptedScopes" TO "postgres" WITH GRANT OPTION;

GRANT REFERENCES ON public."entity_acceptedScopes" TO "postgres" WITH GRANT OPTION;

GRANT TRIGGER ON public."entity_acceptedScopes" TO "postgres" WITH GRANT OPTION;

GRANT INSERT ON public."entity_acceptedScopes" TO "service_role";

GRANT SELECT ON public."entity_acceptedScopes" TO "service_role";

GRANT UPDATE ON public."entity_acceptedScopes" TO "service_role";

GRANT DELETE ON public."entity_acceptedScopes" TO "service_role";

GRANT TRUNCATE ON public."entity_acceptedScopes" TO "service_role";

GRANT REFERENCES ON public."entity_acceptedScopes" TO "service_role";

GRANT TRIGGER ON public."entity_acceptedScopes" TO "service_role";

CREATE POLICY "entity_acceptedScopes workspace read" ON public."entity_acceptedScopes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE TABLE public."entity_workOrders" ("id" text NOT NULL, "workspace_id" text DEFAULT 'default'::text NOT NULL, "revision" bigint DEFAULT 0 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_by" text, "data" jsonb NOT NULL, "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED, "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED, "contractor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'contractor_id'::text), ''::text)) STORED, "fk_ad7ea408471e7cb5177099" text GENERATED ALWAYS AS (NULLIF((data #>> '{replacement_for_work_order_id}'::text[]), ''::text)) STORED, "fk_6a19c08ff1313f013b4b20" text GENERATED ALWAYS AS (NULLIF((data #>> '{abandoned_contractor_id}'::text[]), ''::text)) STORED);

ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "entity_workOrders_pkey" PRIMARY KEY (id);

CREATE INDEX "entity_workOrders_updated_idx" ON public."entity_workOrders" USING btree (updated_at DESC);

CREATE INDEX "entity_workOrders_workspace_idx" ON public."entity_workOrders" USING btree (workspace_id);

CREATE INDEX "entity_workOrders_customer_id_idx" ON public."entity_workOrders" USING btree (customer_id_gen, workspace_id);

CREATE INDEX "entity_workOrders_site_id_idx" ON public."entity_workOrders" USING btree (site_id_gen, workspace_id);

CREATE INDEX "graph_workOrders_contractor_id_idx" ON public."entity_workOrders" USING btree (workspace_id, contractor_id_gen);

CREATE UNIQUE INDEX "entity_workOrders_workspace_identity" ON public."entity_workOrders" USING btree (workspace_id, id);

CREATE INDEX fk_3cb32f6eb8811690f957ae ON public."entity_workOrders" USING btree (workspace_id, customer_id_gen);

CREATE INDEX fk_364d06ac39d48f39352e75 ON public."entity_workOrders" USING btree (workspace_id, site_id_gen);

CREATE INDEX fk_7b63e277f2cc1623795628 ON public."entity_workOrders" USING btree (workspace_id, fk_ad7ea408471e7cb5177099);

CREATE INDEX fk_26068ef82afd1bb2b79d0f ON public."entity_workOrders" USING btree (workspace_id, fk_6a19c08ff1313f013b4b20);

ALTER TABLE public."entity_workOrders" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_workOrders" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT ON public."entity_workOrders" TO "postgres" WITH GRANT OPTION;

GRANT SELECT ON public."entity_workOrders" TO "postgres" WITH GRANT OPTION;

GRANT UPDATE ON public."entity_workOrders" TO "postgres" WITH GRANT OPTION;

GRANT DELETE ON public."entity_workOrders" TO "postgres" WITH GRANT OPTION;

GRANT TRUNCATE ON public."entity_workOrders" TO "postgres" WITH GRANT OPTION;

GRANT REFERENCES ON public."entity_workOrders" TO "postgres" WITH GRANT OPTION;

GRANT TRIGGER ON public."entity_workOrders" TO "postgres" WITH GRANT OPTION;

GRANT INSERT ON public."entity_workOrders" TO "service_role";

GRANT SELECT ON public."entity_workOrders" TO "service_role";

GRANT UPDATE ON public."entity_workOrders" TO "service_role";

GRANT DELETE ON public."entity_workOrders" TO "service_role";

GRANT TRUNCATE ON public."entity_workOrders" TO "service_role";

GRANT REFERENCES ON public."entity_workOrders" TO "service_role";

GRANT TRIGGER ON public."entity_workOrders" TO "service_role";

CREATE POLICY "entity_workOrders workspace read" ON public."entity_workOrders" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE TABLE public."entity_payments" ("id" text NOT NULL, "workspace_id" text DEFAULT 'default'::text NOT NULL, "revision" bigint DEFAULT 0 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_by" text, "data" jsonb NOT NULL, "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED, "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED, "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED, "invoice_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'invoice_id'::text), ''::text)) STORED, "sd_ec067a4d11b1b5c63469" text GENERATED ALWAYS AS ('invoices'::text) STORED, "fk_56e30db524815172569588" text GENERATED ALWAYS AS (NULLIF((data #>> '{quotation_id}'::text[]), ''::text)) STORED, "fk_0853d2f491d44bf1c48d8a" text GENERATED ALWAYS AS ('quotations'::text) STORED, "fk_c101efd23d771573ca5549" text GENERATED ALWAYS AS (NULLIF((data #>> '{work_required_id}'::text[]), ''::text)) STORED, "fk_e67dac9cfc4fff4bcb38ef" text GENERATED ALWAYS AS (NULLIF((data #>> '{milestone_term_id}'::text[]), ''::text)) STORED, "fk_bdc2f67f6d1c55498b5f82" text GENERATED ALWAYS AS ('paymentTermTemplates'::text) STORED);

ALTER TABLE public."entity_payments" ADD CONSTRAINT "entity_payments_pkey" PRIMARY KEY (id);

CREATE INDEX entity_payments_updated_idx ON public.entity_payments USING btree (updated_at DESC);

CREATE INDEX entity_payments_workspace_idx ON public.entity_payments USING btree (workspace_id);

CREATE INDEX entity_payments_customer_id_idx ON public.entity_payments USING btree (customer_id_gen, workspace_id);

CREATE INDEX entity_payments_site_id_idx ON public.entity_payments USING btree (site_id_gen, workspace_id);

CREATE UNIQUE INDEX entity_payments_workspace_identity ON public.entity_payments USING btree (workspace_id, id);

CREATE INDEX graph_payments_work_order_id_idx ON public.entity_payments USING btree (workspace_id, work_order_id_gen);

CREATE INDEX graph_payments_invoice_id_idx ON public.entity_payments USING btree (workspace_id, invoice_id_gen);

CREATE INDEX sd_e1c7a35fece2d923b120 ON public.entity_payments USING btree (sd_ec067a4d11b1b5c63469, workspace_id, invoice_id_gen);

CREATE INDEX fk_b0baa516322a03a5c05fdf ON public.entity_payments USING btree (workspace_id, customer_id_gen);

CREATE INDEX fk_30f5844c7b006c90474091 ON public.entity_payments USING btree (workspace_id, site_id_gen);

CREATE INDEX fk_04fccfdefe28d41ef24fb9 ON public.entity_payments USING btree (fk_0853d2f491d44bf1c48d8a, workspace_id, fk_56e30db524815172569588);

CREATE INDEX fk_fb5fe58d070502ed32d943 ON public.entity_payments USING btree (workspace_id, fk_c101efd23d771573ca5549);

CREATE INDEX fk_821f26ac7f6ae2ba782c7f ON public.entity_payments USING btree (fk_bdc2f67f6d1c55498b5f82, workspace_id, fk_e67dac9cfc4fff4bcb38ef);

ALTER TABLE public."entity_payments" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_payments" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT ON public."entity_payments" TO "postgres" WITH GRANT OPTION;

GRANT SELECT ON public."entity_payments" TO "postgres" WITH GRANT OPTION;

GRANT UPDATE ON public."entity_payments" TO "postgres" WITH GRANT OPTION;

GRANT DELETE ON public."entity_payments" TO "postgres" WITH GRANT OPTION;

GRANT TRUNCATE ON public."entity_payments" TO "postgres" WITH GRANT OPTION;

GRANT REFERENCES ON public."entity_payments" TO "postgres" WITH GRANT OPTION;

GRANT TRIGGER ON public."entity_payments" TO "postgres" WITH GRANT OPTION;

GRANT INSERT ON public."entity_payments" TO "service_role";

GRANT SELECT ON public."entity_payments" TO "service_role";

GRANT UPDATE ON public."entity_payments" TO "service_role";

GRANT DELETE ON public."entity_payments" TO "service_role";

GRANT TRUNCATE ON public."entity_payments" TO "service_role";

GRANT REFERENCES ON public."entity_payments" TO "service_role";

GRANT TRIGGER ON public."entity_payments" TO "service_role";

CREATE POLICY "entity_payments workspace read" ON public."entity_payments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE TABLE public."entity_commissions" ("id" text NOT NULL, "workspace_id" text DEFAULT 'default'::text NOT NULL, "revision" bigint DEFAULT 0 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_by" text, "data" jsonb NOT NULL, "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED, "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED, "fk_5b62d5863e6027fe6514ba" text GENERATED ALWAYS AS (NULLIF((data #>> '{work_order_id}'::text[]), ''::text)) STORED, "fk_f78e3d600be57d55f80b95" text GENERATED ALWAYS AS (NULLIF((data #>> '{source_partner_id}'::text[]), ''::text)) STORED, "fk_e3c213d44476e14a10bd6d" text GENERATED ALWAYS AS (NULLIF((data #>> '{quotation_id}'::text[]), ''::text)) STORED, "fk_0853d2f491d44bf1c48d8a" text GENERATED ALWAYS AS ('quotations'::text) STORED);

ALTER TABLE public."entity_commissions" ADD CONSTRAINT "entity_commissions_pkey" PRIMARY KEY (id);

CREATE INDEX entity_commissions_updated_idx ON public.entity_commissions USING btree (updated_at DESC);

CREATE INDEX entity_commissions_workspace_idx ON public.entity_commissions USING btree (workspace_id);

CREATE INDEX entity_commissions_customer_id_idx ON public.entity_commissions USING btree (customer_id_gen, workspace_id);

CREATE INDEX entity_commissions_site_id_idx ON public.entity_commissions USING btree (site_id_gen, workspace_id);

CREATE INDEX fk_837d21af6f1074c46c0c3c ON public.entity_commissions USING btree (workspace_id, fk_5b62d5863e6027fe6514ba);

CREATE INDEX fk_3c3cb20c9455645c921d57 ON public.entity_commissions USING btree (workspace_id, fk_f78e3d600be57d55f80b95);

CREATE INDEX fk_67253c33e7febd4901ccf2 ON public.entity_commissions USING btree (workspace_id, customer_id_gen);

CREATE INDEX fk_9454335b02361497b474dd ON public.entity_commissions USING btree (fk_0853d2f491d44bf1c48d8a, workspace_id, fk_e3c213d44476e14a10bd6d);

CREATE INDEX fk_0b26bbe37f8d3366d431f6 ON public.entity_commissions USING btree (workspace_id, site_id_gen);

ALTER TABLE public."entity_commissions" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_commissions" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT ON public."entity_commissions" TO "postgres" WITH GRANT OPTION;

GRANT SELECT ON public."entity_commissions" TO "postgres" WITH GRANT OPTION;

GRANT UPDATE ON public."entity_commissions" TO "postgres" WITH GRANT OPTION;

GRANT DELETE ON public."entity_commissions" TO "postgres" WITH GRANT OPTION;

GRANT TRUNCATE ON public."entity_commissions" TO "postgres" WITH GRANT OPTION;

GRANT REFERENCES ON public."entity_commissions" TO "postgres" WITH GRANT OPTION;

GRANT TRIGGER ON public."entity_commissions" TO "postgres" WITH GRANT OPTION;

GRANT INSERT ON public."entity_commissions" TO "service_role";

GRANT SELECT ON public."entity_commissions" TO "service_role";

GRANT UPDATE ON public."entity_commissions" TO "service_role";

GRANT DELETE ON public."entity_commissions" TO "service_role";

GRANT TRUNCATE ON public."entity_commissions" TO "service_role";

GRANT REFERENCES ON public."entity_commissions" TO "service_role";

GRANT TRIGGER ON public."entity_commissions" TO "service_role";

CREATE POLICY "entity_commissions workspace read" ON public."entity_commissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE TABLE public."entity_master_catalogueArticleVendorLinks" ("id" text NOT NULL, "workspace_id" text DEFAULT 'default'::text NOT NULL, "revision" bigint DEFAULT 0 NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_by" text, "data" jsonb NOT NULL, "fk_450feed94fbcd78825b5c6" text GENERATED ALWAYS AS (NULLIF((data #>> '{variant_id}'::text[]), ''::text)) STORED, "fk_1cd70b4cd2f5d99a0c26d7" text GENERATED ALWAYS AS ('master.articleVariants'::text) STORED, "fk_c703e5cfa8df4a9d2336f2" text GENERATED ALWAYS AS (NULLIF((data #>> '{catalogue_id}'::text[]), ''::text)) STORED, "fk_236135feae33ca9ca3b0cd" text GENERATED ALWAYS AS ('master.catalogues'::text) STORED, "fk_e6ba4a1248905f9997e996" text GENERATED ALWAYS AS (NULLIF((data #>> '{article_id}'::text[]), ''::text)) STORED, "fk_fac422498fa0394b160927" text GENERATED ALWAYS AS ('master.articles'::text) STORED, "fk_31040da32553891d411ee2" text GENERATED ALWAYS AS (NULLIF((data #>> '{vendor_id}'::text[]), ''::text)) STORED);

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "entity_master_catalogueArticleVendorLinks_pkey" PRIMARY KEY (id);

CREATE INDEX "entity_master_catalogueArticleVendorLinks_updated_idx" ON public."entity_master_catalogueArticleVendorLinks" USING btree (updated_at DESC);

CREATE INDEX "entity_master_catalogueArticleVendorLinks_workspace_idx" ON public."entity_master_catalogueArticleVendorLinks" USING btree (workspace_id);

CREATE INDEX fk_678eb5a158560e59b16ff9 ON public."entity_master_catalogueArticleVendorLinks" USING btree (fk_1cd70b4cd2f5d99a0c26d7, workspace_id, fk_450feed94fbcd78825b5c6);

CREATE INDEX fk_ff752c5021e38a5516ea14 ON public."entity_master_catalogueArticleVendorLinks" USING btree (fk_236135feae33ca9ca3b0cd, workspace_id, fk_c703e5cfa8df4a9d2336f2);

CREATE INDEX fk_92a0feec010c42bcdfa4ed ON public."entity_master_catalogueArticleVendorLinks" USING btree (fk_fac422498fa0394b160927, workspace_id, fk_e6ba4a1248905f9997e996);

CREATE INDEX fk_bfb8f0fbbdf21b52affc70 ON public."entity_master_catalogueArticleVendorLinks" USING btree (workspace_id, fk_31040da32553891d411ee2);

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_master_catalogueArticleVendorLinks" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT ON public."entity_master_catalogueArticleVendorLinks" TO "postgres" WITH GRANT OPTION;

GRANT SELECT ON public."entity_master_catalogueArticleVendorLinks" TO "postgres" WITH GRANT OPTION;

GRANT UPDATE ON public."entity_master_catalogueArticleVendorLinks" TO "postgres" WITH GRANT OPTION;

GRANT DELETE ON public."entity_master_catalogueArticleVendorLinks" TO "postgres" WITH GRANT OPTION;

GRANT TRUNCATE ON public."entity_master_catalogueArticleVendorLinks" TO "postgres" WITH GRANT OPTION;

GRANT REFERENCES ON public."entity_master_catalogueArticleVendorLinks" TO "postgres" WITH GRANT OPTION;

GRANT TRIGGER ON public."entity_master_catalogueArticleVendorLinks" TO "postgres" WITH GRANT OPTION;

GRANT INSERT ON public."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT SELECT ON public."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT UPDATE ON public."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT DELETE ON public."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT TRUNCATE ON public."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT REFERENCES ON public."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT TRIGGER ON public."entity_master_catalogueArticleVendorLinks" TO "service_role";

CREATE POLICY "entity_master_catalogueArticleVendorLinks workspace read" ON public."entity_master_catalogueArticleVendorLinks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

INSERT INTO public."entity_workRequired" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_project_work" WHERE collection='workRequired';

DO $$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workRequired" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_project_work" WHERE collection='workRequired') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_project_work" WHERE collection='workRequired' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workRequired")) THEN RAISE EXCEPTION 'Rollback envelope mismatch for entity_workRequired'; END IF; END $$;

DELETE FROM public."entity_project_work" WHERE collection='workRequired';

INSERT INTO public."entity_acceptedScopes" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_project_work" WHERE collection='acceptedScopes';

DO $$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_acceptedScopes" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_project_work" WHERE collection='acceptedScopes') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_project_work" WHERE collection='acceptedScopes' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_acceptedScopes")) THEN RAISE EXCEPTION 'Rollback envelope mismatch for entity_acceptedScopes'; END IF; END $$;

DELETE FROM public."entity_project_work" WHERE collection='acceptedScopes';

INSERT INTO public."entity_workOrders" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_project_work" WHERE collection='workOrders';

DO $$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workOrders" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_project_work" WHERE collection='workOrders') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_project_work" WHERE collection='workOrders' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workOrders")) THEN RAISE EXCEPTION 'Rollback envelope mismatch for entity_workOrders'; END IF; END $$;

DELETE FROM public."entity_project_work" WHERE collection='workOrders';

INSERT INTO public."entity_payments" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='payments';

DO $$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_payments" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='payments') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='payments' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_payments")) THEN RAISE EXCEPTION 'Rollback envelope mismatch for entity_payments'; END IF; END $$;

DELETE FROM public."entity_financial_documents" WHERE collection='payments';

INSERT INTO public."entity_commissions" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='commissions';

DO $$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commissions" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='commissions') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='commissions' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commissions")) THEN RAISE EXCEPTION 'Rollback envelope mismatch for entity_commissions'; END IF; END $$;

DELETE FROM public."entity_financial_documents" WHERE collection='commissions';

INSERT INTO public."entity_master_catalogueArticleVendorLinks" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_resource_links" WHERE collection='master.catalogueArticleVendorLinks';

DO $$ BEGIN IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_catalogueArticleVendorLinks" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_resource_links" WHERE collection='master.catalogueArticleVendorLinks') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_resource_links" WHERE collection='master.catalogueArticleVendorLinks' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_catalogueArticleVendorLinks")) THEN RAISE EXCEPTION 'Rollback envelope mismatch for entity_master_catalogueArticleVendorLinks'; END IF; END $$;

DELETE FROM public."entity_resource_links" WHERE collection='master.catalogueArticleVendorLinks';

DROP INDEX public."s3_e95601f3fe05ccbb1643dad4";

DROP INDEX public."s3_5aa164102e1c71481224a48f";

DROP INDEX public."s3_5ebf83fe1a502cc8f1900af2";

DROP INDEX public."s3_baf13d31c472d1f758f693f5";

DROP INDEX public."s3_aeae9dee500f1e50d956df70";

DROP INDEX public."s3_9ab2457a89c81057cd838311";

DROP INDEX public."s3_143d102b97f4ea58ae3ca9ef";

DROP INDEX public."s3_0327ee0736cc8c6f9ffa1c80";

DROP INDEX public."s3_442c6162496f2a1c416d1826";

DROP INDEX public."s3_890a18ab70fbf58c9c7f53ec";

DROP INDEX public."s3_b797074d6b0df5821f796328";

DROP INDEX public."s3_4a1f647950cb665ab67b7f45";

DROP INDEX public."s3_3664f014fe1a8199a6ae1bca";

DROP INDEX public."s3_3560a819b5f468b89aacaace";

DROP INDEX public."s3_2baa3108f0686deabaf2189f";

DROP INDEX public."s3_3c8963ba006ae96620a924a7";

DROP INDEX public."s3_c577205edb327050c58219db";

DROP INDEX public."s3_224202f32120a0869a6d3299";

DROP INDEX public."s3_7042fd9bc04ace6728b35a0c";

DROP INDEX public."s3_457d5b158e917ad3d058094b";

DROP INDEX public."s3_079c35f66eb9598ee856fdb0";

DROP INDEX public."s3_30d548472dfe6f23a2292f4b";

DROP INDEX public."s3_0e5acecda80d0670a98bb4c8";

DROP INDEX public."s3_b79efd37fef94ced0e1b0f7a";

DROP INDEX public."s3_8350a45e6e03f2906655ee06";

DROP INDEX public."s3_7c46d378531bea2d0c4043e8";

DROP INDEX public."s3_4ad234236db5028aff99d0f7";

DROP INDEX public."s3_acf66ba94eb545e0461998ae";

DROP INDEX public."s3_48eaadd2c7e2075a83799d66";

DROP INDEX public."s3_3b4d612f720cf887963f8dcd";

DROP INDEX public."s3_79120933c78422377a0035c5";

DROP INDEX public."s3_64f722b87c85d02799fed579";

DROP INDEX public."s3_69004e3295f0b8e39bf462f7";

DROP INDEX public."s3_c5d802491d19b3dfaa99d853";

DROP INDEX public."s3_de1d92ac392987e060edbb47";

DROP INDEX public."s3_01dc4206b0e7f15f37b7a900";

DROP INDEX public."s3_53b74538fb86b96e2c71de2e";

DROP INDEX public."s3_d5a3e37c71b809fc93aea97b";

DROP INDEX public."s3_b5093171153725a978b79de2";

DROP INDEX public."s3_1c584996d096e495a433cb26";

DROP INDEX public."s3_5d61a8878995cabb343e79a2";

DROP INDEX public."s3_031b8c5cafc1ed853b6e1cd6";

DROP INDEX public."s3_136fdf451ca72c005bd97d5c";

DROP INDEX public."s3_9c0b57db5de26b0e5ecd6585";

DROP INDEX public."s3_a2c115f14ca23e30ffaa36e7";

DROP INDEX public."s3_bc7140e967e1adabd9eab202";

DROP INDEX public."s3_c81ac6ac4d0e93212e169c3f";

DROP INDEX public."s3_cee837ed8f6667ca0d627ac7";

DROP INDEX public."s3_381b89e43761839d1410f19c";

DROP INDEX public."s3_780b97faafd23887422fdc43";

DROP INDEX public."s3_9b763a98b679eb11b8987dff";

DROP INDEX public."s3_365a05883d57b999f6eb023e";

DROP INDEX public."s3_88712bc42ec77aaa7b7f71f4";

DROP INDEX public."s3_a5c8045677a131a78d6bac73";

DROP INDEX public."s3_590499e8073d88cffa7b4a67";

DROP INDEX public."s3_0290dd181e2253c3c00cb36c";

DROP INDEX public."s3_a75038d052074d9cde52a5e9";

DROP INDEX public."s3_30b6c70c89bb862cde732876";

DROP INDEX public."s3_72d35b8a5d6bac603fccf49f";

DROP INDEX public."s3_8196be749c8c054fc1634911";

DROP INDEX public."s3_b3299e91f1da461714fadfb6";

DROP INDEX public."s3_b129eb6c320c01fe2542583a";

DROP INDEX public."s3_1d1d56125194cbbdcd086958";

DROP INDEX public."s3_3b0d612e5b77df34d26f9a0e";

DROP INDEX public."s3_ea9db455b417f6cbec1c164d";

DROP INDEX public."s3_5853d90e9b40eaa35963e8ea";

DROP INDEX public."s3_17ff70f5a38a797bf547ab23";

DROP INDEX public."s3_d1898f0e2e2b113b6b386cfc";

DROP INDEX public."s3_76e56596ab49adef2e2141b4";

DROP INDEX public."s3_77131049a0081381fe47b986";

DROP INDEX public."s3_062dac5ef91d345867629b5b";

DROP INDEX public."s3_cb3449b33a434ecc0c8cc94c";

DROP INDEX public."s3_7788a6796b42f76ed5af3310";

DROP INDEX public."s3_010c41b826f939c2e292e3d6";

DROP INDEX public."s3_8f3828b2d9911aeb9c3c81e0";

DROP INDEX public."s3_50b8a805c3f9cacfd645f35f";

DROP INDEX public."s3_8e0ecc0f5c4c15baf1da9a47";

DROP INDEX public."s3_e5d598ec372fbdfc50a8f318";

DROP INDEX public."s3_7234215e5eb26aea52e82dfd";

DROP INDEX public."s3_0e5bb19a4710cd69f5bd60a1";

DROP INDEX public."s3_29f3380824a43a998294375a";

DROP INDEX public."s3_59f68baf2556a485f7962ecb";

DROP INDEX public."s3_202a7437e92c96bf22253d53";

DROP INDEX public."s3_f611959d7daac72a27900284";

DROP INDEX public."s3_1bb7e58a92236c6db3b9aa55";

DROP INDEX public."s3_74016e1240e8ec9ea9360284";

DROP INDEX public."s3_8b365cd9acf7a0a58b3f1e0d";

DROP INDEX public."s3_5a7e54e7826879d367730f2d";

DROP INDEX public."s3_9f042a57f97018d4a52cf8a3";

DROP INDEX public."s3_ed7b763b8f53df238da57dd5";

DROP INDEX public."s3_08ed8d757b12e672a0b37acc";

DROP INDEX public."s3_98d759dbdfa6c44204002bd1";

DROP INDEX public."s3_6419c7389d074c8681a29936";

DROP INDEX public."s3_3e128139234a82650a54aba9";

DROP INDEX public."s3_df09df2487e678a77aff1086";

DROP INDEX public."s3_28307b18346a89f79d533efd";

DROP INDEX public."s3_dcd7d19c30fbac200fe46cd2";

DROP INDEX public."s3_2b00516b8a1c2093a612742a";

DROP INDEX public."s3_6bddcbcf54bf1c8029c9226a";

DROP INDEX public."s3_9f45d029e03a58afbfc6315b";

DROP INDEX public."s3_ec5f4e6724d07d283652f061";

DROP INDEX public."s3_ee91d08c334c8f6dbc4c7d08";

DROP INDEX public."s3_29b806dd4d7e48e84f5a368f";

DROP INDEX public."s3_6f4c4ce35199c15085a16377";

DROP INDEX public."s3_00b73ef0e255d4721ff5cdd7";

DROP INDEX public."s3_726ff087e1851370be7871e4";

DROP INDEX public."s3_e49dee494553fc53d04f7b82";

DROP INDEX public."s3_9e9914f3dc1c623e13ac6f1e";

DROP INDEX public."s3_399a18d35f8631e9494828a5";

DROP INDEX public."s3_f55cf5eaaa0ac09ea09178b9";

DROP INDEX public."s3_d46fdb61c38cbf1e80448fb3";

DROP INDEX public."s3_4bbe77d6c422b4144695a98a";

DROP INDEX public."s3_b4c19cd6de41c3cf6d7fc633";

DROP INDEX public."s3_6f8d9d9b80de58dd182a40e1";

DROP INDEX public."s3_2e952749d5f1b867241a17fc";

DROP INDEX public."s3_2a6ea8a7a17cb52eaba3c514";

DROP INDEX public."s3_54394a5be9896d2d325a7592";

DROP INDEX public."s3_6ab52c001d1a47fbe7c94b54";

DROP INDEX public."s3_feefb2cb5bc739dfcba5472f";

DROP INDEX public."s3_b7be76b2d9f8ae9833c54e05";

DROP INDEX public."s3_f5cc82719b51e994be95ce49";

DROP INDEX public."s3_b60e78f8292f237096f7d644";

ALTER TABLE public."entity_project_work" DROP CONSTRAINT "s3_77a6ced337b678f78929a0e6";

ALTER TABLE public."entity_storage_structure" DROP COLUMN "s3_8dca978e395b0c76e1fddd23";

ALTER TABLE public."entity_policy_rules" DROP COLUMN "s3_94615031b899fe63f2d131bb";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "s3_66ca34610015c888347d14bd";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_252a0e27e97eebb22e88be38";

ALTER TABLE public."entity_resource_links" DROP COLUMN "s3_7d2c329a7baaa6ea8cd4d2a7";

ALTER TABLE public."entity_resource_links" DROP COLUMN "s3_1f702be5ac584f4841c39fb0";

ALTER TABLE public."entity_commSends" DROP COLUMN "s3_7b0c658c972a3a1c2eef1473";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "s3_fbd349a298bc72c2212b0c62";

ALTER TABLE public."entity_money_movements" DROP COLUMN "s3_3b13a2127faba58238450db3";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_48320619b1a42ccd1e258031";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_9dfefad0dd05f5c39e79cd1e";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "s3_e2b1f2ac30affea8d4182995";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "s3_7b74326c59d711331dcad463";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "s3_761030fb82a8dca8aa31ac98";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "s3_cf2dc70d3e49ad3a881977d0";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "s3_8df5f9e4bbd0ee7ff8423bf9";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "s3_46f51832956189960172e93d";

ALTER TABLE public."entity_site_records" DROP COLUMN "s3_9d77c4f5c3e5bbf88055f5be";

ALTER TABLE public."entity_site_records" DROP COLUMN "s3_8dbde696c227288ea111ceb4";

ALTER TABLE public."entity_site_records" DROP COLUMN "s3_f9f4ec7005ee886638cf032d";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "s3_202a3dfcd4cbe27db5289376";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "s3_75227e4201b8cd0bc6920047";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "s3_61064ee071ba79a75188a2e7";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_d211351f2a1d756374007441";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_9fc327d392e30d78dd8ccfcc";

ALTER TABLE public."entity_stockMovements" DROP COLUMN "s3_7cbae7553ce64046bdee9633";

ALTER TABLE public."entity_inventory" DROP COLUMN "s3_5f4fcbce6eb97d1ca1bae273";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "s3_2195232ba16321a7b9ceea8f";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "s3_4d3c6be6459efe7f5cb31de3";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "s3_26ca09a9de3f96bb010ae300";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_ead5f58e2ee3d31d1816b0c9";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_44fec3b4e1bccec147e02388";

ALTER TABLE public."entity_site_records" DROP COLUMN "s3_1c5ae322656cbd1a52556fc8";

ALTER TABLE public."entity_staff_records" DROP COLUMN "s3_efc66d90f33fc6738a4c85c0";

ALTER TABLE public."entity_staff_records" DROP COLUMN "s3_dc208d57c0c87c2ba97d892f";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "s3_2c84f14ebdf79dd9adfb0ac2";

ALTER TABLE public."entity_money_movements" DROP COLUMN "s3_1c6fbe3aeefe9dfbf0c0d4f6";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_4cf091202258b45122b686bb";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "s3_a4f4f8988fe8ff99fd94f51e";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_8c0cbeba5c16083bbf3f3db1";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_4adf55f1cd78c128fccd870c";

ALTER TABLE public."entity_money_movements" DROP COLUMN "s3_d118b6c5d568e0cb306b89ae";

ALTER TABLE public."entity_money_movements" DROP COLUMN "s3_82d8cfc472dcaa2c09025a99";

ALTER TABLE public."entity_money_movements" DROP COLUMN "s3_fc4a3b14c9d06d76b6a22996";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_b2cea6d92e70a7cea281bce5";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_55b6e03f58b8341e9ba3eeda";

ALTER TABLE public."entity_workOrderCostLines" DROP COLUMN "s3_64ca5daa08091459a751a0c5";

ALTER TABLE public."entity_resource_links" DROP COLUMN "s3_f67cafe86dd6b96b73fc2840";

ALTER TABLE public."entity_resource_links" DROP COLUMN "s3_184d1c546c936c92c480071c";

ALTER TABLE public."entity_resource_links" DROP COLUMN "s3_16aa185eeeb7db92f1ac3ac6";

ALTER TABLE public."entity_resource_links" DROP COLUMN "s3_60f273df335a792c2f00cb47";

ALTER TABLE public."entity_resource_links" DROP COLUMN "s3_153023237f9c680fae6c5618";

ALTER TABLE public."entity_resource_links" DROP COLUMN "s3_193b8e6fc56e052f7690701a";

ALTER TABLE public."entity_resource_links" DROP COLUMN "s3_08ecc3470a13170bab10e1c5";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_e9aa6eeb86c45e95a47a8242";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_7ead9a650ce139fd3d8920ed";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_7927c3583518e5bb1c0ddbb2";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_246e54019a6cefe909e16d86";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_720268f6b4469dfd26bcbe1c";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_8847e69d4f82f4a18a82f436";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_70625c4e54dfe95cf4a4b8de";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_c0a21500c318326dba993faa";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_5dabf28ebe1b7ab6d7d6c676";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_93b033d9094597f05e3cfc93";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_debacfb093a401c936a7ee11";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_a815f06b686a7fa596421deb";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_da51ea2d4d3207253001b765";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_4b392f95a5f2e6aca3c4fcc4";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_c0c0a85c9834f76c13030901";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "s3_f11a3f778bd8d292a84c8e37";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_eeca448874673494e4064934";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_f5a776748bc9356b26486cf7";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_cd13ab198bbf4ebf87054a1c";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_92800d563b5984e547403d99";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_f81a7c076373446ffc1406ed";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_14c8cb9d927e07da8ae44f3f";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_dc2532efd88881327bc4f30b";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_14d5c3a603f1bcabdf1d15eb";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_8bf89c7bee464484d01f9701";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_f0160dc6987da956e84cd674";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_ea10984ced183124a8a05b3c";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_9b63066cfa8c01d579fb2068";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_f2308fd3081e61b99708e8c7";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_6fc8b17aae6d46b1d13a031e";

ALTER TABLE public."entity_project_work" DROP COLUMN "s3_2aaddbfe67bdafd733ff86e1";

ALTER TABLE public."entity_workOrderCostLines" ADD CONSTRAINT "graph_workOrderCostLines_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "graph_workOrders_contractor_id" FOREIGN KEY (workspace_id, contractor_id_gen) REFERENCES entity_master_contractors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_payments" ADD CONSTRAINT "graph_payments_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_99099d9c7d486f51dc89" FOREIGN KEY (sd_f8c1fdf5bba847442adb, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_a05dae4487abdf3ffe61" FOREIGN KEY (sd_b977f619b6e787456146, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_7cc946115b80ac7f9fae" FOREIGN KEY (sd_00341c51016d86152a34, payment_id_gen) REFERENCES entity_payments(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_e08516f9f7076ab78a94" FOREIGN KEY (sd_dcd6545686f65e40f138, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_5292691879d00ae29e53" FOREIGN KEY (sd_ce5a8e8bf4fba33ee764, payment_id_gen) REFERENCES entity_payments(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_df776e71f50fbe6c57dd" FOREIGN KEY (sd_d041ff31b5e2eb685f2c, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_payments" ADD CONSTRAINT "sd_e1ed16032f7522ef24c7" FOREIGN KEY (sd_ec067a4d11b1b5c63469, workspace_id, invoice_id_gen) REFERENCES entity_financial_documents(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "sd_378cd18bb2cc829d28fd" FOREIGN KEY (sd_381a7ef2c4d3fdf17cc7, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_b8f393d02938d5c6874b" FOREIGN KEY (sd_fd700e017557db859daa, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_c8554863e9cdbf031ec1" FOREIGN KEY (sd_12ad5eb38b143abb5cc3, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "s2_a5db8c3920744de37b276299" FOREIGN KEY (s2_4e8435c0a073b8a797b19129, s2_fe7678b905042359284bcadf) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "s2_e4febfcbc2cfe61488e3bdb5" FOREIGN KEY (s2_1963899541d5597965d7eca9, s2_c34f4a03b16c749011edbbd8) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "s2_94ee4f30d869030acea3b809" FOREIGN KEY (s2_fb456c92044008de09dc9893, s2_b721f4f121cf9744abf6abaa) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workRequired" ADD CONSTRAINT "fk_3224562be51e137a578ee0" FOREIGN KEY (workspace_id, customer_id_gen) REFERENCES entity_customers(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workRequired" ADD CONSTRAINT "fk_effbca7833e714e2066dd2" FOREIGN KEY (workspace_id, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_8ea7cffe500bf44f5ced87" FOREIGN KEY (workspace_id, fk_0fee8b0239f61c18359aee) REFERENCES "entity_workRequired"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "fk_4042e047f0e3a8f5c28eec" FOREIGN KEY (workspace_id, customer_id_gen) REFERENCES entity_customers(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "fk_832492dc0ebae12e256e5d" FOREIGN KEY (workspace_id, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "fk_57a907e4e5a3493e3bc865" FOREIGN KEY (workspace_id, fk_9b5d1f805774ca81b771f6) REFERENCES "entity_workRequired"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "fk_dfc4b06e40d51e869c1cb6" FOREIGN KEY (fk_0853d2f491d44bf1c48d8a, workspace_id, fk_d08aebf50269477f5f3177) REFERENCES entity_commercial_documents(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "fk_61f3f852ac7d3cddd62fb0" FOREIGN KEY (workspace_id, fk_907a82a54f99c5f559aea4) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "fk_6d95d022fa65659ab4e26d" FOREIGN KEY (workspace_id, customer_id_gen) REFERENCES entity_customers(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "fk_c7dcfd6f1b904c1d4579e5" FOREIGN KEY (workspace_id, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_b3c8077ac92a874e14a8b5" FOREIGN KEY (workspace_id, fk_c7a42560262ae3f3bd1c40) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_d012e37252c388048519ae" FOREIGN KEY (workspace_id, fk_f79be1591db98a2e9f9819) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_8c601167d6c1f2d0f0474f" FOREIGN KEY (workspace_id, fk_2f3c80d3a51f5b3d8bfae9) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_inventory" ADD CONSTRAINT "fk_9bf6c47aed272771fe896c" FOREIGN KEY (workspace_id, fk_c28abf316488fe91627c3c) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_stockMovements" ADD CONSTRAINT "fk_44f7013c7c79cdf679d673" FOREIGN KEY (workspace_id, fk_fa74d8db3975a981d21b4a) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "fk_ec8ea09f1823a0518017c8" FOREIGN KEY (workspace_id, fk_a50efb593eca2e4ce9f964) REFERENCES "entity_workRequired"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commissions" ADD CONSTRAINT "fk_e6dcb19c069d6070f96dab" FOREIGN KEY (workspace_id, fk_5b62d5863e6027fe6514ba) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commissions" ADD CONSTRAINT "fk_1339c516e239f8bb25f538" FOREIGN KEY (workspace_id, fk_f78e3d600be57d55f80b95) REFERENCES "entity_master_sourcePartners"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commissions" ADD CONSTRAINT "fk_a4f867e69d1dd24f104b30" FOREIGN KEY (workspace_id, customer_id_gen) REFERENCES entity_customers(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commissions" ADD CONSTRAINT "fk_7558ea7eb1f5e11630d412" FOREIGN KEY (fk_0853d2f491d44bf1c48d8a, workspace_id, fk_e3c213d44476e14a10bd6d) REFERENCES entity_commercial_documents(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_be5c82184dd6c28ebec0f8" FOREIGN KEY (workspace_id, fk_3e9235a9321c6ba600b72e) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_8675efcb6c3aaa0ce960e5" FOREIGN KEY (workspace_id, fk_17aa718599743a6a85f6b0) REFERENCES "entity_acceptedScopes"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_fbb325a503e283d878ff3b" FOREIGN KEY (workspace_id, fk_651b0a929c11c4e990bd9c) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_613dcf520f8594944c9cd5" FOREIGN KEY (workspace_id, fk_4978319042b99507c75ea4) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_ca8be0722b5b900004bcaa" FOREIGN KEY (workspace_id, fk_600b43a5e6cfd7378878f4) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_c5dff8f1a0fea0804daa1b" FOREIGN KEY (workspace_id, fk_4a03c0242bea24a0e54390) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_b2d49a0658f70938cc3876" FOREIGN KEY (workspace_id, fk_5b62bf8b55d88be8293b71) REFERENCES "entity_workRequired"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_b5be5d91cdcb88217e9723" FOREIGN KEY (workspace_id, fk_38640995a1552b46250636) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_e8feb4e5dbe2eb49145e6c" FOREIGN KEY (workspace_id, fk_7b93e024c47af3933d82ae) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_cf4a07a380bf1c08c09e66" FOREIGN KEY (workspace_id, fk_73b01ca72803c5e4cf5c98) REFERENCES "entity_workRequired"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_fa23a6f2d979c7a523fb16" FOREIGN KEY (workspace_id, fk_a74b645a1c2738fb186115) REFERENCES entity_payments(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_922cae38c46a97b89914ac" FOREIGN KEY (workspace_id, fk_18c95b790e0d38b20922ce) REFERENCES "entity_workRequired"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_payments" ADD CONSTRAINT "fk_cf1285a77a438f10ad44c7" FOREIGN KEY (workspace_id, customer_id_gen) REFERENCES entity_customers(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_payments" ADD CONSTRAINT "fk_c9a501667ce2daf8eaa138" FOREIGN KEY (workspace_id, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_payments" ADD CONSTRAINT "fk_83e828d6d00826a812222d" FOREIGN KEY (fk_0853d2f491d44bf1c48d8a, workspace_id, fk_56e30db524815172569588) REFERENCES entity_commercial_documents(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_payments" ADD CONSTRAINT "fk_39ada450c26c1e75f9ba86" FOREIGN KEY (workspace_id, fk_c101efd23d771573ca5549) REFERENCES "entity_workRequired"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "fk_b5a1fc0372c1f3300a0b4f" FOREIGN KEY (workspace_id, fk_5e01330187dc9a4bbd5648) REFERENCES "entity_workRequired"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "fk_3b278042f2b7952b5324f9" FOREIGN KEY (workspace_id, fk_4f33ecf90136a97a82223e) REFERENCES "entity_workRequired"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_212d5e2379cff8eb250801" FOREIGN KEY (workspace_id, fk_45b72bbd42a8cec266539d) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commSends" ADD CONSTRAINT "fk_6ee8fc60647b2783063872" FOREIGN KEY (workspace_id, fk_eca7d0d9d2bbb9eb824e04) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "fk_2a8bd38a5fcd576b947540" FOREIGN KEY (fk_1cd70b4cd2f5d99a0c26d7, workspace_id, fk_450feed94fbcd78825b5c6) REFERENCES entity_catalogue_items(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "fk_b8130bab04531bbc185482" FOREIGN KEY (workspace_id, fk_d46b91a12d72bcfed87daa) REFERENCES "entity_workRequired"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "fk_e4c89c6668648d6d6a38dd" FOREIGN KEY (workspace_id, fk_67e5ddaef114bebb77b9a8) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "fk_748f3ffcd60e0dc190332a" FOREIGN KEY (fk_236135feae33ca9ca3b0cd, workspace_id, fk_c703e5cfa8df4a9d2336f2) REFERENCES entity_reference_libraries(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "fk_b5c37fee2f9c04aa82a033" FOREIGN KEY (fk_fac422498fa0394b160927, workspace_id, fk_e6ba4a1248905f9997e996) REFERENCES entity_catalogue_items(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "fk_974cf57ed7ebdb8a1bbcb4" FOREIGN KEY (workspace_id, fk_31040da32553891d411ee2) REFERENCES entity_master_vendors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_payments" ADD CONSTRAINT "fk_b21abe83b608a78c75529e" FOREIGN KEY (fk_bdc2f67f6d1c55498b5f82, workspace_id, fk_e67dac9cfc4fff4bcb38ef) REFERENCES entity_commercial_settings(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "fk_c3a53bb6f9da08b17092af" FOREIGN KEY (workspace_id, fk_ad7ea408471e7cb5177099) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "fk_78179bb0ce562b120652da" FOREIGN KEY (workspace_id, fk_6a19c08ff1313f013b4b20) REFERENCES entity_master_contractors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "fk_17474b5f5f529d4b1dd701" FOREIGN KEY (fk_c54e2099ca843e0887abc9, workspace_id, fk_383222e592db5fd66a634c) REFERENCES entity_commercial_documents(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_6dc246842fcf96a03d0350" FOREIGN KEY (workspace_id, fk_b4cd05008d89ca902bc24b) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_policy_rules" ADD CONSTRAINT "fk_fc0cc1c79fcf95bef06607" FOREIGN KEY (workspace_id, fk_d5143a715986ab35224433) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_storage_structure" ADD CONSTRAINT "fk_fe7fb9c43d92d57ed71fc1" FOREIGN KEY (workspace_id, fk_75d807b07b238c4287c423) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_commissions" ADD CONSTRAINT "fk_7208dc2724a698aea88a51" FOREIGN KEY (workspace_id, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "entity_financial_documents_collection_check";

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "entity_financial_documents_collection_check" CHECK ((collection = ANY (ARRAY['invoices'::text, 'vendorBills'::text, 'contractorBills'::text, 'payrollPeriods'::text])));

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "entity_resource_links_collection_check";

ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "entity_resource_links_collection_check" CHECK ((collection = ANY (ARRAY['entityFileAttachments'::text, 'entityReferenceAssignments'::text])));

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

DROP TABLE public.entity_project_work;

NOTIFY pgrst, 'reload schema';

COMMIT;
