-- ============================================================================
-- Stage 2 — DB Schema Fixes
-- ============================================================================
-- This migration fixes 3 issues found in the bug audit:
--   2.1  Missing FK constraint for entity_workOrders.abandoned_contractor_id (H12)
--   2.2  Indexes on all 188 generated _gen FK columns (Systemic #4 — perf)
--   2.3  auth_user_id_gen column + index on entity_master_staff (H1 — O(1) login)
--
-- HOW TO RUN:
--   Paste this ENTIRE file into the Supabase Dashboard → SQL Editor → Run.
--   It is fully idempotent (uses IF NOT EXISTS / IF EXISTS) — safe to re-run.
--
-- NOTE on CONCURRENTLY:
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction block. If your
--   SQL Editor wraps everything in a transaction, run the index statements
--   one at a time, OR remove "CONCURRENTLY" (slower but transaction-safe).
--   The Supabase SQL Editor runs each statement independently by default.
-- ============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2.1  FIX MISSING FK: entity_workOrders.abandoned_contractor_id  (H12)    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- The previous migration (add-fk-constraints-complete.sql line 690-691) added
-- the generated column and DROPPED the old constraint, but never re-added the
-- new FK. This completes the 3-line pattern.

ALTER TABLE "entity_workOrders" DROP CONSTRAINT IF EXISTS "entity_workOrders_abandoned_contractor_id_fkey";
ALTER TABLE "entity_workOrders" ADD CONSTRAINT "entity_workOrders_abandoned_contractor_id_fkey"
    FOREIGN KEY ("abandoned_contractor_id_gen") REFERENCES "entity_master_contractors"(id) NOT VALID;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2.3  auth_user_id_gen column + index on entity_master_staff  (H1)        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- The login flow (auth.ts:79-88) currently loads ALL staff rows and filters
-- in JS by data->>auth_user_id. This generated column + index enables an
-- O(1) server-side .eq("auth_user_id_gen", userId).maybeSingle() lookup.

ALTER TABLE "entity_master_staff" ADD COLUMN IF NOT EXISTS "auth_user_id_gen" text
    GENERATED ALWAYS AS (NULLIF(data->>'auth_user_id', '')) STORED;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_staff_auth_user_id"
    ON "entity_master_staff" ("auth_user_id_gen");

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2.4  RPC: get_auth_user_by_email  (H22 — O(1) signup user lookup)        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- The signup flow (auth-users.ts:findAuthUserByEmail) used to paginate through
-- ALL auth users via listUsers — O(N) and DOS-able. This RPC does an O(1)
-- lookup using the unique index on auth.users.email. SECURITY DEFINER is
-- required because auth.users is not readable via the anon/authenticated role.

CREATE OR REPLACE FUNCTION public.get_auth_user_by_email(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'id', u.id::text,
    'email', u.email,
    'email_confirmed_at', u.email_confirmed_at,
    'created_at', u.created_at,
    'user_metadata', u.user_metadata
  )
  INTO result
  FROM auth.users u
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
  RETURN result;
END;
$$;

-- Allow the service role (used by the app's admin client) to call this function.
-- The anon/authenticated roles are NOT granted — only the server-side admin client uses it.
REVOKE ALL ON FUNCTION public.get_auth_user_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_by_email(text) TO service_role;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2.2  Indexes on ALL 188 generated _gen FK columns  (Systemic #4)         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Every FK enforcement and JOIN on a _gen column currently does a sequential
-- scan. These 188 indexes make them O(log N). This is the single biggest
-- performance win for the app at scale.

-- Stage 2.2: Indexes on all generated _gen FK columns
-- These indexes make FK enforcement and JOINs O(log N) instead of O(N) seq scan.
-- Run each statement separately (CONCURRENTLY cannot run inside a transaction).

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_sites_customer_id_gen" ON "entity_sites" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_areas_site_id_gen" ON "entity_areas" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_workRequired_customer_id_gen" ON "entity_workRequired" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_workRequired_site_id_gen" ON "entity_workRequired" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_measurementRevisions_site_id_gen" ON "entity_measurementRevisions" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_measurementRevisions_area_id_gen" ON "entity_measurementRevisions" ("area_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_measurementRevisions_work_required_id_gen" ON "entity_measurementRevisions" ("work_required_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_measurementRevisions_drawing_id_gen" ON "entity_measurementRevisions" ("drawing_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_quotations_customer_id_gen" ON "entity_quotations" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_quotations_site_id_gen" ON "entity_quotations" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_acceptedScopes_customer_id_gen" ON "entity_acceptedScopes" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_acceptedScopes_site_id_gen" ON "entity_acceptedScopes" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_acceptedScopes_work_required_id_gen" ON "entity_acceptedScopes" ("work_required_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_acceptedScopes_quotation_id_gen" ON "entity_acceptedScopes" ("quotation_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_workOrders_customer_id_gen" ON "entity_workOrders" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_workOrders_site_id_gen" ON "entity_workOrders" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_boqs_work_order_id_gen" ON "entity_boqs" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorRfqs_work_order_id_gen" ON "entity_vendorRfqs" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorRfqs_boq_id_gen" ON "entity_vendorRfqs" ("boq_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorRfqs_site_id_gen" ON "entity_vendorRfqs" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorBids_rfq_id_gen" ON "entity_vendorBids" ("rfq_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorBids_vendor_id_gen" ON "entity_vendorBids" ("vendor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_purchaseOrders_rfq_id_gen" ON "entity_purchaseOrders" ("rfq_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_purchaseOrders_work_order_id_gen" ON "entity_purchaseOrders" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_purchaseOrders_vendor_id_gen" ON "entity_purchaseOrders" ("vendor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_purchaseOrders_site_id_gen" ON "entity_purchaseOrders" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_grns_po_id_gen" ON "entity_grns" ("po_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_grns_vendor_id_gen" ON "entity_grns" ("vendor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_grns_work_order_id_gen" ON "entity_grns" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_grns_site_id_gen" ON "entity_grns" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_dispatches_work_order_id_gen" ON "entity_dispatches" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_dispatches_site_id_gen" ON "entity_dispatches" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_inventory_grn_id_gen" ON "entity_inventory" ("grn_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_inventory_work_order_id_gen" ON "entity_inventory" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_inventory_article_id_gen" ON "entity_inventory" ("article_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_inventory_work_required_article_id_gen" ON "entity_inventory" ("work_required_article_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_stockMovements_inventory_id_gen" ON "entity_stockMovements" ("inventory_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_stockMovements_work_order_id_gen" ON "entity_stockMovements" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_stockMovements_po_id_gen" ON "entity_stockMovements" ("po_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_stockMovements_grn_id_gen" ON "entity_stockMovements" ("grn_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_stockMovements_dispatch_id_gen" ON "entity_stockMovements" ("dispatch_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorBills_po_id_gen" ON "entity_vendorBills" ("po_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorBills_grn_id_gen" ON "entity_vendorBills" ("grn_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorBills_vendor_id_gen" ON "entity_vendorBills" ("vendor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorBills_work_order_id_gen" ON "entity_vendorBills" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorBills_site_id_gen" ON "entity_vendorBills" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorPayments_vendor_bill_id_gen" ON "entity_vendorPayments" ("vendor_bill_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorPayments_vendor_id_gen" ON "entity_vendorPayments" ("vendor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorPayments_work_order_id_gen" ON "entity_vendorPayments" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_vendorPayments_site_id_gen" ON "entity_vendorPayments" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorBills_work_order_id_gen" ON "entity_contractorBills" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorBills_contractor_id_gen" ON "entity_contractorBills" ("contractor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorBills_customer_id_gen" ON "entity_contractorBills" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorBills_site_id_gen" ON "entity_contractorBills" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorBills_work_required_id_gen" ON "entity_contractorBills" ("work_required_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorPayments_contractor_bill_id_gen" ON "entity_contractorPayments" ("contractor_bill_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorPayments_work_order_id_gen" ON "entity_contractorPayments" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorPayments_contractor_id_gen" ON "entity_contractorPayments" ("contractor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_commissions_work_order_id_gen" ON "entity_commissions" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_commissions_source_partner_id_gen" ON "entity_commissions" ("source_partner_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_commissions_customer_id_gen" ON "entity_commissions" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_commissions_quotation_id_gen" ON "entity_commissions" ("quotation_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_workOrderCostLines_work_order_id_gen" ON "entity_workOrderCostLines" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorBids_work_order_id_gen" ON "entity_contractorBids" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorBids_contractor_id_gen" ON "entity_contractorBids" ("contractor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorBids_accepted_scope_id_gen" ON "entity_contractorBids" ("accepted_scope_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorSettlements_work_order_id_gen" ON "entity_contractorSettlements" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorSettlements_contractor_id_gen" ON "entity_contractorSettlements" ("contractor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_drawings_site_id_gen" ON "entity_drawings" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_drawings_work_order_id_gen" ON "entity_drawings" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_drawings_area_id_gen" ON "entity_drawings" ("area_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_executionLogs_work_order_id_gen" ON "entity_executionLogs" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_executionLogs_filed_by_staff_id_gen" ON "entity_executionLogs" ("filed_by_staff_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_executionLogs_site_id_gen" ON "entity_executionLogs" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_variationRequests_work_order_id_gen" ON "entity_variationRequests" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_variationRequests_customer_id_gen" ON "entity_variationRequests" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_variationRequests_site_id_gen" ON "entity_variationRequests" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_visits_customer_id_gen" ON "entity_visits" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_visits_site_id_gen" ON "entity_visits" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_visits_work_required_id_gen" ON "entity_visits" ("work_required_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_visits_work_order_id_gen" ON "entity_visits" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_visits_staff_id_gen" ON "entity_visits" ("staff_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_visits_contractor_id_gen" ON "entity_visits" ("contractor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_visits_vendor_id_gen" ON "entity_visits" ("vendor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_tasks_customer_id_gen" ON "entity_tasks" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_tasks_work_order_id_gen" ON "entity_tasks" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_tasks_quotation_id_gen" ON "entity_tasks" ("quotation_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_tasks_site_id_gen" ON "entity_tasks" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_tasks_visit_id_gen" ON "entity_tasks" ("visit_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_tasks_po_id_gen" ON "entity_tasks" ("po_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_tasks_work_required_id_gen" ON "entity_tasks" ("work_required_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_followups_customer_id_gen" ON "entity_followups" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_followups_quotation_id_gen" ON "entity_followups" ("quotation_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_followups_payment_id_gen" ON "entity_followups" ("payment_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_followups_visit_id_gen" ON "entity_followups" ("visit_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_followups_work_required_id_gen" ON "entity_followups" ("work_required_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_actions_customer_id_gen" ON "entity_actions" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_payments_customer_id_gen" ON "entity_payments" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_payments_site_id_gen" ON "entity_payments" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_payments_work_order_id_gen" ON "entity_payments" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_payments_quotation_id_gen" ON "entity_payments" ("quotation_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_payments_work_required_id_gen" ON "entity_payments" ("work_required_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_payments_invoice_id_gen" ON "entity_payments" ("invoice_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_invoices_customer_id_gen" ON "entity_invoices" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_invoices_site_id_gen" ON "entity_invoices" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_invoices_work_order_id_gen" ON "entity_invoices" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_invoices_quotation_id_gen" ON "entity_invoices" ("quotation_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_invoices_work_required_id_gen" ON "entity_invoices" ("work_required_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_invoices_payment_id_gen" ON "entity_invoices" ("payment_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_customerReceipts_customer_id_gen" ON "entity_customerReceipts" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_customerReceipts_invoice_id_gen" ON "entity_customerReceipts" ("invoice_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_customerReceipts_payment_id_gen" ON "entity_customerReceipts" ("payment_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_customerReceipts_work_order_id_gen" ON "entity_customerReceipts" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_customerReceipts_site_id_gen" ON "entity_customerReceipts" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_blocked_customer_id_gen" ON "entity_blocked" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_blocked_linked_work_order_id_gen" ON "entity_blocked" ("linked_work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_blocked_linked_po_id_gen" ON "entity_blocked" ("linked_po_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_blocked_linked_grn_id_gen" ON "entity_blocked" ("linked_grn_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_blocked_linked_task_id_gen" ON "entity_blocked" ("linked_task_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_risks_customer_id_gen" ON "entity_risks" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_commSends_customer_id_gen" ON "entity_commSends" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_commSends_followup_id_gen" ON "entity_commSends" ("followup_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_commSends_task_id_gen" ON "entity_commSends" ("task_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_commSends_work_order_id_gen" ON "entity_commSends" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_commSends_quotation_id_gen" ON "entity_commSends" ("quotation_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_attendance_staff_id_gen" ON "entity_attendance" ("staff_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_attendance_visit_id_gen" ON "entity_attendance" ("visit_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_staffLocationPings_staff_id_gen" ON "entity_staffLocationPings" ("staff_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_leaveRequests_staff_id_gen" ON "entity_leaveRequests" ("staff_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_payrollLines_payroll_period_id_gen" ON "entity_payrollLines" ("payroll_period_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_payrollLines_staff_id_gen" ON "entity_payrollLines" ("staff_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_salaryAdjustments_staff_id_gen" ON "entity_salaryAdjustments" ("staff_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_salaryAdjustments_payroll_period_id_gen" ON "entity_salaryAdjustments" ("payroll_period_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_staffDocuments_staff_id_gen" ON "entity_staffDocuments" ("staff_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_staffDocuments_file_asset_id_gen" ON "entity_staffDocuments" ("file_asset_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_recurringTasks_assignee_id_gen" ON "entity_recurringTasks" ("assignee_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_entityFileAttachments_file_asset_id_gen" ON "entity_entityFileAttachments" ("file_asset_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_entityReferenceAssignments_customer_id_gen" ON "entity_entityReferenceAssignments" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_vendorRates_vendor_id_gen" ON "entity_master_vendorRates" ("vendor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_vendorRates_work_required_article_id_gen" ON "entity_master_vendorRates" ("work_required_article_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_vendorRates_article_id_gen" ON "entity_master_vendorRates" ("article_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_vendorRateHistories_vendor_rate_id_gen" ON "entity_master_vendorRateHistories" ("vendor_rate_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_vendorRateHistories_vendor_id_gen" ON "entity_master_vendorRateHistories" ("vendor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_vendorRateHistories_article_id_gen" ON "entity_master_vendorRateHistories" ("article_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_vendorRateHistor_work_required_article_id_" ON "entity_master_vendorRateHistories" ("work_required_article_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_contractorRates_contractor_id_gen" ON "entity_master_contractorRates" ("contractor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_articleVariants_article_id_gen" ON "entity_master_articleVariants" ("article_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_articleVariants_work_required_article_id_" ON "entity_master_articleVariants" ("work_required_article_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_subcategoryArticleMap_article_id_gen" ON "entity_master_subcategoryArticleMap" ("article_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_subcategoryArticleMap_work_required_id_gen" ON "entity_master_subcategoryArticleMap" ("work_required_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_storageFolderIns_storage_account_id_gen" ON "entity_master_storageFolderInstances" ("storage_account_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_storageFolderInstances_template_id_gen" ON "entity_master_storageFolderInstances" ("template_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_fileAssets_storage_account_id_gen" ON "entity_master_fileAssets" ("storage_account_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_fileAssets_storage_folder_instance_id_gen" ON "entity_master_fileAssets" ("storage_folder_instance_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_catalogueArticle_catalogue_id_gen" ON "entity_master_catalogueArticleVendorLinks" ("catalogue_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_catalogueArticleVendorLinks_article_id_gen" ON "entity_master_catalogueArticleVendorLinks" ("article_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_catalogueArticleVendorLinks_vendor_id_gen" ON "entity_master_catalogueArticleVendorLinks" ("vendor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_commissionRules_source_partner_id_gen" ON "entity_master_commissionRules" ("source_partner_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_commissionRules_category_id_gen" ON "entity_master_commissionRules" ("category_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_pinterestBoards_category_id_gen" ON "entity_master_pinterestBoards" ("category_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_pinterestBoards_subcategory_id_gen" ON "entity_master_pinterestBoards" ("subcategory_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_pinterestBoards_article_id_gen" ON "entity_master_pinterestBoards" ("article_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_referenceMedia_category_id_gen" ON "entity_master_referenceMedia" ("category_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_referenceMedia_subcategory_id_gen" ON "entity_master_referenceMedia" ("subcategory_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_referenceMedia_article_id_gen" ON "entity_master_referenceMedia" ("article_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_catalogues_drive_asset_id_gen" ON "entity_master_catalogues" ("drive_asset_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_visits_recovery_followup_id_gen" ON "entity_visits" ("recovery_followup_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_visits_report_task_id_gen" ON "entity_visits" ("report_task_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_tasks_blocked_item_id_gen" ON "entity_tasks" ("blocked_item_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_payments_milestone_term_id_gen" ON "entity_payments" ("milestone_term_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_workOrders_abandoned_contractor_id_gen" ON "entity_workOrders" ("abandoned_contractor_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_customers_source_partner_id_gen" ON "entity_customers" ("source_partner_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_sites_source_partner_id_gen" ON "entity_sites" ("source_partner_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_acceptedScopes_contractor_bid_id_gen" ON "entity_acceptedScopes" ("contractor_bid_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_contractorSettlements_replacement_work_order_id" ON "entity_contractorSettlements" ("replacement_work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_leaveRequests_approved_by_staff_id_gen" ON "entity_leaveRequests" ("approved_by_staff_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_attendance_work_order_id_gen" ON "entity_attendance" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_salaryAdjustments_work_order_id_gen" ON "entity_salaryAdjustments" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_recurringTasks_customer_id_gen" ON "entity_recurringTasks" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_recurringTasks_site_id_gen" ON "entity_recurringTasks" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_recurringTasks_work_order_id_gen" ON "entity_recurringTasks" ("work_order_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_blocked_linked_quotation_id_gen" ON "entity_blocked" ("linked_quotation_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_auditLog_customer_id_gen" ON "entity_auditLog" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_fileAssets_customer_id_gen" ON "entity_master_fileAssets" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_fileAssets_site_id_gen" ON "entity_master_fileAssets" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_storageFolderInstances_customer_id_gen" ON "entity_master_storageFolderInstances" ("customer_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_storageFolderInstances_site_id_gen" ON "entity_master_storageFolderInstances" ("site_id_gen");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_entity_master_storageFolderInstances_work_order_id_gen" ON "entity_master_storageFolderInstances" ("work_order_id_gen");