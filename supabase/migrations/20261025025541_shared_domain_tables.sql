-- Canonical shared domain storage. No compatibility tables, views or dual writes.

-- Logical collection IDs, permissions, row revisions and financial history are preserved.

BEGIN;

SET LOCAL lock_timeout = '15s';

SET LOCAL statement_timeout = '120s';

LOCK TABLE public.entity_workspace_revision IN ACCESS EXCLUSIVE MODE;

LOCK TABLE public."entity_actions", public."entity_approvalPolicies", public."entity_automationRules", public."entity_blocked", public."entity_boqs", public."entity_commercialTerms", public."entity_contractorBids", public."entity_contractorBills", public."entity_contractorPayments", public."entity_contractorSettlements", public."entity_customerReceipts", public."entity_invoices", public."entity_master_catalogues", public."entity_master_commissionRules", public."entity_master_contractorRates", public."entity_master_customerRateSuggestions", public."entity_master_pinterestBoards", public."entity_master_referenceMedia", public."entity_master_vendorRates", public."entity_paymentTermTemplates", public."entity_purchaseOrders", public."entity_quotations", public."entity_risks", public."entity_taxConfigs", public."entity_validityConfigs", public."entity_vendorBids", public."entity_vendorBills", public."entity_vendorPayments", public."entity_vendorRfqs" IN ACCESS EXCLUSIVE MODE;

CREATE TABLE public."entity_commercial_documents" (
  collection text NOT NULL CHECK (collection IN ('quotations', 'boqs', 'vendorRfqs', 'vendorBids', 'contractorBids', 'purchaseOrders', 'contractorSettlements')),
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED,
  "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'vendor_id'::text), ''::text)) STORED,
  "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED,
  PRIMARY KEY (collection, id)
);

ALTER TABLE public."entity_commercial_documents" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_commercial_documents" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_commercial_documents" TO service_role;

COMMENT ON TABLE public."entity_commercial_documents" IS 'Shared commercial documents; collection discriminates record kinds. Modules reference canonical records by ID. Server-only access through authorized workspace APIs.';

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "sd_881205dc4e8b31a5c78f" CHECK (collection <> 'purchaseOrders' OR (vendor_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

CREATE TABLE public."entity_financial_documents" (
  collection text NOT NULL CHECK (collection IN ('invoices', 'vendorBills', 'contractorBills')),
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED,
  "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED,
  "payment_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'payment_id'::text), ''::text)) STORED,
  "po_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'po_id'::text), ''::text)) STORED,
  "grn_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'grn_id'::text), ''::text)) STORED,
  "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'vendor_id'::text), ''::text)) STORED,
  "contractor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'contractor_id'::text), ''::text)) STORED,
  PRIMARY KEY (collection, id)
);

ALTER TABLE public."entity_financial_documents" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_financial_documents" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_financial_documents" TO service_role;

COMMENT ON TABLE public."entity_financial_documents" IS 'Shared financial documents; collection discriminates record kinds. Modules reference canonical records by ID. Server-only access through authorized workspace APIs.';

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_e7bed771b9ef40dcdb2f" CHECK (collection <> 'vendorBills' OR (grn_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_c2f6536cd3afa378b54e" CHECK (collection <> 'vendorBills' OR (po_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_24d327676a0423f43fbd" CHECK (collection <> 'vendorBills' OR (vendor_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_453618a58a3c3f03d926" CHECK (collection <> 'contractorBills' OR (contractor_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_f21b1997b4c353be3f83" CHECK (collection <> 'contractorBills' OR (work_order_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

CREATE TABLE public."entity_money_movements" (
  collection text NOT NULL CHECK (collection IN ('customerReceipts', 'vendorPayments', 'contractorPayments')),
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED,
  "invoice_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'invoice_id'::text), ''::text)) STORED,
  "payment_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'payment_id'::text), ''::text)) STORED,
  "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED,
  "vendor_bill_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'vendor_bill_id'::text), ''::text)) STORED,
  "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'vendor_id'::text), ''::text)) STORED,
  "contractor_bill_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'contractor_bill_id'::text), ''::text)) STORED,
  "contractor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'contractor_id'::text), ''::text)) STORED,
  PRIMARY KEY (collection, id)
);

ALTER TABLE public."entity_money_movements" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_money_movements" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_money_movements" TO service_role;

COMMENT ON TABLE public."entity_money_movements" IS 'Shared money movements; collection discriminates record kinds. Modules reference canonical records by ID. Server-only access through authorized workspace APIs.';

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_3a355ebb6c3204d27e16" CHECK (collection <> 'customerReceipts' OR (invoice_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_794e1ee22d9fbc57a543" CHECK (collection <> 'vendorPayments' OR (vendor_bill_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_f6a7812f9422a3b1d9f4" CHECK (collection <> 'vendorPayments' OR (vendor_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_1598d6d8df79ace7a23f" CHECK (collection <> 'contractorPayments' OR (contractor_bill_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_81ff36d0eba37081f74c" CHECK (collection <> 'contractorPayments' OR (contractor_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_49bff6d1c87f44669243" CHECK (collection <> 'contractorPayments' OR (site_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_e7c5b2a0a229304cf8ef" CHECK (collection <> 'contractorPayments' OR (work_order_id_gen IS NOT NULL AND workspace_id IS NOT NULL));

CREATE TABLE public."entity_commercial_settings" (
  collection text NOT NULL CHECK (collection IN ('commercialTerms', 'paymentTermTemplates', 'taxConfigs', 'validityConfigs')),
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  PRIMARY KEY (collection, id)
);

ALTER TABLE public."entity_commercial_settings" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_commercial_settings" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_commercial_settings" TO service_role;

COMMENT ON TABLE public."entity_commercial_settings" IS 'Shared commercial settings; collection discriminates record kinds. Modules reference canonical records by ID. Server-only access through authorized workspace APIs.';

CREATE TABLE public."entity_workflow_controls" (
  collection text NOT NULL CHECK (collection IN ('actions', 'risks', 'blocked')),
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED,
  PRIMARY KEY (collection, id)
);

ALTER TABLE public."entity_workflow_controls" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_workflow_controls" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_workflow_controls" TO service_role;

COMMENT ON TABLE public."entity_workflow_controls" IS 'Shared workflow controls; collection discriminates record kinds. Modules reference canonical records by ID. Server-only access through authorized workspace APIs.';

CREATE TABLE public."entity_reference_libraries" (
  collection text NOT NULL CHECK (collection IN ('master.catalogues', 'master.pinterestBoards', 'master.referenceMedia')),
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  PRIMARY KEY (collection, id)
);

ALTER TABLE public."entity_reference_libraries" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_reference_libraries" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_reference_libraries" TO service_role;

COMMENT ON TABLE public."entity_reference_libraries" IS 'Shared reference libraries; collection discriminates record kinds. Modules reference canonical records by ID. Server-only access through authorized workspace APIs.';

CREATE TABLE public."entity_rate_cards" (
  collection text NOT NULL CHECK (collection IN ('master.vendorRates', 'master.contractorRates', 'master.customerRateSuggestions')),
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  PRIMARY KEY (collection, id)
);

ALTER TABLE public."entity_rate_cards" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_rate_cards" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_rate_cards" TO service_role;

COMMENT ON TABLE public."entity_rate_cards" IS 'Shared rate cards; collection discriminates record kinds. Modules reference canonical records by ID. Server-only access through authorized workspace APIs.';

CREATE TABLE public."entity_policy_rules" (
  collection text NOT NULL CHECK (collection IN ('approvalPolicies', 'automationRules', 'master.commissionRules')),
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "approver_staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'approver_id'::text)), ''::text)) STORED,
  PRIMARY KEY (collection, id)
);

ALTER TABLE public."entity_policy_rules" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_policy_rules" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_policy_rules" TO service_role;

COMMENT ON TABLE public."entity_policy_rules" IS 'Shared policy rules; collection discriminates record kinds. Modules reference canonical records by ID. Server-only access through authorized workspace APIs.';

INSERT INTO public."entity_commercial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'quotations', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_quotations";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_quotations" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='quotations') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='quotations' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_quotations")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:quotations';
  END IF;
END $verify$;

INSERT INTO public."entity_commercial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'boqs', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_boqs";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_boqs" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='boqs') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='boqs' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_boqs")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:boqs';
  END IF;
END $verify$;

INSERT INTO public."entity_commercial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'vendorRfqs', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorRfqs";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorRfqs" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='vendorRfqs') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='vendorRfqs' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorRfqs")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:vendorRfqs';
  END IF;
END $verify$;

INSERT INTO public."entity_commercial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'vendorBids', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorBids";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorBids" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='vendorBids') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='vendorBids' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorBids")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:vendorBids';
  END IF;
END $verify$;

INSERT INTO public."entity_commercial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'contractorBids', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorBids";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorBids" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='contractorBids') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='contractorBids' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorBids")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:contractorBids';
  END IF;
END $verify$;

INSERT INTO public."entity_commercial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'purchaseOrders', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_purchaseOrders";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_purchaseOrders" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='purchaseOrders') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='purchaseOrders' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_purchaseOrders")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:purchaseOrders';
  END IF;
END $verify$;

INSERT INTO public."entity_commercial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'contractorSettlements', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorSettlements";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorSettlements" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='contractorSettlements') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='contractorSettlements' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorSettlements")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:contractorSettlements';
  END IF;
END $verify$;

INSERT INTO public."entity_financial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'invoices', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_invoices";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_invoices" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='invoices') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='invoices' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_invoices")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:invoices';
  END IF;
END $verify$;

INSERT INTO public."entity_financial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'vendorBills', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorBills";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorBills" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='vendorBills') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='vendorBills' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorBills")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:vendorBills';
  END IF;
END $verify$;

INSERT INTO public."entity_financial_documents" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'contractorBills', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorBills";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorBills" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='contractorBills') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='contractorBills' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorBills")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:contractorBills';
  END IF;
END $verify$;

INSERT INTO public."entity_money_movements" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'customerReceipts', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_customerReceipts";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_customerReceipts" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='customerReceipts') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='customerReceipts' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_customerReceipts")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:customerReceipts';
  END IF;
END $verify$;

INSERT INTO public."entity_money_movements" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'vendorPayments', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorPayments";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorPayments" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='vendorPayments') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='vendorPayments' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorPayments")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:vendorPayments';
  END IF;
END $verify$;

INSERT INTO public."entity_money_movements" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'contractorPayments', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorPayments";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorPayments" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='contractorPayments') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='contractorPayments' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorPayments")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:contractorPayments';
  END IF;
END $verify$;

INSERT INTO public."entity_commercial_settings" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'commercialTerms', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercialTerms";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercialTerms" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='commercialTerms') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='commercialTerms' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercialTerms")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:commercialTerms';
  END IF;
END $verify$;

INSERT INTO public."entity_commercial_settings" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'paymentTermTemplates', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_paymentTermTemplates";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_paymentTermTemplates" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='paymentTermTemplates') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='paymentTermTemplates' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_paymentTermTemplates")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:paymentTermTemplates';
  END IF;
END $verify$;

INSERT INTO public."entity_commercial_settings" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'taxConfigs', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_taxConfigs";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_taxConfigs" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='taxConfigs') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='taxConfigs' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_taxConfigs")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:taxConfigs';
  END IF;
END $verify$;

INSERT INTO public."entity_commercial_settings" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'validityConfigs', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_validityConfigs";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_validityConfigs" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='validityConfigs') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='validityConfigs' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_validityConfigs")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:validityConfigs';
  END IF;
END $verify$;

INSERT INTO public."entity_workflow_controls" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'actions', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_actions";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_actions" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='actions') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='actions' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_actions")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:actions';
  END IF;
END $verify$;

INSERT INTO public."entity_workflow_controls" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'risks', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_risks";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_risks" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='risks') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='risks' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_risks")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:risks';
  END IF;
END $verify$;

INSERT INTO public."entity_workflow_controls" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'blocked', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_blocked";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_blocked" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='blocked') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='blocked' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_blocked")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:blocked';
  END IF;
END $verify$;

INSERT INTO public."entity_reference_libraries" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.catalogues', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_catalogues";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_catalogues" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.catalogues') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.catalogues' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_catalogues")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:master.catalogues';
  END IF;
END $verify$;

INSERT INTO public."entity_reference_libraries" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.pinterestBoards', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_pinterestBoards";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_pinterestBoards" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.pinterestBoards') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.pinterestBoards' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_pinterestBoards")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:master.pinterestBoards';
  END IF;
END $verify$;

INSERT INTO public."entity_reference_libraries" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.referenceMedia', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_referenceMedia";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_referenceMedia" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.referenceMedia') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.referenceMedia' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_referenceMedia")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:master.referenceMedia';
  END IF;
END $verify$;

INSERT INTO public."entity_rate_cards" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.vendorRates', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_vendorRates";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_vendorRates" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.vendorRates') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.vendorRates' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_vendorRates")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:master.vendorRates';
  END IF;
END $verify$;

INSERT INTO public."entity_rate_cards" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.contractorRates', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_contractorRates";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_contractorRates" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.contractorRates') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.contractorRates' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_contractorRates")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:master.contractorRates';
  END IF;
END $verify$;

INSERT INTO public."entity_rate_cards" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.customerRateSuggestions', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_customerRateSuggestions";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_customerRateSuggestions" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.customerRateSuggestions') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.customerRateSuggestions' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_customerRateSuggestions")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:master.customerRateSuggestions';
  END IF;
END $verify$;

INSERT INTO public."entity_policy_rules" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'approvalPolicies', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_approvalPolicies";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_approvalPolicies" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='approvalPolicies') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='approvalPolicies' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_approvalPolicies")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:approvalPolicies';
  END IF;
END $verify$;

INSERT INTO public."entity_policy_rules" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'automationRules', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_automationRules";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_automationRules" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='automationRules') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='automationRules' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_automationRules")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:automationRules';
  END IF;
END $verify$;

INSERT INTO public."entity_policy_rules" (collection, "id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT 'master.commissionRules', "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_commissionRules";

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_commissionRules" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='master.commissionRules') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='master.commissionRules' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_commissionRules")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_COPY_MISMATCH:master.commissionRules';
  END IF;
END $verify$;

CREATE INDEX "sd_ea8b849314e56fb87c93" ON public."entity_workflow_controls" USING btree (customer_id_gen, workspace_id) WHERE collection='actions';

CREATE INDEX "sd_1d329a2dca673c8493e9" ON public."entity_workflow_controls" USING btree (site_id_gen, workspace_id) WHERE collection='actions';

CREATE INDEX "sd_76be02323cc8765aa61a" ON public."entity_workflow_controls" USING btree (updated_at DESC) WHERE collection='actions';

CREATE INDEX "sd_a4dd5eea2fb0bfd30fbe" ON public."entity_workflow_controls" USING btree (workspace_id) WHERE collection='actions';

CREATE INDEX "sd_313964551b453c611a81" ON public."entity_policy_rules" USING btree (updated_at DESC) WHERE collection='approvalPolicies';

CREATE INDEX "sd_1a477cce5ff83cbaec3e" ON public."entity_policy_rules" USING btree (workspace_id) WHERE collection='approvalPolicies';

CREATE INDEX "sd_83bbe10be5bf8c705e1a" ON public."entity_policy_rules" USING btree (workspace_id, approver_staff_id) WHERE collection='approvalPolicies' AND ((approver_staff_id IS NOT NULL));

CREATE INDEX "sd_089d2b1d1746a22cd4e5" ON public."entity_policy_rules" USING btree (updated_at DESC) WHERE collection='automationRules';

CREATE INDEX "sd_b3ca152f50cd15b79faa" ON public."entity_policy_rules" USING btree (workspace_id) WHERE collection='automationRules';

CREATE INDEX "sd_600e2b7a67bc9a8fc493" ON public."entity_workflow_controls" USING btree (customer_id_gen, workspace_id) WHERE collection='blocked';

CREATE INDEX "sd_8bc5d63a171c67b1e205" ON public."entity_workflow_controls" USING btree (site_id_gen, workspace_id) WHERE collection='blocked';

CREATE INDEX "sd_c001bcf2b157765afa7a" ON public."entity_workflow_controls" USING btree (updated_at DESC) WHERE collection='blocked';

CREATE INDEX "sd_cb4878f666331f37070b" ON public."entity_workflow_controls" USING btree (workspace_id) WHERE collection='blocked';

CREATE INDEX "sd_bc15595487db72826134" ON public."entity_commercial_documents" USING btree (updated_at DESC) WHERE collection='boqs';

CREATE INDEX "sd_4d6cbdbf612d56995527" ON public."entity_commercial_documents" USING btree (workspace_id) WHERE collection='boqs';

CREATE INDEX "sd_9740a8dc6781d7818a57" ON public."entity_commercial_settings" USING btree (updated_at DESC) WHERE collection='commercialTerms';

CREATE INDEX "sd_cffe3b2eb89a29e79ade" ON public."entity_commercial_settings" USING btree (workspace_id) WHERE collection='commercialTerms';

CREATE INDEX "sd_fb42c1a758b9a1e7ac2f" ON public."entity_commercial_documents" USING btree (updated_at DESC) WHERE collection='contractorBids';

CREATE INDEX "sd_b42ae9835dc4df5e39d3" ON public."entity_commercial_documents" USING btree (workspace_id) WHERE collection='contractorBids';

CREATE INDEX "sd_d4559e91d3953420fd82" ON public."entity_financial_documents" USING btree (customer_id_gen, workspace_id) WHERE collection='contractorBills';

CREATE INDEX "sd_f7d8b3a7653f91262e69" ON public."entity_financial_documents" USING btree (site_id_gen, workspace_id) WHERE collection='contractorBills';

CREATE INDEX "sd_27e97858d2c6b9420773" ON public."entity_financial_documents" USING btree (updated_at DESC) WHERE collection='contractorBills';

CREATE UNIQUE INDEX "sd_67c5d016d9e324b7727e" ON public."entity_financial_documents" USING btree (workspace_id, id) WHERE collection='contractorBills';

CREATE INDEX "sd_01fa5c79b2a166d46ea4" ON public."entity_financial_documents" USING btree (workspace_id) WHERE collection='contractorBills';

CREATE UNIQUE INDEX "sd_7cee666fd60eb4b16133" ON public."entity_financial_documents" USING btree (workspace_id, id, contractor_id_gen, work_order_id_gen, site_id_gen) WHERE collection='contractorBills';

CREATE INDEX "sd_8ac12841a04e8e578b00" ON public."entity_financial_documents" USING btree (workspace_id, contractor_id_gen) WHERE collection='contractorBills';

CREATE INDEX "sd_ba93e474c664a13ed162" ON public."entity_financial_documents" USING btree (workspace_id, work_order_id_gen) WHERE collection='contractorBills';

CREATE INDEX "sd_c9a2e935cbaba605bf9a" ON public."entity_money_movements" USING btree (updated_at DESC) WHERE collection='contractorPayments';

CREATE INDEX "sd_fdcd1c834ecba5fae00f" ON public."entity_money_movements" USING btree (workspace_id) WHERE collection='contractorPayments';

CREATE INDEX "sd_d9f2f86fbcc9bb0561f3" ON public."entity_money_movements" USING btree (workspace_id, contractor_bill_id_gen, contractor_id_gen, work_order_id_gen, site_id_gen) WHERE collection='contractorPayments';

CREATE INDEX "sd_effa0f421671463779ab" ON public."entity_money_movements" USING btree (workspace_id, contractor_bill_id_gen) WHERE collection='contractorPayments';

CREATE INDEX "sd_fdc17bee389b4949a1d8" ON public."entity_money_movements" USING btree (workspace_id, contractor_id_gen) WHERE collection='contractorPayments';

CREATE INDEX "sd_2dfa033292c062ddcd14" ON public."entity_money_movements" USING btree (workspace_id, site_id_gen) WHERE collection='contractorPayments';

CREATE INDEX "sd_f35165a878b8b4c060d8" ON public."entity_money_movements" USING btree (workspace_id, work_order_id_gen) WHERE collection='contractorPayments';

CREATE INDEX "sd_0e054e634b0e02925bc7" ON public."entity_commercial_documents" USING btree (updated_at DESC) WHERE collection='contractorSettlements';

CREATE INDEX "sd_b6b2c6cec8b7da3b449b" ON public."entity_commercial_documents" USING btree (workspace_id) WHERE collection='contractorSettlements';

CREATE INDEX "sd_cbaf8fdbceeccd343157" ON public."entity_money_movements" USING btree (customer_id_gen, workspace_id) WHERE collection='customerReceipts';

CREATE INDEX "sd_22ae87bfb939848c5742" ON public."entity_money_movements" USING btree (site_id_gen, workspace_id) WHERE collection='customerReceipts';

CREATE INDEX "sd_af4a642901317d1e5532" ON public."entity_money_movements" USING btree (updated_at DESC) WHERE collection='customerReceipts';

CREATE INDEX "sd_64d65c55f943de40f9ac" ON public."entity_money_movements" USING btree (workspace_id) WHERE collection='customerReceipts';

CREATE UNIQUE INDEX "sd_0576f351c00432b181aa" ON public."entity_money_movements" USING btree (workspace_id, NULLIF(btrim((data ->> 'receipt_no'::text)), ''::text)) WHERE collection='customerReceipts' AND ((NULLIF(btrim((data ->> 'receipt_no'::text)), ''::text) IS NOT NULL));

CREATE INDEX "sd_2d677467c438724b5606" ON public."entity_money_movements" USING btree (workspace_id, invoice_id_gen) WHERE collection='customerReceipts';

CREATE INDEX "sd_8c0215d770e8ae67afe9" ON public."entity_money_movements" USING btree (workspace_id, payment_id_gen) WHERE collection='customerReceipts';

CREATE INDEX "sd_af14653d7f6ff724b550" ON public."entity_money_movements" USING btree (workspace_id, work_order_id_gen) WHERE collection='customerReceipts';

CREATE INDEX "sd_f1ef4b060130715d9988" ON public."entity_financial_documents" USING btree (customer_id_gen, workspace_id) WHERE collection='invoices';

CREATE INDEX "sd_890e30e2babf14ae9551" ON public."entity_financial_documents" USING btree (site_id_gen, workspace_id) WHERE collection='invoices';

CREATE INDEX "sd_0c3613d59c3a480d36eb" ON public."entity_financial_documents" USING btree (updated_at DESC) WHERE collection='invoices';

CREATE UNIQUE INDEX "sd_924affef01ff202564b8" ON public."entity_financial_documents" USING btree (workspace_id, id) WHERE collection='invoices';

CREATE INDEX "sd_a10788d5d2f7f4a1f234" ON public."entity_financial_documents" USING btree (workspace_id) WHERE collection='invoices';

CREATE UNIQUE INDEX "sd_e78e623e8ec8a00b7d79" ON public."entity_financial_documents" USING btree (workspace_id, NULLIF(btrim((data ->> 'invoice_no'::text)), ''::text)) WHERE collection='invoices' AND ((NULLIF(btrim((data ->> 'invoice_no'::text)), ''::text) IS NOT NULL));

CREATE INDEX "sd_8ea4c4ff10c2fdfcd822" ON public."entity_financial_documents" USING btree (workspace_id, payment_id_gen) WHERE collection='invoices';

CREATE INDEX "sd_86fe24273d58d3e4ce36" ON public."entity_financial_documents" USING btree (workspace_id, work_order_id_gen) WHERE collection='invoices';

CREATE INDEX "sd_e9510c715d44cbd3772d" ON public."entity_reference_libraries" USING btree (updated_at DESC) WHERE collection='master.catalogues';

CREATE INDEX "sd_2adb8154730470076864" ON public."entity_reference_libraries" USING btree (workspace_id) WHERE collection='master.catalogues';

CREATE INDEX "sd_8d676dce052e6023b4d4" ON public."entity_policy_rules" USING btree (updated_at DESC) WHERE collection='master.commissionRules';

CREATE INDEX "sd_81f712701701f9ea4d6c" ON public."entity_policy_rules" USING btree (workspace_id) WHERE collection='master.commissionRules';

CREATE INDEX "sd_8a6134d137d92ab2b3a2" ON public."entity_rate_cards" USING btree (updated_at DESC) WHERE collection='master.contractorRates';

CREATE INDEX "sd_de5633987d00428bc522" ON public."entity_rate_cards" USING btree (workspace_id) WHERE collection='master.contractorRates';

CREATE INDEX "sd_f8f7407ffd9a0f8eedb0" ON public."entity_rate_cards" USING btree (workspace_id, ((data ->> 'contractor_id'::text)), ((data ->> 'work_subcategory_id'::text))) WHERE collection='master.contractorRates';

CREATE INDEX "sd_75857520dddc7ec94741" ON public."entity_rate_cards" USING btree (updated_at DESC) WHERE collection='master.customerRateSuggestions';

CREATE INDEX "sd_aa7491510fbfc18182dd" ON public."entity_rate_cards" USING btree (workspace_id) WHERE collection='master.customerRateSuggestions';

CREATE INDEX "sd_af2cce982c22395eda85" ON public."entity_reference_libraries" USING btree (updated_at DESC) WHERE collection='master.pinterestBoards';

CREATE INDEX "sd_c59e70bea508bec23fce" ON public."entity_reference_libraries" USING btree (workspace_id) WHERE collection='master.pinterestBoards';

CREATE INDEX "sd_b09f865acd3f11bd97c4" ON public."entity_reference_libraries" USING btree (updated_at DESC) WHERE collection='master.referenceMedia';

CREATE INDEX "sd_62e93ea63e543fd95e72" ON public."entity_reference_libraries" USING btree (workspace_id) WHERE collection='master.referenceMedia';

CREATE INDEX "sd_90ed56a624d8af1ba7ab" ON public."entity_rate_cards" USING btree (updated_at DESC) WHERE collection='master.vendorRates';

CREATE INDEX "sd_fa70ab663665b35d96df" ON public."entity_rate_cards" USING btree (workspace_id) WHERE collection='master.vendorRates';

CREATE INDEX "sd_85dcac9404d01b9b78a1" ON public."entity_commercial_settings" USING btree (updated_at DESC) WHERE collection='paymentTermTemplates';

CREATE INDEX "sd_88692193a1d662b3125d" ON public."entity_commercial_settings" USING btree (workspace_id) WHERE collection='paymentTermTemplates';

CREATE INDEX "sd_73671e9e07c7fc292b86" ON public."entity_commercial_documents" USING btree (updated_at DESC) WHERE collection='purchaseOrders';

CREATE UNIQUE INDEX "sd_ddbd2a48b29425fa7b9c" ON public."entity_commercial_documents" USING btree (workspace_id, id) WHERE collection='purchaseOrders';

CREATE INDEX "sd_f3ee96efae027741eab5" ON public."entity_commercial_documents" USING btree (workspace_id) WHERE collection='purchaseOrders';

CREATE UNIQUE INDEX "sd_0df48b3d54a4ac8c6d26" ON public."entity_commercial_documents" USING btree (workspace_id, id, vendor_id_gen) WHERE collection='purchaseOrders';

CREATE INDEX "sd_78da3df69bd6aca02f9c" ON public."entity_commercial_documents" USING btree (workspace_id, site_id_gen) WHERE collection='purchaseOrders';

CREATE INDEX "sd_0f1c8d9020ea86b70b6a" ON public."entity_commercial_documents" USING btree (workspace_id, vendor_id_gen) WHERE collection='purchaseOrders';

CREATE INDEX "sd_d487860d02dbd65df556" ON public."entity_commercial_documents" USING btree (workspace_id, work_order_id_gen) WHERE collection='purchaseOrders';

CREATE INDEX "sd_c78c5c32a94bdc7046f3" ON public."entity_commercial_documents" USING btree (customer_id_gen, workspace_id) WHERE collection='quotations';

CREATE INDEX "sd_73816ba49ca6b594452b" ON public."entity_commercial_documents" USING btree (site_id_gen, workspace_id) WHERE collection='quotations';

CREATE INDEX "sd_50346af78f3606085651" ON public."entity_commercial_documents" USING btree (updated_at DESC) WHERE collection='quotations';

CREATE UNIQUE INDEX "sd_abf05d599ad33d6f80a6" ON public."entity_commercial_documents" USING btree (workspace_id, ((data ->> 'quotation_no'::text))) WHERE collection='quotations' AND (((COALESCE((data ->> 'status'::text), ''::text) <> 'cancelled'::text) AND (NULLIF(btrim((data ->> 'quotation_no'::text)), ''::text) IS NOT NULL)));

CREATE INDEX "sd_bba8e07ddddecc8d3a00" ON public."entity_commercial_documents" USING btree (workspace_id) WHERE collection='quotations';

CREATE INDEX "sd_4713f0ded9b11258df60" ON public."entity_workflow_controls" USING btree (customer_id_gen, workspace_id) WHERE collection='risks';

CREATE INDEX "sd_4a654c0c2611ab27cc99" ON public."entity_workflow_controls" USING btree (site_id_gen, workspace_id) WHERE collection='risks';

CREATE INDEX "sd_30ef18076159a519f149" ON public."entity_workflow_controls" USING btree (updated_at DESC) WHERE collection='risks';

CREATE INDEX "sd_8c45bd8d5786bfa609d0" ON public."entity_workflow_controls" USING btree (workspace_id) WHERE collection='risks';

CREATE INDEX "sd_08ba66a1757517beba45" ON public."entity_commercial_settings" USING btree (updated_at DESC) WHERE collection='taxConfigs';

CREATE INDEX "sd_108b26385d1f72d1b292" ON public."entity_commercial_settings" USING btree (workspace_id) WHERE collection='taxConfigs';

CREATE INDEX "sd_d86f7e03bb26c7bc09ae" ON public."entity_commercial_settings" USING btree (updated_at DESC) WHERE collection='validityConfigs';

CREATE INDEX "sd_2319b4eb2aa4ef53a7d4" ON public."entity_commercial_settings" USING btree (workspace_id) WHERE collection='validityConfigs';

CREATE INDEX "sd_a9c7d1ada7cb72e1e558" ON public."entity_commercial_documents" USING btree (updated_at DESC) WHERE collection='vendorBids';

CREATE INDEX "sd_a23b89737f5d7f3847a3" ON public."entity_commercial_documents" USING btree (workspace_id) WHERE collection='vendorBids';

CREATE INDEX "sd_431afe2dd46bee366920" ON public."entity_financial_documents" USING btree (updated_at DESC) WHERE collection='vendorBills';

CREATE UNIQUE INDEX "sd_46e1d6bf2c3564032c05" ON public."entity_financial_documents" USING btree (workspace_id, id) WHERE collection='vendorBills';

CREATE INDEX "sd_b194daff39c58512ebbc" ON public."entity_financial_documents" USING btree (workspace_id) WHERE collection='vendorBills';

CREATE UNIQUE INDEX "sd_2b80ae00e538df3435ab" ON public."entity_financial_documents" USING btree (workspace_id, id, vendor_id_gen) WHERE collection='vendorBills';

CREATE INDEX "sd_dc2808d34eb4e43bf463" ON public."entity_financial_documents" USING btree (workspace_id, grn_id_gen) WHERE collection='vendorBills';

CREATE INDEX "sd_1a359fb0c32c302844a5" ON public."entity_financial_documents" USING btree (workspace_id, grn_id_gen, po_id_gen, vendor_id_gen) WHERE collection='vendorBills';

CREATE INDEX "sd_4333e9a077ea541b84f3" ON public."entity_financial_documents" USING btree (workspace_id, po_id_gen) WHERE collection='vendorBills';

CREATE INDEX "sd_a148df36bb8a1c692058" ON public."entity_financial_documents" USING btree (workspace_id, po_id_gen, vendor_id_gen) WHERE collection='vendorBills';

CREATE INDEX "sd_f41b28db3a53f99b7ff7" ON public."entity_financial_documents" USING btree (workspace_id, site_id_gen) WHERE collection='vendorBills';

CREATE INDEX "sd_eafefc08c8fe57ee3f6a" ON public."entity_financial_documents" USING btree (workspace_id, vendor_id_gen) WHERE collection='vendorBills';

CREATE INDEX "sd_21ed67ece2b852bcdb87" ON public."entity_financial_documents" USING btree (workspace_id, work_order_id_gen) WHERE collection='vendorBills';

CREATE INDEX "sd_324eeceed6ca6bd757a3" ON public."entity_money_movements" USING btree (updated_at DESC) WHERE collection='vendorPayments';

CREATE INDEX "sd_9d811b2200bb5bffe1d4" ON public."entity_money_movements" USING btree (workspace_id) WHERE collection='vendorPayments';

CREATE INDEX "sd_00013dd064f102d1590a" ON public."entity_money_movements" USING btree (workspace_id, vendor_bill_id_gen, vendor_id_gen) WHERE collection='vendorPayments';

CREATE INDEX "sd_bba57496e052ec0b04f3" ON public."entity_money_movements" USING btree (workspace_id, site_id_gen) WHERE collection='vendorPayments';

CREATE INDEX "sd_b8738de840e333ae5544" ON public."entity_money_movements" USING btree (workspace_id, vendor_bill_id_gen) WHERE collection='vendorPayments';

CREATE INDEX "sd_7cfe2abd9dc9e6545054" ON public."entity_money_movements" USING btree (workspace_id, vendor_id_gen) WHERE collection='vendorPayments';

CREATE INDEX "sd_04fc92e83e95fbe6ce05" ON public."entity_money_movements" USING btree (workspace_id, work_order_id_gen) WHERE collection='vendorPayments';

CREATE INDEX "sd_7a4999d2af951aa12f76" ON public."entity_commercial_documents" USING btree (updated_at DESC) WHERE collection='vendorRfqs';

CREATE INDEX "sd_72626a2386a3242f41b3" ON public."entity_commercial_documents" USING btree (workspace_id) WHERE collection='vendorRfqs';

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_f0c97f16f3b5a5b22514" UNIQUE (collection, workspace_id, id, contractor_id_gen, work_order_id_gen, site_id_gen);

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_6de6c5a4d6b8e0f3b1c9" UNIQUE (collection, workspace_id, id);

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "sd_44ff63571de21bad4b16" UNIQUE (collection, workspace_id, id);

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "sd_6738a8385e3adc04e1b2" UNIQUE (collection, workspace_id, id, vendor_id_gen);

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_2dfd968c957f422c78a6" UNIQUE (collection, workspace_id, id, vendor_id_gen);

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "sd_f0c5338ed87f8da85e2a" text GENERATED ALWAYS AS (CASE WHEN collection='actions' THEN (NULLIF((data ->> 'customer_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "sd_dfa581eb3282671ff10a" FOREIGN KEY ("sd_f0c5338ed87f8da85e2a") REFERENCES public."entity_customers" (id);

CREATE INDEX "sd_791428640ec9b1da8f89" ON public."entity_workflow_controls" ("sd_f0c5338ed87f8da85e2a");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "sd_76e724a8ae01dd269987" text GENERATED ALWAYS AS (CASE WHEN collection='actions' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "sd_e8761b8f070c9dbcac50" FOREIGN KEY ("sd_76e724a8ae01dd269987") REFERENCES public."entity_sites" (id);

CREATE INDEX "sd_22f1ba350c244e6a0dbd" ON public."entity_workflow_controls" ("sd_76e724a8ae01dd269987");

ALTER TABLE public."entity_policy_rules" ADD COLUMN "sd_d88329e677268d0af6b5" text GENERATED ALWAYS AS (CASE WHEN collection='approvalPolicies' THEN workspace_id END) STORED;

ALTER TABLE public."entity_policy_rules" ADD CONSTRAINT "sd_bb59e3afdbbae001c053" FOREIGN KEY ("sd_d88329e677268d0af6b5", approver_staff_id) REFERENCES public."entity_master_staff" (workspace_id, id) ON DELETE RESTRICT;

CREATE INDEX "sd_64e8e98f01eca5d89e71" ON public."entity_policy_rules" ("sd_d88329e677268d0af6b5", approver_staff_id);

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "sd_896262c53f4cfaa4f824" text GENERATED ALWAYS AS (CASE WHEN collection='blocked' THEN (NULLIF((data ->> 'customer_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "sd_91e5326614a181727da2" FOREIGN KEY ("sd_896262c53f4cfaa4f824") REFERENCES public."entity_customers" (id);

CREATE INDEX "sd_d8c9c91c9719b9dff250" ON public."entity_workflow_controls" ("sd_896262c53f4cfaa4f824");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "sd_a291a3a1d61683190c5b" text GENERATED ALWAYS AS (CASE WHEN collection='blocked' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "sd_0f2545f97175c44b445d" FOREIGN KEY ("sd_a291a3a1d61683190c5b") REFERENCES public."entity_sites" (id);

CREATE INDEX "sd_c5269beba06a1f4dd6a5" ON public."entity_workflow_controls" ("sd_a291a3a1d61683190c5b");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_79a3041abf5ba7c29887" text GENERATED ALWAYS AS (CASE WHEN collection='contractorBills' THEN (NULLIF((data ->> 'customer_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_afc8973449530910f685" FOREIGN KEY ("sd_79a3041abf5ba7c29887") REFERENCES public."entity_customers" (id);

CREATE INDEX "sd_1474b32373571d932ecc" ON public."entity_financial_documents" ("sd_79a3041abf5ba7c29887");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_e4eff89c5be14ad2831f" text GENERATED ALWAYS AS (CASE WHEN collection='contractorBills' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_3722bc7e601d83ed302f" FOREIGN KEY ("sd_e4eff89c5be14ad2831f") REFERENCES public."entity_sites" (id);

CREATE INDEX "sd_87d98e65d3936c08d866" ON public."entity_financial_documents" ("sd_e4eff89c5be14ad2831f");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_995e0adc26a2dabe9258" text GENERATED ALWAYS AS (CASE WHEN collection='contractorBills' THEN workspace_id END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_3d294fa2702e99771a40" FOREIGN KEY ("sd_995e0adc26a2dabe9258", contractor_id_gen) REFERENCES public."entity_master_contractors" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_04e7c231c9e69abee59b" ON public."entity_financial_documents" ("sd_995e0adc26a2dabe9258", contractor_id_gen);

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_f8c1fdf5bba847442adb" text GENERATED ALWAYS AS (CASE WHEN collection='contractorBills' THEN workspace_id END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_99099d9c7d486f51dc89" FOREIGN KEY ("sd_f8c1fdf5bba847442adb", work_order_id_gen) REFERENCES public."entity_workOrders" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_718a91a286a5c7de75e1" ON public."entity_financial_documents" ("sd_f8c1fdf5bba847442adb", work_order_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_6cba67ee70156c7a4ba7" text GENERATED ALWAYS AS (CASE WHEN collection='contractorPayments' THEN 'contractorBills'::text END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_c71e6c74a42cf09a7435" FOREIGN KEY ("sd_6cba67ee70156c7a4ba7", workspace_id, contractor_bill_id_gen, contractor_id_gen, work_order_id_gen, site_id_gen) REFERENCES public."entity_financial_documents" (collection, workspace_id, id, contractor_id_gen, work_order_id_gen, site_id_gen) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_de0f3178dd95a64cb838" ON public."entity_money_movements" ("sd_6cba67ee70156c7a4ba7", workspace_id, contractor_bill_id_gen, contractor_id_gen, work_order_id_gen, site_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_9c1f20588aca97588260" text GENERATED ALWAYS AS (CASE WHEN collection='contractorPayments' THEN 'contractorBills'::text END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_3ec614041620bc4e00c2" FOREIGN KEY ("sd_9c1f20588aca97588260", workspace_id, contractor_bill_id_gen) REFERENCES public."entity_financial_documents" (collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_38240bba763236a42eaf" ON public."entity_money_movements" ("sd_9c1f20588aca97588260", workspace_id, contractor_bill_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_52c2690706271d27d64a" text GENERATED ALWAYS AS (CASE WHEN collection='contractorPayments' THEN workspace_id END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_b2c46fc092582cc40cf5" FOREIGN KEY ("sd_52c2690706271d27d64a", contractor_id_gen) REFERENCES public."entity_master_contractors" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_1e12a329eda1421c3edc" ON public."entity_money_movements" ("sd_52c2690706271d27d64a", contractor_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_83a96458a5749577575b" text GENERATED ALWAYS AS (CASE WHEN collection='contractorPayments' THEN workspace_id END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_1507922174f9c51b812a" FOREIGN KEY ("sd_83a96458a5749577575b", site_id_gen) REFERENCES public."entity_sites" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_55e440a2af85683fa74f" ON public."entity_money_movements" ("sd_83a96458a5749577575b", site_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_b977f619b6e787456146" text GENERATED ALWAYS AS (CASE WHEN collection='contractorPayments' THEN workspace_id END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_a05dae4487abdf3ffe61" FOREIGN KEY ("sd_b977f619b6e787456146", work_order_id_gen) REFERENCES public."entity_workOrders" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_e1d55c50a1d8b084d823" ON public."entity_money_movements" ("sd_b977f619b6e787456146", work_order_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_47c9fed69701c1b111b4" text GENERATED ALWAYS AS (CASE WHEN collection='customerReceipts' THEN (NULLIF((data ->> 'customer_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_b1f1fdd06b8ebc837408" FOREIGN KEY ("sd_47c9fed69701c1b111b4") REFERENCES public."entity_customers" (id);

CREATE INDEX "sd_cd03f25bbdb986f3b3a4" ON public."entity_money_movements" ("sd_47c9fed69701c1b111b4");

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_677ef08b162d13bdfddc" text GENERATED ALWAYS AS (CASE WHEN collection='customerReceipts' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_cc51aa53426a27165efe" FOREIGN KEY ("sd_677ef08b162d13bdfddc") REFERENCES public."entity_sites" (id);

CREATE INDEX "sd_700c99c12e093651bff2" ON public."entity_money_movements" ("sd_677ef08b162d13bdfddc");

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_c900124140f0e2d606ce" text GENERATED ALWAYS AS (CASE WHEN collection='customerReceipts' THEN 'invoices'::text END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_e93dde0ca0d566da730d" FOREIGN KEY ("sd_c900124140f0e2d606ce", workspace_id, invoice_id_gen) REFERENCES public."entity_financial_documents" (collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_baffde463bbc575238dd" ON public."entity_money_movements" ("sd_c900124140f0e2d606ce", workspace_id, invoice_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_00341c51016d86152a34" text GENERATED ALWAYS AS (CASE WHEN collection='customerReceipts' THEN workspace_id END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_7cc946115b80ac7f9fae" FOREIGN KEY ("sd_00341c51016d86152a34", payment_id_gen) REFERENCES public."entity_payments" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_39404501b37c4b111861" ON public."entity_money_movements" ("sd_00341c51016d86152a34", payment_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_dcd6545686f65e40f138" text GENERATED ALWAYS AS (CASE WHEN collection='customerReceipts' THEN workspace_id END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_e08516f9f7076ab78a94" FOREIGN KEY ("sd_dcd6545686f65e40f138", work_order_id_gen) REFERENCES public."entity_workOrders" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_24585a8ece255cdfbbf2" ON public."entity_money_movements" ("sd_dcd6545686f65e40f138", work_order_id_gen);

ALTER TABLE public."entity_grns" DROP CONSTRAINT "graph_grns_po_id";

ALTER TABLE public."entity_grns" ADD COLUMN "sd_989b10de1fd234494cb0" text GENERATED ALWAYS AS ('purchaseOrders'::text) STORED;

ALTER TABLE public."entity_grns" ADD CONSTRAINT "sd_9f7b08682e345e9e02c1" FOREIGN KEY ("sd_989b10de1fd234494cb0", workspace_id, po_id_gen) REFERENCES public."entity_commercial_documents" (collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_ffd52694e7d7464295b3" ON public."entity_grns" ("sd_989b10de1fd234494cb0", workspace_id, po_id_gen);

ALTER TABLE public."entity_grns" DROP CONSTRAINT "graph_grns_po_vendor";

ALTER TABLE public."entity_grns" ADD COLUMN "sd_7a96ce1039e7d83685ee" text GENERATED ALWAYS AS ('purchaseOrders'::text) STORED;

ALTER TABLE public."entity_grns" ADD CONSTRAINT "sd_0638ac61fbe5582587e8" FOREIGN KEY ("sd_7a96ce1039e7d83685ee", workspace_id, po_id_gen, vendor_id_gen) REFERENCES public."entity_commercial_documents" (collection, workspace_id, id, vendor_id_gen) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_752d2235243aaaa752b6" ON public."entity_grns" ("sd_7a96ce1039e7d83685ee", workspace_id, po_id_gen, vendor_id_gen);

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_de11944679c93077c0a0" text GENERATED ALWAYS AS (CASE WHEN collection='invoices' THEN (NULLIF((data ->> 'customer_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_21e1d6b91113db2663b5" FOREIGN KEY ("sd_de11944679c93077c0a0") REFERENCES public."entity_customers" (id);

CREATE INDEX "sd_df350421628d6a930d6d" ON public."entity_financial_documents" ("sd_de11944679c93077c0a0");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_ce2695f4fb72b9a68e00" text GENERATED ALWAYS AS (CASE WHEN collection='invoices' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_1c594d762ace6b857d52" FOREIGN KEY ("sd_ce2695f4fb72b9a68e00") REFERENCES public."entity_sites" (id);

CREATE INDEX "sd_d448f2a6bf83ba69bfa0" ON public."entity_financial_documents" ("sd_ce2695f4fb72b9a68e00");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_ce5a8e8bf4fba33ee764" text GENERATED ALWAYS AS (CASE WHEN collection='invoices' THEN workspace_id END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_5292691879d00ae29e53" FOREIGN KEY ("sd_ce5a8e8bf4fba33ee764", payment_id_gen) REFERENCES public."entity_payments" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_41df84234effba088a9a" ON public."entity_financial_documents" ("sd_ce5a8e8bf4fba33ee764", payment_id_gen);

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_d041ff31b5e2eb685f2c" text GENERATED ALWAYS AS (CASE WHEN collection='invoices' THEN workspace_id END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_df776e71f50fbe6c57dd" FOREIGN KEY ("sd_d041ff31b5e2eb685f2c", work_order_id_gen) REFERENCES public."entity_workOrders" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_9921cbd05cf379ca070c" ON public."entity_financial_documents" ("sd_d041ff31b5e2eb685f2c", work_order_id_gen);

ALTER TABLE public."entity_payments" DROP CONSTRAINT "graph_payments_invoice_id";

ALTER TABLE public."entity_payments" ADD COLUMN "sd_ec067a4d11b1b5c63469" text GENERATED ALWAYS AS ('invoices'::text) STORED;

ALTER TABLE public."entity_payments" ADD CONSTRAINT "sd_e1ed16032f7522ef24c7" FOREIGN KEY ("sd_ec067a4d11b1b5c63469", workspace_id, invoice_id_gen) REFERENCES public."entity_financial_documents" (collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_e1c7a35fece2d923b120" ON public."entity_payments" ("sd_ec067a4d11b1b5c63469", workspace_id, invoice_id_gen);

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "sd_e5f2acc3589c66f8fa55" text GENERATED ALWAYS AS (CASE WHEN collection='purchaseOrders' THEN workspace_id END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "sd_0fd35844a021660b00d1" FOREIGN KEY ("sd_e5f2acc3589c66f8fa55", site_id_gen) REFERENCES public."entity_sites" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_9c8a9cb6cab1180a0d51" ON public."entity_commercial_documents" ("sd_e5f2acc3589c66f8fa55", site_id_gen);

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "sd_ee10e8576c1ade7e800e" text GENERATED ALWAYS AS (CASE WHEN collection='purchaseOrders' THEN workspace_id END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "sd_6aa81ab2f783210aa2de" FOREIGN KEY ("sd_ee10e8576c1ade7e800e", vendor_id_gen) REFERENCES public."entity_master_vendors" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_2a5738d24d3f84cca792" ON public."entity_commercial_documents" ("sd_ee10e8576c1ade7e800e", vendor_id_gen);

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "sd_381a7ef2c4d3fdf17cc7" text GENERATED ALWAYS AS (CASE WHEN collection='purchaseOrders' THEN workspace_id END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "sd_378cd18bb2cc829d28fd" FOREIGN KEY ("sd_381a7ef2c4d3fdf17cc7", work_order_id_gen) REFERENCES public."entity_workOrders" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_2faacff0c85c1bd3107d" ON public."entity_commercial_documents" ("sd_381a7ef2c4d3fdf17cc7", work_order_id_gen);

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "sd_7dad38aaab2a13e3cef5" text GENERATED ALWAYS AS (CASE WHEN collection='quotations' THEN (NULLIF((data ->> 'customer_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "sd_c881b0b5a8e23d78c817" FOREIGN KEY ("sd_7dad38aaab2a13e3cef5") REFERENCES public."entity_customers" (id);

CREATE INDEX "sd_eb3be6b6b8a05af63050" ON public."entity_commercial_documents" ("sd_7dad38aaab2a13e3cef5");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "sd_d362111c2dd759619485" text GENERATED ALWAYS AS (CASE WHEN collection='quotations' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "sd_9017f4bddf10572db008" FOREIGN KEY ("sd_d362111c2dd759619485") REFERENCES public."entity_sites" (id);

CREATE INDEX "sd_ec32844e1f451fac7ceb" ON public."entity_commercial_documents" ("sd_d362111c2dd759619485");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "sd_fdb4b4da80d2e32d77f6" text GENERATED ALWAYS AS (CASE WHEN collection='risks' THEN (NULLIF((data ->> 'customer_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "sd_c4e0f2d7e4b42d0af68f" FOREIGN KEY ("sd_fdb4b4da80d2e32d77f6") REFERENCES public."entity_customers" (id);

CREATE INDEX "sd_ce6bce4b3cd12ff3ff80" ON public."entity_workflow_controls" ("sd_fdb4b4da80d2e32d77f6");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "sd_ffb53a4ac65790034db9" text GENERATED ALWAYS AS (CASE WHEN collection='risks' THEN (NULLIF((data ->> 'site_id'::text), ''::text)) END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "sd_d913d380a6647eb3644f" FOREIGN KEY ("sd_ffb53a4ac65790034db9") REFERENCES public."entity_sites" (id);

CREATE INDEX "sd_5cf9207067faee7d8531" ON public."entity_workflow_controls" ("sd_ffb53a4ac65790034db9");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_e312eb5c19f656dc911e" text GENERATED ALWAYS AS (CASE WHEN collection='vendorBills' THEN workspace_id END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_1fb85c7491001f1cca74" FOREIGN KEY ("sd_e312eb5c19f656dc911e", grn_id_gen) REFERENCES public."entity_grns" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_4f96589198e38965dfa9" ON public."entity_financial_documents" ("sd_e312eb5c19f656dc911e", grn_id_gen);

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_3f5f54a6c54af5aa7a7e" text GENERATED ALWAYS AS (CASE WHEN collection='vendorBills' THEN workspace_id END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_47469765d8513dcd288a" FOREIGN KEY ("sd_3f5f54a6c54af5aa7a7e", grn_id_gen, po_id_gen, vendor_id_gen) REFERENCES public."entity_grns" (workspace_id, id, po_id_gen, vendor_id_gen) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_9407ad2523d64129e2f8" ON public."entity_financial_documents" ("sd_3f5f54a6c54af5aa7a7e", grn_id_gen, po_id_gen, vendor_id_gen);

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_c1072f55346a3e74cc5a" text GENERATED ALWAYS AS (CASE WHEN collection='vendorBills' THEN 'purchaseOrders'::text END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_b06788236fcb83f55fd5" FOREIGN KEY ("sd_c1072f55346a3e74cc5a", workspace_id, po_id_gen) REFERENCES public."entity_commercial_documents" (collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_1f90609a60e03d65d824" ON public."entity_financial_documents" ("sd_c1072f55346a3e74cc5a", workspace_id, po_id_gen);

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_830a7ca70e6963321869" text GENERATED ALWAYS AS (CASE WHEN collection='vendorBills' THEN 'purchaseOrders'::text END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_aeb225efea1bc722a7a4" FOREIGN KEY ("sd_830a7ca70e6963321869", workspace_id, po_id_gen, vendor_id_gen) REFERENCES public."entity_commercial_documents" (collection, workspace_id, id, vendor_id_gen) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_7bccd91e8346b1759567" ON public."entity_financial_documents" ("sd_830a7ca70e6963321869", workspace_id, po_id_gen, vendor_id_gen);

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_4d64ec47001d82368e45" text GENERATED ALWAYS AS (CASE WHEN collection='vendorBills' THEN workspace_id END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_1fcb58c04e54053509ad" FOREIGN KEY ("sd_4d64ec47001d82368e45", site_id_gen) REFERENCES public."entity_sites" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_74a20492719965610bed" ON public."entity_financial_documents" ("sd_4d64ec47001d82368e45", site_id_gen);

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_59ef74edde9313403766" text GENERATED ALWAYS AS (CASE WHEN collection='vendorBills' THEN workspace_id END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_9680b0cd962818bfd026" FOREIGN KEY ("sd_59ef74edde9313403766", vendor_id_gen) REFERENCES public."entity_master_vendors" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_04ad6121cfbde9192386" ON public."entity_financial_documents" ("sd_59ef74edde9313403766", vendor_id_gen);

ALTER TABLE public."entity_financial_documents" ADD COLUMN "sd_fd700e017557db859daa" text GENERATED ALWAYS AS (CASE WHEN collection='vendorBills' THEN workspace_id END) STORED;

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_b8f393d02938d5c6874b" FOREIGN KEY ("sd_fd700e017557db859daa", work_order_id_gen) REFERENCES public."entity_workOrders" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_b96f97db71b9724cadd3" ON public."entity_financial_documents" ("sd_fd700e017557db859daa", work_order_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_7c0b2bc36fa980fc9080" text GENERATED ALWAYS AS (CASE WHEN collection='vendorPayments' THEN 'vendorBills'::text END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_b4d230a85610fc5cdbd0" FOREIGN KEY ("sd_7c0b2bc36fa980fc9080", workspace_id, vendor_bill_id_gen, vendor_id_gen) REFERENCES public."entity_financial_documents" (collection, workspace_id, id, vendor_id_gen) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_6e99c04579d4818c386e" ON public."entity_money_movements" ("sd_7c0b2bc36fa980fc9080", workspace_id, vendor_bill_id_gen, vendor_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_716aaf0f55bb03272ee3" text GENERATED ALWAYS AS (CASE WHEN collection='vendorPayments' THEN workspace_id END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_6b89eddc618cc8772363" FOREIGN KEY ("sd_716aaf0f55bb03272ee3", site_id_gen) REFERENCES public."entity_sites" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_97bc11367bf00549df99" ON public."entity_money_movements" ("sd_716aaf0f55bb03272ee3", site_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_a2f0728eafe7c5acc451" text GENERATED ALWAYS AS (CASE WHEN collection='vendorPayments' THEN 'vendorBills'::text END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_34c053b687ca5636fb65" FOREIGN KEY ("sd_a2f0728eafe7c5acc451", workspace_id, vendor_bill_id_gen) REFERENCES public."entity_financial_documents" (collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_d618bd576221daf3302b" ON public."entity_money_movements" ("sd_a2f0728eafe7c5acc451", workspace_id, vendor_bill_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_c842369ccf2e34a16434" text GENERATED ALWAYS AS (CASE WHEN collection='vendorPayments' THEN workspace_id END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_be7c38ed56afd5c1cb40" FOREIGN KEY ("sd_c842369ccf2e34a16434", vendor_id_gen) REFERENCES public."entity_master_vendors" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_1db7ba51bcbfa6c8705f" ON public."entity_money_movements" ("sd_c842369ccf2e34a16434", vendor_id_gen);

ALTER TABLE public."entity_money_movements" ADD COLUMN "sd_12ad5eb38b143abb5cc3" text GENERATED ALWAYS AS (CASE WHEN collection='vendorPayments' THEN workspace_id END) STORED;

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_c8554863e9cdbf031ec1" FOREIGN KEY ("sd_12ad5eb38b143abb5cc3", work_order_id_gen) REFERENCES public."entity_workOrders" (workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "sd_6d21eff8d61445819ec8" ON public."entity_money_movements" ("sd_12ad5eb38b143abb5cc3", work_order_id_gen);

CREATE OR REPLACE FUNCTION public.uc_collection_table(p_collection text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $map$
  SELECT CASE p_collection
    WHEN 'customers' THEN 'entity_customers'
    WHEN 'sites' THEN 'entity_sites'
    WHEN 'areas' THEN 'entity_areas'
    WHEN 'workRequired' THEN 'entity_workRequired'
    WHEN 'measurementRevisions' THEN 'entity_measurementRevisions'
    WHEN 'quotations' THEN 'entity_commercial_documents'
    WHEN 'acceptedScopes' THEN 'entity_acceptedScopes'
    WHEN 'workOrders' THEN 'entity_workOrders'
    WHEN 'boqs' THEN 'entity_commercial_documents'
    WHEN 'vendorRfqs' THEN 'entity_commercial_documents'
    WHEN 'vendorBids' THEN 'entity_commercial_documents'
    WHEN 'purchaseOrders' THEN 'entity_commercial_documents'
    WHEN 'grns' THEN 'entity_grns'
    WHEN 'inventory' THEN 'entity_inventory'
    WHEN 'stockMovements' THEN 'entity_stockMovements'
    WHEN 'dispatches' THEN 'entity_dispatches'
    WHEN 'vendorBills' THEN 'entity_financial_documents'
    WHEN 'vendorPayments' THEN 'entity_money_movements'
    WHEN 'contractorBills' THEN 'entity_financial_documents'
    WHEN 'contractorPayments' THEN 'entity_money_movements'
    WHEN 'commissions' THEN 'entity_commissions'
    WHEN 'workOrderCostLines' THEN 'entity_workOrderCostLines'
    WHEN 'contractorBids' THEN 'entity_commercial_documents'
    WHEN 'contractorSettlements' THEN 'entity_commercial_documents'
    WHEN 'drawings' THEN 'entity_drawings'
    WHEN 'executionLogs' THEN 'entity_executionLogs'
    WHEN 'variationRequests' THEN 'entity_variationRequests'
    WHEN 'visits' THEN 'entity_visits'
    WHEN 'tasks' THEN 'entity_tasks'
    WHEN 'followups' THEN 'entity_followups'
    WHEN 'actions' THEN 'entity_workflow_controls'
    WHEN 'payments' THEN 'entity_payments'
    WHEN 'invoices' THEN 'entity_financial_documents'
    WHEN 'customerReceipts' THEN 'entity_money_movements'
    WHEN 'blocked' THEN 'entity_workflow_controls'
    WHEN 'risks' THEN 'entity_workflow_controls'
    WHEN 'threads' THEN 'entity_threads'
    WHEN 'attendance' THEN 'entity_attendance'
    WHEN 'staffRolePermissions' THEN 'entity_staffRolePermissions'
    WHEN 'leaveRequests' THEN 'entity_leaveRequests'
    WHEN 'payrollPeriods' THEN 'entity_payrollPeriods'
    WHEN 'payrollLines' THEN 'entity_payrollLines'
    WHEN 'salaryAdjustments' THEN 'entity_salaryAdjustments'
    WHEN 'staffDocuments' THEN 'entity_staffDocuments'
    WHEN 'approvalPolicies' THEN 'entity_policy_rules'
    WHEN 'automationRules' THEN 'entity_policy_rules'
    WHEN 'recurringTasks' THEN 'entity_recurringTasks'
    WHEN 'commSends' THEN 'entity_commSends'
    WHEN 'entityFileAttachments' THEN 'entity_entityFileAttachments'
    WHEN 'entityReferenceAssignments' THEN 'entity_entityReferenceAssignments'
    WHEN 'commercialTerms' THEN 'entity_commercial_settings'
    WHEN 'paymentTermTemplates' THEN 'entity_commercial_settings'
    WHEN 'taxConfigs' THEN 'entity_commercial_settings'
    WHEN 'validityConfigs' THEN 'entity_commercial_settings'
    WHEN 'auditLog' THEN 'entity_auditLog'
    WHEN 'master.units' THEN 'entity_master_units'
    WHEN 'master.workCategories' THEN 'entity_master_workCategories'
    WHEN 'master.workSubcategories' THEN 'entity_master_workSubcategories'
    WHEN 'master.articles' THEN 'entity_master_articles'
    WHEN 'master.articleVariants' THEN 'entity_master_articleVariants'
    WHEN 'master.subcategoryArticleMap' THEN 'entity_master_subcategoryArticleMap'
    WHEN 'master.workOptionGroups' THEN 'entity_master_workOptionGroups'
    WHEN 'master.workOptionValues' THEN 'entity_master_workOptionValues'
    WHEN 'master.vendors' THEN 'entity_master_vendors'
    WHEN 'master.contractors' THEN 'entity_master_contractors'
    WHEN 'master.staff' THEN 'entity_master_staff'
    WHEN 'master.sourcePartners' THEN 'entity_master_sourcePartners'
    WHEN 'master.commissionRules' THEN 'entity_policy_rules'
    WHEN 'master.vendorRates' THEN 'entity_rate_cards'
    WHEN 'master.contractorRates' THEN 'entity_rate_cards'
    WHEN 'master.customerRateSuggestions' THEN 'entity_rate_cards'
    WHEN 'master.vendorRateHistories' THEN 'entity_master_vendorRateHistories'
    WHEN 'master.storageAccounts' THEN 'entity_master_storageAccounts'
    WHEN 'master.storageFolderTemplates' THEN 'entity_master_storageFolderTemplates'
    WHEN 'master.storageFolderInstances' THEN 'entity_master_storageFolderInstances'
    WHEN 'master.fileAssets' THEN 'entity_master_fileAssets'
    WHEN 'master.catalogues' THEN 'entity_reference_libraries'
    WHEN 'master.catalogueArticleVendorLinks' THEN 'entity_master_catalogueArticleVendorLinks'
    WHEN 'master.pinterestBoards' THEN 'entity_reference_libraries'
    WHEN 'master.referenceMedia' THEN 'entity_reference_libraries'
  END;
$map$;

REVOKE ALL ON FUNCTION public.uc_collection_table(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.uc_collection_table(text) TO service_role;

CREATE OR REPLACE FUNCTION public.commit_workspace_operations(p_workspace_id text, p_expected_workspace_revision integer, p_operations jsonb, p_expected_row_versions jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_op jsonb;
  v_collection text;
  v_table text;
  v_expected_table text;
  v_operations jsonb;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';
  end if;

  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    v_collection := nullif(btrim(v_op ->> 'collection'), '');
    v_table := nullif(btrim(v_op ->> 'table'), '');
    if v_collection is null or v_table is null then
      raise exception using errcode = '22023', message = 'INVALID_COLLECTION';
    end if;

    v_expected_table := public.uc_collection_table(v_collection);
    if v_expected_table is null or v_table is distinct from v_expected_table
       or v_expected_table !~ '^entity_[A-Za-z0-9_]+$'
       or to_regclass(format('public.%I', v_expected_table)) is null then
      raise exception using errcode = '22023', message = 'INVALID_COLLECTION_TABLE';
    end if;
  end loop;

  v_operations := public.uc_sanitize_workspace_operations(p_operations);
  v_operations := public.uc_expand_contractor_rate_operations(p_workspace_id, v_operations);
  perform set_config('uc.write_source', 'workspace-commit', true);

  return public.commit_workspace_operations_internal(
    p_workspace_id,
    p_expected_workspace_revision,
    v_operations,
    coalesce(p_expected_row_versions, '{}'::jsonb)
  );
end;
$function$;

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
      execute format('select revision from public.%I where workspace_id = $1 and id = $2%s for update', table_name, CASE WHEN table_name IN ('entity_commercial_documents', 'entity_financial_documents', 'entity_money_movements', 'entity_commercial_settings', 'entity_workflow_controls', 'entity_reference_libraries', 'entity_rate_cards', 'entity_policy_rules') THEN ' and collection = $3' ELSE '' END)
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
      execute format('select revision from public.%I where workspace_id = $1 and id = $2%s for update', table_name, CASE WHEN table_name IN ('entity_commercial_documents', 'entity_financial_documents', 'entity_money_movements', 'entity_commercial_settings', 'entity_workflow_controls', 'entity_reference_libraries', 'entity_rate_cards', 'entity_policy_rules') THEN ' and collection = $3' ELSE '' END)
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
        execute format('delete from public.%I where workspace_id = $1 and id = $2%s', table_name, CASE WHEN table_name IN ('entity_commercial_documents', 'entity_financial_documents', 'entity_money_movements', 'entity_commercial_settings', 'entity_workflow_controls', 'entity_reference_libraries', 'entity_rate_cards', 'entity_policy_rules') THEN ' and collection = $3' ELSE '' END)
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
      execute format('select revision from public.%I where workspace_id = $1 and id = $2%s', table_name, CASE WHEN table_name IN ('entity_commercial_documents', 'entity_financial_documents', 'entity_money_movements', 'entity_commercial_settings', 'entity_workflow_controls', 'entity_reference_libraries', 'entity_rate_cards', 'entity_policy_rules') THEN ' and collection = $3' ELSE '' END)
        into actual_row_revision using p_workspace_id, row_id, collection_name;
      if actual_row_revision is null then
        new_row_revision := 0;
        IF table_name IN ('entity_commercial_documents', 'entity_financial_documents', 'entity_money_movements', 'entity_commercial_settings', 'entity_workflow_controls', 'entity_reference_libraries', 'entity_rate_cards', 'entity_policy_rules') THEN
          EXECUTE format('insert into public.%I (id, workspace_id, collection, revision, data, updated_at) values ($1, $2, $4, 0, $3, now())', table_name) USING row_id, p_workspace_id, row_data, collection_name;
        ELSE
        execute format('insert into public.%I (id, workspace_id, revision, data, updated_at) values ($1, $2, 0, $3, now())', table_name)
          using row_id, p_workspace_id, row_data;
        END IF;
      else
        new_row_revision := actual_row_revision + 1;
        execute format('update public.%I set data = $3, revision = $4, updated_at = now() where workspace_id = $1 and id = $2%s', table_name, CASE WHEN table_name IN ('entity_commercial_documents', 'entity_financial_documents', 'entity_money_movements', 'entity_commercial_settings', 'entity_workflow_controls', 'entity_reference_libraries', 'entity_rate_cards', 'entity_policy_rules') THEN ' and collection = $5' ELSE '' END)
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
$function$;

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
  from public.entity_tasks
  where workspace_id = p_workspace_id
),
followup_metrics as (
  select count(*) filter (where data->>'status' in ('pending', 'scheduled', 'missed'))::bigint as active_followups
  from public.entity_followups
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
  from public.entity_visits
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
$function$;

CREATE OR REPLACE FUNCTION public.uc_expand_contractor_rate_operations(p_workspace_id text, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_op jsonb;
  v_row jsonb;
  v_projected_row jsonb;
  v_id text;
  v_contractor_id text;
  v_affected_ids text[] := array[]::text[];
  v_deleted_contractor_ids text[] := array[]::text[];
  v_projection_ids text[] := array[]::text[];
  v_rate_delete_ids text[] := array[]::text[];
  v_projection_rows jsonb := '[]'::jsonb;
  v_contractor_projection jsonb;
  v_output jsonb := '[]'::jsonb;
  v_existing_id text;
  v_has_rate_operation boolean := false;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';
  end if;

  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    if v_op ->> 'collection' = 'master.contractorRates' then
      v_has_rate_operation := true;
      continue;
    end if;
    if v_op ->> 'collection' <> 'master.contractors' then
      continue;
    end if;

    for v_row in select value from jsonb_array_elements(coalesce(v_op -> 'upsert', '[]'::jsonb))
    loop
      v_contractor_id := nullif(btrim(coalesce(v_row ->> 'id', '')), '');
      if v_contractor_id is null then continue; end if;
      if not (v_contractor_id = any(v_affected_ids)) then
        v_affected_ids := array_append(v_affected_ids, v_contractor_id);
      end if;

      v_contractor_projection := public.uc_contractor_rate_projection_rows(
        p_workspace_id,
        v_row
      );
      v_projection_rows := v_projection_rows || v_contractor_projection;

      for v_projected_row in select value from jsonb_array_elements(v_contractor_projection)
      loop
        v_id := nullif(btrim(coalesce(v_projected_row ->> 'id', '')), '');
        if v_id is not null and not (v_id = any(v_projection_ids)) then
          v_projection_ids := array_append(v_projection_ids, v_id);
        end if;
      end loop;

      for v_existing_id in
        select r.id
          from (SELECT * FROM public."entity_rate_cards" WHERE collection='master.contractorRates') r
         where r.workspace_id = p_workspace_id
           and r.data ->> 'contractor_id' = v_contractor_id
      loop
        if not (v_existing_id = any(v_projection_ids))
           and not (v_existing_id = any(v_rate_delete_ids)) then
          v_rate_delete_ids := array_append(v_rate_delete_ids, v_existing_id);
        end if;
      end loop;
    end loop;

    for v_id in select value #>> '{}' from jsonb_array_elements(coalesce(v_op -> 'deleteIds', '[]'::jsonb))
    loop
      v_contractor_id := nullif(btrim(coalesce(v_id, '')), '');
      if v_contractor_id is null then continue; end if;
      if not (v_contractor_id = any(v_affected_ids)) then
        v_affected_ids := array_append(v_affected_ids, v_contractor_id);
      end if;
      if not (v_contractor_id = any(v_deleted_contractor_ids)) then
        v_deleted_contractor_ids := array_append(v_deleted_contractor_ids, v_contractor_id);
      end if;

      for v_existing_id in
        select r.id
          from (SELECT * FROM public."entity_rate_cards" WHERE collection='master.contractorRates') r
         where r.workspace_id = p_workspace_id
           and r.data ->> 'contractor_id' = v_contractor_id
      loop
        if not (v_existing_id = any(v_rate_delete_ids)) then
          v_rate_delete_ids := array_append(v_rate_delete_ids, v_existing_id);
        end if;
      end loop;
    end loop;
  end loop;

  if cardinality(v_affected_ids) = 0 then
    if v_has_rate_operation then
      raise exception using errcode = '22023', message = 'CONTRACTOR_RATES_READ_ONLY';
    end if;
    return p_operations;
  end if;

  -- Contractor Rates are projection output, never caller input. Preserve every
  -- non-rate operation and discard any supplied rate upserts/deletes.
  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    if v_op ->> 'collection' = 'master.contractorRates' then
      continue;
    end if;
    v_output := v_output || jsonb_build_array(v_op);
  end loop;

  v_output := v_output || jsonb_build_array(jsonb_build_object(
    'collection', 'master.contractorRates',
    'table', 'entity_rate_cards',
    'upsert', v_projection_rows,
    'deleteIds', to_jsonb(v_rate_delete_ids)
  ));

  return v_output;
end;
$function$;

CREATE OR REPLACE FUNCTION public.uc_guard_staff_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source_table text := coalesce(nullif(tg_argv[0], ''), tg_table_name);
  v_old_data jsonb;
  v_old_staff_id text;
  v_new_staff_id text;
  v_staff_status text;
begin
  new.data := public.uc_canonicalize_staff_assignment_payload(v_source_table, new.workspace_id, new.data);

  if v_source_table = 'entity_approvalPolicies' then
    v_new_staff_id := nullif(btrim(new.data ->> 'approver_id'), '');
  else
    v_new_staff_id := nullif(btrim(new.data ->> 'assigned_staff_id'), '');
  end if;

  if tg_op = 'UPDATE' then
    v_old_data := public.uc_canonicalize_staff_assignment_payload(v_source_table, old.workspace_id, old.data);
    if v_source_table = 'entity_approvalPolicies' then
      v_old_staff_id := nullif(btrim(v_old_data ->> 'approver_id'), '');
    else
      v_old_staff_id := nullif(btrim(v_old_data ->> 'assigned_staff_id'), '');
    end if;
  end if;

  if v_new_staff_id is not null
     and (tg_op = 'INSERT' or v_new_staff_id is distinct from v_old_staff_id) then
    select lower(btrim(coalesce(staff.data ->> 'status', '')))
      into v_staff_status
    from public.entity_master_staff as staff
    where staff.workspace_id = new.workspace_id
      and staff.id = v_new_staff_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = format('STAFF_ASSIGNMENT_UNKNOWN: %s', v_new_staff_id);
    end if;

    if v_staff_status <> 'active' then
      raise exception using
        errcode = '23514',
        message = format('STAFF_ASSIGNMENT_REQUIRES_ACTIVE_STAFF: %s', v_new_staff_id);
    end if;
  end if;

  return new;
end;
$function$;

CREATE TRIGGER shared_approval_policy_staff_guard BEFORE INSERT OR UPDATE OF data ON public.entity_policy_rules FOR EACH ROW WHEN (NEW.collection='approvalPolicies') EXECUTE FUNCTION public.uc_guard_staff_assignment('entity_approvalPolicies');

ALTER TABLE public."entity_actions" DROP CONSTRAINT "entity_actions_customer_id_fkey";

ALTER TABLE public."entity_actions" DROP CONSTRAINT "entity_actions_site_id_fkey";

ALTER TABLE public."entity_approvalPolicies" DROP CONSTRAINT "entity_approval_policies_staff_fkey";

ALTER TABLE public."entity_blocked" DROP CONSTRAINT "entity_blocked_customer_id_fkey";

ALTER TABLE public."entity_blocked" DROP CONSTRAINT "entity_blocked_site_id_fkey";

ALTER TABLE public."entity_contractorBills" DROP CONSTRAINT "entity_contractorBills_customer_id_fkey";

ALTER TABLE public."entity_contractorBills" DROP CONSTRAINT "entity_contractorBills_site_id_fkey";

ALTER TABLE public."entity_contractorBills" DROP CONSTRAINT "graph_contractorBills_contractor_id";

ALTER TABLE public."entity_contractorBills" DROP CONSTRAINT "graph_contractorBills_work_order_id";

ALTER TABLE public."entity_contractorPayments" DROP CONSTRAINT "graph_contractorPayments_bill_contractor_job";

ALTER TABLE public."entity_contractorPayments" DROP CONSTRAINT "graph_contractorPayments_contractor_bill_id";

ALTER TABLE public."entity_contractorPayments" DROP CONSTRAINT "graph_contractorPayments_contractor_id";

ALTER TABLE public."entity_contractorPayments" DROP CONSTRAINT "graph_contractorPayments_site_id";

ALTER TABLE public."entity_contractorPayments" DROP CONSTRAINT "graph_contractorPayments_work_order_id";

ALTER TABLE public."entity_customerReceipts" DROP CONSTRAINT "entity_customerReceipts_customer_id_fkey";

ALTER TABLE public."entity_customerReceipts" DROP CONSTRAINT "entity_customerReceipts_site_id_fkey";

ALTER TABLE public."entity_customerReceipts" DROP CONSTRAINT "graph_customerReceipts_invoice_id";

ALTER TABLE public."entity_customerReceipts" DROP CONSTRAINT "graph_customerReceipts_payment_id";

ALTER TABLE public."entity_customerReceipts" DROP CONSTRAINT "graph_customerReceipts_work_order_id";

ALTER TABLE public."entity_invoices" DROP CONSTRAINT "entity_invoices_customer_id_fkey";

ALTER TABLE public."entity_invoices" DROP CONSTRAINT "entity_invoices_site_id_fkey";

ALTER TABLE public."entity_invoices" DROP CONSTRAINT "graph_invoices_payment_id";

ALTER TABLE public."entity_invoices" DROP CONSTRAINT "graph_invoices_work_order_id";

ALTER TABLE public."entity_purchaseOrders" DROP CONSTRAINT "graph_purchaseOrders_site_id";

ALTER TABLE public."entity_purchaseOrders" DROP CONSTRAINT "graph_purchaseOrders_vendor_id";

ALTER TABLE public."entity_purchaseOrders" DROP CONSTRAINT "graph_purchaseOrders_work_order_id";

ALTER TABLE public."entity_quotations" DROP CONSTRAINT "entity_quotations_customer_id_fkey";

ALTER TABLE public."entity_quotations" DROP CONSTRAINT "entity_quotations_site_id_fkey";

ALTER TABLE public."entity_risks" DROP CONSTRAINT "entity_risks_customer_id_fkey";

ALTER TABLE public."entity_risks" DROP CONSTRAINT "entity_risks_site_id_fkey";

ALTER TABLE public."entity_vendorBills" DROP CONSTRAINT "graph_vendorBills_grn_id";

ALTER TABLE public."entity_vendorBills" DROP CONSTRAINT "graph_vendorBills_grn_po_vendor";

ALTER TABLE public."entity_vendorBills" DROP CONSTRAINT "graph_vendorBills_po_id";

ALTER TABLE public."entity_vendorBills" DROP CONSTRAINT "graph_vendorBills_po_vendor";

ALTER TABLE public."entity_vendorBills" DROP CONSTRAINT "graph_vendorBills_site_id";

ALTER TABLE public."entity_vendorBills" DROP CONSTRAINT "graph_vendorBills_vendor_id";

ALTER TABLE public."entity_vendorBills" DROP CONSTRAINT "graph_vendorBills_work_order_id";

ALTER TABLE public."entity_vendorPayments" DROP CONSTRAINT "graph_vendorPayments_bill_vendor";

ALTER TABLE public."entity_vendorPayments" DROP CONSTRAINT "graph_vendorPayments_site_id";

ALTER TABLE public."entity_vendorPayments" DROP CONSTRAINT "graph_vendorPayments_vendor_bill_id";

ALTER TABLE public."entity_vendorPayments" DROP CONSTRAINT "graph_vendorPayments_vendor_id";

ALTER TABLE public."entity_vendorPayments" DROP CONSTRAINT "graph_vendorPayments_work_order_id";

DROP TABLE public."entity_quotations";

DROP TABLE public."entity_boqs";

DROP TABLE public."entity_vendorRfqs";

DROP TABLE public."entity_vendorBids";

DROP TABLE public."entity_contractorBids";

DROP TABLE public."entity_purchaseOrders";

DROP TABLE public."entity_contractorSettlements";

DROP TABLE public."entity_invoices";

DROP TABLE public."entity_vendorBills";

DROP TABLE public."entity_contractorBills";

DROP TABLE public."entity_customerReceipts";

DROP TABLE public."entity_vendorPayments";

DROP TABLE public."entity_contractorPayments";

DROP TABLE public."entity_commercialTerms";

DROP TABLE public."entity_paymentTermTemplates";

DROP TABLE public."entity_taxConfigs";

DROP TABLE public."entity_validityConfigs";

DROP TABLE public."entity_actions";

DROP TABLE public."entity_risks";

DROP TABLE public."entity_blocked";

DROP TABLE public."entity_master_catalogues";

DROP TABLE public."entity_master_pinterestBoards";

DROP TABLE public."entity_master_referenceMedia";

DROP TABLE public."entity_master_vendorRates";

DROP TABLE public."entity_master_contractorRates";

DROP TABLE public."entity_master_customerRateSuggestions";

DROP TABLE public."entity_approvalPolicies";

DROP TABLE public."entity_automationRules";

DROP TABLE public."entity_master_commissionRules";

DO $verify$ BEGIN

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('entity_quotations', 'entity_boqs', 'entity_vendorRfqs', 'entity_vendorBids', 'entity_contractorBids', 'entity_purchaseOrders', 'entity_contractorSettlements', 'entity_invoices', 'entity_vendorBills', 'entity_contractorBills', 'entity_customerReceipts', 'entity_vendorPayments', 'entity_contractorPayments', 'entity_commercialTerms', 'entity_paymentTermTemplates', 'entity_taxConfigs', 'entity_validityConfigs', 'entity_actions', 'entity_risks', 'entity_blocked', 'entity_master_catalogues', 'entity_master_pinterestBoards', 'entity_master_referenceMedia', 'entity_master_vendorRates', 'entity_master_contractorRates', 'entity_master_customerRateSuggestions', 'entity_approvalPolicies', 'entity_automationRules', 'entity_master_commissionRules')) THEN RAISE EXCEPTION 'SHARED_DOMAIN_OLD_TABLE_REMAINS'; END IF;

END $verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
