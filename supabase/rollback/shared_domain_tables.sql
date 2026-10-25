-- Run only as part of a coordinated application rollback.

-- Restores independent tables from current canonical shared data.

BEGIN;

SET LOCAL lock_timeout = '15s';

LOCK TABLE public.entity_workspace_revision IN ACCESS EXCLUSIVE MODE;

LOCK TABLE public."entity_commercial_documents", public."entity_financial_documents", public."entity_money_movements", public."entity_commercial_settings", public."entity_workflow_controls", public."entity_reference_libraries", public."entity_rate_cards", public."entity_policy_rules" IN ACCESS EXCLUSIVE MODE;

CREATE TABLE public."entity_quotations" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL,
"customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
"site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

ALTER TABLE public."entity_quotations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_quotations" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_quotations" TO service_role;

CREATE TABLE public."entity_boqs" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_boqs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_boqs" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_boqs" TO service_role;

CREATE TABLE public."entity_vendorRfqs" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_vendorRfqs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_vendorRfqs" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_vendorRfqs" TO service_role;

CREATE TABLE public."entity_vendorBids" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_vendorBids" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_vendorBids" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_vendorBids" TO service_role;

CREATE TABLE public."entity_contractorBids" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_contractorBids" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_contractorBids" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_contractorBids" TO service_role;

CREATE TABLE public."entity_purchaseOrders" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL,
"vendor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'vendor_id'::text), ''::text)) STORED,
"work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED,
"site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

ALTER TABLE public."entity_purchaseOrders" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_purchaseOrders" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_purchaseOrders" TO service_role;

CREATE TABLE public."entity_contractorSettlements" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_contractorSettlements" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_contractorSettlements" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_contractorSettlements" TO service_role;

CREATE TABLE public."entity_invoices" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL,
"customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
"site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED,
"work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED,
"payment_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'payment_id'::text), ''::text)) STORED
);

ALTER TABLE public."entity_invoices" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_invoices" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_invoices" TO service_role;

CREATE TABLE public."entity_vendorBills" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL,
"po_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'po_id'::text), ''::text)) STORED,
"grn_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'grn_id'::text), ''::text)) STORED,
"vendor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'vendor_id'::text), ''::text)) STORED,
"work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED,
"site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

ALTER TABLE public."entity_vendorBills" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_vendorBills" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_vendorBills" TO service_role;

CREATE TABLE public."entity_contractorBills" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL,
"customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
"site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED,
"work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED,
"contractor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'contractor_id'::text), ''::text)) STORED
);

ALTER TABLE public."entity_contractorBills" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_contractorBills" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_contractorBills" TO service_role;

CREATE TABLE public."entity_customerReceipts" (
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
"work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED
);

ALTER TABLE public."entity_customerReceipts" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_customerReceipts" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_customerReceipts" TO service_role;

CREATE TABLE public."entity_vendorPayments" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL,
"vendor_bill_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'vendor_bill_id'::text), ''::text)) STORED,
"vendor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'vendor_id'::text), ''::text)) STORED,
"work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED,
"site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

ALTER TABLE public."entity_vendorPayments" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_vendorPayments" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_vendorPayments" TO service_role;

CREATE TABLE public."entity_contractorPayments" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL,
"contractor_bill_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'contractor_bill_id'::text), ''::text)) STORED,
"contractor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'contractor_id'::text), ''::text)) STORED,
"work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED,
"site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

ALTER TABLE public."entity_contractorPayments" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_contractorPayments" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_contractorPayments" TO service_role;

CREATE TABLE public."entity_commercialTerms" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_commercialTerms" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_commercialTerms" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_commercialTerms" TO service_role;

CREATE TABLE public."entity_paymentTermTemplates" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_paymentTermTemplates" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_paymentTermTemplates" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_paymentTermTemplates" TO service_role;

CREATE TABLE public."entity_taxConfigs" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_taxConfigs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_taxConfigs" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_taxConfigs" TO service_role;

CREATE TABLE public."entity_validityConfigs" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_validityConfigs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_validityConfigs" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_validityConfigs" TO service_role;

CREATE TABLE public."entity_actions" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL,
"customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
"site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

ALTER TABLE public."entity_actions" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_actions" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_actions" TO service_role;

CREATE TABLE public."entity_risks" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL,
"customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
"site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

ALTER TABLE public."entity_risks" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_risks" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_risks" TO service_role;

CREATE TABLE public."entity_blocked" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL,
"customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
"site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

ALTER TABLE public."entity_blocked" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_blocked" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_blocked" TO service_role;

CREATE TABLE public."entity_master_catalogues" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_master_catalogues" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_master_catalogues" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_master_catalogues" TO service_role;

CREATE TABLE public."entity_master_pinterestBoards" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_master_pinterestBoards" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_master_pinterestBoards" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_master_pinterestBoards" TO service_role;

CREATE TABLE public."entity_master_referenceMedia" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_master_referenceMedia" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_master_referenceMedia" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_master_referenceMedia" TO service_role;

CREATE TABLE public."entity_master_vendorRates" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_master_vendorRates" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_master_vendorRates" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_master_vendorRates" TO service_role;

CREATE TABLE public."entity_master_contractorRates" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_master_contractorRates" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_master_contractorRates" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_master_contractorRates" TO service_role;

CREATE TABLE public."entity_master_customerRateSuggestions" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_master_customerRateSuggestions" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_master_customerRateSuggestions" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_master_customerRateSuggestions" TO service_role;

CREATE TABLE public."entity_approvalPolicies" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL,
"approver_staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'approver_id'::text)), ''::text)) STORED
);

ALTER TABLE public."entity_approvalPolicies" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_approvalPolicies" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_approvalPolicies" TO service_role;

CREATE TABLE public."entity_automationRules" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_automationRules" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_automationRules" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_automationRules" TO service_role;

CREATE TABLE public."entity_master_commissionRules" (
"id" text NOT NULL,
"workspace_id" text DEFAULT 'default'::text NOT NULL,
"revision" bigint DEFAULT 0 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" text,
"data" jsonb NOT NULL
);

ALTER TABLE public."entity_master_commissionRules" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."entity_master_commissionRules" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."entity_master_commissionRules" TO service_role;

CREATE POLICY "entity_actions workspace read" ON public."entity_actions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_approvalPolicies workspace read" ON public."entity_approvalPolicies" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_automationRules workspace read" ON public."entity_automationRules" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_blocked workspace read" ON public."entity_blocked" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_boqs workspace read" ON public."entity_boqs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_commercialTerms workspace read" ON public."entity_commercialTerms" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_contractorBids workspace read" ON public."entity_contractorBids" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_contractorBills workspace read" ON public."entity_contractorBills" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_contractorPayments workspace read" ON public."entity_contractorPayments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_contractorSettlements workspace read" ON public."entity_contractorSettlements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_customerReceipts workspace read" ON public."entity_customerReceipts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_invoices workspace read" ON public."entity_invoices" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_catalogues workspace read" ON public."entity_master_catalogues" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_commissionRules workspace read" ON public."entity_master_commissionRules" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_contractorRates workspace read" ON public."entity_master_contractorRates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_customerRateSuggestions workspace read" ON public."entity_master_customerRateSuggestions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_pinterestBoards workspace read" ON public."entity_master_pinterestBoards" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_referenceMedia workspace read" ON public."entity_master_referenceMedia" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_vendorRates workspace read" ON public."entity_master_vendorRates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_paymentTermTemplates workspace read" ON public."entity_paymentTermTemplates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_purchaseOrders workspace read" ON public."entity_purchaseOrders" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_quotations workspace read" ON public."entity_quotations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_risks workspace read" ON public."entity_risks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_taxConfigs workspace read" ON public."entity_taxConfigs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_validityConfigs workspace read" ON public."entity_validityConfigs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_vendorBids workspace read" ON public."entity_vendorBids" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_vendorBills workspace read" ON public."entity_vendorBills" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_vendorPayments workspace read" ON public."entity_vendorPayments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_vendorRfqs workspace read" ON public."entity_vendorRfqs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

ALTER TABLE public."entity_actions" ADD CONSTRAINT "entity_actions_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_approvalPolicies" ADD CONSTRAINT "entity_approvalPolicies_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_automationRules" ADD CONSTRAINT "entity_automationRules_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_blocked" ADD CONSTRAINT "entity_blocked_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_boqs" ADD CONSTRAINT "entity_boqs_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_commercialTerms" ADD CONSTRAINT "entity_commercialTerms_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_contractorBids" ADD CONSTRAINT "entity_contractorBids_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_contractorBills" ADD CONSTRAINT "entity_contractorBills_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_contractorBills" ADD CONSTRAINT "graph_contractorBills_contractor_id_required" CHECK (contractor_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_contractorBills" ADD CONSTRAINT "graph_contractorBills_work_order_id_required" CHECK (work_order_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_contractorPayments" ADD CONSTRAINT "entity_contractorPayments_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_contractorPayments" ADD CONSTRAINT "graph_contractorPayments_contractor_bill_id_required" CHECK (contractor_bill_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_contractorPayments" ADD CONSTRAINT "graph_contractorPayments_contractor_id_required" CHECK (contractor_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_contractorPayments" ADD CONSTRAINT "graph_contractorPayments_site_id_required" CHECK (site_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_contractorPayments" ADD CONSTRAINT "graph_contractorPayments_work_order_id_required" CHECK (work_order_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_contractorSettlements" ADD CONSTRAINT "entity_contractorSettlements_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_customerReceipts" ADD CONSTRAINT "entity_customerReceipts_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_customerReceipts" ADD CONSTRAINT "graph_customerReceipts_invoice_id_required" CHECK (invoice_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_invoices" ADD CONSTRAINT "entity_invoices_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_catalogues" ADD CONSTRAINT "entity_master_catalogues_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_commissionRules" ADD CONSTRAINT "entity_master_commissionRules_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_contractorRates" ADD CONSTRAINT "entity_master_contractorRates_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_customerRateSuggestions" ADD CONSTRAINT "entity_master_customerRateSuggestions_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_pinterestBoards" ADD CONSTRAINT "entity_master_pinterestBoards_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_referenceMedia" ADD CONSTRAINT "entity_master_referenceMedia_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_vendorRates" ADD CONSTRAINT "entity_master_vendorRates_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_paymentTermTemplates" ADD CONSTRAINT "entity_paymentTermTemplates_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_purchaseOrders" ADD CONSTRAINT "entity_purchaseOrders_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_purchaseOrders" ADD CONSTRAINT "graph_purchaseOrders_vendor_id_required" CHECK (vendor_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_quotations" ADD CONSTRAINT "entity_quotations_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_risks" ADD CONSTRAINT "entity_risks_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_taxConfigs" ADD CONSTRAINT "entity_taxConfigs_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_validityConfigs" ADD CONSTRAINT "entity_validityConfigs_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_vendorBids" ADD CONSTRAINT "entity_vendorBids_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_vendorBills" ADD CONSTRAINT "entity_vendorBills_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_vendorBills" ADD CONSTRAINT "graph_vendorBills_grn_id_required" CHECK (grn_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_vendorBills" ADD CONSTRAINT "graph_vendorBills_po_id_required" CHECK (po_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_vendorBills" ADD CONSTRAINT "graph_vendorBills_vendor_id_required" CHECK (vendor_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_vendorPayments" ADD CONSTRAINT "entity_vendorPayments_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_vendorPayments" ADD CONSTRAINT "graph_vendorPayments_vendor_bill_id_required" CHECK (vendor_bill_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_vendorPayments" ADD CONSTRAINT "graph_vendorPayments_vendor_id_required" CHECK (vendor_id_gen IS NOT NULL AND workspace_id IS NOT NULL);

ALTER TABLE public."entity_vendorRfqs" ADD CONSTRAINT "entity_vendorRfqs_pkey" PRIMARY KEY (id);

CREATE INDEX entity_actions_customer_id_idx ON public.entity_actions USING btree (customer_id_gen, workspace_id);

CREATE INDEX entity_actions_site_id_idx ON public.entity_actions USING btree (site_id_gen, workspace_id);

CREATE INDEX entity_actions_updated_idx ON public.entity_actions USING btree (updated_at DESC);

CREATE INDEX entity_actions_workspace_idx ON public.entity_actions USING btree (workspace_id);

CREATE INDEX "entity_approvalPolicies_updated_idx" ON public."entity_approvalPolicies" USING btree (updated_at DESC);

CREATE INDEX "entity_approvalPolicies_workspace_idx" ON public."entity_approvalPolicies" USING btree (workspace_id);

CREATE INDEX entity_approval_policies_staff_idx ON public."entity_approvalPolicies" USING btree (workspace_id, approver_staff_id) WHERE (approver_staff_id IS NOT NULL);

CREATE INDEX "entity_automationRules_updated_idx" ON public."entity_automationRules" USING btree (updated_at DESC);

CREATE INDEX "entity_automationRules_workspace_idx" ON public."entity_automationRules" USING btree (workspace_id);

CREATE INDEX entity_blocked_customer_id_idx ON public.entity_blocked USING btree (customer_id_gen, workspace_id);

CREATE INDEX entity_blocked_site_id_idx ON public.entity_blocked USING btree (site_id_gen, workspace_id);

CREATE INDEX entity_blocked_updated_idx ON public.entity_blocked USING btree (updated_at DESC);

CREATE INDEX entity_blocked_workspace_idx ON public.entity_blocked USING btree (workspace_id);

CREATE INDEX entity_boqs_updated_idx ON public.entity_boqs USING btree (updated_at DESC);

CREATE INDEX entity_boqs_workspace_idx ON public.entity_boqs USING btree (workspace_id);

CREATE INDEX "entity_commercialTerms_updated_idx" ON public."entity_commercialTerms" USING btree (updated_at DESC);

CREATE INDEX "entity_commercialTerms_workspace_idx" ON public."entity_commercialTerms" USING btree (workspace_id);

CREATE INDEX "entity_contractorBids_updated_idx" ON public."entity_contractorBids" USING btree (updated_at DESC);

CREATE INDEX "entity_contractorBids_workspace_idx" ON public."entity_contractorBids" USING btree (workspace_id);

CREATE INDEX "entity_contractorBills_customer_id_idx" ON public."entity_contractorBills" USING btree (customer_id_gen, workspace_id);

CREATE INDEX "entity_contractorBills_site_id_idx" ON public."entity_contractorBills" USING btree (site_id_gen, workspace_id);

CREATE INDEX "entity_contractorBills_updated_idx" ON public."entity_contractorBills" USING btree (updated_at DESC);

CREATE UNIQUE INDEX "entity_contractorBills_workspace_identity" ON public."entity_contractorBills" USING btree (workspace_id, id);

CREATE INDEX "entity_contractorBills_workspace_idx" ON public."entity_contractorBills" USING btree (workspace_id);

CREATE UNIQUE INDEX "graph_contractorBills_bill_contractor_job_identity" ON public."entity_contractorBills" USING btree (workspace_id, id, contractor_id_gen, work_order_id_gen, site_id_gen);

CREATE INDEX "graph_contractorBills_contractor_id_idx" ON public."entity_contractorBills" USING btree (workspace_id, contractor_id_gen);

CREATE INDEX "graph_contractorBills_work_order_id_idx" ON public."entity_contractorBills" USING btree (workspace_id, work_order_id_gen);

CREATE INDEX "entity_contractorPayments_updated_idx" ON public."entity_contractorPayments" USING btree (updated_at DESC);

CREATE INDEX "entity_contractorPayments_workspace_idx" ON public."entity_contractorPayments" USING btree (workspace_id);

CREATE INDEX "graph_contractorPayments_bill_contractor_job_idx" ON public."entity_contractorPayments" USING btree (workspace_id, contractor_bill_id_gen, contractor_id_gen, work_order_id_gen, site_id_gen);

CREATE INDEX "graph_contractorPayments_contractor_bill_id_idx" ON public."entity_contractorPayments" USING btree (workspace_id, contractor_bill_id_gen);

CREATE INDEX "graph_contractorPayments_contractor_id_idx" ON public."entity_contractorPayments" USING btree (workspace_id, contractor_id_gen);

CREATE INDEX "graph_contractorPayments_site_id_idx" ON public."entity_contractorPayments" USING btree (workspace_id, site_id_gen);

CREATE INDEX "graph_contractorPayments_work_order_id_idx" ON public."entity_contractorPayments" USING btree (workspace_id, work_order_id_gen);

CREATE INDEX "entity_contractorSettlements_updated_idx" ON public."entity_contractorSettlements" USING btree (updated_at DESC);

CREATE INDEX "entity_contractorSettlements_workspace_idx" ON public."entity_contractorSettlements" USING btree (workspace_id);

CREATE INDEX "entity_customerReceipts_customer_id_idx" ON public."entity_customerReceipts" USING btree (customer_id_gen, workspace_id);

CREATE INDEX "entity_customerReceipts_site_id_idx" ON public."entity_customerReceipts" USING btree (site_id_gen, workspace_id);

CREATE INDEX "entity_customerReceipts_updated_idx" ON public."entity_customerReceipts" USING btree (updated_at DESC);

CREATE INDEX "entity_customerReceipts_workspace_idx" ON public."entity_customerReceipts" USING btree (workspace_id);

CREATE UNIQUE INDEX entity_customer_receipts_workspace_receipt_no_unique ON public."entity_customerReceipts" USING btree (workspace_id, NULLIF(btrim((data ->> 'receipt_no'::text)), ''::text)) WHERE (NULLIF(btrim((data ->> 'receipt_no'::text)), ''::text) IS NOT NULL);

CREATE INDEX "graph_customerReceipts_invoice_id_idx" ON public."entity_customerReceipts" USING btree (workspace_id, invoice_id_gen);

CREATE INDEX "graph_customerReceipts_payment_id_idx" ON public."entity_customerReceipts" USING btree (workspace_id, payment_id_gen);

CREATE INDEX "graph_customerReceipts_work_order_id_idx" ON public."entity_customerReceipts" USING btree (workspace_id, work_order_id_gen);

CREATE INDEX entity_invoices_customer_id_idx ON public.entity_invoices USING btree (customer_id_gen, workspace_id);

CREATE INDEX entity_invoices_site_id_idx ON public.entity_invoices USING btree (site_id_gen, workspace_id);

CREATE INDEX entity_invoices_updated_idx ON public.entity_invoices USING btree (updated_at DESC);

CREATE UNIQUE INDEX entity_invoices_workspace_identity ON public.entity_invoices USING btree (workspace_id, id);

CREATE INDEX entity_invoices_workspace_idx ON public.entity_invoices USING btree (workspace_id);

CREATE UNIQUE INDEX entity_invoices_workspace_invoice_no_unique ON public.entity_invoices USING btree (workspace_id, NULLIF(btrim((data ->> 'invoice_no'::text)), ''::text)) WHERE (NULLIF(btrim((data ->> 'invoice_no'::text)), ''::text) IS NOT NULL);

CREATE INDEX graph_invoices_payment_id_idx ON public.entity_invoices USING btree (workspace_id, payment_id_gen);

CREATE INDEX graph_invoices_work_order_id_idx ON public.entity_invoices USING btree (workspace_id, work_order_id_gen);

CREATE INDEX entity_master_catalogues_updated_idx ON public.entity_master_catalogues USING btree (updated_at DESC);

CREATE INDEX entity_master_catalogues_workspace_idx ON public.entity_master_catalogues USING btree (workspace_id);

CREATE INDEX "entity_master_commissionRules_updated_idx" ON public."entity_master_commissionRules" USING btree (updated_at DESC);

CREATE INDEX "entity_master_commissionRules_workspace_idx" ON public."entity_master_commissionRules" USING btree (workspace_id);

CREATE INDEX "entity_master_contractorRates_updated_idx" ON public."entity_master_contractorRates" USING btree (updated_at DESC);

CREATE INDEX "entity_master_contractorRates_workspace_idx" ON public."entity_master_contractorRates" USING btree (workspace_id);

CREATE INDEX entity_master_contractor_rates_lookup_idx ON public."entity_master_contractorRates" USING btree (workspace_id, ((data ->> 'contractor_id'::text)), ((data ->> 'work_subcategory_id'::text)));

CREATE INDEX "entity_master_customerRateSuggestions_updated_idx" ON public."entity_master_customerRateSuggestions" USING btree (updated_at DESC);

CREATE INDEX "entity_master_customerRateSuggestions_workspace_idx" ON public."entity_master_customerRateSuggestions" USING btree (workspace_id);

CREATE INDEX "entity_master_pinterestBoards_updated_idx" ON public."entity_master_pinterestBoards" USING btree (updated_at DESC);

CREATE INDEX "entity_master_pinterestBoards_workspace_idx" ON public."entity_master_pinterestBoards" USING btree (workspace_id);

CREATE INDEX "entity_master_referenceMedia_updated_idx" ON public."entity_master_referenceMedia" USING btree (updated_at DESC);

CREATE INDEX "entity_master_referenceMedia_workspace_idx" ON public."entity_master_referenceMedia" USING btree (workspace_id);

CREATE INDEX "entity_master_vendorRates_updated_idx" ON public."entity_master_vendorRates" USING btree (updated_at DESC);

CREATE INDEX "entity_master_vendorRates_workspace_idx" ON public."entity_master_vendorRates" USING btree (workspace_id);

CREATE INDEX "entity_paymentTermTemplates_updated_idx" ON public."entity_paymentTermTemplates" USING btree (updated_at DESC);

CREATE INDEX "entity_paymentTermTemplates_workspace_idx" ON public."entity_paymentTermTemplates" USING btree (workspace_id);

CREATE INDEX "entity_purchaseOrders_updated_idx" ON public."entity_purchaseOrders" USING btree (updated_at DESC);

CREATE UNIQUE INDEX "entity_purchaseOrders_workspace_identity" ON public."entity_purchaseOrders" USING btree (workspace_id, id);

CREATE INDEX "entity_purchaseOrders_workspace_idx" ON public."entity_purchaseOrders" USING btree (workspace_id);

CREATE UNIQUE INDEX "graph_purchaseOrders_po_vendor_identity" ON public."entity_purchaseOrders" USING btree (workspace_id, id, vendor_id_gen);

CREATE INDEX "graph_purchaseOrders_site_id_idx" ON public."entity_purchaseOrders" USING btree (workspace_id, site_id_gen);

CREATE INDEX "graph_purchaseOrders_vendor_id_idx" ON public."entity_purchaseOrders" USING btree (workspace_id, vendor_id_gen);

CREATE INDEX "graph_purchaseOrders_work_order_id_idx" ON public."entity_purchaseOrders" USING btree (workspace_id, work_order_id_gen);

CREATE INDEX entity_quotations_customer_id_idx ON public.entity_quotations USING btree (customer_id_gen, workspace_id);

CREATE INDEX entity_quotations_site_id_idx ON public.entity_quotations USING btree (site_id_gen, workspace_id);

CREATE INDEX entity_quotations_updated_idx ON public.entity_quotations USING btree (updated_at DESC);

CREATE UNIQUE INDEX entity_quotations_workspace_active_number_uidx ON public.entity_quotations USING btree (workspace_id, ((data ->> 'quotation_no'::text))) WHERE ((COALESCE((data ->> 'status'::text), ''::text) <> 'cancelled'::text) AND (NULLIF(btrim((data ->> 'quotation_no'::text)), ''::text) IS NOT NULL));

CREATE INDEX entity_quotations_workspace_idx ON public.entity_quotations USING btree (workspace_id);

CREATE INDEX entity_risks_customer_id_idx ON public.entity_risks USING btree (customer_id_gen, workspace_id);

CREATE INDEX entity_risks_site_id_idx ON public.entity_risks USING btree (site_id_gen, workspace_id);

CREATE INDEX entity_risks_updated_idx ON public.entity_risks USING btree (updated_at DESC);

CREATE INDEX entity_risks_workspace_idx ON public.entity_risks USING btree (workspace_id);

CREATE INDEX "entity_taxConfigs_updated_idx" ON public."entity_taxConfigs" USING btree (updated_at DESC);

CREATE INDEX "entity_taxConfigs_workspace_idx" ON public."entity_taxConfigs" USING btree (workspace_id);

CREATE INDEX "entity_validityConfigs_updated_idx" ON public."entity_validityConfigs" USING btree (updated_at DESC);

CREATE INDEX "entity_validityConfigs_workspace_idx" ON public."entity_validityConfigs" USING btree (workspace_id);

CREATE INDEX "entity_vendorBids_updated_idx" ON public."entity_vendorBids" USING btree (updated_at DESC);

CREATE INDEX "entity_vendorBids_workspace_idx" ON public."entity_vendorBids" USING btree (workspace_id);

CREATE INDEX "entity_vendorBills_updated_idx" ON public."entity_vendorBills" USING btree (updated_at DESC);

CREATE UNIQUE INDEX "entity_vendorBills_workspace_identity" ON public."entity_vendorBills" USING btree (workspace_id, id);

CREATE INDEX "entity_vendorBills_workspace_idx" ON public."entity_vendorBills" USING btree (workspace_id);

CREATE UNIQUE INDEX "graph_vendorBills_bill_vendor_identity" ON public."entity_vendorBills" USING btree (workspace_id, id, vendor_id_gen);

CREATE INDEX "graph_vendorBills_grn_id_idx" ON public."entity_vendorBills" USING btree (workspace_id, grn_id_gen);

CREATE INDEX "graph_vendorBills_grn_po_vendor_idx" ON public."entity_vendorBills" USING btree (workspace_id, grn_id_gen, po_id_gen, vendor_id_gen);

CREATE INDEX "graph_vendorBills_po_id_idx" ON public."entity_vendorBills" USING btree (workspace_id, po_id_gen);

CREATE INDEX "graph_vendorBills_po_vendor_idx" ON public."entity_vendorBills" USING btree (workspace_id, po_id_gen, vendor_id_gen);

CREATE INDEX "graph_vendorBills_site_id_idx" ON public."entity_vendorBills" USING btree (workspace_id, site_id_gen);

CREATE INDEX "graph_vendorBills_vendor_id_idx" ON public."entity_vendorBills" USING btree (workspace_id, vendor_id_gen);

CREATE INDEX "graph_vendorBills_work_order_id_idx" ON public."entity_vendorBills" USING btree (workspace_id, work_order_id_gen);

CREATE INDEX "entity_vendorPayments_updated_idx" ON public."entity_vendorPayments" USING btree (updated_at DESC);

CREATE INDEX "entity_vendorPayments_workspace_idx" ON public."entity_vendorPayments" USING btree (workspace_id);

CREATE INDEX "graph_vendorPayments_bill_vendor_idx" ON public."entity_vendorPayments" USING btree (workspace_id, vendor_bill_id_gen, vendor_id_gen);

CREATE INDEX "graph_vendorPayments_site_id_idx" ON public."entity_vendorPayments" USING btree (workspace_id, site_id_gen);

CREATE INDEX "graph_vendorPayments_vendor_bill_id_idx" ON public."entity_vendorPayments" USING btree (workspace_id, vendor_bill_id_gen);

CREATE INDEX "graph_vendorPayments_vendor_id_idx" ON public."entity_vendorPayments" USING btree (workspace_id, vendor_id_gen);

CREATE INDEX "graph_vendorPayments_work_order_id_idx" ON public."entity_vendorPayments" USING btree (workspace_id, work_order_id_gen);

CREATE INDEX "entity_vendorRfqs_updated_idx" ON public."entity_vendorRfqs" USING btree (updated_at DESC);

CREATE INDEX "entity_vendorRfqs_workspace_idx" ON public."entity_vendorRfqs" USING btree (workspace_id);

INSERT INTO public."entity_quotations" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='quotations';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_quotations" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='quotations') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='quotations' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_quotations")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:quotations';
  END IF;
END $verify$;

INSERT INTO public."entity_boqs" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='boqs';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_boqs" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='boqs') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='boqs' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_boqs")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:boqs';
  END IF;
END $verify$;

INSERT INTO public."entity_vendorRfqs" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='vendorRfqs';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorRfqs" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='vendorRfqs') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='vendorRfqs' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorRfqs")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:vendorRfqs';
  END IF;
END $verify$;

INSERT INTO public."entity_vendorBids" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='vendorBids';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorBids" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='vendorBids') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='vendorBids' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorBids")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:vendorBids';
  END IF;
END $verify$;

INSERT INTO public."entity_contractorBids" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='contractorBids';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorBids" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='contractorBids') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='contractorBids' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorBids")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:contractorBids';
  END IF;
END $verify$;

INSERT INTO public."entity_purchaseOrders" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='purchaseOrders';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_purchaseOrders" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='purchaseOrders') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='purchaseOrders' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_purchaseOrders")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:purchaseOrders';
  END IF;
END $verify$;

INSERT INTO public."entity_contractorSettlements" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='contractorSettlements';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorSettlements" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='contractorSettlements') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_documents" WHERE collection='contractorSettlements' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorSettlements")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:contractorSettlements';
  END IF;
END $verify$;

INSERT INTO public."entity_invoices" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='invoices';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_invoices" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='invoices') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='invoices' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_invoices")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:invoices';
  END IF;
END $verify$;

INSERT INTO public."entity_vendorBills" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='vendorBills';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorBills" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='vendorBills') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='vendorBills' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorBills")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:vendorBills';
  END IF;
END $verify$;

INSERT INTO public."entity_contractorBills" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='contractorBills';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorBills" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='contractorBills') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_financial_documents" WHERE collection='contractorBills' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorBills")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:contractorBills';
  END IF;
END $verify$;

INSERT INTO public."entity_customerReceipts" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='customerReceipts';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_customerReceipts" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='customerReceipts') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='customerReceipts' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_customerReceipts")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:customerReceipts';
  END IF;
END $verify$;

INSERT INTO public."entity_vendorPayments" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='vendorPayments';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorPayments" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='vendorPayments') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='vendorPayments' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_vendorPayments")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:vendorPayments';
  END IF;
END $verify$;

INSERT INTO public."entity_contractorPayments" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='contractorPayments';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorPayments" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='contractorPayments') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_money_movements" WHERE collection='contractorPayments' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_contractorPayments")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:contractorPayments';
  END IF;
END $verify$;

INSERT INTO public."entity_commercialTerms" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='commercialTerms';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercialTerms" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='commercialTerms') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='commercialTerms' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercialTerms")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:commercialTerms';
  END IF;
END $verify$;

INSERT INTO public."entity_paymentTermTemplates" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='paymentTermTemplates';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_paymentTermTemplates" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='paymentTermTemplates') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='paymentTermTemplates' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_paymentTermTemplates")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:paymentTermTemplates';
  END IF;
END $verify$;

INSERT INTO public."entity_taxConfigs" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='taxConfigs';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_taxConfigs" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='taxConfigs') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='taxConfigs' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_taxConfigs")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:taxConfigs';
  END IF;
END $verify$;

INSERT INTO public."entity_validityConfigs" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='validityConfigs';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_validityConfigs" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='validityConfigs') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_commercial_settings" WHERE collection='validityConfigs' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_validityConfigs")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:validityConfigs';
  END IF;
END $verify$;

INSERT INTO public."entity_actions" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='actions';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_actions" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='actions') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='actions' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_actions")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:actions';
  END IF;
END $verify$;

INSERT INTO public."entity_risks" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='risks';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_risks" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='risks') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='risks' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_risks")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:risks';
  END IF;
END $verify$;

INSERT INTO public."entity_blocked" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='blocked';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_blocked" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='blocked') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_workflow_controls" WHERE collection='blocked' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_blocked")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:blocked';
  END IF;
END $verify$;

INSERT INTO public."entity_master_catalogues" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.catalogues';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_catalogues" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.catalogues') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.catalogues' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_catalogues")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:master.catalogues';
  END IF;
END $verify$;

INSERT INTO public."entity_master_pinterestBoards" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.pinterestBoards';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_pinterestBoards" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.pinterestBoards') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.pinterestBoards' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_pinterestBoards")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:master.pinterestBoards';
  END IF;
END $verify$;

INSERT INTO public."entity_master_referenceMedia" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.referenceMedia';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_referenceMedia" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.referenceMedia') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_reference_libraries" WHERE collection='master.referenceMedia' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_referenceMedia")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:master.referenceMedia';
  END IF;
END $verify$;

INSERT INTO public."entity_master_vendorRates" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.vendorRates';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_vendorRates" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.vendorRates') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.vendorRates' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_vendorRates")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:master.vendorRates';
  END IF;
END $verify$;

INSERT INTO public."entity_master_contractorRates" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.contractorRates';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_contractorRates" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.contractorRates') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.contractorRates' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_contractorRates")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:master.contractorRates';
  END IF;
END $verify$;

INSERT INTO public."entity_master_customerRateSuggestions" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.customerRateSuggestions';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_customerRateSuggestions" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.customerRateSuggestions') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_rate_cards" WHERE collection='master.customerRateSuggestions' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_customerRateSuggestions")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:master.customerRateSuggestions';
  END IF;
END $verify$;

INSERT INTO public."entity_approvalPolicies" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='approvalPolicies';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_approvalPolicies" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='approvalPolicies') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='approvalPolicies' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_approvalPolicies")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:approvalPolicies';
  END IF;
END $verify$;

INSERT INTO public."entity_automationRules" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='automationRules';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_automationRules" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='automationRules') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='automationRules' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_automationRules")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:automationRules';
  END IF;
END $verify$;

INSERT INTO public."entity_master_commissionRules" ("id", "workspace_id", "revision", "updated_at", "updated_by", "data") SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='master.commissionRules';

DO $verify$ BEGIN
  IF EXISTS ((SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_commissionRules" EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='master.commissionRules') UNION ALL (SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_policy_rules" WHERE collection='master.commissionRules' EXCEPT SELECT "id", "workspace_id", "revision", "updated_at", "updated_by", "data" FROM public."entity_master_commissionRules")) THEN
    RAISE EXCEPTION 'SHARED_DOMAIN_ROLLBACK_MISMATCH:master.commissionRules';
  END IF;
END $verify$;

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "sd_dfa581eb3282671ff10a";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "sd_e8761b8f070c9dbcac50";

ALTER TABLE public."entity_policy_rules" DROP CONSTRAINT "sd_bb59e3afdbbae001c053";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "sd_91e5326614a181727da2";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "sd_0f2545f97175c44b445d";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_afc8973449530910f685";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_3722bc7e601d83ed302f";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_3d294fa2702e99771a40";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_99099d9c7d486f51dc89";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_c71e6c74a42cf09a7435";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_3ec614041620bc4e00c2";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_b2c46fc092582cc40cf5";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_1507922174f9c51b812a";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_a05dae4487abdf3ffe61";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_b1f1fdd06b8ebc837408";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_cc51aa53426a27165efe";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_e93dde0ca0d566da730d";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_7cc946115b80ac7f9fae";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_e08516f9f7076ab78a94";

ALTER TABLE public."entity_grns" DROP CONSTRAINT "sd_9f7b08682e345e9e02c1";

ALTER TABLE public."entity_grns" DROP CONSTRAINT "sd_0638ac61fbe5582587e8";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_21e1d6b91113db2663b5";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_1c594d762ace6b857d52";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_5292691879d00ae29e53";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_df776e71f50fbe6c57dd";

ALTER TABLE public."entity_payments" DROP CONSTRAINT "sd_e1ed16032f7522ef24c7";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "sd_0fd35844a021660b00d1";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "sd_6aa81ab2f783210aa2de";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "sd_378cd18bb2cc829d28fd";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "sd_c881b0b5a8e23d78c817";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "sd_9017f4bddf10572db008";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "sd_c4e0f2d7e4b42d0af68f";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "sd_d913d380a6647eb3644f";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_1fb85c7491001f1cca74";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_47469765d8513dcd288a";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_b06788236fcb83f55fd5";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_aeb225efea1bc722a7a4";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_1fcb58c04e54053509ad";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_9680b0cd962818bfd026";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_b8f393d02938d5c6874b";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_b4d230a85610fc5cdbd0";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_6b89eddc618cc8772363";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_34c053b687ca5636fb65";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_be7c38ed56afd5c1cb40";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_c8554863e9cdbf031ec1";

ALTER TABLE public."entity_actions" ADD CONSTRAINT "entity_actions_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_actions" ADD CONSTRAINT "entity_actions_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_approvalPolicies" ADD CONSTRAINT "entity_approval_policies_staff_fkey" FOREIGN KEY (workspace_id, approver_staff_id) REFERENCES entity_master_staff(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public."entity_blocked" ADD CONSTRAINT "entity_blocked_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_blocked" ADD CONSTRAINT "entity_blocked_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_contractorBills" ADD CONSTRAINT "entity_contractorBills_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_contractorBills" ADD CONSTRAINT "entity_contractorBills_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_contractorBills" ADD CONSTRAINT "graph_contractorBills_contractor_id" FOREIGN KEY (workspace_id, contractor_id_gen) REFERENCES entity_master_contractors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_contractorBills" ADD CONSTRAINT "graph_contractorBills_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_contractorPayments" ADD CONSTRAINT "graph_contractorPayments_bill_contractor_job" FOREIGN KEY (workspace_id, contractor_bill_id_gen, contractor_id_gen, work_order_id_gen, site_id_gen) REFERENCES "entity_contractorBills"(workspace_id, id, contractor_id_gen, work_order_id_gen, site_id_gen) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_contractorPayments" ADD CONSTRAINT "graph_contractorPayments_contractor_bill_id" FOREIGN KEY (workspace_id, contractor_bill_id_gen) REFERENCES "entity_contractorBills"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_contractorPayments" ADD CONSTRAINT "graph_contractorPayments_contractor_id" FOREIGN KEY (workspace_id, contractor_id_gen) REFERENCES entity_master_contractors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_contractorPayments" ADD CONSTRAINT "graph_contractorPayments_site_id" FOREIGN KEY (workspace_id, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_contractorPayments" ADD CONSTRAINT "graph_contractorPayments_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_customerReceipts" ADD CONSTRAINT "entity_customerReceipts_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_customerReceipts" ADD CONSTRAINT "entity_customerReceipts_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_customerReceipts" ADD CONSTRAINT "graph_customerReceipts_invoice_id" FOREIGN KEY (workspace_id, invoice_id_gen) REFERENCES entity_invoices(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_customerReceipts" ADD CONSTRAINT "graph_customerReceipts_payment_id" FOREIGN KEY (workspace_id, payment_id_gen) REFERENCES entity_payments(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_customerReceipts" ADD CONSTRAINT "graph_customerReceipts_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_grns" ADD CONSTRAINT "graph_grns_po_id" FOREIGN KEY (workspace_id, po_id_gen) REFERENCES "entity_purchaseOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_grns" ADD CONSTRAINT "graph_grns_po_vendor" FOREIGN KEY (workspace_id, po_id_gen, vendor_id_gen) REFERENCES "entity_purchaseOrders"(workspace_id, id, vendor_id_gen) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_invoices" ADD CONSTRAINT "entity_invoices_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_invoices" ADD CONSTRAINT "entity_invoices_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_invoices" ADD CONSTRAINT "graph_invoices_payment_id" FOREIGN KEY (workspace_id, payment_id_gen) REFERENCES entity_payments(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_invoices" ADD CONSTRAINT "graph_invoices_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_payments" ADD CONSTRAINT "graph_payments_invoice_id" FOREIGN KEY (workspace_id, invoice_id_gen) REFERENCES entity_invoices(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_purchaseOrders" ADD CONSTRAINT "graph_purchaseOrders_site_id" FOREIGN KEY (workspace_id, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_purchaseOrders" ADD CONSTRAINT "graph_purchaseOrders_vendor_id" FOREIGN KEY (workspace_id, vendor_id_gen) REFERENCES entity_master_vendors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_purchaseOrders" ADD CONSTRAINT "graph_purchaseOrders_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_quotations" ADD CONSTRAINT "entity_quotations_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_quotations" ADD CONSTRAINT "entity_quotations_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_risks" ADD CONSTRAINT "entity_risks_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_risks" ADD CONSTRAINT "entity_risks_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_vendorBills" ADD CONSTRAINT "graph_vendorBills_grn_id" FOREIGN KEY (workspace_id, grn_id_gen) REFERENCES entity_grns(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_vendorBills" ADD CONSTRAINT "graph_vendorBills_grn_po_vendor" FOREIGN KEY (workspace_id, grn_id_gen, po_id_gen, vendor_id_gen) REFERENCES entity_grns(workspace_id, id, po_id_gen, vendor_id_gen) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_vendorBills" ADD CONSTRAINT "graph_vendorBills_po_id" FOREIGN KEY (workspace_id, po_id_gen) REFERENCES "entity_purchaseOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_vendorBills" ADD CONSTRAINT "graph_vendorBills_po_vendor" FOREIGN KEY (workspace_id, po_id_gen, vendor_id_gen) REFERENCES "entity_purchaseOrders"(workspace_id, id, vendor_id_gen) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_vendorBills" ADD CONSTRAINT "graph_vendorBills_site_id" FOREIGN KEY (workspace_id, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_vendorBills" ADD CONSTRAINT "graph_vendorBills_vendor_id" FOREIGN KEY (workspace_id, vendor_id_gen) REFERENCES entity_master_vendors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_vendorBills" ADD CONSTRAINT "graph_vendorBills_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_vendorPayments" ADD CONSTRAINT "graph_vendorPayments_bill_vendor" FOREIGN KEY (workspace_id, vendor_bill_id_gen, vendor_id_gen) REFERENCES "entity_vendorBills"(workspace_id, id, vendor_id_gen) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_vendorPayments" ADD CONSTRAINT "graph_vendorPayments_site_id" FOREIGN KEY (workspace_id, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_vendorPayments" ADD CONSTRAINT "graph_vendorPayments_vendor_bill_id" FOREIGN KEY (workspace_id, vendor_bill_id_gen) REFERENCES "entity_vendorBills"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_vendorPayments" ADD CONSTRAINT "graph_vendorPayments_vendor_id" FOREIGN KEY (workspace_id, vendor_id_gen) REFERENCES entity_master_vendors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_vendorPayments" ADD CONSTRAINT "graph_vendorPayments_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

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

    v_expected_table := 'entity_' || replace(v_collection, '.', '_');
    if v_table is distinct from v_expected_table
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
       or table_name !~ '^entity_[A-Za-z0-9_]+$'
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
      execute format('select revision from public.%I where workspace_id = $1 and id = $2 for update', table_name)
        into actual_row_revision using p_workspace_id, row_id;
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
      execute format('select revision from public.%I where workspace_id = $1 and id = $2 for update', table_name)
        into actual_row_revision using p_workspace_id, row_id;
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
      for row_id in select value #>> '{}' from jsonb_array_elements(coalesce(op -> 'deleteIds', '[]'::jsonb))
      loop
        execute format('delete from public.%I where workspace_id = $1 and id = $2', table_name)
          using p_workspace_id, row_id;
        if found then deleted_count := deleted_count + 1; end if;
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
      execute format('select revision from public.%I where workspace_id = $1 and id = $2', table_name)
        into actual_row_revision using p_workspace_id, row_id;
      if actual_row_revision is null then
        new_row_revision := 0;
        execute format('insert into public.%I (id, workspace_id, revision, data, updated_at) values ($1, $2, 0, $3, now())', table_name)
          using row_id, p_workspace_id, row_data;
      else
        new_row_revision := actual_row_revision + 1;
        execute format('update public.%I set data = $3, revision = $4, updated_at = now() where workspace_id = $1 and id = $2', table_name)
          using p_workspace_id, row_id, row_data, new_row_revision;
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
  from public.entity_actions
  where workspace_id = p_workspace_id
),
blocked_metrics as (
  select count(*) filter (where coalesce(data->'resolved', 'false'::jsonb) <> 'true'::jsonb)::bigint as unresolved_blocked
  from public.entity_blocked
  where workspace_id = p_workspace_id
),
risk_metrics as (
  select count(*)::bigint as open_risks
  from public.entity_risks
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
  from public."entity_purchaseOrders"
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
  from public.entity_quotations
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
  from public."entity_customerReceipts"
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
  from public."entity_vendorPayments"
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
  from public.entity_invoices
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
  from public."entity_vendorBills"
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
          from public."entity_master_contractorRates" r
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
          from public."entity_master_contractorRates" r
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
    'table', 'entity_master_contractorRates',
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
  v_old_data jsonb;
  v_old_staff_id text;
  v_new_staff_id text;
  v_staff_status text;
begin
  new.data := public.uc_canonicalize_staff_assignment_payload(tg_table_name, new.workspace_id, new.data);

  if tg_table_name = 'entity_approvalPolicies' then
    v_new_staff_id := nullif(btrim(new.data ->> 'approver_id'), '');
  else
    v_new_staff_id := nullif(btrim(new.data ->> 'assigned_staff_id'), '');
  end if;

  if tg_op = 'UPDATE' then
    v_old_data := public.uc_canonicalize_staff_assignment_payload(tg_table_name, old.workspace_id, old.data);
    if tg_table_name = 'entity_approvalPolicies' then
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

CREATE TRIGGER entity_approval_policies_staff_assignment_guard BEFORE INSERT OR UPDATE OF data ON "entity_approvalPolicies" FOR EACH ROW EXECUTE FUNCTION uc_guard_staff_assignment();

DROP TABLE public."entity_commercial_documents";

DROP TABLE public."entity_financial_documents";

DROP TABLE public."entity_money_movements";

DROP TABLE public."entity_commercial_settings";

DROP TABLE public."entity_workflow_controls";

DROP TABLE public."entity_reference_libraries";

DROP TABLE public."entity_rate_cards";

DROP TABLE public."entity_policy_rules";

ALTER TABLE public."entity_grns" DROP COLUMN "sd_989b10de1fd234494cb0";

ALTER TABLE public."entity_grns" DROP COLUMN "sd_7a96ce1039e7d83685ee";

ALTER TABLE public."entity_payments" DROP COLUMN "sd_ec067a4d11b1b5c63469";

DROP FUNCTION public.uc_collection_table(text);

NOTIFY pgrst, 'reload schema';

COMMIT;
