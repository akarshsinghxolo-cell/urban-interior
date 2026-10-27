-- Schema-only snapshot of urban-interior before PR #239, 26 October 2026.
-- No production row data, Auth accounts, API keys or provider credentials.
-- auth.users is a minimal local test stub; application schemas match the live catalogue.


CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA private; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}'); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_user::text $$; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$; GRANT USAGE ON SCHEMA public,private,auth TO anon,authenticated,service_role;

CREATE TABLE "public"."StaffRouteBundle" (
  "id" text NOT NULL,
  "staffId" text NOT NULL,
  "startedAt" timestamp with time zone NOT NULL,
  "endedAt" timestamp with time zone NOT NULL,
  "pointCount" integer NOT NULL,
  "distanceM" double precision DEFAULT 0 NOT NULL,
  "dataJson" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "private"."customer_contact_identities" (
  "workspace_id" text NOT NULL,
  "customer_id" text NOT NULL,
  "identity_kind" text NOT NULL,
  "identity_value" text NOT NULL
);

CREATE TABLE "public"."entity_acceptedScopes" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_areas" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_attendance" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'staff_id'::text)), ''::text)) STORED,
  "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_auditLog" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_commSends" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_commercial_documents" (
  "collection" text NOT NULL,
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
  "sd_e5f2acc3589c66f8fa55" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'purchaseOrders'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_ee10e8576c1ade7e800e" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'purchaseOrders'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_381a7ef2c4d3fdf17cc7" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'purchaseOrders'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_7dad38aaab2a13e3cef5" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'quotations'::text) THEN NULLIF((data ->> 'customer_id'::text), ''::text)
    ELSE NULL::text
END) STORED,
  "sd_d362111c2dd759619485" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'quotations'::text) THEN NULLIF((data ->> 'site_id'::text), ''::text)
    ELSE NULL::text
END) STORED
);

CREATE TABLE "public"."entity_commercial_settings" (
  "collection" text NOT NULL,
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_commissions" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_customers" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_dispatches" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_drawings" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_entityFileAttachments" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_entityReferenceAssignments" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_executionLogs" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_financial_documents" (
  "collection" text NOT NULL,
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
  "sd_79a3041abf5ba7c29887" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'contractorBills'::text) THEN NULLIF((data ->> 'customer_id'::text), ''::text)
    ELSE NULL::text
END) STORED,
  "sd_e4eff89c5be14ad2831f" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'contractorBills'::text) THEN NULLIF((data ->> 'site_id'::text), ''::text)
    ELSE NULL::text
END) STORED,
  "sd_995e0adc26a2dabe9258" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'contractorBills'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_f8c1fdf5bba847442adb" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'contractorBills'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_de11944679c93077c0a0" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'invoices'::text) THEN NULLIF((data ->> 'customer_id'::text), ''::text)
    ELSE NULL::text
END) STORED,
  "sd_ce2695f4fb72b9a68e00" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'invoices'::text) THEN NULLIF((data ->> 'site_id'::text), ''::text)
    ELSE NULL::text
END) STORED,
  "sd_ce5a8e8bf4fba33ee764" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'invoices'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_d041ff31b5e2eb685f2c" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'invoices'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_e312eb5c19f656dc911e" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'vendorBills'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_3f5f54a6c54af5aa7a7e" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'vendorBills'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_c1072f55346a3e74cc5a" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'vendorBills'::text) THEN 'purchaseOrders'::text
    ELSE NULL::text
END) STORED,
  "sd_830a7ca70e6963321869" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'vendorBills'::text) THEN 'purchaseOrders'::text
    ELSE NULL::text
END) STORED,
  "sd_4d64ec47001d82368e45" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'vendorBills'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_59ef74edde9313403766" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'vendorBills'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_fd700e017557db859daa" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'vendorBills'::text) THEN workspace_id
    ELSE NULL::text
END) STORED
);

CREATE TABLE "public"."entity_followups" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "assigned_staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'assigned_staff_id'::text)), ''::text)) STORED,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_grns" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "po_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'po_id'::text), ''::text)) STORED,
  "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'vendor_id'::text), ''::text)) STORED,
  "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED,
  "sd_989b10de1fd234494cb0" text GENERATED ALWAYS AS ('purchaseOrders'::text) STORED,
  "sd_7a96ce1039e7d83685ee" text GENERATED ALWAYS AS ('purchaseOrders'::text) STORED
);

CREATE TABLE "public"."entity_inventory" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_leaveRequests" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'staff_id'::text)), ''::text)) STORED
);

CREATE TABLE "public"."entity_master_articleVariants" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_articles" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_catalogueArticleVendorLinks" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_contractors" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_fileAssets" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_sourcePartners" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_staff" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "auth_user_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'auth_user_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_master_storageAccounts" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_storageFolderInstances" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_storageFolderTemplates" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_subcategoryArticleMap" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_units" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_vendorRateHistories" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_vendors" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_workCategories" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_workOptionGroups" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_workOptionValues" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_master_workSubcategories" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_measurementRevisions" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_money_movements" (
  "collection" text NOT NULL,
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
  "sd_6cba67ee70156c7a4ba7" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'contractorPayments'::text) THEN 'contractorBills'::text
    ELSE NULL::text
END) STORED,
  "sd_9c1f20588aca97588260" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'contractorPayments'::text) THEN 'contractorBills'::text
    ELSE NULL::text
END) STORED,
  "sd_52c2690706271d27d64a" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'contractorPayments'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_83a96458a5749577575b" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'contractorPayments'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_b977f619b6e787456146" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'contractorPayments'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_47c9fed69701c1b111b4" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'customerReceipts'::text) THEN NULLIF((data ->> 'customer_id'::text), ''::text)
    ELSE NULL::text
END) STORED,
  "sd_677ef08b162d13bdfddc" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'customerReceipts'::text) THEN NULLIF((data ->> 'site_id'::text), ''::text)
    ELSE NULL::text
END) STORED,
  "sd_c900124140f0e2d606ce" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'customerReceipts'::text) THEN 'invoices'::text
    ELSE NULL::text
END) STORED,
  "sd_00341c51016d86152a34" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'customerReceipts'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_dcd6545686f65e40f138" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'customerReceipts'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_7c0b2bc36fa980fc9080" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'vendorPayments'::text) THEN 'vendorBills'::text
    ELSE NULL::text
END) STORED,
  "sd_716aaf0f55bb03272ee3" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'vendorPayments'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_a2f0728eafe7c5acc451" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'vendorPayments'::text) THEN 'vendorBills'::text
    ELSE NULL::text
END) STORED,
  "sd_c842369ccf2e34a16434" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'vendorPayments'::text) THEN workspace_id
    ELSE NULL::text
END) STORED,
  "sd_12ad5eb38b143abb5cc3" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'vendorPayments'::text) THEN workspace_id
    ELSE NULL::text
END) STORED
);

CREATE TABLE "public"."entity_payments" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED,
  "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED,
  "invoice_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'invoice_id'::text), ''::text)) STORED,
  "sd_ec067a4d11b1b5c63469" text GENERATED ALWAYS AS ('invoices'::text) STORED
);

CREATE TABLE "public"."entity_payrollLines" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'staff_id'::text)), ''::text)) STORED
);

CREATE TABLE "public"."entity_payrollPeriods" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_policy_rules" (
  "collection" text NOT NULL,
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "approver_staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'approver_id'::text)), ''::text)) STORED,
  "sd_d88329e677268d0af6b5" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'approvalPolicies'::text) THEN workspace_id
    ELSE NULL::text
END) STORED
);

CREATE TABLE "public"."entity_rate_cards" (
  "collection" text NOT NULL,
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_recurringTasks" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "assigned_staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'assigned_staff_id'::text)), ''::text)) STORED
);

CREATE TABLE "public"."entity_reference_libraries" (
  "collection" text NOT NULL,
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_salaryAdjustments" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'staff_id'::text)), ''::text)) STORED,
  "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_sites" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_staffDocuments" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_staffRolePermissions" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_stockMovements" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_tasks" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "assigned_staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'assigned_staff_id'::text)), ''::text)) STORED,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED,
  "source_followup_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'source_followup_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_threads" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL
);

CREATE TABLE "public"."entity_variationRequests" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_visits" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "staff_id" text GENERATED ALWAYS AS (NULLIF(btrim((data ->> 'assigned_staff_id'::text)), ''::text)) STORED,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_workOrderCostLines" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'work_order_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_workOrders" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED,
  "contractor_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'contractor_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_workRequired" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED
);

CREATE TABLE "public"."entity_workflow_controls" (
  "collection" text NOT NULL,
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "data" jsonb NOT NULL,
  "customer_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'customer_id'::text), ''::text)) STORED,
  "site_id_gen" text GENERATED ALWAYS AS (NULLIF((data ->> 'site_id'::text), ''::text)) STORED,
  "sd_f0c5338ed87f8da85e2a" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'actions'::text) THEN NULLIF((data ->> 'customer_id'::text), ''::text)
    ELSE NULL::text
END) STORED,
  "sd_76e724a8ae01dd269987" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'actions'::text) THEN NULLIF((data ->> 'site_id'::text), ''::text)
    ELSE NULL::text
END) STORED,
  "sd_896262c53f4cfaa4f824" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'blocked'::text) THEN NULLIF((data ->> 'customer_id'::text), ''::text)
    ELSE NULL::text
END) STORED,
  "sd_a291a3a1d61683190c5b" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'blocked'::text) THEN NULLIF((data ->> 'site_id'::text), ''::text)
    ELSE NULL::text
END) STORED,
  "sd_fdb4b4da80d2e32d77f6" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'risks'::text) THEN NULLIF((data ->> 'customer_id'::text), ''::text)
    ELSE NULL::text
END) STORED,
  "sd_ffb53a4ac65790034db9" text GENERATED ALWAYS AS (
CASE
    WHEN (collection = 'risks'::text) THEN NULLIF((data ->> 'site_id'::text), ''::text)
    ELSE NULL::text
END) STORED
);

CREATE TABLE "public"."entity_workspace_change_batches" (
  "workspace_id" text NOT NULL,
  "revision" integer NOT NULL,
  "operations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "row_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_baseline" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."entity_workspace_revision" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."schema_migrations" (
  "version" text NOT NULL,
  "name" text NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."uc_drive_folders" (
  "folder_key" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "storage_account_id" text NOT NULL,
  "google_folder_id" text NOT NULL,
  "parent_folder_key" text,
  "display_name" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "web_view_link" text
);

CREATE TABLE "public"."uc_google_drive_credentials" (
  "storage_account_id" text NOT NULL,
  "google_account_id" text,
  "refresh_token_encrypted" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."uc_upload_batches" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "source_flow" text NOT NULL,
  "source_label" text NOT NULL,
  "target_entity_type" text NOT NULL,
  "target_entity_id" text NOT NULL,
  "target_label" text,
  "upload_purpose" text NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "required_evidence" boolean DEFAULT false NOT NULL,
  "storage_account_id" text,
  "created_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."uc_upload_events" (
  "id" bigint NOT NULL,
  "upload_item_id" text NOT NULL,
  "event_type" text NOT NULL,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."uc_upload_items" (
  "id" text NOT NULL,
  "batch_id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "last_modified" bigint,
  "fingerprint_sha256" text,
  "status" text DEFAULT 'queued'::text NOT NULL,
  "confirmed_bytes" bigint DEFAULT 0 NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "retry_at" timestamp with time zone,
  "last_error_code" text,
  "last_error_message" text,
  "storage_account_id" text,
  "google_file_id" text,
  "file_asset_id" text,
  "attachment_id" text,
  "verified_at" timestamp with time zone,
  "finalized_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source_flow" text,
  "upload_purpose" text,
  "target_entity_type" text,
  "target_entity_id" text,
  "desired_target_entity_type" text,
  "kind" text,
  "role" text,
  "caption" text,
  "visibility" text,
  "customer_shareable" boolean DEFAULT false NOT NULL,
  "attachment_field" text,
  "attachment_field_mode" text,
  "required_evidence" boolean DEFAULT false NOT NULL,
  "session_uri" text,
  "session_expires_at" timestamp with time zone,
  "staging_folder_id" text,
  "final_folder_id" text,
  "progress" integer DEFAULT 0 NOT NULL,
  "session_origin" text
);

CREATE TABLE "public"."uc_user_roles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "staff_id" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."uc_whatsapp_accounts" (
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "status" text DEFAULT 'disconnected'::text NOT NULL,
  "phone_number" text,
  "jid" text,
  "display_name" text,
  "pairing_requested_at" timestamp with time zone,
  "connected_at" timestamp with time zone,
  "last_activity_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."uc_whatsapp_auth_state" (
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "auth_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."uc_whatsapp_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "provider_message_id" text,
  "direction" text NOT NULL,
  "remote_jid" text NOT NULL,
  "customer_id" text,
  "comm_send_id" text,
  "subject" text,
  "body" text,
  "message_type" text DEFAULT 'text'::text NOT NULL,
  "status" text NOT NULL,
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sent_at" timestamp with time zone,
  "received_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."uc_workspace_operations" (
  "id" text NOT NULL,
  "workspace_id" text DEFAULT 'default'::text NOT NULL,
  "base_revision" bigint NOT NULL,
  "operations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'processing'::text NOT NULL,
  "created_by_user_id" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "applied_revision" bigint,
  "result" jsonb,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "applied_at" timestamp with time zone
);

CREATE OR REPLACE FUNCTION public.uc_guard_shared_service_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.data ? 'category_ids' then
    if jsonb_typeof(new.data->'category_ids') <> 'array' then raise exception 'Service categories must be an array'; end if;
    if exists(select 1 from jsonb_array_elements_text(new.data->'category_ids') category(value)
      where not exists(select 1 from public."entity_master_workCategories" c where c.workspace_id=new.workspace_id and c.id=category.value))
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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.uc_clear_terminal_upload_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status in ('uploaded_unverified','verifying','finalizing','completed','cancelled')
     or new.google_file_id is not null then
    new.session_uri:=null;
    new.session_expires_at:=null;
    new.session_origin:=null;
  end if;
  return new;
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
            from public."entity_master_workSubcategories" subcategory
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
            from public."entity_master_workSubcategories" subcategory
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

CREATE OR REPLACE FUNCTION public.uc_journal_auth_staff_master_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_revision integer;
  v_next_revision integer;
begin
  if current_setting('uc.write_source', true) = 'workspace-commit' then
    return new;
  end if;

  if new.updated_by is distinct from 'auth-system' then
    return new;
  end if;

  select revision
    into v_current_revision
    from public.entity_workspace_revision
   where id = new.workspace_id;

  if v_current_revision is null then
    raise exception using errcode = 'P0002', message = 'WORKSPACE_REVISION_NOT_FOUND';
  end if;

  v_next_revision := v_current_revision + 1;

  insert into public.entity_workspace_change_batches (
    workspace_id,
    revision,
    operations,
    row_versions,
    is_baseline,
    created_at
  ) values (
    new.workspace_id,
    v_next_revision,
    jsonb_build_array(
      jsonb_build_object(
        'collection', 'master.staff',
        'upsert', jsonb_build_array(new.data),
        'deleteIds', '[]'::jsonb
      )
    ),
    jsonb_build_object('master.staff:' || new.id, new.revision),
    false,
    now()
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uc_prepare_drive_folder_claim_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status in ('stale','error') then new.updated_at:=now()-interval '2 minutes'; end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uc_guard_workspace_staff_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if current_setting('uc.write_source', true) = 'workspace-commit' then
    raise exception using
      errcode = '23514',
      message = 'STAFF_DELETE_FORBIDDEN_USE_INACTIVE';
  end if;
  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_staff_identity_bundle(p_assignment_id uuid, p_user_id uuid, p_email text, p_role text, p_display_name text, p_status text, p_staff_id text DEFAULT NULL::text, p_approved_by uuid DEFAULT NULL::uuid, p_approved_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_rejected_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_workspace_id text DEFAULT 'default'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_display_name, ''));
  v_requested_staff_id text := nullif(trim(coalesce(p_staff_id, '')), '');
  v_staff_id text;
  v_code text;
  v_staff_status text;
  v_role_label text;
  v_existing_master public.entity_master_staff%rowtype;
  v_role_row public.uc_user_roles%rowtype;
  v_master_data jsonb;
  v_workspace_revision integer;
  v_next_workspace_revision integer;
  v_gps_enabled boolean := true;
  v_now timestamptz := now();
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'INVALID_USER_ID';
  end if;
  if v_email = '' then
    raise exception using errcode = '22023', message = 'INVALID_EMAIL';
  end if;
  if v_name = '' then
    raise exception using errcode = '22023', message = 'INVALID_DISPLAY_NAME';
  end if;
  if p_role not in (
    'OWNER','OPERATIONS_MANAGER','FIELD_STAFF','SALES_TELECALLER',
    'PROCUREMENT_STAFF','FINANCE','ACCOUNTS_ADMIN'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ROLE';
  end if;
  if p_status not in ('pending','active','rejected','inactive') then
    raise exception using errcode = '22023', message = 'INVALID_STATUS';
  end if;

  insert into public.entity_workspace_revision (id, workspace_id, revision, updated_at)
  values (p_workspace_id, p_workspace_id, 0, v_now)
  on conflict (id) do nothing;

  select revision
    into v_workspace_revision
    from public.entity_workspace_revision
   where id = p_workspace_id
   for update;

  select m.*
    into v_existing_master
    from public.entity_master_staff m
   where m.workspace_id = p_workspace_id
     and (
       (v_requested_staff_id is not null and m.id = v_requested_staff_id)
       or coalesce(m.data ->> 'auth_user_id', '') = p_user_id::text
       or lower(coalesce(m.data ->> 'email', '')) = v_email
     )
   order by case
     when v_requested_staff_id is not null and m.id = v_requested_staff_id then 0
     when coalesce(m.data ->> 'auth_user_id', '') = p_user_id::text then 1
     else 2
   end
   limit 1
   for update;

  v_staff_id := coalesce(
    v_existing_master.id,
    v_requested_staff_id,
    'staff-auth-' || left(replace(p_user_id::text, '-', ''), 12)
  );
  v_code := coalesce(
    nullif(v_existing_master.data ->> 'code', ''),
    'AUTH-' || upper(left(replace(p_user_id::text, '-', ''), 8))
  );
  v_staff_status := case
    when p_status in ('rejected','inactive') then 'inactive'
    else p_status
  end;
  v_role_label := case p_role
    when 'OWNER' then 'Owner'
    when 'OPERATIONS_MANAGER' then 'Operations Manager'
    when 'FIELD_STAFF' then 'Field Staff'
    when 'SALES_TELECALLER' then 'Sales / Telecaller'
    when 'PROCUREMENT_STAFF' then 'Procurement Staff'
    when 'FINANCE' then 'Finance'
    when 'ACCOUNTS_ADMIN' then 'Accounts / Admin'
    else 'Staff'
  end;
  v_gps_enabled := case lower(coalesce(v_existing_master.data ->> 'gps_tracking_enabled', 'true'))
    when 'false' then false
    else true
  end;

  v_master_data :=
    jsonb_build_object(
      'phone','',
      'department','',
      'designation','',
      'salary_type','monthly',
      'attendance_policy', jsonb_build_object(
        'id','policy-' || v_staff_id,
        'grace_period_minutes',15,
        'late_grace_minutes',15,
        'absent_deduction_enabled',false,
        'absent_deduction_days',0
      )
    )
    || coalesce(v_existing_master.data, '{}'::jsonb)
    || jsonb_build_object(
      'id',v_staff_id,
      'code',v_code,
      'name',v_name,
      'email',v_email,
      'auth_user_id',p_user_id,
      'role',v_role_label,
      'role_key',p_role,
      'status',v_staff_status,
      'gps_tracking_enabled',v_gps_enabled,
      'login_enabled',p_status in ('pending','active'),
      'login_email',v_email,
      'created_at',coalesce(v_existing_master.data ->> 'created_at',v_now::text),
      'updated_at',v_now
    );

  insert into public.entity_master_staff (
    id, workspace_id, revision, updated_at, updated_by, data
  )
  values (
    v_staff_id,
    p_workspace_id,
    coalesce(v_existing_master.revision,-1)+1,
    v_now,
    'auth-system',
    v_master_data
  )
  on conflict (id) do update set
    workspace_id = excluded.workspace_id,
    revision = excluded.revision,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    data = excluded.data;

  v_next_workspace_revision := v_workspace_revision + 1;
  update public.entity_workspace_revision
     set revision = v_next_workspace_revision,
         updated_at = v_now
   where id = p_workspace_id;

  if p_assignment_id is null then
    insert into public.uc_user_roles (
      user_id, staff_id, status,
      approved_by, approved_at, rejected_at, created_at, updated_at
    )
    values (
      p_user_id, v_staff_id, p_status,
      case when p_status in ('active','rejected') then p_approved_by else null end,
      case when p_status = 'active' then coalesce(p_approved_at,v_now) else null end,
      case when p_status = 'rejected' then coalesce(p_rejected_at,v_now) else null end,
      v_now, v_now
    )
    returning * into v_role_row;
  else
    update public.uc_user_roles
       set user_id = p_user_id,
           staff_id = v_staff_id,
           status = p_status,
           approved_by = case when p_status in ('active','rejected') then p_approved_by else null end,
           approved_at = case when p_status = 'active' then coalesce(p_approved_at,v_now) else null end,
           rejected_at = case when p_status = 'rejected' then coalesce(p_rejected_at,v_now) else null end,
           updated_at = v_now
     where id = p_assignment_id
    returning * into v_role_row;

    if not found then
      raise exception using errcode = 'P0002', message = 'ROLE_ASSIGNMENT_NOT_FOUND';
    end if;
  end if;

  return jsonb_build_object(
    'assignment', to_jsonb(v_role_row),
    'staffId', v_staff_id,
    'workspaceRevision', v_next_workspace_revision
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uc_canonicalize_staff_assignment_payload(p_table_name text, p_workspace_id text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_reference text;
  v_staff_id text;
begin
  case p_table_name
    when 'entity_tasks' then
      if v_data ? 'assigned_staff_id' then
        v_reference := nullif(btrim(v_data ->> 'assigned_staff_id'), '');
      else
        v_reference := coalesce(
          nullif(btrim(v_data ->> 'assigned_to_staff_id'), ''),
          nullif(btrim(v_data ->> 'assignee_id'), ''),
          nullif(btrim(v_data ->> 'assignee_name'), ''),
          nullif(btrim(v_data ->> 'assigned_to'), '')
        );
      end if;

      v_staff_id := public.uc_resolve_staff_reference(p_workspace_id, v_reference);
      v_data := v_data - array['assigned_to_staff_id', 'assignee_id', 'assignee_name', 'assigned_to', 'assigned_role'];
      if v_staff_id is null then
        v_data := v_data - 'assigned_staff_id';
      else
        v_data := jsonb_set(v_data, '{assigned_staff_id}', to_jsonb(v_staff_id), true);
      end if;

    when 'entity_followups' then
      if v_data ? 'assigned_staff_id' then
        v_reference := nullif(btrim(v_data ->> 'assigned_staff_id'), '');
      else
        v_reference := coalesce(
          nullif(btrim(v_data ->> 'assigned_to_staff_id'), ''),
          nullif(btrim(v_data ->> 'assigned_to'), '')
        );
      end if;

      v_staff_id := public.uc_resolve_staff_reference(p_workspace_id, v_reference);
      v_data := v_data - array['assigned_to_staff_id', 'assigned_to', 'assigned_role'];
      if v_staff_id is null then
        v_data := v_data - 'assigned_staff_id';
      else
        v_data := jsonb_set(v_data, '{assigned_staff_id}', to_jsonb(v_staff_id), true);
      end if;

    when 'entity_visits' then
      if lower(btrim(coalesce(v_data ->> 'assignee_type', ''))) = 'contractor' then
        return v_data - array['assigned_staff_id', 'staff_id', 'staff_name'];
      end if;

      if v_data ? 'assigned_staff_id' then
        v_reference := nullif(btrim(v_data ->> 'assigned_staff_id'), '');
      else
        v_reference := coalesce(
          nullif(btrim(v_data ->> 'staff_id'), ''),
          nullif(btrim(v_data ->> 'staff_name'), '')
        );
      end if;

      v_staff_id := public.uc_resolve_staff_reference(p_workspace_id, v_reference);
      v_data := v_data - array['staff_id', 'staff_name'];
      if v_staff_id is null then
        v_data := v_data - 'assigned_staff_id';
      else
        v_data := jsonb_set(v_data, '{assigned_staff_id}', to_jsonb(v_staff_id), true);
        v_data := jsonb_set(v_data, '{assignee_type}', '"staff"'::jsonb, true);
      end if;

    when 'entity_recurringTasks' then
      if v_data ? 'assigned_staff_id' then
        v_reference := nullif(btrim(v_data ->> 'assigned_staff_id'), '');
      else
        v_reference := coalesce(
          nullif(btrim(v_data ->> 'assignee_id'), ''),
          nullif(btrim(v_data ->> 'assignee_name'), '')
        );
      end if;

      v_staff_id := public.uc_resolve_staff_reference(p_workspace_id, v_reference);
      v_data := v_data - array['assignee_id', 'assignee_name'];
      if v_staff_id is null then
        v_data := v_data - 'assigned_staff_id';
      else
        v_data := jsonb_set(v_data, '{assigned_staff_id}', to_jsonb(v_staff_id), true);
      end if;

    when 'entity_approvalPolicies' then
      if v_data ? 'approver_id' then
        v_reference := nullif(btrim(v_data ->> 'approver_id'), '');
      else
        v_reference := nullif(btrim(v_data ->> 'approver_name'), '');
      end if;

      v_staff_id := public.uc_resolve_staff_reference(p_workspace_id, v_reference);
      v_data := v_data - 'approver_name';
      if v_staff_id is null then
        v_data := v_data - 'approver_id';
      else
        v_data := jsonb_set(v_data, '{approver_id}', to_jsonb(v_staff_id), true);
      end if;

    else
      raise exception using
        errcode = '22023',
        message = format('UNSUPPORTED_STAFF_ASSIGNMENT_TABLE: %s', p_table_name);
  end case;

  return v_data;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uc_sanitize_workspace_staff_auth_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.data := coalesce(new.data, '{}'::jsonb)
    - 'temporary_password'
    - 'force_password_change';
  return new;
end;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.uc_normalize_staff_history_payload()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.data := coalesce(new.data, '{}'::jsonb) - 'staff_name';
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.uc_canonicalize_customer_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_type text;
  v_id text;
  v_name text;
  v_exists boolean;
begin
  if jsonb_typeof(new.data) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_DATA';
  end if;

  if new.data ? 'source_partner_id' or new.data ? 'source_partner_name' then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_LEGACY_REFERRER_FIELDS';
  end if;
  if new.data ? 'interest_category_ids' or new.data ? 'interest_work_subcategory_ids' then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_RETIRED_FIELDS';
  end if;

  new.data := jsonb_set(new.data, '{id}', to_jsonb(new.id), true);
  if coalesce(btrim(new.data->>'status'), '') = '' then
    new.data := jsonb_set(new.data, '{status}', '"active"'::jsonb, true);
  end if;

  v_type := nullif(btrim(new.data->>'referrer_type'), '');
  v_id := nullif(btrim(new.data->>'referrer_id'), '');
  v_name := nullif(btrim(new.data->>'referrer_name'), '');

  if v_type is null then
    if v_id is not null or v_name is not null then
      raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_PARTIAL';
    end if;
    new.data := new.data - 'referrer_type' - 'referrer_id' - 'referrer_name';
    return new;
  end if;

  if v_type not in ('customer','contractor','vendor','source_partner','external') then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_TYPE';
  end if;
  if v_name is null then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_NAME';
  end if;

  if v_type = 'external' then
    if v_id is not null then
      raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_EXTERNAL_REFERRER_ID';
    end if;
    new.data := (new.data - 'referrer_id')
      || jsonb_build_object('referrer_type', v_type, 'referrer_name', v_name);
    return new;
  end if;

  if v_id is null then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER_ID';
  end if;

  if v_type = 'customer' then
    select exists(
      select 1
      from public.entity_customers x
      where x.workspace_id = new.workspace_id
        and x.id = v_id
        and x.id <> new.id
    ) into v_exists;
  elsif v_type = 'contractor' then
    select exists(
      select 1 from public."entity_master_contractors" x
      where x.workspace_id = new.workspace_id and x.id = v_id
    ) into v_exists;
  elsif v_type = 'vendor' then
    select exists(
      select 1 from public."entity_master_vendors" x
      where x.workspace_id = new.workspace_id and x.id = v_id
    ) into v_exists;
  else
    select exists(
      select 1 from public."entity_master_sourcePartners" x
      where x.workspace_id = new.workspace_id and x.id = v_id
    ) into v_exists;
  end if;

  if not v_exists then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_REFERRER';
  end if;

  new.data := new.data
    || jsonb_build_object(
      'referrer_type', v_type,
      'referrer_id', v_id,
      'referrer_name', v_name
    );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uc_resolve_staff_reference(p_workspace_id text, p_reference text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_staff_id text;
  v_match_count integer;
begin
  if v_reference is null then
    return null;
  end if;

  select staff.id
    into v_staff_id
  from public.entity_master_staff as staff
  where staff.workspace_id = p_workspace_id
    and staff.id = v_reference
  limit 1;

  if v_staff_id is not null then
    return v_staff_id;
  end if;

  select count(*)::integer, min(staff.id)
    into v_match_count, v_staff_id
  from public.entity_master_staff as staff
  where staff.workspace_id = p_workspace_id
    and lower(btrim(coalesce(staff.data ->> 'name', ''))) = lower(v_reference);

  if v_match_count = 0 then
    raise exception using
      errcode = '23503',
      message = format('STAFF_ASSIGNMENT_UNKNOWN: %s', v_reference);
  end if;

  if v_match_count > 1 then
    raise exception using
      errcode = '21000',
      message = format('STAFF_ASSIGNMENT_AMBIGUOUS: %s', v_reference);
  end if;

  return v_staff_id;
end;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.uc_sanitize_workspace_operations(p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_op jsonb;
  v_row jsonb;
  v_upsert jsonb;
  v_output jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';
  end if;

  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    if v_op ->> 'collection' = 'master.staff' then
      v_upsert := '[]'::jsonb;
      for v_row in select value from jsonb_array_elements(coalesce(v_op -> 'upsert', '[]'::jsonb))
      loop
        v_upsert := v_upsert || jsonb_build_array(
          v_row - 'temporary_password' - 'force_password_change'
        );
      end loop;
      v_op := jsonb_set(v_op, '{upsert}', v_upsert, true);
    end if;
    v_output := v_output || jsonb_build_array(v_op);
  end loop;

  return v_output;
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
$function$
;

CREATE OR REPLACE FUNCTION public.uc_normalize_phone(raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select nullif(d3, '') from (
    select case
      when char_length(d2) = 11 and left(d2, 1) = '0' then substr(d2, 2)
      else d2
    end as d3
    from (
      select case
        when char_length(d1) = 12 and left(d1, 2) = '91' then substr(d1, 3)
        else d1
      end as d2
      from (
        select case when d0 like '00%' then substr(d0, 3) else d0 end as d1
        from (select regexp_replace(coalesce(raw, ''), '\D', '', 'g') as d0) s
      ) t1
    ) t2
  ) t3;
$function$
;

CREATE OR REPLACE FUNCTION private.uc_sync_customer_contact_identities()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE' then
    delete from private.customer_contact_identities
    where workspace_id = old.workspace_id and customer_id = old.id;
  end if;

  begin
    insert into private.customer_contact_identities(workspace_id, customer_id, identity_kind, identity_value)
    select distinct new.workspace_id, new.id, x.identity_kind, x.identity_value
    from (
      values
        ('phone'::text, public.uc_normalize_phone(new.data->>'phone')),
        ('phone'::text, public.uc_normalize_phone(new.data->>'whatsapp')),
        ('phone'::text, public.uc_normalize_phone(new.data->>'alternate_phone')),
        ('email'::text, nullif(lower(btrim(new.data->>'email')), ''))
    ) as x(identity_kind, identity_value)
    where x.identity_value is not null;
  exception when unique_violation then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_IDENTITY_DUPLICATE';
  end;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uc_sync_workspace_staff_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_new jsonb := coalesce(new.data, '{}'::jsonb);
  v_old jsonb := case
    when tg_op = 'UPDATE' then coalesce(old.data, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_name text := btrim(coalesce(v_new ->> 'name', ''));
  v_role_key text := upper(btrim(coalesce(v_new ->> 'role_key', 'FIELD_STAFF')));
  v_status text := lower(btrim(coalesce(v_new ->> 'status', 'active')));
  v_auth_user_text text := nullif(btrim(coalesce(v_new ->> 'auth_user_id', '')), '');
  v_old_auth_user_text text := nullif(btrim(coalesce(v_old ->> 'auth_user_id', '')), '');
  v_auth_user_id uuid;
  v_role_assignment_id uuid;
  v_role_status text;
  v_master_email text := lower(btrim(coalesce(v_new ->> 'email', '')));
  v_master_login_email text := lower(btrim(coalesce(v_new ->> 'login_email', '')));
  v_old_email text := lower(btrim(coalesce(v_old ->> 'email', '')));
  v_old_login_email text := lower(btrim(coalesce(v_old ->> 'login_email', '')));
  v_login_enabled boolean := lower(coalesce(v_new ->> 'login_enabled', 'false')) = 'true';
begin
  if current_setting('uc.write_source', true) is distinct from 'workspace-commit' then
    return new;
  end if;

  if v_name = '' then
    raise exception using errcode = '23514', message = 'STAFF_NAME_REQUIRED';
  end if;
  if v_role_key not in (
    'OWNER', 'OPERATIONS_MANAGER', 'FIELD_STAFF', 'SALES_TELECALLER',
    'PROCUREMENT_STAFF', 'FINANCE', 'ACCOUNTS_ADMIN'
  ) then
    raise exception using errcode = '23514', message = 'INVALID_STAFF_ROLE';
  end if;

  if tg_op = 'INSERT' and v_auth_user_text is not null then
    raise exception using errcode = '23514', message = 'STAFF_AUTH_LINK_MUST_USE_AUTH_FLOW';
  end if;
  if tg_op = 'UPDATE' and v_auth_user_text is distinct from v_old_auth_user_text then
    raise exception using errcode = '23514', message = 'STAFF_AUTH_LINK_MUST_USE_AUTH_FLOW';
  end if;
  if v_login_enabled and v_auth_user_text is null then
    raise exception using errcode = '23514', message = 'STAFF_LOGIN_MUST_USE_AUTH_FLOW';
  end if;

  if v_auth_user_text is null then
    return new;
  end if;
  if v_auth_user_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = '23514', message = 'INVALID_STAFF_AUTH_LINK';
  end if;
  v_auth_user_id := v_auth_user_text::uuid;

  if tg_op = 'UPDATE' then
    if v_master_email is distinct from v_old_email
       or v_master_login_email is distinct from v_old_login_email then
      raise exception using errcode = '23514', message = 'STAFF_LOGIN_EMAIL_MUST_USE_AUTH_FLOW';
    end if;
    if lower(coalesce(v_new ->> 'login_enabled', 'false'))
       is distinct from lower(coalesce(v_old ->> 'login_enabled', 'false')) then
      raise exception using errcode = '23514', message = 'STAFF_LOGIN_ACCESS_MUST_USE_AUTH_FLOW';
    end if;
  end if;

  select id, status
    into v_role_assignment_id, v_role_status
    from public.uc_user_roles
   where user_id = v_auth_user_id
      or staff_id = new.id
   order by case when staff_id = new.id then 0 else 1 end, updated_at desc
   limit 1
   for update;

  if v_role_assignment_id is null or v_role_status is null then
    raise exception using errcode = '23503', message = 'STAFF_ROLE_ASSIGNMENT_NOT_FOUND';
  end if;

  if v_role_status in ('pending', 'rejected') and tg_op = 'UPDATE' then
    if v_status is distinct from lower(coalesce(v_old ->> 'status', ''))
       or v_role_key is distinct from upper(coalesce(v_old ->> 'role_key', '')) then
      raise exception using errcode = '23514', message = 'STAFF_ACCESS_MUST_USE_AUTH_FLOW';
    end if;
  end if;

  if v_role_status in ('active', 'inactive') then
    update public.uc_user_roles
       set staff_id = new.id,
           status = case when v_status = 'active' then 'active' else 'inactive' end,
           updated_at = now()
     where id = v_role_assignment_id;
  else
    update public.uc_user_roles
       set staff_id = new.id,
           updated_at = now()
     where id = v_role_assignment_id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uc_is_canonical_indian_mobile(value text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select value is null
    or btrim(value) = ''
    or value ~ '^[6-9][0-9]{9}$';
$function$
;

CREATE OR REPLACE FUNCTION public.detach_staff_login_identity(p_assignment_id uuid, p_user_id uuid, p_workspace_id text, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role public.uc_user_roles%rowtype;
  v_staff public.entity_master_staff%rowtype;
  v_now timestamptz := now();
  v_workspace_revision bigint;
  v_next_workspace_revision bigint;
  v_data jsonb;
begin
  if p_assignment_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'MISSING_LOGIN_IDENTITY';
  end if;

  insert into public.entity_workspace_revision (id, workspace_id, revision, updated_at)
  values (p_workspace_id, p_workspace_id, 0, v_now)
  on conflict (id) do nothing;

  select revision
    into v_workspace_revision
    from public.entity_workspace_revision
   where id = p_workspace_id
   for update;

  select *
    into v_role
    from public.uc_user_roles
   where id = p_assignment_id
     and user_id = p_user_id
   for update;
  if not found or v_role.staff_id is null then
    raise exception using errcode = 'P0002', message = 'LOGIN_IDENTITY_NOT_FOUND';
  end if;

  select *
    into v_staff
    from public.entity_master_staff
   where workspace_id = p_workspace_id
     and id = v_role.staff_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CANONICAL_STAFF_NOT_FOUND';
  end if;

  if nullif(v_staff.data ->> 'auth_user_id', '') is not null
     and v_staff.data ->> 'auth_user_id' is distinct from p_user_id::text then
    raise exception using errcode = '23514', message = 'STAFF_LOGIN_IDENTITY_MISMATCH';
  end if;

  v_data := (v_staff.data - 'auth_user_id' - 'login_email' - 'temporary_password' - 'force_password_change')
    || jsonb_build_object(
      'login_enabled', false,
      'updated_at', v_now
    );

  update public.entity_master_staff
     set data = v_data,
         revision = revision + 1,
         updated_at = v_now,
         updated_by = nullif(btrim(coalesce(p_actor, '')), '')
   where id = v_staff.id
     and workspace_id = p_workspace_id;

  update public.uc_user_roles
     set status = 'inactive',
         approved_by = null,
         approved_at = null,
         updated_at = v_now
   where id = v_role.id;

  v_next_workspace_revision := v_workspace_revision + 1;
  update public.entity_workspace_revision
     set revision = v_next_workspace_revision,
         updated_at = v_now
   where id = p_workspace_id;

  return jsonb_build_object(
    'staffId', v_staff.id,
    'workspaceRevision', v_next_workspace_revision
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uc_taxonomy_reference_table(target_workspace_id text, target_id text, definition_table regclass, definition_id text)
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
        'select exists (select 1 from %s where workspace_id = $1 and id <> $3 and jsonb_path_exists(data, ''$.** ? (@ == $target)'', jsonb_build_object(''target'', to_jsonb($2))))',
        candidate.table_ref
      ) into found_reference using target_workspace_id, target_id, definition_id;
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
    referenced_by := public.uc_taxonomy_reference_table(old.workspace_id, old.id, tg_relid, old.id);
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
    referenced_by := public.uc_taxonomy_reference_table(old.workspace_id, old.id, tg_relid, old.id);
    if referenced_by is not null then
      raise exception 'Work subcategory % is still referenced by %. Archive it instead.', old.id, referenced_by using errcode = '23503';
    end if;
    return old;
  end if;

  category_id := nullif(btrim(new.data ->> 'category_id'), '');
  if category_id is null or not exists (
    select 1
    from public."entity_master_workCategories" category
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
      referenced_by := public.uc_taxonomy_reference_table(new.workspace_id, removed_work_type_id, tg_relid, new.id);
      if referenced_by is not null then
        raise exception 'Work type % is still referenced by %. Archive it instead.', removed_work_type_id, referenced_by using errcode = '23503';
      end if;
    end loop;
  end if;
  return new;
end;
$function$
;

ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "entity_acceptedScopes_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_auditLog" ADD CONSTRAINT "entity_auditLog_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_commSends" ADD CONSTRAINT "entity_commSends_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_entityFileAttachments" ADD CONSTRAINT "entity_entityFileAttachments_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_entityReferenceAssignments" ADD CONSTRAINT "entity_entityReferenceAssignments_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_executionLogs" ADD CONSTRAINT "entity_executionLogs_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_leaveRequests" ADD CONSTRAINT "entity_leaveRequests_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_articleVariants" ADD CONSTRAINT "entity_master_articleVariants_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "entity_master_catalogueArticleVendorLinks_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_areas ADD CONSTRAINT "entity_areas_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_attendance ADD CONSTRAINT "entity_attendance_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_commissions ADD CONSTRAINT "entity_commissions_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_customers ADD CONSTRAINT "entity_customers_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_dispatches ADD CONSTRAINT "entity_dispatches_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_drawings ADD CONSTRAINT "entity_drawings_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_followups ADD CONSTRAINT "entity_followups_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_grns ADD CONSTRAINT "entity_grns_pkey" PRIMARY KEY (id);

ALTER TABLE public.uc_upload_items ADD CONSTRAINT "uc_upload_items_size_bytes_check" CHECK ((size_bytes >= 0));

ALTER TABLE public.uc_upload_items ADD CONSTRAINT "uc_upload_items_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'preparing'::text, 'starting_session'::text, 'uploading'::text, 'paused'::text, 'uploaded_unverified'::text, 'verifying'::text, 'finalizing'::text, 'completed'::text, 'failed_permanent'::text, 'cancel_requested'::text, 'cleanup_pending'::text, 'cancelled'::text])));

ALTER TABLE public.uc_user_roles ADD CONSTRAINT "uc_user_roles_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_fileAssets" ADD CONSTRAINT "entity_master_fileAssets_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_sourcePartners" ADD CONSTRAINT "entity_master_sourcePartners_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_storageAccounts" ADD CONSTRAINT "entity_master_storageAccounts_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_storageFolderInstances" ADD CONSTRAINT "entity_master_storageFolderInstances_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_storageFolderTemplates" ADD CONSTRAINT "entity_master_storageFolderTemplates_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_subcategoryArticleMap" ADD CONSTRAINT "entity_master_subcategoryArticleMap_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_vendorRateHistories" ADD CONSTRAINT "entity_master_vendorRateHistories_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_inventory ADD CONSTRAINT "entity_inventory_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_master_articles ADD CONSTRAINT "entity_master_articles_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_master_contractors ADD CONSTRAINT "entity_master_contractors_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_master_staff ADD CONSTRAINT "entity_master_staff_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_master_staff ADD CONSTRAINT "entity_master_staff_workspace_id_id_key" UNIQUE (workspace_id, id);

ALTER TABLE public.entity_master_units ADD CONSTRAINT "entity_master_units_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_master_vendors ADD CONSTRAINT "entity_master_vendors_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_payments ADD CONSTRAINT "entity_payments_pkey" PRIMARY KEY (id);

ALTER TABLE public.uc_user_roles ADD CONSTRAINT "uc_user_roles_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'rejected'::text, 'inactive'::text])));

ALTER TABLE public.uc_workspace_operations ADD CONSTRAINT "uc_workspace_operations_status_check" CHECK ((status = ANY (ARRAY['processing'::text, 'applied'::text, 'conflict'::text, 'retryable'::text, 'failed'::text]))) NOT VALID;

ALTER TABLE public."entity_master_workCategories" ADD CONSTRAINT "entity_master_workCategories_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_workOptionGroups" ADD CONSTRAINT "entity_master_workOptionGroups_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_workOptionValues" ADD CONSTRAINT "entity_master_workOptionValues_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_master_workSubcategories" ADD CONSTRAINT "entity_master_workSubcategories_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_measurementRevisions" ADD CONSTRAINT "entity_measurementRevisions_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_payrollLines" ADD CONSTRAINT "entity_payrollLines_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_payrollPeriods" ADD CONSTRAINT "entity_payrollPeriods_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_recurringTasks" ADD CONSTRAINT "entity_recurringTasks_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_sites ADD CONSTRAINT "entity_sites_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_tasks ADD CONSTRAINT "entity_tasks_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_threads ADD CONSTRAINT "entity_threads_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_visits ADD CONSTRAINT "entity_visits_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_workspace_change_batches ADD CONSTRAINT "entity_workspace_change_batches_operations_check" CHECK ((jsonb_typeof(operations) = 'array'::text));

ALTER TABLE public.entity_workspace_change_batches ADD CONSTRAINT "entity_workspace_change_batches_pkey" PRIMARY KEY (workspace_id, revision);

ALTER TABLE public.entity_workspace_change_batches ADD CONSTRAINT "entity_workspace_change_batches_revision_check" CHECK ((revision >= 0));

ALTER TABLE public.entity_workspace_change_batches ADD CONSTRAINT "entity_workspace_change_batches_row_versions_check" CHECK ((jsonb_typeof(row_versions) = 'object'::text));

ALTER TABLE public.uc_workspace_operations ADD CONSTRAINT "uc_workspace_operations_attempt_count_check" CHECK ((attempt_count >= 0));

ALTER TABLE public.uc_workspace_operations ADD CONSTRAINT "uc_workspace_operations_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_salaryAdjustments" ADD CONSTRAINT "entity_salaryAdjustments_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_staffDocuments" ADD CONSTRAINT "entity_staffDocuments_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_staffRolePermissions" ADD CONSTRAINT "entity_staffRolePermissions_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_stockMovements" ADD CONSTRAINT "entity_stockMovements_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_variationRequests" ADD CONSTRAINT "entity_variationRequests_pkey" PRIMARY KEY (id);

ALTER TABLE public.entity_workspace_revision ADD CONSTRAINT "entity_workspace_revision_pkey" PRIMARY KEY (id);

ALTER TABLE public.schema_migrations ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY (version);

ALTER TABLE public.uc_drive_folders ADD CONSTRAINT "uc_drive_folders_pkey" PRIMARY KEY (folder_key);

ALTER TABLE public.uc_drive_folders ADD CONSTRAINT "uc_drive_folders_status_check" CHECK ((status = ANY (ARRAY['creating'::text, 'active'::text, 'stale'::text, 'error'::text]))) NOT VALID;

ALTER TABLE public.uc_drive_folders ADD CONSTRAINT "uc_drive_folders_storage_account_id_google_folder_id_key" UNIQUE (storage_account_id, google_folder_id);

ALTER TABLE public.uc_upload_batches ADD CONSTRAINT "uc_upload_batches_pkey" PRIMARY KEY (id);

ALTER TABLE public.uc_upload_batches ADD CONSTRAINT "uc_upload_batches_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'uploading'::text, 'waiting'::text, 'finalizing'::text, 'completed'::text, 'cancelled'::text, 'failed'::text]))) NOT VALID;

ALTER TABLE public.uc_upload_events ADD CONSTRAINT "uc_upload_events_pkey" PRIMARY KEY (id);

ALTER TABLE public.uc_upload_items ADD CONSTRAINT "uc_upload_items_attachment_mode_check" CHECK (((attachment_field_mode IS NULL) OR (attachment_field_mode = ANY (ARRAY['set'::text, 'append'::text])))) NOT VALID;

ALTER TABLE public.uc_upload_items ADD CONSTRAINT "uc_upload_items_confirmed_bytes_check" CHECK ((confirmed_bytes >= 0));

ALTER TABLE public."entity_workOrderCostLines" ADD CONSTRAINT "entity_workOrderCostLines_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "entity_workOrders_pkey" PRIMARY KEY (id);

ALTER TABLE public."entity_workRequired" ADD CONSTRAINT "entity_workRequired_pkey" PRIMARY KEY (id);

ALTER TABLE public."StaffRouteBundle" ADD CONSTRAINT "StaffRouteBundle_distanceM_check" CHECK (("distanceM" >= (0)::double precision));

ALTER TABLE public."StaffRouteBundle" ADD CONSTRAINT "StaffRouteBundle_pkey" PRIMARY KEY (id);

ALTER TABLE public."StaffRouteBundle" ADD CONSTRAINT "StaffRouteBundle_pointCount_check" CHECK ((("pointCount" >= 1) AND ("pointCount" <= 6000)));

ALTER TABLE public."StaffRouteBundle" ADD CONSTRAINT "StaffRouteBundle_time_order_check" CHECK (("endedAt" >= "startedAt"));

ALTER TABLE public.uc_upload_items ADD CONSTRAINT "uc_upload_items_confirmed_size_check" CHECK (((confirmed_bytes >= 0) AND (confirmed_bytes <= size_bytes))) NOT VALID;

ALTER TABLE public.uc_upload_items ADD CONSTRAINT "uc_upload_items_pkey" PRIMARY KEY (id);

ALTER TABLE public.uc_upload_items ADD CONSTRAINT "uc_upload_items_progress_check" CHECK (((progress >= 0) AND (progress <= 100))) NOT VALID;

ALTER TABLE public.uc_upload_items ADD CONSTRAINT "uc_upload_items_retry_count_check" CHECK ((retry_count >= 0));

ALTER TABLE public.uc_upload_items ADD CONSTRAINT "uc_upload_items_session_origin_http" CHECK (((session_origin IS NULL) OR (session_origin ~ '^https?://[^[:space:]]+$'::text)));

ALTER TABLE private.customer_contact_identities ADD CONSTRAINT "customer_contact_identities_identity_kind_check" CHECK ((identity_kind = ANY (ARRAY['phone'::text, 'email'::text])));

ALTER TABLE private.customer_contact_identities ADD CONSTRAINT "customer_contact_identities_pkey" PRIMARY KEY (workspace_id, customer_id, identity_kind, identity_value);

ALTER TABLE private.customer_contact_identities ADD CONSTRAINT "customer_contact_identities_unique_identity" UNIQUE (workspace_id, identity_kind, identity_value);

ALTER TABLE public.entity_customers ADD CONSTRAINT "entity_customers_data_shape_chk" CHECK (((jsonb_typeof(data) = 'object'::text) AND ((data ->> 'id'::text) = id) AND (COALESCE(btrim((data ->> 'name'::text)), ''::text) <> ''::text) AND ((data ->> 'status'::text) = ANY (ARRAY['active'::text, 'inactive'::text, 'blocked'::text])) AND ((NULLIF(btrim((data ->> 'phone'::text)), ''::text) IS NULL) OR (uc_normalize_phone((data ->> 'phone'::text)) ~ '^[6-9][0-9]{9}$'::text)) AND ((NULLIF(btrim((data ->> 'whatsapp'::text)), ''::text) IS NULL) OR (uc_normalize_phone((data ->> 'whatsapp'::text)) ~ '^[6-9][0-9]{9}$'::text)) AND ((NULLIF(btrim((data ->> 'alternate_phone'::text)), ''::text) IS NULL) OR (uc_normalize_phone((data ->> 'alternate_phone'::text)) ~ '^[6-9][0-9]{9}$'::text)) AND ((NULLIF(btrim((data ->> 'email'::text)), ''::text) IS NULL) OR (POSITION(('@'::text) IN ((data ->> 'email'::text))) > 1)) AND (NOT (data ? 'interest_category_ids'::text)) AND (NOT (data ? 'interest_work_subcategory_ids'::text)) AND (NOT (data ? 'source_partner_id'::text)) AND (NOT (data ? 'source_partner_name'::text)) AND (((NULLIF(btrim((data ->> 'referrer_type'::text)), ''::text) IS NULL) AND (NULLIF(btrim((data ->> 'referrer_id'::text)), ''::text) IS NULL) AND (NULLIF(btrim((data ->> 'referrer_name'::text)), ''::text) IS NULL)) OR (((data ->> 'referrer_type'::text) = ANY (ARRAY['customer'::text, 'contractor'::text, 'vendor'::text, 'source_partner'::text, 'external'::text])) AND (NULLIF(btrim((data ->> 'referrer_name'::text)), ''::text) IS NOT NULL) AND ((((data ->> 'referrer_type'::text) = 'external'::text) AND (NULLIF(btrim((data ->> 'referrer_id'::text)), ''::text) IS NULL)) OR (((data ->> 'referrer_type'::text) <> 'external'::text) AND (NULLIF(btrim((data ->> 'referrer_id'::text)), ''::text) IS NOT NULL)))))));

ALTER TABLE public.uc_whatsapp_accounts ADD CONSTRAINT "uc_whatsapp_accounts_status_check" CHECK ((status = ANY (ARRAY['disconnected'::text, 'pairing'::text, 'connecting'::text, 'connected'::text, 'degraded'::text, 'logged_out'::text, 'error'::text])));

ALTER TABLE public.uc_whatsapp_accounts ADD CONSTRAINT "uc_whatsapp_accounts_pkey" PRIMARY KEY (workspace_id);

ALTER TABLE public.uc_whatsapp_auth_state ADD CONSTRAINT "uc_whatsapp_auth_state_pkey" PRIMARY KEY (workspace_id, auth_key);

ALTER TABLE public.uc_whatsapp_messages ADD CONSTRAINT "uc_whatsapp_messages_direction_check" CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])));

ALTER TABLE public.uc_whatsapp_messages ADD CONSTRAINT "uc_whatsapp_messages_status_check" CHECK ((status = ANY (ARRAY['received'::text, 'queued'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])));

ALTER TABLE public.uc_whatsapp_messages ADD CONSTRAINT "uc_whatsapp_messages_pkey" PRIMARY KEY (id);

ALTER TABLE public.uc_google_drive_credentials ADD CONSTRAINT "uc_google_drive_credentials_pkey" PRIMARY KEY (storage_account_id);

ALTER TABLE public."entity_workOrderCostLines" ADD CONSTRAINT "graph_workOrderCostLines_work_order_id_required" CHECK (((work_order_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL)));

ALTER TABLE public.entity_grns ADD CONSTRAINT "graph_grns_po_id_required" CHECK (((po_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL)));

ALTER TABLE public.entity_grns ADD CONSTRAINT "graph_grns_vendor_id_required" CHECK (((vendor_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL)));

ALTER TABLE public.entity_customers ADD CONSTRAINT "entity_customers_indian_mobile_chk" CHECK ((uc_is_canonical_indian_mobile((data ->> 'phone'::text)) AND uc_is_canonical_indian_mobile((data ->> 'whatsapp'::text)) AND uc_is_canonical_indian_mobile((data ->> 'alternate_phone'::text))));

ALTER TABLE public.entity_master_vendors ADD CONSTRAINT "entity_master_vendors_indian_mobile_chk" CHECK (uc_is_canonical_indian_mobile((data ->> 'phone'::text)));

ALTER TABLE public.entity_master_contractors ADD CONSTRAINT "entity_master_contractors_indian_mobile_chk" CHECK ((uc_is_canonical_indian_mobile((data ->> 'phone'::text)) AND uc_is_canonical_indian_mobile((data ->> 'alternate_phone'::text))));

ALTER TABLE public.entity_master_staff ADD CONSTRAINT "entity_master_staff_indian_mobile_chk" CHECK ((uc_is_canonical_indian_mobile((data ->> 'phone'::text)) AND uc_is_canonical_indian_mobile((data ->> 'emergency_contact'::text))));

ALTER TABLE public."entity_master_sourcePartners" ADD CONSTRAINT "entity_master_source_partners_indian_mobile_chk" CHECK (uc_is_canonical_indian_mobile((data ->> 'phone'::text)));

ALTER TABLE public."entity_workRequired" ADD CONSTRAINT "entity_workrequired_data_shape_chk" CHECK (((jsonb_typeof(data) = 'object'::text) AND ((data ->> 'id'::text) = id) AND (COALESCE(btrim((data ->> 'customer_id'::text)), ''::text) <> ''::text) AND (COALESCE(btrim((data ->> 'title'::text)), ''::text) <> ''::text) AND (((data -> 'area_ids'::text) IS NULL) OR (jsonb_typeof((data -> 'area_ids'::text)) = 'array'::text)) AND (jsonb_typeof((data -> 'work_subcategory_ids'::text)) = 'array'::text) AND (jsonb_typeof((data -> 'work_type_ids'::text)) = 'array'::text) AND (((jsonb_array_length((data -> 'work_subcategory_ids'::text)) = 0) AND (jsonb_array_length((data -> 'work_type_ids'::text)) = 0)) OR ((jsonb_array_length((data -> 'work_subcategory_ids'::text)) > 0) AND (jsonb_array_length((data -> 'work_type_ids'::text)) > 0)))));

ALTER TABLE public.entity_tasks ADD CONSTRAINT "entity_tasks_recovery_source_required" CHECK (((COALESCE((data ->> 'task_type'::text), ''::text) <> 'followup_recovery'::text) OR (source_followup_id_gen IS NOT NULL)));

ALTER TABLE public.entity_commercial_documents ADD CONSTRAINT "entity_commercial_documents_collection_check" CHECK ((collection = ANY (ARRAY['quotations'::text, 'boqs'::text, 'vendorRfqs'::text, 'vendorBids'::text, 'contractorBids'::text, 'purchaseOrders'::text, 'contractorSettlements'::text])));

ALTER TABLE public.entity_commercial_documents ADD CONSTRAINT "entity_commercial_documents_pkey" PRIMARY KEY (collection, id);

ALTER TABLE public.entity_commercial_documents ADD CONSTRAINT "sd_881205dc4e8b31a5c78f" CHECK (((collection <> 'purchaseOrders'::text) OR ((vendor_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "entity_financial_documents_collection_check" CHECK ((collection = ANY (ARRAY['invoices'::text, 'vendorBills'::text, 'contractorBills'::text])));

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "entity_financial_documents_pkey" PRIMARY KEY (collection, id);

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_e7bed771b9ef40dcdb2f" CHECK (((collection <> 'vendorBills'::text) OR ((grn_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_c2f6536cd3afa378b54e" CHECK (((collection <> 'vendorBills'::text) OR ((po_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_24d327676a0423f43fbd" CHECK (((collection <> 'vendorBills'::text) OR ((vendor_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_453618a58a3c3f03d926" CHECK (((collection <> 'contractorBills'::text) OR ((contractor_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_f21b1997b4c353be3f83" CHECK (((collection <> 'contractorBills'::text) OR ((work_order_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "entity_money_movements_collection_check" CHECK ((collection = ANY (ARRAY['customerReceipts'::text, 'vendorPayments'::text, 'contractorPayments'::text])));

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "entity_money_movements_pkey" PRIMARY KEY (collection, id);

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_3a355ebb6c3204d27e16" CHECK (((collection <> 'customerReceipts'::text) OR ((invoice_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_794e1ee22d9fbc57a543" CHECK (((collection <> 'vendorPayments'::text) OR ((vendor_bill_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_f6a7812f9422a3b1d9f4" CHECK (((collection <> 'vendorPayments'::text) OR ((vendor_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_1598d6d8df79ace7a23f" CHECK (((collection <> 'contractorPayments'::text) OR ((contractor_bill_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_81ff36d0eba37081f74c" CHECK (((collection <> 'contractorPayments'::text) OR ((contractor_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_49bff6d1c87f44669243" CHECK (((collection <> 'contractorPayments'::text) OR ((site_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_e7c5b2a0a229304cf8ef" CHECK (((collection <> 'contractorPayments'::text) OR ((work_order_id_gen IS NOT NULL) AND (workspace_id IS NOT NULL))));

ALTER TABLE public.entity_commercial_settings ADD CONSTRAINT "entity_commercial_settings_collection_check" CHECK ((collection = ANY (ARRAY['commercialTerms'::text, 'paymentTermTemplates'::text, 'taxConfigs'::text, 'validityConfigs'::text])));

ALTER TABLE public.entity_commercial_settings ADD CONSTRAINT "entity_commercial_settings_pkey" PRIMARY KEY (collection, id);

ALTER TABLE public.entity_workflow_controls ADD CONSTRAINT "entity_workflow_controls_collection_check" CHECK ((collection = ANY (ARRAY['actions'::text, 'risks'::text, 'blocked'::text])));

ALTER TABLE public.entity_workflow_controls ADD CONSTRAINT "entity_workflow_controls_pkey" PRIMARY KEY (collection, id);

ALTER TABLE public.entity_reference_libraries ADD CONSTRAINT "entity_reference_libraries_collection_check" CHECK ((collection = ANY (ARRAY['master.catalogues'::text, 'master.pinterestBoards'::text, 'master.referenceMedia'::text])));

ALTER TABLE public.entity_reference_libraries ADD CONSTRAINT "entity_reference_libraries_pkey" PRIMARY KEY (collection, id);

ALTER TABLE public.entity_rate_cards ADD CONSTRAINT "entity_rate_cards_collection_check" CHECK ((collection = ANY (ARRAY['master.vendorRates'::text, 'master.contractorRates'::text, 'master.customerRateSuggestions'::text])));

ALTER TABLE public.entity_rate_cards ADD CONSTRAINT "entity_rate_cards_pkey" PRIMARY KEY (collection, id);

ALTER TABLE public.entity_policy_rules ADD CONSTRAINT "entity_policy_rules_collection_check" CHECK ((collection = ANY (ARRAY['approvalPolicies'::text, 'automationRules'::text, 'master.commissionRules'::text])));

ALTER TABLE public.entity_policy_rules ADD CONSTRAINT "entity_policy_rules_pkey" PRIMARY KEY (collection, id);

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_f0c97f16f3b5a5b22514" UNIQUE (collection, workspace_id, id, contractor_id_gen, work_order_id_gen, site_id_gen);

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_6de6c5a4d6b8e0f3b1c9" UNIQUE (collection, workspace_id, id);

ALTER TABLE public.entity_commercial_documents ADD CONSTRAINT "sd_44ff63571de21bad4b16" UNIQUE (collection, workspace_id, id);

ALTER TABLE public.entity_commercial_documents ADD CONSTRAINT "sd_6738a8385e3adc04e1b2" UNIQUE (collection, workspace_id, id, vendor_id_gen);

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_2dfd968c957f422c78a6" UNIQUE (collection, workspace_id, id, vendor_id_gen);

CREATE INDEX entity_areas_updated_idx ON public.entity_areas USING btree (updated_at DESC);

CREATE INDEX entity_areas_workspace_idx ON public.entity_areas USING btree (workspace_id);

CREATE INDEX entity_areas_site_id_idx ON public.entity_areas USING btree (site_id_gen, workspace_id);

CREATE INDEX uc_upload_events_item_idx ON public.uc_upload_events USING btree (upload_item_id, created_at DESC);

CREATE INDEX "entity_entityReferenceAssignments_updated_idx" ON public."entity_entityReferenceAssignments" USING btree (updated_at DESC);

CREATE INDEX "entity_entityReferenceAssignments_workspace_idx" ON public."entity_entityReferenceAssignments" USING btree (workspace_id);

CREATE INDEX "entity_entityReferenceAssignments_customer_id_idx" ON public."entity_entityReferenceAssignments" USING btree (customer_id_gen, workspace_id);

CREATE INDEX "entity_entityReferenceAssignments_site_id_idx" ON public."entity_entityReferenceAssignments" USING btree (site_id_gen, workspace_id);

CREATE INDEX entity_dispatches_updated_idx ON public.entity_dispatches USING btree (updated_at DESC);

CREATE INDEX entity_dispatches_workspace_idx ON public.entity_dispatches USING btree (workspace_id);

CREATE INDEX entity_drawings_updated_idx ON public.entity_drawings USING btree (updated_at DESC);

CREATE INDEX entity_drawings_workspace_idx ON public.entity_drawings USING btree (workspace_id);

CREATE INDEX "entity_entityFileAttachments_updated_idx" ON public."entity_entityFileAttachments" USING btree (updated_at DESC);

CREATE INDEX "entity_entityFileAttachments_workspace_idx" ON public."entity_entityFileAttachments" USING btree (workspace_id);

CREATE INDEX "entity_executionLogs_updated_idx" ON public."entity_executionLogs" USING btree (updated_at DESC);

CREATE INDEX "entity_executionLogs_workspace_idx" ON public."entity_executionLogs" USING btree (workspace_id);

CREATE INDEX uc_whatsapp_auth_state_workspace_idx ON public.uc_whatsapp_auth_state USING btree (workspace_id);

CREATE UNIQUE INDEX uc_whatsapp_messages_provider_unique ON public.uc_whatsapp_messages USING btree (workspace_id, direction, provider_message_id) WHERE (provider_message_id IS NOT NULL);

CREATE INDEX uc_whatsapp_messages_customer_created_idx ON public.uc_whatsapp_messages USING btree (customer_id, created_at DESC);

CREATE INDEX uc_whatsapp_messages_workspace_created_idx ON public.uc_whatsapp_messages USING btree (workspace_id, created_at DESC);

CREATE UNIQUE INDEX uc_whatsapp_messages_outbound_comm_send_unique ON public.uc_whatsapp_messages USING btree (workspace_id, comm_send_id) WHERE ((direction = 'outbound'::text) AND (comm_send_id IS NOT NULL));

CREATE INDEX uc_whatsapp_messages_comm_send_idx ON public.uc_whatsapp_messages USING btree (comm_send_id);

CREATE INDEX uc_workspace_operations_created_by_idx ON public.uc_workspace_operations USING btree (created_by_user_id, created_at DESC);

CREATE INDEX uc_workspace_operations_status_idx ON public.uc_workspace_operations USING btree (workspace_id, status, updated_at DESC);

CREATE INDEX entity_master_contractors_updated_idx ON public.entity_master_contractors USING btree (updated_at DESC);

CREATE INDEX entity_master_contractors_workspace_idx ON public.entity_master_contractors USING btree (workspace_id);

CREATE UNIQUE INDEX entity_master_contractors_workspace_identity ON public.entity_master_contractors USING btree (workspace_id, id);

CREATE INDEX "entity_master_articleVariants_updated_idx" ON public."entity_master_articleVariants" USING btree (updated_at DESC);

CREATE INDEX "entity_master_articleVariants_workspace_idx" ON public."entity_master_articleVariants" USING btree (workspace_id);

CREATE INDEX entity_master_articles_updated_idx ON public.entity_master_articles USING btree (updated_at DESC);

CREATE INDEX entity_master_articles_workspace_idx ON public.entity_master_articles USING btree (workspace_id);

CREATE INDEX "entity_master_catalogueArticleVendorLinks_updated_idx" ON public."entity_master_catalogueArticleVendorLinks" USING btree (updated_at DESC);

CREATE INDEX "entity_master_catalogueArticleVendorLinks_workspace_idx" ON public."entity_master_catalogueArticleVendorLinks" USING btree (workspace_id);

CREATE INDEX "entity_master_fileAssets_updated_idx" ON public."entity_master_fileAssets" USING btree (updated_at DESC);

CREATE INDEX "entity_master_fileAssets_workspace_idx" ON public."entity_master_fileAssets" USING btree (workspace_id);

CREATE INDEX entity_workspace_change_batches_baseline_idx ON public.entity_workspace_change_batches USING btree (workspace_id, revision DESC) WHERE is_baseline;

CREATE INDEX entity_master_staff_revision_idx ON public.entity_master_staff USING btree (revision);

CREATE INDEX entity_master_staff_workspace_idx ON public.entity_master_staff USING btree (workspace_id);

CREATE UNIQUE INDEX entity_master_staff_workspace_auth_user_idx ON public.entity_master_staff USING btree (workspace_id, auth_user_id_gen) WHERE (auth_user_id_gen IS NOT NULL);

CREATE INDEX "entity_master_sourcePartners_updated_idx" ON public."entity_master_sourcePartners" USING btree (updated_at DESC);

CREATE INDEX "entity_master_sourcePartners_workspace_idx" ON public."entity_master_sourcePartners" USING btree (workspace_id);

CREATE INDEX "entity_master_storageAccounts_updated_idx" ON public."entity_master_storageAccounts" USING btree (updated_at DESC);

CREATE INDEX "entity_master_storageAccounts_workspace_idx" ON public."entity_master_storageAccounts" USING btree (workspace_id);

CREATE INDEX "entity_master_storageFolderInstances_updated_idx" ON public."entity_master_storageFolderInstances" USING btree (updated_at DESC);

CREATE INDEX "entity_master_storageFolderInstances_workspace_idx" ON public."entity_master_storageFolderInstances" USING btree (workspace_id);

CREATE INDEX "entity_master_storageFolderTemplates_updated_idx" ON public."entity_master_storageFolderTemplates" USING btree (updated_at DESC);

CREATE INDEX "entity_master_storageFolderTemplates_workspace_idx" ON public."entity_master_storageFolderTemplates" USING btree (workspace_id);

CREATE INDEX "entity_master_subcategoryArticleMap_updated_idx" ON public."entity_master_subcategoryArticleMap" USING btree (updated_at DESC);

CREATE INDEX "entity_master_subcategoryArticleMap_workspace_idx" ON public."entity_master_subcategoryArticleMap" USING btree (workspace_id);

CREATE INDEX entity_master_units_updated_idx ON public.entity_master_units USING btree (updated_at DESC);

CREATE INDEX entity_master_units_workspace_idx ON public.entity_master_units USING btree (workspace_id);

CREATE INDEX "entity_master_vendorRateHistories_updated_idx" ON public."entity_master_vendorRateHistories" USING btree (updated_at DESC);

CREATE INDEX "entity_master_vendorRateHistories_workspace_idx" ON public."entity_master_vendorRateHistories" USING btree (workspace_id);

CREATE INDEX entity_master_vendors_updated_idx ON public.entity_master_vendors USING btree (updated_at DESC);

CREATE INDEX entity_master_vendors_workspace_idx ON public.entity_master_vendors USING btree (workspace_id);

CREATE UNIQUE INDEX entity_master_vendors_workspace_identity ON public.entity_master_vendors USING btree (workspace_id, id);

CREATE INDEX "entity_master_workCategories_updated_idx" ON public."entity_master_workCategories" USING btree (updated_at DESC);

CREATE INDEX "entity_master_workCategories_workspace_idx" ON public."entity_master_workCategories" USING btree (workspace_id);

CREATE INDEX "entity_master_workSubcategories_updated_idx" ON public."entity_master_workSubcategories" USING btree (updated_at DESC);

CREATE INDEX "entity_master_workSubcategories_workspace_idx" ON public."entity_master_workSubcategories" USING btree (workspace_id);

CREATE INDEX sd_9740a8dc6781d7818a57 ON public.entity_commercial_settings USING btree (updated_at DESC) WHERE (collection = 'commercialTerms'::text);

CREATE INDEX sd_cffe3b2eb89a29e79ade ON public.entity_commercial_settings USING btree (workspace_id) WHERE (collection = 'commercialTerms'::text);

CREATE INDEX sd_88692193a1d662b3125d ON public.entity_commercial_settings USING btree (workspace_id) WHERE (collection = 'paymentTermTemplates'::text);

CREATE INDEX sd_85dcac9404d01b9b78a1 ON public.entity_commercial_settings USING btree (updated_at DESC) WHERE (collection = 'paymentTermTemplates'::text);

CREATE INDEX sd_08ba66a1757517beba45 ON public.entity_commercial_settings USING btree (updated_at DESC) WHERE (collection = 'taxConfigs'::text);

CREATE INDEX sd_108b26385d1f72d1b292 ON public.entity_commercial_settings USING btree (workspace_id) WHERE (collection = 'taxConfigs'::text);

CREATE INDEX sd_d86f7e03bb26c7bc09ae ON public.entity_commercial_settings USING btree (updated_at DESC) WHERE (collection = 'validityConfigs'::text);

CREATE INDEX sd_2319b4eb2aa4ef53a7d4 ON public.entity_commercial_settings USING btree (workspace_id) WHERE (collection = 'validityConfigs'::text);

CREATE INDEX "entity_master_workOptionGroups_updated_idx" ON public."entity_master_workOptionGroups" USING btree (updated_at DESC);

CREATE INDEX "entity_master_workOptionGroups_workspace_idx" ON public."entity_master_workOptionGroups" USING btree (workspace_id);

CREATE INDEX "entity_master_workOptionValues_updated_idx" ON public."entity_master_workOptionValues" USING btree (updated_at DESC);

CREATE INDEX "entity_master_workOptionValues_workspace_idx" ON public."entity_master_workOptionValues" USING btree (workspace_id);

CREATE INDEX "entity_measurementRevisions_updated_idx" ON public."entity_measurementRevisions" USING btree (updated_at DESC);

CREATE INDEX "entity_measurementRevisions_workspace_idx" ON public."entity_measurementRevisions" USING btree (workspace_id);

CREATE INDEX "entity_payrollLines_updated_idx" ON public."entity_payrollLines" USING btree (updated_at DESC);

CREATE INDEX "entity_payrollLines_workspace_idx" ON public."entity_payrollLines" USING btree (workspace_id);

CREATE INDEX entity_payroll_lines_staff_idx ON public."entity_payrollLines" USING btree (workspace_id, staff_id) WHERE (staff_id IS NOT NULL);

CREATE INDEX uc_upload_items_batch_status_idx ON public.uc_upload_items USING btree (batch_id, status, updated_at DESC);

CREATE INDEX uc_upload_items_fingerprint_sha256_idx ON public.uc_upload_items USING btree (workspace_id, fingerprint_sha256, size_bytes) WHERE (fingerprint_sha256 IS NOT NULL);

CREATE INDEX uc_upload_items_retry_idx ON public.uc_upload_items USING btree (status, retry_at) WHERE (status = 'paused'::text);

CREATE INDEX uc_upload_items_session_idx ON public.uc_upload_items USING btree (status, session_expires_at) WHERE (session_uri IS NOT NULL);

CREATE INDEX uc_upload_items_target_idx ON public.uc_upload_items USING btree (workspace_id, target_entity_type, target_entity_id, updated_at DESC);

CREATE UNIQUE INDEX uc_upload_items_attachment_unique ON public.uc_upload_items USING btree (attachment_id) WHERE (attachment_id IS NOT NULL);

CREATE UNIQUE INDEX uc_upload_items_file_asset_unique ON public.uc_upload_items USING btree (file_asset_id) WHERE (file_asset_id IS NOT NULL);

CREATE UNIQUE INDEX uc_upload_items_google_file_unique ON public.uc_upload_items USING btree (storage_account_id, google_file_id) WHERE (google_file_id IS NOT NULL);

CREATE INDEX sd_e9510c715d44cbd3772d ON public.entity_reference_libraries USING btree (updated_at DESC) WHERE (collection = 'master.catalogues'::text);

CREATE INDEX sd_2adb8154730470076864 ON public.entity_reference_libraries USING btree (workspace_id) WHERE (collection = 'master.catalogues'::text);

CREATE INDEX sd_af2cce982c22395eda85 ON public.entity_reference_libraries USING btree (updated_at DESC) WHERE (collection = 'master.pinterestBoards'::text);

CREATE INDEX sd_c59e70bea508bec23fce ON public.entity_reference_libraries USING btree (workspace_id) WHERE (collection = 'master.pinterestBoards'::text);

CREATE INDEX sd_b09f865acd3f11bd97c4 ON public.entity_reference_libraries USING btree (updated_at DESC) WHERE (collection = 'master.referenceMedia'::text);

CREATE INDEX sd_62e93ea63e543fd95e72 ON public.entity_reference_libraries USING btree (workspace_id) WHERE (collection = 'master.referenceMedia'::text);

CREATE INDEX "entity_salaryAdjustments_updated_idx" ON public."entity_salaryAdjustments" USING btree (updated_at DESC);

CREATE INDEX "entity_salaryAdjustments_workspace_idx" ON public."entity_salaryAdjustments" USING btree (workspace_id);

CREATE INDEX entity_salary_adjustments_staff_idx ON public."entity_salaryAdjustments" USING btree (workspace_id, staff_id) WHERE (staff_id IS NOT NULL);

CREATE INDEX "graph_salaryAdjustments_work_order_id_idx" ON public."entity_salaryAdjustments" USING btree (workspace_id, work_order_id_gen);

CREATE INDEX entity_sites_updated_idx ON public.entity_sites USING btree (updated_at DESC);

CREATE INDEX entity_sites_workspace_idx ON public.entity_sites USING btree (workspace_id);

CREATE INDEX entity_sites_customer_id_idx ON public.entity_sites USING btree (customer_id_gen, workspace_id);

CREATE UNIQUE INDEX entity_sites_workspace_identity ON public.entity_sites USING btree (workspace_id, id);

CREATE INDEX sd_8a6134d137d92ab2b3a2 ON public.entity_rate_cards USING btree (updated_at DESC) WHERE (collection = 'master.contractorRates'::text);

CREATE INDEX sd_de5633987d00428bc522 ON public.entity_rate_cards USING btree (workspace_id) WHERE (collection = 'master.contractorRates'::text);

CREATE INDEX sd_f8f7407ffd9a0f8eedb0 ON public.entity_rate_cards USING btree (workspace_id, ((data ->> 'contractor_id'::text)), ((data ->> 'work_subcategory_id'::text))) WHERE (collection = 'master.contractorRates'::text);

CREATE INDEX sd_75857520dddc7ec94741 ON public.entity_rate_cards USING btree (updated_at DESC) WHERE (collection = 'master.customerRateSuggestions'::text);

CREATE INDEX sd_aa7491510fbfc18182dd ON public.entity_rate_cards USING btree (workspace_id) WHERE (collection = 'master.customerRateSuggestions'::text);

CREATE INDEX sd_90ed56a624d8af1ba7ab ON public.entity_rate_cards USING btree (updated_at DESC) WHERE (collection = 'master.vendorRates'::text);

CREATE INDEX sd_fa70ab663665b35d96df ON public.entity_rate_cards USING btree (workspace_id) WHERE (collection = 'master.vendorRates'::text);

CREATE INDEX "entity_recurringTasks_updated_idx" ON public."entity_recurringTasks" USING btree (updated_at DESC);

CREATE INDEX "entity_recurringTasks_workspace_idx" ON public."entity_recurringTasks" USING btree (workspace_id);

CREATE INDEX entity_recurring_tasks_assigned_staff_idx ON public."entity_recurringTasks" USING btree (workspace_id, assigned_staff_id) WHERE (assigned_staff_id IS NOT NULL);

CREATE INDEX "entity_staffDocuments_updated_idx" ON public."entity_staffDocuments" USING btree (updated_at DESC);

CREATE INDEX "entity_staffDocuments_workspace_idx" ON public."entity_staffDocuments" USING btree (workspace_id);

CREATE INDEX "entity_staffRolePermissions_updated_idx" ON public."entity_staffRolePermissions" USING btree (updated_at DESC);

CREATE INDEX "entity_staffRolePermissions_workspace_idx" ON public."entity_staffRolePermissions" USING btree (workspace_id);

CREATE INDEX "entity_stockMovements_updated_idx" ON public."entity_stockMovements" USING btree (updated_at DESC);

CREATE INDEX "entity_stockMovements_workspace_idx" ON public."entity_stockMovements" USING btree (workspace_id);

CREATE INDEX "entity_variationRequests_updated_idx" ON public."entity_variationRequests" USING btree (updated_at DESC);

CREATE INDEX "entity_variationRequests_workspace_idx" ON public."entity_variationRequests" USING btree (workspace_id);

CREATE INDEX "entity_variationRequests_customer_id_idx" ON public."entity_variationRequests" USING btree (customer_id_gen, workspace_id);

CREATE INDEX "entity_variationRequests_site_id_idx" ON public."entity_variationRequests" USING btree (site_id_gen, workspace_id);

CREATE INDEX entity_threads_updated_idx ON public.entity_threads USING btree (updated_at DESC);

CREATE INDEX entity_threads_workspace_idx ON public.entity_threads USING btree (workspace_id);

CREATE UNIQUE INDEX uc_google_drive_credentials_google_account_uidx ON public.uc_google_drive_credentials USING btree (google_account_id) WHERE (google_account_id IS NOT NULL);

CREATE INDEX uc_user_roles_approved_by_idx ON public.uc_user_roles USING btree (approved_by) WHERE (approved_by IS NOT NULL);

CREATE UNIQUE INDEX uc_user_roles_one_active_role ON public.uc_user_roles USING btree (user_id) WHERE (status = 'active'::text);

CREATE UNIQUE INDEX uc_user_roles_one_open_request ON public.uc_user_roles USING btree (user_id) WHERE (status = ANY (ARRAY['pending'::text, 'active'::text]));

CREATE INDEX uc_user_roles_staff_id_idx ON public.uc_user_roles USING btree (staff_id);

CREATE INDEX entity_inventory_updated_idx ON public.entity_inventory USING btree (updated_at DESC);

CREATE INDEX entity_inventory_workspace_idx ON public.entity_inventory USING btree (workspace_id);

CREATE INDEX "entity_leaveRequests_updated_idx" ON public."entity_leaveRequests" USING btree (updated_at DESC);

CREATE INDEX "entity_leaveRequests_workspace_idx" ON public."entity_leaveRequests" USING btree (workspace_id);

CREATE INDEX entity_leave_requests_staff_idx ON public."entity_leaveRequests" USING btree (workspace_id, staff_id) WHERE (staff_id IS NOT NULL);

CREATE INDEX "entity_payrollPeriods_updated_idx" ON public."entity_payrollPeriods" USING btree (updated_at DESC);

CREATE INDEX "entity_payrollPeriods_workspace_idx" ON public."entity_payrollPeriods" USING btree (workspace_id);

CREATE INDEX entity_workspace_revision_ws_idx ON public.entity_workspace_revision USING btree (workspace_id);

CREATE INDEX uc_upload_batches_status_idx ON public.uc_upload_batches USING btree (workspace_id, status, updated_at DESC);

CREATE INDEX "StaffRouteBundle_endedAt_idx" ON public."StaffRouteBundle" USING btree ("endedAt");

CREATE INDEX "StaffRouteBundle_staffId_startedAt_idx" ON public."StaffRouteBundle" USING btree ("staffId", "startedAt" DESC);

CREATE INDEX "entity_auditLog_updated_idx" ON public."entity_auditLog" USING btree (updated_at DESC);

CREATE INDEX "entity_auditLog_workspace_idx" ON public."entity_auditLog" USING btree (workspace_id);

CREATE INDEX "entity_auditLog_workspace_timestamp_idx" ON public."entity_auditLog" USING btree (workspace_id, ((data ->> 'timestamp'::text)) DESC);

CREATE INDEX entity_customers_updated_idx ON public.entity_customers USING btree (updated_at DESC);

CREATE INDEX entity_customers_workspace_idx ON public.entity_customers USING btree (workspace_id);

CREATE UNIQUE INDEX entity_customers_workspace_id_uidx ON public.entity_customers USING btree (workspace_id, id);

CREATE INDEX sd_313964551b453c611a81 ON public.entity_policy_rules USING btree (updated_at DESC) WHERE (collection = 'approvalPolicies'::text);

CREATE INDEX sd_1a477cce5ff83cbaec3e ON public.entity_policy_rules USING btree (workspace_id) WHERE (collection = 'approvalPolicies'::text);

CREATE INDEX sd_83bbe10be5bf8c705e1a ON public.entity_policy_rules USING btree (workspace_id, approver_staff_id) WHERE ((collection = 'approvalPolicies'::text) AND (approver_staff_id IS NOT NULL));

CREATE INDEX sd_089d2b1d1746a22cd4e5 ON public.entity_policy_rules USING btree (updated_at DESC) WHERE (collection = 'automationRules'::text);

CREATE INDEX sd_b3ca152f50cd15b79faa ON public.entity_policy_rules USING btree (workspace_id) WHERE (collection = 'automationRules'::text);

CREATE INDEX sd_8d676dce052e6023b4d4 ON public.entity_policy_rules USING btree (updated_at DESC) WHERE (collection = 'master.commissionRules'::text);

CREATE INDEX sd_81f712701701f9ea4d6c ON public.entity_policy_rules USING btree (workspace_id) WHERE (collection = 'master.commissionRules'::text);

CREATE INDEX sd_64e8e98f01eca5d89e71 ON public.entity_policy_rules USING btree (sd_d88329e677268d0af6b5, approver_staff_id);

CREATE INDEX "entity_workOrderCostLines_updated_idx" ON public."entity_workOrderCostLines" USING btree (updated_at DESC);

CREATE INDEX "entity_workOrderCostLines_workspace_idx" ON public."entity_workOrderCostLines" USING btree (workspace_id);

CREATE INDEX "graph_workOrderCostLines_work_order_id_idx" ON public."entity_workOrderCostLines" USING btree (workspace_id, work_order_id_gen);

CREATE INDEX "entity_workRequired_updated_idx" ON public."entity_workRequired" USING btree (updated_at DESC);

CREATE INDEX "entity_workRequired_workspace_idx" ON public."entity_workRequired" USING btree (workspace_id);

CREATE INDEX "entity_workRequired_customer_id_idx" ON public."entity_workRequired" USING btree (customer_id_gen, workspace_id);

CREATE INDEX "entity_workRequired_site_id_idx" ON public."entity_workRequired" USING btree (site_id_gen, workspace_id);

CREATE INDEX "entity_acceptedScopes_updated_idx" ON public."entity_acceptedScopes" USING btree (updated_at DESC);

CREATE INDEX "entity_acceptedScopes_workspace_idx" ON public."entity_acceptedScopes" USING btree (workspace_id);

CREATE INDEX "entity_acceptedScopes_customer_id_idx" ON public."entity_acceptedScopes" USING btree (customer_id_gen, workspace_id);

CREATE INDEX "entity_acceptedScopes_site_id_idx" ON public."entity_acceptedScopes" USING btree (site_id_gen, workspace_id);

CREATE INDEX "entity_workOrders_updated_idx" ON public."entity_workOrders" USING btree (updated_at DESC);

CREATE INDEX "entity_workOrders_workspace_idx" ON public."entity_workOrders" USING btree (workspace_id);

CREATE INDEX "entity_workOrders_customer_id_idx" ON public."entity_workOrders" USING btree (customer_id_gen, workspace_id);

CREATE INDEX "entity_workOrders_site_id_idx" ON public."entity_workOrders" USING btree (site_id_gen, workspace_id);

CREATE INDEX "graph_workOrders_contractor_id_idx" ON public."entity_workOrders" USING btree (workspace_id, contractor_id_gen);

CREATE UNIQUE INDEX "entity_workOrders_workspace_identity" ON public."entity_workOrders" USING btree (workspace_id, id);

CREATE INDEX entity_tasks_assigned_staff_idx ON public.entity_tasks USING btree (workspace_id, assigned_staff_id) WHERE (assigned_staff_id IS NOT NULL);

CREATE INDEX entity_tasks_updated_idx ON public.entity_tasks USING btree (updated_at DESC);

CREATE INDEX entity_tasks_workspace_idx ON public.entity_tasks USING btree (workspace_id);

CREATE INDEX entity_tasks_customer_id_idx ON public.entity_tasks USING btree (customer_id_gen, workspace_id);

CREATE INDEX entity_tasks_site_id_idx ON public.entity_tasks USING btree (site_id_gen, workspace_id);

CREATE UNIQUE INDEX entity_tasks_one_open_recovery_per_followup ON public.entity_tasks USING btree (workspace_id, source_followup_id_gen) WHERE ((source_followup_id_gen IS NOT NULL) AND ((data ->> 'status'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text])));

CREATE INDEX entity_visits_staff_idx ON public.entity_visits USING btree (workspace_id, staff_id) WHERE (staff_id IS NOT NULL);

CREATE INDEX entity_visits_updated_idx ON public.entity_visits USING btree (updated_at DESC);

CREATE INDEX entity_visits_workspace_idx ON public.entity_visits USING btree (workspace_id);

CREATE INDEX entity_visits_customer_id_idx ON public.entity_visits USING btree (customer_id_gen, workspace_id);

CREATE INDEX entity_visits_site_id_idx ON public.entity_visits USING btree (site_id_gen, workspace_id);

CREATE INDEX entity_followups_assigned_staff_idx ON public.entity_followups USING btree (workspace_id, assigned_staff_id) WHERE (assigned_staff_id IS NOT NULL);

CREATE INDEX entity_followups_updated_idx ON public.entity_followups USING btree (updated_at DESC);

CREATE INDEX entity_followups_workspace_idx ON public.entity_followups USING btree (workspace_id);

CREATE INDEX entity_followups_customer_id_idx ON public.entity_followups USING btree (customer_id_gen, workspace_id);

CREATE INDEX entity_followups_site_id_idx ON public.entity_followups USING btree (site_id_gen, workspace_id);

CREATE UNIQUE INDEX entity_followups_workspace_id_uidx ON public.entity_followups USING btree (workspace_id, id);

CREATE INDEX entity_attendance_staff_idx ON public.entity_attendance USING btree (workspace_id, staff_id) WHERE (staff_id IS NOT NULL);

CREATE INDEX entity_attendance_updated_idx ON public.entity_attendance USING btree (updated_at DESC);

CREATE INDEX entity_attendance_workspace_idx ON public.entity_attendance USING btree (workspace_id);

CREATE INDEX graph_attendance_work_order_id_idx ON public.entity_attendance USING btree (workspace_id, work_order_id_gen);

CREATE UNIQUE INDEX entity_attendance_workspace_staff_date_uidx ON public.entity_attendance USING btree (workspace_id, ((data ->> 'staff_id'::text)), ((data ->> 'date'::text))) WHERE ((NULLIF(btrim((data ->> 'staff_id'::text)), ''::text) IS NOT NULL) AND (NULLIF(btrim((data ->> 'date'::text)), ''::text) IS NOT NULL));

CREATE INDEX entity_commissions_updated_idx ON public.entity_commissions USING btree (updated_at DESC);

CREATE INDEX entity_commissions_workspace_idx ON public.entity_commissions USING btree (workspace_id);

CREATE INDEX entity_commissions_customer_id_idx ON public.entity_commissions USING btree (customer_id_gen, workspace_id);

CREATE INDEX entity_commissions_site_id_idx ON public.entity_commissions USING btree (site_id_gen, workspace_id);

CREATE INDEX "entity_commSends_updated_idx" ON public."entity_commSends" USING btree (updated_at DESC);

CREATE INDEX "entity_commSends_workspace_idx" ON public."entity_commSends" USING btree (workspace_id);

CREATE INDEX "entity_commSends_customer_id_idx" ON public."entity_commSends" USING btree (customer_id_gen, workspace_id);

CREATE INDEX "entity_commSends_site_id_idx" ON public."entity_commSends" USING btree (site_id_gen, workspace_id);

CREATE INDEX entity_grns_updated_idx ON public.entity_grns USING btree (updated_at DESC);

CREATE INDEX entity_grns_workspace_idx ON public.entity_grns USING btree (workspace_id);

CREATE UNIQUE INDEX entity_grns_workspace_identity ON public.entity_grns USING btree (workspace_id, id);

CREATE INDEX graph_grns_po_id_idx ON public.entity_grns USING btree (workspace_id, po_id_gen);

CREATE INDEX graph_grns_vendor_id_idx ON public.entity_grns USING btree (workspace_id, vendor_id_gen);

CREATE INDEX graph_grns_work_order_id_idx ON public.entity_grns USING btree (workspace_id, work_order_id_gen);

CREATE INDEX graph_grns_site_id_idx ON public.entity_grns USING btree (workspace_id, site_id_gen);

CREATE INDEX graph_grns_po_vendor_idx ON public.entity_grns USING btree (workspace_id, po_id_gen, vendor_id_gen);

CREATE UNIQUE INDEX graph_grns_grn_po_vendor_identity ON public.entity_grns USING btree (workspace_id, id, po_id_gen, vendor_id_gen);

CREATE INDEX sd_ffd52694e7d7464295b3 ON public.entity_grns USING btree (sd_989b10de1fd234494cb0, workspace_id, po_id_gen);

CREATE INDEX sd_752d2235243aaaa752b6 ON public.entity_grns USING btree (sd_7a96ce1039e7d83685ee, workspace_id, po_id_gen, vendor_id_gen);

CREATE INDEX entity_payments_updated_idx ON public.entity_payments USING btree (updated_at DESC);

CREATE INDEX entity_payments_workspace_idx ON public.entity_payments USING btree (workspace_id);

CREATE INDEX entity_payments_customer_id_idx ON public.entity_payments USING btree (customer_id_gen, workspace_id);

CREATE INDEX entity_payments_site_id_idx ON public.entity_payments USING btree (site_id_gen, workspace_id);

CREATE UNIQUE INDEX entity_payments_workspace_identity ON public.entity_payments USING btree (workspace_id, id);

CREATE INDEX graph_payments_work_order_id_idx ON public.entity_payments USING btree (workspace_id, work_order_id_gen);

CREATE INDEX graph_payments_invoice_id_idx ON public.entity_payments USING btree (workspace_id, invoice_id_gen);

CREATE INDEX sd_e1c7a35fece2d923b120 ON public.entity_payments USING btree (sd_ec067a4d11b1b5c63469, workspace_id, invoice_id_gen);

CREATE INDEX sd_bc15595487db72826134 ON public.entity_commercial_documents USING btree (updated_at DESC) WHERE (collection = 'boqs'::text);

CREATE INDEX sd_4d6cbdbf612d56995527 ON public.entity_commercial_documents USING btree (workspace_id) WHERE (collection = 'boqs'::text);

CREATE INDEX sd_fb42c1a758b9a1e7ac2f ON public.entity_commercial_documents USING btree (updated_at DESC) WHERE (collection = 'contractorBids'::text);

CREATE INDEX sd_b42ae9835dc4df5e39d3 ON public.entity_commercial_documents USING btree (workspace_id) WHERE (collection = 'contractorBids'::text);

CREATE INDEX sd_0e054e634b0e02925bc7 ON public.entity_commercial_documents USING btree (updated_at DESC) WHERE (collection = 'contractorSettlements'::text);

CREATE INDEX sd_b6b2c6cec8b7da3b449b ON public.entity_commercial_documents USING btree (workspace_id) WHERE (collection = 'contractorSettlements'::text);

CREATE INDEX sd_73671e9e07c7fc292b86 ON public.entity_commercial_documents USING btree (updated_at DESC) WHERE (collection = 'purchaseOrders'::text);

CREATE UNIQUE INDEX sd_ddbd2a48b29425fa7b9c ON public.entity_commercial_documents USING btree (workspace_id, id) WHERE (collection = 'purchaseOrders'::text);

CREATE INDEX sd_f3ee96efae027741eab5 ON public.entity_commercial_documents USING btree (workspace_id) WHERE (collection = 'purchaseOrders'::text);

CREATE UNIQUE INDEX sd_0df48b3d54a4ac8c6d26 ON public.entity_commercial_documents USING btree (workspace_id, id, vendor_id_gen) WHERE (collection = 'purchaseOrders'::text);

CREATE INDEX sd_78da3df69bd6aca02f9c ON public.entity_commercial_documents USING btree (workspace_id, site_id_gen) WHERE (collection = 'purchaseOrders'::text);

CREATE INDEX sd_0f1c8d9020ea86b70b6a ON public.entity_commercial_documents USING btree (workspace_id, vendor_id_gen) WHERE (collection = 'purchaseOrders'::text);

CREATE INDEX sd_d487860d02dbd65df556 ON public.entity_commercial_documents USING btree (workspace_id, work_order_id_gen) WHERE (collection = 'purchaseOrders'::text);

CREATE INDEX sd_c78c5c32a94bdc7046f3 ON public.entity_commercial_documents USING btree (customer_id_gen, workspace_id) WHERE (collection = 'quotations'::text);

CREATE INDEX sd_73816ba49ca6b594452b ON public.entity_commercial_documents USING btree (site_id_gen, workspace_id) WHERE (collection = 'quotations'::text);

CREATE INDEX sd_50346af78f3606085651 ON public.entity_commercial_documents USING btree (updated_at DESC) WHERE (collection = 'quotations'::text);

CREATE UNIQUE INDEX sd_abf05d599ad33d6f80a6 ON public.entity_commercial_documents USING btree (workspace_id, ((data ->> 'quotation_no'::text))) WHERE ((collection = 'quotations'::text) AND ((COALESCE((data ->> 'status'::text), ''::text) <> 'cancelled'::text) AND (NULLIF(btrim((data ->> 'quotation_no'::text)), ''::text) IS NOT NULL)));

CREATE INDEX sd_bba8e07ddddecc8d3a00 ON public.entity_commercial_documents USING btree (workspace_id) WHERE (collection = 'quotations'::text);

CREATE INDEX sd_a9c7d1ada7cb72e1e558 ON public.entity_commercial_documents USING btree (updated_at DESC) WHERE (collection = 'vendorBids'::text);

CREATE INDEX sd_a23b89737f5d7f3847a3 ON public.entity_commercial_documents USING btree (workspace_id) WHERE (collection = 'vendorBids'::text);

CREATE INDEX sd_7a4999d2af951aa12f76 ON public.entity_commercial_documents USING btree (updated_at DESC) WHERE (collection = 'vendorRfqs'::text);

CREATE INDEX sd_72626a2386a3242f41b3 ON public.entity_commercial_documents USING btree (workspace_id) WHERE (collection = 'vendorRfqs'::text);

CREATE INDEX sd_9c8a9cb6cab1180a0d51 ON public.entity_commercial_documents USING btree (sd_e5f2acc3589c66f8fa55, site_id_gen);

CREATE INDEX sd_2a5738d24d3f84cca792 ON public.entity_commercial_documents USING btree (sd_ee10e8576c1ade7e800e, vendor_id_gen);

CREATE INDEX sd_2faacff0c85c1bd3107d ON public.entity_commercial_documents USING btree (sd_381a7ef2c4d3fdf17cc7, work_order_id_gen);

CREATE INDEX sd_eb3be6b6b8a05af63050 ON public.entity_commercial_documents USING btree (sd_7dad38aaab2a13e3cef5);

CREATE INDEX sd_ec32844e1f451fac7ceb ON public.entity_commercial_documents USING btree (sd_d362111c2dd759619485);

CREATE INDEX sd_1d329a2dca673c8493e9 ON public.entity_workflow_controls USING btree (site_id_gen, workspace_id) WHERE (collection = 'actions'::text);

CREATE INDEX sd_ea8b849314e56fb87c93 ON public.entity_workflow_controls USING btree (customer_id_gen, workspace_id) WHERE (collection = 'actions'::text);

CREATE INDEX sd_76be02323cc8765aa61a ON public.entity_workflow_controls USING btree (updated_at DESC) WHERE (collection = 'actions'::text);

CREATE INDEX sd_a4dd5eea2fb0bfd30fbe ON public.entity_workflow_controls USING btree (workspace_id) WHERE (collection = 'actions'::text);

CREATE INDEX sd_600e2b7a67bc9a8fc493 ON public.entity_workflow_controls USING btree (customer_id_gen, workspace_id) WHERE (collection = 'blocked'::text);

CREATE INDEX sd_8bc5d63a171c67b1e205 ON public.entity_workflow_controls USING btree (site_id_gen, workspace_id) WHERE (collection = 'blocked'::text);

CREATE INDEX sd_c001bcf2b157765afa7a ON public.entity_workflow_controls USING btree (updated_at DESC) WHERE (collection = 'blocked'::text);

CREATE INDEX sd_cb4878f666331f37070b ON public.entity_workflow_controls USING btree (workspace_id) WHERE (collection = 'blocked'::text);

CREATE INDEX sd_4713f0ded9b11258df60 ON public.entity_workflow_controls USING btree (customer_id_gen, workspace_id) WHERE (collection = 'risks'::text);

CREATE INDEX sd_4a654c0c2611ab27cc99 ON public.entity_workflow_controls USING btree (site_id_gen, workspace_id) WHERE (collection = 'risks'::text);

CREATE INDEX sd_30ef18076159a519f149 ON public.entity_workflow_controls USING btree (updated_at DESC) WHERE (collection = 'risks'::text);

CREATE INDEX sd_8c45bd8d5786bfa609d0 ON public.entity_workflow_controls USING btree (workspace_id) WHERE (collection = 'risks'::text);

CREATE INDEX sd_791428640ec9b1da8f89 ON public.entity_workflow_controls USING btree (sd_f0c5338ed87f8da85e2a);

CREATE INDEX sd_22f1ba350c244e6a0dbd ON public.entity_workflow_controls USING btree (sd_76e724a8ae01dd269987);

CREATE INDEX sd_d8c9c91c9719b9dff250 ON public.entity_workflow_controls USING btree (sd_896262c53f4cfaa4f824);

CREATE INDEX sd_c5269beba06a1f4dd6a5 ON public.entity_workflow_controls USING btree (sd_a291a3a1d61683190c5b);

CREATE INDEX sd_ce6bce4b3cd12ff3ff80 ON public.entity_workflow_controls USING btree (sd_fdb4b4da80d2e32d77f6);

CREATE INDEX sd_5cf9207067faee7d8531 ON public.entity_workflow_controls USING btree (sd_ffb53a4ac65790034db9);

CREATE INDEX sd_d4559e91d3953420fd82 ON public.entity_financial_documents USING btree (customer_id_gen, workspace_id) WHERE (collection = 'contractorBills'::text);

CREATE INDEX sd_f7d8b3a7653f91262e69 ON public.entity_financial_documents USING btree (site_id_gen, workspace_id) WHERE (collection = 'contractorBills'::text);

CREATE INDEX sd_27e97858d2c6b9420773 ON public.entity_financial_documents USING btree (updated_at DESC) WHERE (collection = 'contractorBills'::text);

CREATE UNIQUE INDEX sd_67c5d016d9e324b7727e ON public.entity_financial_documents USING btree (workspace_id, id) WHERE (collection = 'contractorBills'::text);

CREATE INDEX sd_01fa5c79b2a166d46ea4 ON public.entity_financial_documents USING btree (workspace_id) WHERE (collection = 'contractorBills'::text);

CREATE UNIQUE INDEX sd_7cee666fd60eb4b16133 ON public.entity_financial_documents USING btree (workspace_id, id, contractor_id_gen, work_order_id_gen, site_id_gen) WHERE (collection = 'contractorBills'::text);

CREATE INDEX sd_8ac12841a04e8e578b00 ON public.entity_financial_documents USING btree (workspace_id, contractor_id_gen) WHERE (collection = 'contractorBills'::text);

CREATE INDEX sd_ba93e474c664a13ed162 ON public.entity_financial_documents USING btree (workspace_id, work_order_id_gen) WHERE (collection = 'contractorBills'::text);

CREATE INDEX sd_f1ef4b060130715d9988 ON public.entity_financial_documents USING btree (customer_id_gen, workspace_id) WHERE (collection = 'invoices'::text);

CREATE INDEX sd_890e30e2babf14ae9551 ON public.entity_financial_documents USING btree (site_id_gen, workspace_id) WHERE (collection = 'invoices'::text);

CREATE INDEX sd_0c3613d59c3a480d36eb ON public.entity_financial_documents USING btree (updated_at DESC) WHERE (collection = 'invoices'::text);

CREATE UNIQUE INDEX sd_924affef01ff202564b8 ON public.entity_financial_documents USING btree (workspace_id, id) WHERE (collection = 'invoices'::text);

CREATE INDEX sd_a10788d5d2f7f4a1f234 ON public.entity_financial_documents USING btree (workspace_id) WHERE (collection = 'invoices'::text);

CREATE UNIQUE INDEX sd_e78e623e8ec8a00b7d79 ON public.entity_financial_documents USING btree (workspace_id, NULLIF(btrim((data ->> 'invoice_no'::text)), ''::text)) WHERE ((collection = 'invoices'::text) AND (NULLIF(btrim((data ->> 'invoice_no'::text)), ''::text) IS NOT NULL));

CREATE INDEX sd_8ea4c4ff10c2fdfcd822 ON public.entity_financial_documents USING btree (workspace_id, payment_id_gen) WHERE (collection = 'invoices'::text);

CREATE INDEX sd_86fe24273d58d3e4ce36 ON public.entity_financial_documents USING btree (workspace_id, work_order_id_gen) WHERE (collection = 'invoices'::text);

CREATE INDEX sd_431afe2dd46bee366920 ON public.entity_financial_documents USING btree (updated_at DESC) WHERE (collection = 'vendorBills'::text);

CREATE UNIQUE INDEX sd_46e1d6bf2c3564032c05 ON public.entity_financial_documents USING btree (workspace_id, id) WHERE (collection = 'vendorBills'::text);

CREATE INDEX sd_b194daff39c58512ebbc ON public.entity_financial_documents USING btree (workspace_id) WHERE (collection = 'vendorBills'::text);

CREATE UNIQUE INDEX sd_2b80ae00e538df3435ab ON public.entity_financial_documents USING btree (workspace_id, id, vendor_id_gen) WHERE (collection = 'vendorBills'::text);

CREATE INDEX sd_dc2808d34eb4e43bf463 ON public.entity_financial_documents USING btree (workspace_id, grn_id_gen) WHERE (collection = 'vendorBills'::text);

CREATE INDEX sd_1a359fb0c32c302844a5 ON public.entity_financial_documents USING btree (workspace_id, grn_id_gen, po_id_gen, vendor_id_gen) WHERE (collection = 'vendorBills'::text);

CREATE INDEX sd_4333e9a077ea541b84f3 ON public.entity_financial_documents USING btree (workspace_id, po_id_gen) WHERE (collection = 'vendorBills'::text);

CREATE INDEX sd_a148df36bb8a1c692058 ON public.entity_financial_documents USING btree (workspace_id, po_id_gen, vendor_id_gen) WHERE (collection = 'vendorBills'::text);

CREATE INDEX sd_f41b28db3a53f99b7ff7 ON public.entity_financial_documents USING btree (workspace_id, site_id_gen) WHERE (collection = 'vendorBills'::text);

CREATE INDEX sd_eafefc08c8fe57ee3f6a ON public.entity_financial_documents USING btree (workspace_id, vendor_id_gen) WHERE (collection = 'vendorBills'::text);

CREATE INDEX sd_21ed67ece2b852bcdb87 ON public.entity_financial_documents USING btree (workspace_id, work_order_id_gen) WHERE (collection = 'vendorBills'::text);

CREATE INDEX sd_1474b32373571d932ecc ON public.entity_financial_documents USING btree (sd_79a3041abf5ba7c29887);

CREATE INDEX sd_87d98e65d3936c08d866 ON public.entity_financial_documents USING btree (sd_e4eff89c5be14ad2831f);

CREATE INDEX sd_04e7c231c9e69abee59b ON public.entity_financial_documents USING btree (sd_995e0adc26a2dabe9258, contractor_id_gen);

CREATE INDEX sd_718a91a286a5c7de75e1 ON public.entity_financial_documents USING btree (sd_f8c1fdf5bba847442adb, work_order_id_gen);

CREATE INDEX sd_df350421628d6a930d6d ON public.entity_financial_documents USING btree (sd_de11944679c93077c0a0);

CREATE INDEX sd_d448f2a6bf83ba69bfa0 ON public.entity_financial_documents USING btree (sd_ce2695f4fb72b9a68e00);

CREATE INDEX sd_41df84234effba088a9a ON public.entity_financial_documents USING btree (sd_ce5a8e8bf4fba33ee764, payment_id_gen);

CREATE INDEX sd_9921cbd05cf379ca070c ON public.entity_financial_documents USING btree (sd_d041ff31b5e2eb685f2c, work_order_id_gen);

CREATE INDEX sd_4f96589198e38965dfa9 ON public.entity_financial_documents USING btree (sd_e312eb5c19f656dc911e, grn_id_gen);

CREATE INDEX sd_9407ad2523d64129e2f8 ON public.entity_financial_documents USING btree (sd_3f5f54a6c54af5aa7a7e, grn_id_gen, po_id_gen, vendor_id_gen);

CREATE INDEX sd_1f90609a60e03d65d824 ON public.entity_financial_documents USING btree (sd_c1072f55346a3e74cc5a, workspace_id, po_id_gen);

CREATE INDEX sd_7bccd91e8346b1759567 ON public.entity_financial_documents USING btree (sd_830a7ca70e6963321869, workspace_id, po_id_gen, vendor_id_gen);

CREATE INDEX sd_74a20492719965610bed ON public.entity_financial_documents USING btree (sd_4d64ec47001d82368e45, site_id_gen);

CREATE INDEX sd_04ad6121cfbde9192386 ON public.entity_financial_documents USING btree (sd_59ef74edde9313403766, vendor_id_gen);

CREATE INDEX sd_b96f97db71b9724cadd3 ON public.entity_financial_documents USING btree (sd_fd700e017557db859daa, work_order_id_gen);

CREATE INDEX sd_cd03f25bbdb986f3b3a4 ON public.entity_money_movements USING btree (sd_47c9fed69701c1b111b4);

CREATE INDEX sd_700c99c12e093651bff2 ON public.entity_money_movements USING btree (sd_677ef08b162d13bdfddc);

CREATE INDEX sd_c9a2e935cbaba605bf9a ON public.entity_money_movements USING btree (updated_at DESC) WHERE (collection = 'contractorPayments'::text);

CREATE INDEX sd_fdcd1c834ecba5fae00f ON public.entity_money_movements USING btree (workspace_id) WHERE (collection = 'contractorPayments'::text);

CREATE INDEX sd_d9f2f86fbcc9bb0561f3 ON public.entity_money_movements USING btree (workspace_id, contractor_bill_id_gen, contractor_id_gen, work_order_id_gen, site_id_gen) WHERE (collection = 'contractorPayments'::text);

CREATE INDEX sd_effa0f421671463779ab ON public.entity_money_movements USING btree (workspace_id, contractor_bill_id_gen) WHERE (collection = 'contractorPayments'::text);

CREATE INDEX sd_fdc17bee389b4949a1d8 ON public.entity_money_movements USING btree (workspace_id, contractor_id_gen) WHERE (collection = 'contractorPayments'::text);

CREATE INDEX sd_2dfa033292c062ddcd14 ON public.entity_money_movements USING btree (workspace_id, site_id_gen) WHERE (collection = 'contractorPayments'::text);

CREATE INDEX sd_f35165a878b8b4c060d8 ON public.entity_money_movements USING btree (workspace_id, work_order_id_gen) WHERE (collection = 'contractorPayments'::text);

CREATE INDEX sd_cbaf8fdbceeccd343157 ON public.entity_money_movements USING btree (customer_id_gen, workspace_id) WHERE (collection = 'customerReceipts'::text);

CREATE INDEX sd_22ae87bfb939848c5742 ON public.entity_money_movements USING btree (site_id_gen, workspace_id) WHERE (collection = 'customerReceipts'::text);

CREATE INDEX sd_baffde463bbc575238dd ON public.entity_money_movements USING btree (sd_c900124140f0e2d606ce, workspace_id, invoice_id_gen);

CREATE INDEX sd_af4a642901317d1e5532 ON public.entity_money_movements USING btree (updated_at DESC) WHERE (collection = 'customerReceipts'::text);

CREATE INDEX sd_64d65c55f943de40f9ac ON public.entity_money_movements USING btree (workspace_id) WHERE (collection = 'customerReceipts'::text);

CREATE UNIQUE INDEX sd_0576f351c00432b181aa ON public.entity_money_movements USING btree (workspace_id, NULLIF(btrim((data ->> 'receipt_no'::text)), ''::text)) WHERE ((collection = 'customerReceipts'::text) AND (NULLIF(btrim((data ->> 'receipt_no'::text)), ''::text) IS NOT NULL));

CREATE INDEX sd_2d677467c438724b5606 ON public.entity_money_movements USING btree (workspace_id, invoice_id_gen) WHERE (collection = 'customerReceipts'::text);

CREATE INDEX sd_8c0215d770e8ae67afe9 ON public.entity_money_movements USING btree (workspace_id, payment_id_gen) WHERE (collection = 'customerReceipts'::text);

CREATE INDEX sd_af14653d7f6ff724b550 ON public.entity_money_movements USING btree (workspace_id, work_order_id_gen) WHERE (collection = 'customerReceipts'::text);

CREATE INDEX sd_38240bba763236a42eaf ON public.entity_money_movements USING btree (sd_9c1f20588aca97588260, workspace_id, contractor_bill_id_gen);

CREATE INDEX sd_1e12a329eda1421c3edc ON public.entity_money_movements USING btree (sd_52c2690706271d27d64a, contractor_id_gen);

CREATE INDEX sd_55e440a2af85683fa74f ON public.entity_money_movements USING btree (sd_83a96458a5749577575b, site_id_gen);

CREATE INDEX sd_324eeceed6ca6bd757a3 ON public.entity_money_movements USING btree (updated_at DESC) WHERE (collection = 'vendorPayments'::text);

CREATE INDEX sd_9d811b2200bb5bffe1d4 ON public.entity_money_movements USING btree (workspace_id) WHERE (collection = 'vendorPayments'::text);

CREATE INDEX sd_00013dd064f102d1590a ON public.entity_money_movements USING btree (workspace_id, vendor_bill_id_gen, vendor_id_gen) WHERE (collection = 'vendorPayments'::text);

CREATE INDEX sd_bba57496e052ec0b04f3 ON public.entity_money_movements USING btree (workspace_id, site_id_gen) WHERE (collection = 'vendorPayments'::text);

CREATE INDEX sd_e1d55c50a1d8b084d823 ON public.entity_money_movements USING btree (sd_b977f619b6e787456146, work_order_id_gen);

CREATE INDEX sd_b8738de840e333ae5544 ON public.entity_money_movements USING btree (workspace_id, vendor_bill_id_gen) WHERE (collection = 'vendorPayments'::text);

CREATE INDEX sd_7cfe2abd9dc9e6545054 ON public.entity_money_movements USING btree (workspace_id, vendor_id_gen) WHERE (collection = 'vendorPayments'::text);

CREATE INDEX sd_04fc92e83e95fbe6ce05 ON public.entity_money_movements USING btree (workspace_id, work_order_id_gen) WHERE (collection = 'vendorPayments'::text);

CREATE INDEX sd_de0f3178dd95a64cb838 ON public.entity_money_movements USING btree (sd_6cba67ee70156c7a4ba7, workspace_id, contractor_bill_id_gen, contractor_id_gen, work_order_id_gen, site_id_gen);

CREATE INDEX sd_39404501b37c4b111861 ON public.entity_money_movements USING btree (sd_00341c51016d86152a34, payment_id_gen);

CREATE INDEX sd_24585a8ece255cdfbbf2 ON public.entity_money_movements USING btree (sd_dcd6545686f65e40f138, work_order_id_gen);

CREATE INDEX sd_6e99c04579d4818c386e ON public.entity_money_movements USING btree (sd_7c0b2bc36fa980fc9080, workspace_id, vendor_bill_id_gen, vendor_id_gen);

CREATE INDEX sd_97bc11367bf00549df99 ON public.entity_money_movements USING btree (sd_716aaf0f55bb03272ee3, site_id_gen);

CREATE INDEX sd_d618bd576221daf3302b ON public.entity_money_movements USING btree (sd_a2f0728eafe7c5acc451, workspace_id, vendor_bill_id_gen);

CREATE INDEX sd_1db7ba51bcbfa6c8705f ON public.entity_money_movements USING btree (sd_c842369ccf2e34a16434, vendor_id_gen);

CREATE INDEX sd_6d21eff8d61445819ec8 ON public.entity_money_movements USING btree (sd_12ad5eb38b143abb5cc3, work_order_id_gen);

ALTER TABLE public.uc_user_roles ADD CONSTRAINT "uc_user_roles_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public."entity_payrollLines" ADD CONSTRAINT "entity_payroll_lines_staff_fkey" FOREIGN KEY (workspace_id, staff_id) REFERENCES entity_master_staff(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public."entity_recurringTasks" ADD CONSTRAINT "entity_recurring_tasks_assigned_staff_fkey" FOREIGN KEY (workspace_id, assigned_staff_id) REFERENCES entity_master_staff(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public."entity_salaryAdjustments" ADD CONSTRAINT "entity_salary_adjustments_staff_fkey" FOREIGN KEY (workspace_id, staff_id) REFERENCES entity_master_staff(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public."StaffRouteBundle" ADD CONSTRAINT "StaffRouteBundle_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES entity_master_staff(id) ON DELETE RESTRICT;

ALTER TABLE public.uc_upload_events ADD CONSTRAINT "uc_upload_events_upload_item_id_fkey" FOREIGN KEY (upload_item_id) REFERENCES uc_upload_items(id) ON DELETE CASCADE;

ALTER TABLE public."entity_leaveRequests" ADD CONSTRAINT "entity_leave_requests_staff_fkey" FOREIGN KEY (workspace_id, staff_id) REFERENCES entity_master_staff(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.entity_attendance ADD CONSTRAINT "entity_attendance_staff_fkey" FOREIGN KEY (workspace_id, staff_id) REFERENCES entity_master_staff(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.entity_followups ADD CONSTRAINT "entity_followups_assigned_staff_fkey" FOREIGN KEY (workspace_id, assigned_staff_id) REFERENCES entity_master_staff(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.entity_tasks ADD CONSTRAINT "entity_tasks_assigned_staff_fkey" FOREIGN KEY (workspace_id, assigned_staff_id) REFERENCES entity_master_staff(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.entity_visits ADD CONSTRAINT "entity_visits_staff_fkey" FOREIGN KEY (workspace_id, staff_id) REFERENCES entity_master_staff(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.uc_user_roles ADD CONSTRAINT "uc_user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE private.customer_contact_identities ADD CONSTRAINT "customer_contact_identities_customer_fkey" FOREIGN KEY (workspace_id, customer_id) REFERENCES entity_customers(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE public.entity_sites ADD CONSTRAINT "entity_sites_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_workRequired" ADD CONSTRAINT "entity_workRequired_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "entity_acceptedScopes_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "entity_workOrders_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public.entity_visits ADD CONSTRAINT "entity_visits_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public.entity_tasks ADD CONSTRAINT "entity_tasks_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public.entity_followups ADD CONSTRAINT "entity_followups_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public.entity_payments ADD CONSTRAINT "entity_payments_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public.entity_commissions ADD CONSTRAINT "entity_commissions_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_variationRequests" ADD CONSTRAINT "entity_variationRequests_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_commSends" ADD CONSTRAINT "entity_commSends_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_entityReferenceAssignments" ADD CONSTRAINT "entity_entityReferenceAssignments_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public.entity_areas ADD CONSTRAINT "entity_areas_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_workRequired" ADD CONSTRAINT "entity_workRequired_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "entity_acceptedScopes_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "entity_workOrders_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public.entity_visits ADD CONSTRAINT "entity_visits_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public.entity_tasks ADD CONSTRAINT "entity_tasks_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public.entity_followups ADD CONSTRAINT "entity_followups_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public.entity_payments ADD CONSTRAINT "entity_payments_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public.entity_commissions ADD CONSTRAINT "entity_commissions_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_variationRequests" ADD CONSTRAINT "entity_variationRequests_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_commSends" ADD CONSTRAINT "entity_commSends_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_entityReferenceAssignments" ADD CONSTRAINT "entity_entityReferenceAssignments_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public.uc_whatsapp_auth_state ADD CONSTRAINT "uc_whatsapp_auth_state_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES uc_whatsapp_accounts(workspace_id) ON DELETE CASCADE;

ALTER TABLE public.uc_whatsapp_messages ADD CONSTRAINT "uc_whatsapp_messages_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES uc_whatsapp_accounts(workspace_id) ON DELETE CASCADE;

ALTER TABLE public.uc_whatsapp_messages ADD CONSTRAINT "uc_whatsapp_messages_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES entity_customers(id) ON DELETE SET NULL;

ALTER TABLE public.uc_whatsapp_messages ADD CONSTRAINT "uc_whatsapp_messages_comm_send_id_fkey" FOREIGN KEY (comm_send_id) REFERENCES "entity_commSends"(id) ON DELETE SET NULL;

ALTER TABLE public.uc_google_drive_credentials ADD CONSTRAINT "uc_google_drive_credentials_storage_account_fkey" FOREIGN KEY (storage_account_id) REFERENCES "entity_master_storageAccounts"(id) ON DELETE CASCADE;

ALTER TABLE public."entity_workOrderCostLines" ADD CONSTRAINT "graph_workOrderCostLines_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_21e1d6b91113db2663b5" FOREIGN KEY (sd_de11944679c93077c0a0) REFERENCES entity_customers(id);

ALTER TABLE public.uc_user_roles ADD CONSTRAINT "uc_user_roles_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES entity_master_staff(id) ON DELETE RESTRICT;

ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "graph_workOrders_contractor_id" FOREIGN KEY (workspace_id, contractor_id_gen) REFERENCES entity_master_contractors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_grns ADD CONSTRAINT "graph_grns_vendor_id" FOREIGN KEY (workspace_id, vendor_id_gen) REFERENCES entity_master_vendors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_grns ADD CONSTRAINT "graph_grns_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_grns ADD CONSTRAINT "graph_grns_site_id" FOREIGN KEY (workspace_id, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_payments ADD CONSTRAINT "graph_payments_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_attendance ADD CONSTRAINT "graph_attendance_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."entity_salaryAdjustments" ADD CONSTRAINT "graph_salaryAdjustments_work_order_id" FOREIGN KEY (workspace_id, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_workflow_controls ADD CONSTRAINT "sd_e8761b8f070c9dbcac50" FOREIGN KEY (sd_76e724a8ae01dd269987) REFERENCES entity_sites(id);

ALTER TABLE public.entity_policy_rules ADD CONSTRAINT "sd_bb59e3afdbbae001c053" FOREIGN KEY (sd_d88329e677268d0af6b5, approver_staff_id) REFERENCES entity_master_staff(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.entity_workflow_controls ADD CONSTRAINT "sd_91e5326614a181727da2" FOREIGN KEY (sd_896262c53f4cfaa4f824) REFERENCES entity_customers(id);

ALTER TABLE public.entity_workflow_controls ADD CONSTRAINT "sd_0f2545f97175c44b445d" FOREIGN KEY (sd_a291a3a1d61683190c5b) REFERENCES entity_sites(id);

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_afc8973449530910f685" FOREIGN KEY (sd_79a3041abf5ba7c29887) REFERENCES entity_customers(id);

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_3722bc7e601d83ed302f" FOREIGN KEY (sd_e4eff89c5be14ad2831f) REFERENCES entity_sites(id);

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_3d294fa2702e99771a40" FOREIGN KEY (sd_995e0adc26a2dabe9258, contractor_id_gen) REFERENCES entity_master_contractors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_99099d9c7d486f51dc89" FOREIGN KEY (sd_f8c1fdf5bba847442adb, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_c71e6c74a42cf09a7435" FOREIGN KEY (sd_6cba67ee70156c7a4ba7, workspace_id, contractor_bill_id_gen, contractor_id_gen, work_order_id_gen, site_id_gen) REFERENCES entity_financial_documents(collection, workspace_id, id, contractor_id_gen, work_order_id_gen, site_id_gen) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_3ec614041620bc4e00c2" FOREIGN KEY (sd_9c1f20588aca97588260, workspace_id, contractor_bill_id_gen) REFERENCES entity_financial_documents(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_b2c46fc092582cc40cf5" FOREIGN KEY (sd_52c2690706271d27d64a, contractor_id_gen) REFERENCES entity_master_contractors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_1507922174f9c51b812a" FOREIGN KEY (sd_83a96458a5749577575b, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_a05dae4487abdf3ffe61" FOREIGN KEY (sd_b977f619b6e787456146, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_b1f1fdd06b8ebc837408" FOREIGN KEY (sd_47c9fed69701c1b111b4) REFERENCES entity_customers(id);

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_cc51aa53426a27165efe" FOREIGN KEY (sd_677ef08b162d13bdfddc) REFERENCES entity_sites(id);

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_e93dde0ca0d566da730d" FOREIGN KEY (sd_c900124140f0e2d606ce, workspace_id, invoice_id_gen) REFERENCES entity_financial_documents(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_tasks ADD CONSTRAINT "entity_tasks_source_followup_fk" FOREIGN KEY (workspace_id, source_followup_id_gen) REFERENCES entity_followups(workspace_id, id) ON DELETE RESTRICT;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_7cc946115b80ac7f9fae" FOREIGN KEY (sd_00341c51016d86152a34, payment_id_gen) REFERENCES entity_payments(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_e08516f9f7076ab78a94" FOREIGN KEY (sd_dcd6545686f65e40f138, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_grns ADD CONSTRAINT "sd_9f7b08682e345e9e02c1" FOREIGN KEY (sd_989b10de1fd234494cb0, workspace_id, po_id_gen) REFERENCES entity_commercial_documents(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_grns ADD CONSTRAINT "sd_0638ac61fbe5582587e8" FOREIGN KEY (sd_7a96ce1039e7d83685ee, workspace_id, po_id_gen, vendor_id_gen) REFERENCES entity_commercial_documents(collection, workspace_id, id, vendor_id_gen) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_workflow_controls ADD CONSTRAINT "sd_dfa581eb3282671ff10a" FOREIGN KEY (sd_f0c5338ed87f8da85e2a) REFERENCES entity_customers(id);

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_1c594d762ace6b857d52" FOREIGN KEY (sd_ce2695f4fb72b9a68e00) REFERENCES entity_sites(id);

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_5292691879d00ae29e53" FOREIGN KEY (sd_ce5a8e8bf4fba33ee764, payment_id_gen) REFERENCES entity_payments(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_df776e71f50fbe6c57dd" FOREIGN KEY (sd_d041ff31b5e2eb685f2c, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_payments ADD CONSTRAINT "sd_e1ed16032f7522ef24c7" FOREIGN KEY (sd_ec067a4d11b1b5c63469, workspace_id, invoice_id_gen) REFERENCES entity_financial_documents(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_commercial_documents ADD CONSTRAINT "sd_0fd35844a021660b00d1" FOREIGN KEY (sd_e5f2acc3589c66f8fa55, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_commercial_documents ADD CONSTRAINT "sd_6aa81ab2f783210aa2de" FOREIGN KEY (sd_ee10e8576c1ade7e800e, vendor_id_gen) REFERENCES entity_master_vendors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_commercial_documents ADD CONSTRAINT "sd_378cd18bb2cc829d28fd" FOREIGN KEY (sd_381a7ef2c4d3fdf17cc7, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_commercial_documents ADD CONSTRAINT "sd_c881b0b5a8e23d78c817" FOREIGN KEY (sd_7dad38aaab2a13e3cef5) REFERENCES entity_customers(id);

ALTER TABLE public.entity_commercial_documents ADD CONSTRAINT "sd_9017f4bddf10572db008" FOREIGN KEY (sd_d362111c2dd759619485) REFERENCES entity_sites(id);

ALTER TABLE public.entity_workflow_controls ADD CONSTRAINT "sd_c4e0f2d7e4b42d0af68f" FOREIGN KEY (sd_fdb4b4da80d2e32d77f6) REFERENCES entity_customers(id);

ALTER TABLE public.entity_workflow_controls ADD CONSTRAINT "sd_d913d380a6647eb3644f" FOREIGN KEY (sd_ffb53a4ac65790034db9) REFERENCES entity_sites(id);

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_1fb85c7491001f1cca74" FOREIGN KEY (sd_e312eb5c19f656dc911e, grn_id_gen) REFERENCES entity_grns(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_47469765d8513dcd288a" FOREIGN KEY (sd_3f5f54a6c54af5aa7a7e, grn_id_gen, po_id_gen, vendor_id_gen) REFERENCES entity_grns(workspace_id, id, po_id_gen, vendor_id_gen) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_b06788236fcb83f55fd5" FOREIGN KEY (sd_c1072f55346a3e74cc5a, workspace_id, po_id_gen) REFERENCES entity_commercial_documents(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_aeb225efea1bc722a7a4" FOREIGN KEY (sd_830a7ca70e6963321869, workspace_id, po_id_gen, vendor_id_gen) REFERENCES entity_commercial_documents(collection, workspace_id, id, vendor_id_gen) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_1fcb58c04e54053509ad" FOREIGN KEY (sd_4d64ec47001d82368e45, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_9680b0cd962818bfd026" FOREIGN KEY (sd_59ef74edde9313403766, vendor_id_gen) REFERENCES entity_master_vendors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_financial_documents ADD CONSTRAINT "sd_b8f393d02938d5c6874b" FOREIGN KEY (sd_fd700e017557db859daa, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_b4d230a85610fc5cdbd0" FOREIGN KEY (sd_7c0b2bc36fa980fc9080, workspace_id, vendor_bill_id_gen, vendor_id_gen) REFERENCES entity_financial_documents(collection, workspace_id, id, vendor_id_gen) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_6b89eddc618cc8772363" FOREIGN KEY (sd_716aaf0f55bb03272ee3, site_id_gen) REFERENCES entity_sites(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_34c053b687ca5636fb65" FOREIGN KEY (sd_a2f0728eafe7c5acc451, workspace_id, vendor_bill_id_gen) REFERENCES entity_financial_documents(collection, workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_be7c38ed56afd5c1cb40" FOREIGN KEY (sd_c842369ccf2e34a16434, vendor_id_gen) REFERENCES entity_master_vendors(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.entity_money_movements ADD CONSTRAINT "sd_c8554863e9cdbf031ec1" FOREIGN KEY (sd_12ad5eb38b143abb5cc3, work_order_id_gen) REFERENCES "entity_workOrders"(workspace_id, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "public"."entity_areas" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."uc_upload_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_entityReferenceAssignments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_dispatches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_drawings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_entityFileAttachments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_executionLogs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."uc_whatsapp_accounts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."uc_whatsapp_auth_state" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."uc_whatsapp_messages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."uc_workspace_operations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_contractors" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_articleVariants" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_articles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_catalogueArticleVendorLinks" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_fileAssets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_workspace_change_batches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_staff" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_sourcePartners" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_storageAccounts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_storageFolderInstances" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_storageFolderTemplates" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_subcategoryArticleMap" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_units" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_vendorRateHistories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_vendors" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_workCategories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_workSubcategories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_commercial_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_workOptionGroups" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_master_workOptionValues" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_measurementRevisions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_payrollLines" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."uc_upload_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_reference_libraries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_salaryAdjustments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_sites" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_rate_cards" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_recurringTasks" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_staffDocuments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_staffRolePermissions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_stockMovements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_variationRequests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_threads" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."uc_google_drive_credentials" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."uc_user_roles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_inventory" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_leaveRequests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_payrollPeriods" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_workspace_revision" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."uc_drive_folders" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."uc_upload_batches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."StaffRouteBundle" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_auditLog" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_customers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_policy_rules" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_workOrderCostLines" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_workRequired" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_acceptedScopes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_workOrders" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_tasks" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_visits" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_followups" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_attendance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_commissions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_commSends" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_grns" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_payments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_commercial_documents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_workflow_controls" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_financial_documents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."entity_money_movements" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_acceptedScopes workspace read" ON "public"."entity_acceptedScopes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_areas workspace read" ON "public"."entity_areas" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_attendance workspace read" ON "public"."entity_attendance" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_auditLog workspace read" ON "public"."entity_auditLog" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_commSends workspace read" ON "public"."entity_commSends" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_commissions workspace read" ON "public"."entity_commissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_customers workspace read" ON "public"."entity_customers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_dispatches workspace read" ON "public"."entity_dispatches" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_drawings workspace read" ON "public"."entity_drawings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_entityFileAttachments workspace read" ON "public"."entity_entityFileAttachments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_entityReferenceAssignments workspace read" ON "public"."entity_entityReferenceAssignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_executionLogs workspace read" ON "public"."entity_executionLogs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_followups workspace read" ON "public"."entity_followups" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_grns workspace read" ON "public"."entity_grns" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_inventory workspace read" ON "public"."entity_inventory" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_leaveRequests workspace read" ON "public"."entity_leaveRequests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_articleVariants workspace read" ON "public"."entity_master_articleVariants" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_articles workspace read" ON "public"."entity_master_articles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_catalogueArticleVendorLinks workspace read" ON "public"."entity_master_catalogueArticleVendorLinks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_contractors workspace read" ON "public"."entity_master_contractors" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_fileAssets workspace read" ON "public"."entity_master_fileAssets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_sourcePartners workspace read" ON "public"."entity_master_sourcePartners" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_storageAccounts workspace read" ON "public"."entity_master_storageAccounts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_storageFolderInstances workspace read" ON "public"."entity_master_storageFolderInstances" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_storageFolderTemplates workspace read" ON "public"."entity_master_storageFolderTemplates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_subcategoryArticleMap workspace read" ON "public"."entity_master_subcategoryArticleMap" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_units workspace read" ON "public"."entity_master_units" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_vendorRateHistories workspace read" ON "public"."entity_master_vendorRateHistories" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_vendors workspace read" ON "public"."entity_master_vendors" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_workCategories workspace read" ON "public"."entity_master_workCategories" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_workOptionGroups workspace read" ON "public"."entity_master_workOptionGroups" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_workOptionValues workspace read" ON "public"."entity_master_workOptionValues" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_master_workSubcategories workspace read" ON "public"."entity_master_workSubcategories" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_measurementRevisions workspace read" ON "public"."entity_measurementRevisions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_payments workspace read" ON "public"."entity_payments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_payrollLines workspace read" ON "public"."entity_payrollLines" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_payrollPeriods workspace read" ON "public"."entity_payrollPeriods" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_recurringTasks workspace read" ON "public"."entity_recurringTasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_salaryAdjustments workspace read" ON "public"."entity_salaryAdjustments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_sites workspace read" ON "public"."entity_sites" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_staffDocuments workspace read" ON "public"."entity_staffDocuments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_staffRolePermissions workspace read" ON "public"."entity_staffRolePermissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_stockMovements workspace read" ON "public"."entity_stockMovements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_tasks workspace read" ON "public"."entity_tasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_threads workspace read" ON "public"."entity_threads" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_variationRequests workspace read" ON "public"."entity_variationRequests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_visits workspace read" ON "public"."entity_visits" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_workOrderCostLines workspace read" ON "public"."entity_workOrderCostLines" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_workOrders workspace read" ON "public"."entity_workOrders" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "entity_workRequired workspace read" ON "public"."entity_workRequired" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((workspace_id = 'default'::text));

CREATE POLICY "Users can read their own UC role" ON "public"."uc_user_roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id));

GRANT INSERT ON "public"."entity_areas" TO "service_role";

GRANT SELECT ON "public"."entity_areas" TO "service_role";

GRANT UPDATE ON "public"."entity_areas" TO "service_role";

GRANT DELETE ON "public"."entity_areas" TO "service_role";

GRANT TRUNCATE ON "public"."entity_areas" TO "service_role";

GRANT REFERENCES ON "public"."entity_areas" TO "service_role";

GRANT TRIGGER ON "public"."entity_areas" TO "service_role";

GRANT INSERT ON "public"."uc_upload_events" TO "service_role";

GRANT SELECT ON "public"."uc_upload_events" TO "service_role";

GRANT UPDATE ON "public"."uc_upload_events" TO "service_role";

GRANT DELETE ON "public"."uc_upload_events" TO "service_role";

GRANT TRUNCATE ON "public"."uc_upload_events" TO "service_role";

GRANT REFERENCES ON "public"."uc_upload_events" TO "service_role";

GRANT TRIGGER ON "public"."uc_upload_events" TO "service_role";

GRANT INSERT ON "public"."entity_entityReferenceAssignments" TO "service_role";

GRANT SELECT ON "public"."entity_entityReferenceAssignments" TO "service_role";

GRANT UPDATE ON "public"."entity_entityReferenceAssignments" TO "service_role";

GRANT DELETE ON "public"."entity_entityReferenceAssignments" TO "service_role";

GRANT TRUNCATE ON "public"."entity_entityReferenceAssignments" TO "service_role";

GRANT REFERENCES ON "public"."entity_entityReferenceAssignments" TO "service_role";

GRANT TRIGGER ON "public"."entity_entityReferenceAssignments" TO "service_role";

GRANT INSERT ON "public"."entity_dispatches" TO "service_role";

GRANT SELECT ON "public"."entity_dispatches" TO "service_role";

GRANT UPDATE ON "public"."entity_dispatches" TO "service_role";

GRANT DELETE ON "public"."entity_dispatches" TO "service_role";

GRANT TRUNCATE ON "public"."entity_dispatches" TO "service_role";

GRANT REFERENCES ON "public"."entity_dispatches" TO "service_role";

GRANT TRIGGER ON "public"."entity_dispatches" TO "service_role";

GRANT INSERT ON "public"."entity_drawings" TO "service_role";

GRANT SELECT ON "public"."entity_drawings" TO "service_role";

GRANT UPDATE ON "public"."entity_drawings" TO "service_role";

GRANT DELETE ON "public"."entity_drawings" TO "service_role";

GRANT TRUNCATE ON "public"."entity_drawings" TO "service_role";

GRANT REFERENCES ON "public"."entity_drawings" TO "service_role";

GRANT TRIGGER ON "public"."entity_drawings" TO "service_role";

GRANT INSERT ON "public"."entity_entityFileAttachments" TO "service_role";

GRANT SELECT ON "public"."entity_entityFileAttachments" TO "service_role";

GRANT UPDATE ON "public"."entity_entityFileAttachments" TO "service_role";

GRANT DELETE ON "public"."entity_entityFileAttachments" TO "service_role";

GRANT TRUNCATE ON "public"."entity_entityFileAttachments" TO "service_role";

GRANT REFERENCES ON "public"."entity_entityFileAttachments" TO "service_role";

GRANT TRIGGER ON "public"."entity_entityFileAttachments" TO "service_role";

GRANT INSERT ON "public"."entity_executionLogs" TO "service_role";

GRANT SELECT ON "public"."entity_executionLogs" TO "service_role";

GRANT UPDATE ON "public"."entity_executionLogs" TO "service_role";

GRANT DELETE ON "public"."entity_executionLogs" TO "service_role";

GRANT TRUNCATE ON "public"."entity_executionLogs" TO "service_role";

GRANT REFERENCES ON "public"."entity_executionLogs" TO "service_role";

GRANT TRIGGER ON "public"."entity_executionLogs" TO "service_role";

GRANT INSERT ON "public"."uc_whatsapp_accounts" TO "service_role";

GRANT SELECT ON "public"."uc_whatsapp_accounts" TO "service_role";

GRANT UPDATE ON "public"."uc_whatsapp_accounts" TO "service_role";

GRANT DELETE ON "public"."uc_whatsapp_accounts" TO "service_role";

GRANT TRUNCATE ON "public"."uc_whatsapp_accounts" TO "service_role";

GRANT REFERENCES ON "public"."uc_whatsapp_accounts" TO "service_role";

GRANT TRIGGER ON "public"."uc_whatsapp_accounts" TO "service_role";

GRANT INSERT ON "public"."uc_whatsapp_auth_state" TO "service_role";

GRANT SELECT ON "public"."uc_whatsapp_auth_state" TO "service_role";

GRANT UPDATE ON "public"."uc_whatsapp_auth_state" TO "service_role";

GRANT DELETE ON "public"."uc_whatsapp_auth_state" TO "service_role";

GRANT TRUNCATE ON "public"."uc_whatsapp_auth_state" TO "service_role";

GRANT REFERENCES ON "public"."uc_whatsapp_auth_state" TO "service_role";

GRANT TRIGGER ON "public"."uc_whatsapp_auth_state" TO "service_role";

GRANT INSERT ON "public"."uc_whatsapp_messages" TO "service_role";

GRANT SELECT ON "public"."uc_whatsapp_messages" TO "service_role";

GRANT UPDATE ON "public"."uc_whatsapp_messages" TO "service_role";

GRANT DELETE ON "public"."uc_whatsapp_messages" TO "service_role";

GRANT TRUNCATE ON "public"."uc_whatsapp_messages" TO "service_role";

GRANT REFERENCES ON "public"."uc_whatsapp_messages" TO "service_role";

GRANT TRIGGER ON "public"."uc_whatsapp_messages" TO "service_role";

GRANT INSERT ON "public"."uc_workspace_operations" TO "service_role";

GRANT SELECT ON "public"."uc_workspace_operations" TO "service_role";

GRANT UPDATE ON "public"."uc_workspace_operations" TO "service_role";

GRANT DELETE ON "public"."uc_workspace_operations" TO "service_role";

GRANT TRUNCATE ON "public"."uc_workspace_operations" TO "service_role";

GRANT REFERENCES ON "public"."uc_workspace_operations" TO "service_role";

GRANT TRIGGER ON "public"."uc_workspace_operations" TO "service_role";

GRANT INSERT ON "public"."entity_master_contractors" TO "service_role";

GRANT SELECT ON "public"."entity_master_contractors" TO "service_role";

GRANT UPDATE ON "public"."entity_master_contractors" TO "service_role";

GRANT DELETE ON "public"."entity_master_contractors" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_contractors" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_contractors" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_contractors" TO "service_role";

GRANT INSERT ON "public"."entity_master_articleVariants" TO "service_role";

GRANT SELECT ON "public"."entity_master_articleVariants" TO "service_role";

GRANT UPDATE ON "public"."entity_master_articleVariants" TO "service_role";

GRANT DELETE ON "public"."entity_master_articleVariants" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_articleVariants" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_articleVariants" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_articleVariants" TO "service_role";

GRANT INSERT ON "public"."entity_master_articles" TO "service_role";

GRANT SELECT ON "public"."entity_master_articles" TO "service_role";

GRANT UPDATE ON "public"."entity_master_articles" TO "service_role";

GRANT DELETE ON "public"."entity_master_articles" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_articles" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_articles" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_articles" TO "service_role";

GRANT INSERT ON "public"."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT SELECT ON "public"."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT UPDATE ON "public"."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT DELETE ON "public"."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_catalogueArticleVendorLinks" TO "service_role";

GRANT INSERT ON "public"."entity_master_fileAssets" TO "service_role";

GRANT SELECT ON "public"."entity_master_fileAssets" TO "service_role";

GRANT UPDATE ON "public"."entity_master_fileAssets" TO "service_role";

GRANT DELETE ON "public"."entity_master_fileAssets" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_fileAssets" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_fileAssets" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_fileAssets" TO "service_role";

GRANT INSERT ON "public"."entity_workspace_change_batches" TO "service_role";

GRANT SELECT ON "public"."entity_workspace_change_batches" TO "service_role";

GRANT DELETE ON "public"."entity_workspace_change_batches" TO "service_role";

GRANT INSERT ON "public"."entity_master_staff" TO "service_role";

GRANT SELECT ON "public"."entity_master_staff" TO "service_role";

GRANT UPDATE ON "public"."entity_master_staff" TO "service_role";

GRANT DELETE ON "public"."entity_master_staff" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_staff" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_staff" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_staff" TO "service_role";

GRANT INSERT ON "public"."entity_master_sourcePartners" TO "service_role";

GRANT SELECT ON "public"."entity_master_sourcePartners" TO "service_role";

GRANT UPDATE ON "public"."entity_master_sourcePartners" TO "service_role";

GRANT DELETE ON "public"."entity_master_sourcePartners" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_sourcePartners" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_sourcePartners" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_sourcePartners" TO "service_role";

GRANT INSERT ON "public"."entity_master_storageAccounts" TO "service_role";

GRANT SELECT ON "public"."entity_master_storageAccounts" TO "service_role";

GRANT UPDATE ON "public"."entity_master_storageAccounts" TO "service_role";

GRANT DELETE ON "public"."entity_master_storageAccounts" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_storageAccounts" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_storageAccounts" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_storageAccounts" TO "service_role";

GRANT INSERT ON "public"."entity_master_storageFolderInstances" TO "service_role";

GRANT SELECT ON "public"."entity_master_storageFolderInstances" TO "service_role";

GRANT UPDATE ON "public"."entity_master_storageFolderInstances" TO "service_role";

GRANT DELETE ON "public"."entity_master_storageFolderInstances" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_storageFolderInstances" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_storageFolderInstances" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_storageFolderInstances" TO "service_role";

GRANT INSERT ON "public"."entity_master_storageFolderTemplates" TO "service_role";

GRANT SELECT ON "public"."entity_master_storageFolderTemplates" TO "service_role";

GRANT UPDATE ON "public"."entity_master_storageFolderTemplates" TO "service_role";

GRANT DELETE ON "public"."entity_master_storageFolderTemplates" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_storageFolderTemplates" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_storageFolderTemplates" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_storageFolderTemplates" TO "service_role";

GRANT INSERT ON "public"."entity_master_subcategoryArticleMap" TO "service_role";

GRANT SELECT ON "public"."entity_master_subcategoryArticleMap" TO "service_role";

GRANT UPDATE ON "public"."entity_master_subcategoryArticleMap" TO "service_role";

GRANT DELETE ON "public"."entity_master_subcategoryArticleMap" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_subcategoryArticleMap" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_subcategoryArticleMap" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_subcategoryArticleMap" TO "service_role";

GRANT INSERT ON "public"."entity_master_units" TO "service_role";

GRANT SELECT ON "public"."entity_master_units" TO "service_role";

GRANT UPDATE ON "public"."entity_master_units" TO "service_role";

GRANT DELETE ON "public"."entity_master_units" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_units" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_units" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_units" TO "service_role";

GRANT INSERT ON "public"."entity_master_vendorRateHistories" TO "service_role";

GRANT SELECT ON "public"."entity_master_vendorRateHistories" TO "service_role";

GRANT UPDATE ON "public"."entity_master_vendorRateHistories" TO "service_role";

GRANT DELETE ON "public"."entity_master_vendorRateHistories" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_vendorRateHistories" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_vendorRateHistories" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_vendorRateHistories" TO "service_role";

GRANT INSERT ON "public"."entity_master_vendors" TO "service_role";

GRANT SELECT ON "public"."entity_master_vendors" TO "service_role";

GRANT UPDATE ON "public"."entity_master_vendors" TO "service_role";

GRANT DELETE ON "public"."entity_master_vendors" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_vendors" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_vendors" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_vendors" TO "service_role";

GRANT INSERT ON "public"."entity_master_workCategories" TO "service_role";

GRANT SELECT ON "public"."entity_master_workCategories" TO "service_role";

GRANT UPDATE ON "public"."entity_master_workCategories" TO "service_role";

GRANT DELETE ON "public"."entity_master_workCategories" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_workCategories" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_workCategories" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_workCategories" TO "service_role";

GRANT INSERT ON "public"."entity_master_workSubcategories" TO "service_role";

GRANT SELECT ON "public"."entity_master_workSubcategories" TO "service_role";

GRANT UPDATE ON "public"."entity_master_workSubcategories" TO "service_role";

GRANT DELETE ON "public"."entity_master_workSubcategories" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_workSubcategories" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_workSubcategories" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_workSubcategories" TO "service_role";

GRANT INSERT ON "public"."entity_commercial_settings" TO "service_role";

GRANT SELECT ON "public"."entity_commercial_settings" TO "service_role";

GRANT UPDATE ON "public"."entity_commercial_settings" TO "service_role";

GRANT DELETE ON "public"."entity_commercial_settings" TO "service_role";

GRANT TRUNCATE ON "public"."entity_commercial_settings" TO "service_role";

GRANT REFERENCES ON "public"."entity_commercial_settings" TO "service_role";

GRANT TRIGGER ON "public"."entity_commercial_settings" TO "service_role";

GRANT INSERT ON "public"."entity_master_workOptionGroups" TO "service_role";

GRANT SELECT ON "public"."entity_master_workOptionGroups" TO "service_role";

GRANT UPDATE ON "public"."entity_master_workOptionGroups" TO "service_role";

GRANT DELETE ON "public"."entity_master_workOptionGroups" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_workOptionGroups" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_workOptionGroups" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_workOptionGroups" TO "service_role";

GRANT INSERT ON "public"."entity_master_workOptionValues" TO "service_role";

GRANT SELECT ON "public"."entity_master_workOptionValues" TO "service_role";

GRANT UPDATE ON "public"."entity_master_workOptionValues" TO "service_role";

GRANT DELETE ON "public"."entity_master_workOptionValues" TO "service_role";

GRANT TRUNCATE ON "public"."entity_master_workOptionValues" TO "service_role";

GRANT REFERENCES ON "public"."entity_master_workOptionValues" TO "service_role";

GRANT TRIGGER ON "public"."entity_master_workOptionValues" TO "service_role";

GRANT INSERT ON "public"."entity_measurementRevisions" TO "service_role";

GRANT SELECT ON "public"."entity_measurementRevisions" TO "service_role";

GRANT UPDATE ON "public"."entity_measurementRevisions" TO "service_role";

GRANT DELETE ON "public"."entity_measurementRevisions" TO "service_role";

GRANT TRUNCATE ON "public"."entity_measurementRevisions" TO "service_role";

GRANT REFERENCES ON "public"."entity_measurementRevisions" TO "service_role";

GRANT TRIGGER ON "public"."entity_measurementRevisions" TO "service_role";

GRANT INSERT ON "public"."entity_payrollLines" TO "service_role";

GRANT SELECT ON "public"."entity_payrollLines" TO "service_role";

GRANT UPDATE ON "public"."entity_payrollLines" TO "service_role";

GRANT DELETE ON "public"."entity_payrollLines" TO "service_role";

GRANT TRUNCATE ON "public"."entity_payrollLines" TO "service_role";

GRANT REFERENCES ON "public"."entity_payrollLines" TO "service_role";

GRANT TRIGGER ON "public"."entity_payrollLines" TO "service_role";

GRANT INSERT ON "public"."uc_upload_items" TO "service_role";

GRANT SELECT ON "public"."uc_upload_items" TO "service_role";

GRANT UPDATE ON "public"."uc_upload_items" TO "service_role";

GRANT DELETE ON "public"."uc_upload_items" TO "service_role";

GRANT TRUNCATE ON "public"."uc_upload_items" TO "service_role";

GRANT REFERENCES ON "public"."uc_upload_items" TO "service_role";

GRANT TRIGGER ON "public"."uc_upload_items" TO "service_role";

GRANT INSERT ON "public"."entity_reference_libraries" TO "service_role";

GRANT SELECT ON "public"."entity_reference_libraries" TO "service_role";

GRANT UPDATE ON "public"."entity_reference_libraries" TO "service_role";

GRANT DELETE ON "public"."entity_reference_libraries" TO "service_role";

GRANT TRUNCATE ON "public"."entity_reference_libraries" TO "service_role";

GRANT REFERENCES ON "public"."entity_reference_libraries" TO "service_role";

GRANT TRIGGER ON "public"."entity_reference_libraries" TO "service_role";

GRANT INSERT ON "public"."entity_salaryAdjustments" TO "service_role";

GRANT SELECT ON "public"."entity_salaryAdjustments" TO "service_role";

GRANT UPDATE ON "public"."entity_salaryAdjustments" TO "service_role";

GRANT DELETE ON "public"."entity_salaryAdjustments" TO "service_role";

GRANT TRUNCATE ON "public"."entity_salaryAdjustments" TO "service_role";

GRANT REFERENCES ON "public"."entity_salaryAdjustments" TO "service_role";

GRANT TRIGGER ON "public"."entity_salaryAdjustments" TO "service_role";

GRANT INSERT ON "public"."entity_sites" TO "service_role";

GRANT SELECT ON "public"."entity_sites" TO "service_role";

GRANT UPDATE ON "public"."entity_sites" TO "service_role";

GRANT DELETE ON "public"."entity_sites" TO "service_role";

GRANT TRUNCATE ON "public"."entity_sites" TO "service_role";

GRANT REFERENCES ON "public"."entity_sites" TO "service_role";

GRANT TRIGGER ON "public"."entity_sites" TO "service_role";

GRANT INSERT ON "public"."entity_rate_cards" TO "service_role";

GRANT SELECT ON "public"."entity_rate_cards" TO "service_role";

GRANT UPDATE ON "public"."entity_rate_cards" TO "service_role";

GRANT DELETE ON "public"."entity_rate_cards" TO "service_role";

GRANT TRUNCATE ON "public"."entity_rate_cards" TO "service_role";

GRANT REFERENCES ON "public"."entity_rate_cards" TO "service_role";

GRANT TRIGGER ON "public"."entity_rate_cards" TO "service_role";

GRANT INSERT ON "public"."entity_recurringTasks" TO "service_role";

GRANT SELECT ON "public"."entity_recurringTasks" TO "service_role";

GRANT UPDATE ON "public"."entity_recurringTasks" TO "service_role";

GRANT DELETE ON "public"."entity_recurringTasks" TO "service_role";

GRANT TRUNCATE ON "public"."entity_recurringTasks" TO "service_role";

GRANT REFERENCES ON "public"."entity_recurringTasks" TO "service_role";

GRANT TRIGGER ON "public"."entity_recurringTasks" TO "service_role";

GRANT INSERT ON "public"."entity_staffDocuments" TO "service_role";

GRANT SELECT ON "public"."entity_staffDocuments" TO "service_role";

GRANT UPDATE ON "public"."entity_staffDocuments" TO "service_role";

GRANT DELETE ON "public"."entity_staffDocuments" TO "service_role";

GRANT TRUNCATE ON "public"."entity_staffDocuments" TO "service_role";

GRANT REFERENCES ON "public"."entity_staffDocuments" TO "service_role";

GRANT TRIGGER ON "public"."entity_staffDocuments" TO "service_role";

GRANT INSERT ON "public"."entity_staffRolePermissions" TO "service_role";

GRANT SELECT ON "public"."entity_staffRolePermissions" TO "service_role";

GRANT UPDATE ON "public"."entity_staffRolePermissions" TO "service_role";

GRANT DELETE ON "public"."entity_staffRolePermissions" TO "service_role";

GRANT TRUNCATE ON "public"."entity_staffRolePermissions" TO "service_role";

GRANT REFERENCES ON "public"."entity_staffRolePermissions" TO "service_role";

GRANT TRIGGER ON "public"."entity_staffRolePermissions" TO "service_role";

GRANT INSERT ON "public"."entity_stockMovements" TO "service_role";

GRANT SELECT ON "public"."entity_stockMovements" TO "service_role";

GRANT UPDATE ON "public"."entity_stockMovements" TO "service_role";

GRANT DELETE ON "public"."entity_stockMovements" TO "service_role";

GRANT TRUNCATE ON "public"."entity_stockMovements" TO "service_role";

GRANT REFERENCES ON "public"."entity_stockMovements" TO "service_role";

GRANT TRIGGER ON "public"."entity_stockMovements" TO "service_role";

GRANT INSERT ON "public"."entity_variationRequests" TO "service_role";

GRANT SELECT ON "public"."entity_variationRequests" TO "service_role";

GRANT UPDATE ON "public"."entity_variationRequests" TO "service_role";

GRANT DELETE ON "public"."entity_variationRequests" TO "service_role";

GRANT TRUNCATE ON "public"."entity_variationRequests" TO "service_role";

GRANT REFERENCES ON "public"."entity_variationRequests" TO "service_role";

GRANT TRIGGER ON "public"."entity_variationRequests" TO "service_role";

GRANT INSERT ON "public"."entity_threads" TO "service_role";

GRANT SELECT ON "public"."entity_threads" TO "service_role";

GRANT UPDATE ON "public"."entity_threads" TO "service_role";

GRANT DELETE ON "public"."entity_threads" TO "service_role";

GRANT TRUNCATE ON "public"."entity_threads" TO "service_role";

GRANT REFERENCES ON "public"."entity_threads" TO "service_role";

GRANT TRIGGER ON "public"."entity_threads" TO "service_role";

GRANT INSERT ON "public"."uc_google_drive_credentials" TO "service_role";

GRANT SELECT ON "public"."uc_google_drive_credentials" TO "service_role";

GRANT UPDATE ON "public"."uc_google_drive_credentials" TO "service_role";

GRANT DELETE ON "public"."uc_google_drive_credentials" TO "service_role";

GRANT TRUNCATE ON "public"."uc_google_drive_credentials" TO "service_role";

GRANT REFERENCES ON "public"."uc_google_drive_credentials" TO "service_role";

GRANT TRIGGER ON "public"."uc_google_drive_credentials" TO "service_role";

GRANT SELECT ON "public"."uc_user_roles" TO "authenticated";

GRANT INSERT ON "public"."uc_user_roles" TO "service_role";

GRANT SELECT ON "public"."uc_user_roles" TO "service_role";

GRANT UPDATE ON "public"."uc_user_roles" TO "service_role";

GRANT DELETE ON "public"."uc_user_roles" TO "service_role";

GRANT TRUNCATE ON "public"."uc_user_roles" TO "service_role";

GRANT REFERENCES ON "public"."uc_user_roles" TO "service_role";

GRANT TRIGGER ON "public"."uc_user_roles" TO "service_role";

GRANT INSERT ON "public"."entity_inventory" TO "service_role";

GRANT SELECT ON "public"."entity_inventory" TO "service_role";

GRANT UPDATE ON "public"."entity_inventory" TO "service_role";

GRANT DELETE ON "public"."entity_inventory" TO "service_role";

GRANT TRUNCATE ON "public"."entity_inventory" TO "service_role";

GRANT REFERENCES ON "public"."entity_inventory" TO "service_role";

GRANT TRIGGER ON "public"."entity_inventory" TO "service_role";

GRANT INSERT ON "public"."entity_leaveRequests" TO "service_role";

GRANT SELECT ON "public"."entity_leaveRequests" TO "service_role";

GRANT UPDATE ON "public"."entity_leaveRequests" TO "service_role";

GRANT DELETE ON "public"."entity_leaveRequests" TO "service_role";

GRANT TRUNCATE ON "public"."entity_leaveRequests" TO "service_role";

GRANT REFERENCES ON "public"."entity_leaveRequests" TO "service_role";

GRANT TRIGGER ON "public"."entity_leaveRequests" TO "service_role";

GRANT INSERT ON "public"."entity_payrollPeriods" TO "service_role";

GRANT SELECT ON "public"."entity_payrollPeriods" TO "service_role";

GRANT UPDATE ON "public"."entity_payrollPeriods" TO "service_role";

GRANT DELETE ON "public"."entity_payrollPeriods" TO "service_role";

GRANT TRUNCATE ON "public"."entity_payrollPeriods" TO "service_role";

GRANT REFERENCES ON "public"."entity_payrollPeriods" TO "service_role";

GRANT TRIGGER ON "public"."entity_payrollPeriods" TO "service_role";

GRANT INSERT ON "public"."entity_workspace_revision" TO "service_role";

GRANT SELECT ON "public"."entity_workspace_revision" TO "service_role";

GRANT UPDATE ON "public"."entity_workspace_revision" TO "service_role";

GRANT DELETE ON "public"."entity_workspace_revision" TO "service_role";

GRANT INSERT ON "public"."uc_drive_folders" TO "service_role";

GRANT SELECT ON "public"."uc_drive_folders" TO "service_role";

GRANT UPDATE ON "public"."uc_drive_folders" TO "service_role";

GRANT DELETE ON "public"."uc_drive_folders" TO "service_role";

GRANT TRUNCATE ON "public"."uc_drive_folders" TO "service_role";

GRANT REFERENCES ON "public"."uc_drive_folders" TO "service_role";

GRANT TRIGGER ON "public"."uc_drive_folders" TO "service_role";

GRANT INSERT ON "public"."uc_upload_batches" TO "service_role";

GRANT SELECT ON "public"."uc_upload_batches" TO "service_role";

GRANT UPDATE ON "public"."uc_upload_batches" TO "service_role";

GRANT DELETE ON "public"."uc_upload_batches" TO "service_role";

GRANT TRUNCATE ON "public"."uc_upload_batches" TO "service_role";

GRANT REFERENCES ON "public"."uc_upload_batches" TO "service_role";

GRANT TRIGGER ON "public"."uc_upload_batches" TO "service_role";

GRANT INSERT ON "public"."StaffRouteBundle" TO "service_role";

GRANT SELECT ON "public"."StaffRouteBundle" TO "service_role";

GRANT UPDATE ON "public"."StaffRouteBundle" TO "service_role";

GRANT DELETE ON "public"."StaffRouteBundle" TO "service_role";

GRANT INSERT ON "public"."entity_auditLog" TO "service_role";

GRANT SELECT ON "public"."entity_auditLog" TO "service_role";

GRANT UPDATE ON "public"."entity_auditLog" TO "service_role";

GRANT DELETE ON "public"."entity_auditLog" TO "service_role";

GRANT TRUNCATE ON "public"."entity_auditLog" TO "service_role";

GRANT REFERENCES ON "public"."entity_auditLog" TO "service_role";

GRANT TRIGGER ON "public"."entity_auditLog" TO "service_role";

GRANT INSERT ON "public"."entity_customers" TO "service_role";

GRANT SELECT ON "public"."entity_customers" TO "service_role";

GRANT UPDATE ON "public"."entity_customers" TO "service_role";

GRANT DELETE ON "public"."entity_customers" TO "service_role";

GRANT TRUNCATE ON "public"."entity_customers" TO "service_role";

GRANT REFERENCES ON "public"."entity_customers" TO "service_role";

GRANT TRIGGER ON "public"."entity_customers" TO "service_role";

GRANT INSERT ON "public"."entity_policy_rules" TO "service_role";

GRANT SELECT ON "public"."entity_policy_rules" TO "service_role";

GRANT UPDATE ON "public"."entity_policy_rules" TO "service_role";

GRANT DELETE ON "public"."entity_policy_rules" TO "service_role";

GRANT TRUNCATE ON "public"."entity_policy_rules" TO "service_role";

GRANT REFERENCES ON "public"."entity_policy_rules" TO "service_role";

GRANT TRIGGER ON "public"."entity_policy_rules" TO "service_role";

GRANT INSERT ON "public"."entity_workOrderCostLines" TO "service_role";

GRANT SELECT ON "public"."entity_workOrderCostLines" TO "service_role";

GRANT UPDATE ON "public"."entity_workOrderCostLines" TO "service_role";

GRANT DELETE ON "public"."entity_workOrderCostLines" TO "service_role";

GRANT TRUNCATE ON "public"."entity_workOrderCostLines" TO "service_role";

GRANT REFERENCES ON "public"."entity_workOrderCostLines" TO "service_role";

GRANT TRIGGER ON "public"."entity_workOrderCostLines" TO "service_role";

GRANT INSERT ON "public"."entity_workRequired" TO "service_role";

GRANT SELECT ON "public"."entity_workRequired" TO "service_role";

GRANT UPDATE ON "public"."entity_workRequired" TO "service_role";

GRANT DELETE ON "public"."entity_workRequired" TO "service_role";

GRANT TRUNCATE ON "public"."entity_workRequired" TO "service_role";

GRANT REFERENCES ON "public"."entity_workRequired" TO "service_role";

GRANT TRIGGER ON "public"."entity_workRequired" TO "service_role";

GRANT INSERT ON "public"."entity_acceptedScopes" TO "service_role";

GRANT SELECT ON "public"."entity_acceptedScopes" TO "service_role";

GRANT UPDATE ON "public"."entity_acceptedScopes" TO "service_role";

GRANT DELETE ON "public"."entity_acceptedScopes" TO "service_role";

GRANT TRUNCATE ON "public"."entity_acceptedScopes" TO "service_role";

GRANT REFERENCES ON "public"."entity_acceptedScopes" TO "service_role";

GRANT TRIGGER ON "public"."entity_acceptedScopes" TO "service_role";

GRANT INSERT ON "public"."entity_workOrders" TO "service_role";

GRANT SELECT ON "public"."entity_workOrders" TO "service_role";

GRANT UPDATE ON "public"."entity_workOrders" TO "service_role";

GRANT DELETE ON "public"."entity_workOrders" TO "service_role";

GRANT TRUNCATE ON "public"."entity_workOrders" TO "service_role";

GRANT REFERENCES ON "public"."entity_workOrders" TO "service_role";

GRANT TRIGGER ON "public"."entity_workOrders" TO "service_role";

GRANT INSERT ON "public"."entity_tasks" TO "service_role";

GRANT SELECT ON "public"."entity_tasks" TO "service_role";

GRANT UPDATE ON "public"."entity_tasks" TO "service_role";

GRANT DELETE ON "public"."entity_tasks" TO "service_role";

GRANT TRUNCATE ON "public"."entity_tasks" TO "service_role";

GRANT REFERENCES ON "public"."entity_tasks" TO "service_role";

GRANT TRIGGER ON "public"."entity_tasks" TO "service_role";

GRANT INSERT ON "public"."entity_visits" TO "service_role";

GRANT SELECT ON "public"."entity_visits" TO "service_role";

GRANT UPDATE ON "public"."entity_visits" TO "service_role";

GRANT DELETE ON "public"."entity_visits" TO "service_role";

GRANT TRUNCATE ON "public"."entity_visits" TO "service_role";

GRANT REFERENCES ON "public"."entity_visits" TO "service_role";

GRANT TRIGGER ON "public"."entity_visits" TO "service_role";

GRANT INSERT ON "public"."entity_followups" TO "service_role";

GRANT SELECT ON "public"."entity_followups" TO "service_role";

GRANT UPDATE ON "public"."entity_followups" TO "service_role";

GRANT DELETE ON "public"."entity_followups" TO "service_role";

GRANT TRUNCATE ON "public"."entity_followups" TO "service_role";

GRANT REFERENCES ON "public"."entity_followups" TO "service_role";

GRANT TRIGGER ON "public"."entity_followups" TO "service_role";

GRANT INSERT ON "public"."entity_attendance" TO "service_role";

GRANT SELECT ON "public"."entity_attendance" TO "service_role";

GRANT UPDATE ON "public"."entity_attendance" TO "service_role";

GRANT DELETE ON "public"."entity_attendance" TO "service_role";

GRANT TRUNCATE ON "public"."entity_attendance" TO "service_role";

GRANT REFERENCES ON "public"."entity_attendance" TO "service_role";

GRANT TRIGGER ON "public"."entity_attendance" TO "service_role";

GRANT INSERT ON "public"."entity_commissions" TO "service_role";

GRANT SELECT ON "public"."entity_commissions" TO "service_role";

GRANT UPDATE ON "public"."entity_commissions" TO "service_role";

GRANT DELETE ON "public"."entity_commissions" TO "service_role";

GRANT TRUNCATE ON "public"."entity_commissions" TO "service_role";

GRANT REFERENCES ON "public"."entity_commissions" TO "service_role";

GRANT TRIGGER ON "public"."entity_commissions" TO "service_role";

GRANT INSERT ON "public"."entity_commSends" TO "service_role";

GRANT SELECT ON "public"."entity_commSends" TO "service_role";

GRANT UPDATE ON "public"."entity_commSends" TO "service_role";

GRANT DELETE ON "public"."entity_commSends" TO "service_role";

GRANT TRUNCATE ON "public"."entity_commSends" TO "service_role";

GRANT REFERENCES ON "public"."entity_commSends" TO "service_role";

GRANT TRIGGER ON "public"."entity_commSends" TO "service_role";

GRANT INSERT ON "public"."entity_grns" TO "service_role";

GRANT SELECT ON "public"."entity_grns" TO "service_role";

GRANT UPDATE ON "public"."entity_grns" TO "service_role";

GRANT DELETE ON "public"."entity_grns" TO "service_role";

GRANT TRUNCATE ON "public"."entity_grns" TO "service_role";

GRANT REFERENCES ON "public"."entity_grns" TO "service_role";

GRANT TRIGGER ON "public"."entity_grns" TO "service_role";

GRANT INSERT ON "public"."entity_payments" TO "service_role";

GRANT SELECT ON "public"."entity_payments" TO "service_role";

GRANT UPDATE ON "public"."entity_payments" TO "service_role";

GRANT DELETE ON "public"."entity_payments" TO "service_role";

GRANT TRUNCATE ON "public"."entity_payments" TO "service_role";

GRANT REFERENCES ON "public"."entity_payments" TO "service_role";

GRANT TRIGGER ON "public"."entity_payments" TO "service_role";

GRANT INSERT ON "public"."entity_commercial_documents" TO "service_role";

GRANT SELECT ON "public"."entity_commercial_documents" TO "service_role";

GRANT UPDATE ON "public"."entity_commercial_documents" TO "service_role";

GRANT DELETE ON "public"."entity_commercial_documents" TO "service_role";

GRANT TRUNCATE ON "public"."entity_commercial_documents" TO "service_role";

GRANT REFERENCES ON "public"."entity_commercial_documents" TO "service_role";

GRANT TRIGGER ON "public"."entity_commercial_documents" TO "service_role";

GRANT INSERT ON "public"."entity_workflow_controls" TO "service_role";

GRANT SELECT ON "public"."entity_workflow_controls" TO "service_role";

GRANT UPDATE ON "public"."entity_workflow_controls" TO "service_role";

GRANT DELETE ON "public"."entity_workflow_controls" TO "service_role";

GRANT TRUNCATE ON "public"."entity_workflow_controls" TO "service_role";

GRANT REFERENCES ON "public"."entity_workflow_controls" TO "service_role";

GRANT TRIGGER ON "public"."entity_workflow_controls" TO "service_role";

GRANT INSERT ON "public"."entity_financial_documents" TO "service_role";

GRANT SELECT ON "public"."entity_financial_documents" TO "service_role";

GRANT UPDATE ON "public"."entity_financial_documents" TO "service_role";

GRANT DELETE ON "public"."entity_financial_documents" TO "service_role";

GRANT TRUNCATE ON "public"."entity_financial_documents" TO "service_role";

GRANT REFERENCES ON "public"."entity_financial_documents" TO "service_role";

GRANT TRIGGER ON "public"."entity_financial_documents" TO "service_role";

GRANT INSERT ON "public"."entity_money_movements" TO "service_role";

GRANT SELECT ON "public"."entity_money_movements" TO "service_role";

GRANT UPDATE ON "public"."entity_money_movements" TO "service_role";

GRANT DELETE ON "public"."entity_money_movements" TO "service_role";

GRANT TRUNCATE ON "public"."entity_money_movements" TO "service_role";

GRANT REFERENCES ON "public"."entity_money_movements" TO "service_role";

GRANT TRIGGER ON "public"."entity_money_movements" TO "service_role";

CREATE TRIGGER entity_customers_canonicalize BEFORE INSERT OR UPDATE OF data, workspace_id, id ON public.entity_customers FOR EACH ROW EXECUTE FUNCTION private.uc_canonicalize_customer_row();

CREATE TRIGGER entity_customers_sync_identities AFTER INSERT OR UPDATE OF data, workspace_id, id ON public.entity_customers FOR EACH ROW EXECUTE FUNCTION private.uc_sync_customer_contact_identities();

CREATE TRIGGER entity_tasks_staff_assignment_guard BEFORE INSERT OR UPDATE OF data ON public.entity_tasks FOR EACH ROW EXECUTE FUNCTION uc_guard_staff_assignment();

CREATE TRIGGER entity_followups_staff_assignment_guard BEFORE INSERT OR UPDATE OF data ON public.entity_followups FOR EACH ROW EXECUTE FUNCTION uc_guard_staff_assignment();

CREATE TRIGGER entity_visits_staff_assignment_guard BEFORE INSERT OR UPDATE OF data ON public.entity_visits FOR EACH ROW EXECUTE FUNCTION uc_guard_staff_assignment();

CREATE TRIGGER entity_recurring_tasks_staff_assignment_guard BEFORE INSERT OR UPDATE OF data ON public."entity_recurringTasks" FOR EACH ROW EXECUTE FUNCTION uc_guard_staff_assignment();

CREATE TRIGGER entity_attendance_staff_history_normalizer BEFORE INSERT OR UPDATE OF data ON public.entity_attendance FOR EACH ROW EXECUTE FUNCTION uc_normalize_staff_history_payload();

CREATE TRIGGER entity_payroll_lines_staff_history_normalizer BEFORE INSERT OR UPDATE OF data ON public."entity_payrollLines" FOR EACH ROW EXECUTE FUNCTION uc_normalize_staff_history_payload();

CREATE TRIGGER entity_leave_requests_staff_history_normalizer BEFORE INSERT OR UPDATE OF data ON public."entity_leaveRequests" FOR EACH ROW EXECUTE FUNCTION uc_normalize_staff_history_payload();

CREATE TRIGGER entity_salary_adjustments_staff_history_normalizer BEFORE INSERT OR UPDATE OF data ON public."entity_salaryAdjustments" FOR EACH ROW EXECUTE FUNCTION uc_normalize_staff_history_payload();

CREATE TRIGGER entity_master_work_categories_history_guard BEFORE INSERT OR DELETE OR UPDATE ON public."entity_master_workCategories" FOR EACH ROW EXECUTE FUNCTION uc_guard_work_category_history();

CREATE TRIGGER entity_master_work_subcategories_history_guard BEFORE INSERT OR DELETE OR UPDATE ON public."entity_master_workSubcategories" FOR EACH ROW EXECUTE FUNCTION uc_guard_work_subcategory_history();

CREATE TRIGGER entity_master_shared_service_categories_guard BEFORE INSERT OR UPDATE ON public."entity_master_workSubcategories" FOR EACH ROW EXECUTE FUNCTION uc_guard_shared_service_categories();

CREATE TRIGGER shared_approval_policy_staff_guard BEFORE INSERT OR UPDATE OF data ON public.entity_policy_rules FOR EACH ROW WHEN ((new.collection = 'approvalPolicies'::text)) EXECUTE FUNCTION uc_guard_staff_assignment('entity_approvalPolicies');
