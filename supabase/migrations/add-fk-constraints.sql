-- ============================================================================
-- FIX-DB-MERGE-004: Add foreign key constraints to entity_* tables
-- ============================================================================
-- The 83 entity_* tables store relationships inside JSONB 'data' column as
-- string fields (e.g., data->>'customer_id'). Postgres can't enforce these.
-- This migration adds generated columns that extract the FK fields from JSONB,
-- then adds FK constraints on those generated columns.
--
-- IMPORTANT: All table names must be double-quoted because they use camelCase
-- (e.g., "entity_workRequired" not entity_workrequired). Postgres treats
-- unquoted identifiers as lowercase, which won't match the actual table names.
--
-- SAFE TO RE-RUN: all statements use IF NOT EXISTS.
-- ============================================================================

-- ── Customer Domain ──────────────────────────────────────────────────────
ALTER TABLE "entity_sites" ADD COLUMN IF NOT EXISTS customer_id_gen text GENERATED ALWAYS AS (data->>'customer_id') STORED;
ALTER TABLE "entity_sites" DROP CONSTRAINT IF EXISTS sites_customer_fkey;
ALTER TABLE "entity_sites" ADD CONSTRAINT sites_customer_fkey FOREIGN KEY (customer_id_gen) REFERENCES "entity_customers"(id);

ALTER TABLE "entity_areas" ADD COLUMN IF NOT EXISTS site_id_gen text GENERATED ALWAYS AS (data->>'site_id') STORED;
ALTER TABLE "entity_areas" DROP CONSTRAINT IF EXISTS areas_site_fkey;
ALTER TABLE "entity_areas" ADD CONSTRAINT areas_site_fkey FOREIGN KEY (site_id_gen) REFERENCES "entity_sites"(id);

ALTER TABLE "entity_workRequired" ADD COLUMN IF NOT EXISTS customer_id_gen text GENERATED ALWAYS AS (data->>'customer_id') STORED;
ALTER TABLE "entity_workRequired" ADD COLUMN IF NOT EXISTS site_id_gen text GENERATED ALWAYS AS (data->>'site_id') STORED;
ALTER TABLE "entity_workRequired" DROP CONSTRAINT IF EXISTS wr_customer_fkey;
ALTER TABLE "entity_workRequired" ADD CONSTRAINT wr_customer_fkey FOREIGN KEY (customer_id_gen) REFERENCES "entity_customers"(id);
ALTER TABLE "entity_workRequired" DROP CONSTRAINT IF EXISTS wr_site_fkey;
ALTER TABLE "entity_workRequired" ADD CONSTRAINT wr_site_fkey FOREIGN KEY (site_id_gen) REFERENCES "entity_sites"(id);

-- ── Quotation Domain ─────────────────────────────────────────────────────
ALTER TABLE "entity_quotations" ADD COLUMN IF NOT EXISTS customer_id_gen text GENERATED ALWAYS AS (data->>'customer_id') STORED;
ALTER TABLE "entity_quotations" ADD COLUMN IF NOT EXISTS site_id_gen text GENERATED ALWAYS AS (data->>'site_id') STORED;
ALTER TABLE "entity_quotations" DROP CONSTRAINT IF EXISTS quot_customer_fkey;
ALTER TABLE "entity_quotations" ADD CONSTRAINT quot_customer_fkey FOREIGN KEY (customer_id_gen) REFERENCES "entity_customers"(id);
ALTER TABLE "entity_quotations" DROP CONSTRAINT IF EXISTS quot_site_fkey;
ALTER TABLE "entity_quotations" ADD CONSTRAINT quot_site_fkey FOREIGN KEY (site_id_gen) REFERENCES "entity_sites"(id);

-- ── Execution Domain ─────────────────────────────────────────────────────
ALTER TABLE "entity_workOrders" ADD COLUMN IF NOT EXISTS customer_id_gen text GENERATED ALWAYS AS (data->>'customer_id') STORED;
ALTER TABLE "entity_workOrders" ADD COLUMN IF NOT EXISTS site_id_gen text GENERATED ALWAYS AS (data->>'site_id') STORED;
ALTER TABLE "entity_workOrders" DROP CONSTRAINT IF EXISTS wo_customer_fkey;
ALTER TABLE "entity_workOrders" ADD CONSTRAINT wo_customer_fkey FOREIGN KEY (customer_id_gen) REFERENCES "entity_customers"(id);
ALTER TABLE "entity_workOrders" DROP CONSTRAINT IF EXISTS wo_site_fkey;
ALTER TABLE "entity_workOrders" ADD CONSTRAINT wo_site_fkey FOREIGN KEY (site_id_gen) REFERENCES "entity_sites"(id);

ALTER TABLE "entity_boqs" ADD COLUMN IF NOT EXISTS work_order_id_gen text GENERATED ALWAYS AS (data->>'work_order_id') STORED;
ALTER TABLE "entity_boqs" DROP CONSTRAINT IF EXISTS boq_wo_fkey;
ALTER TABLE "entity_boqs" ADD CONSTRAINT boq_wo_fkey FOREIGN KEY (work_order_id_gen) REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_executionLogs" ADD COLUMN IF NOT EXISTS work_order_id_gen text GENERATED ALWAYS AS (data->>'work_order_id') STORED;
ALTER TABLE "entity_executionLogs" DROP CONSTRAINT IF EXISTS elog_wo_fkey;
ALTER TABLE "entity_executionLogs" ADD CONSTRAINT elog_wo_fkey FOREIGN KEY (work_order_id_gen) REFERENCES "entity_workOrders"(id);

-- ── Procurement Domain ───────────────────────────────────────────────────
ALTER TABLE "entity_purchaseOrders" ADD COLUMN IF NOT EXISTS work_order_id_gen text GENERATED ALWAYS AS (data->>'work_order_id') STORED;
ALTER TABLE "entity_purchaseOrders" DROP CONSTRAINT IF EXISTS po_wo_fkey;
ALTER TABLE "entity_purchaseOrders" ADD CONSTRAINT po_wo_fkey FOREIGN KEY (work_order_id_gen) REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_grns" ADD COLUMN IF NOT EXISTS po_id_gen text GENERATED ALWAYS AS (data->>'po_id') STORED;
ALTER TABLE "entity_grns" DROP CONSTRAINT IF EXISTS grn_po_fkey;
ALTER TABLE "entity_grns" ADD CONSTRAINT grn_po_fkey FOREIGN KEY (po_id_gen) REFERENCES "entity_purchaseOrders"(id);

-- ── Contractor Domain ────────────────────────────────────────────────────
ALTER TABLE "entity_contractorBills" ADD COLUMN IF NOT EXISTS work_order_id_gen text GENERATED ALWAYS AS (data->>'work_order_id') STORED;
ALTER TABLE "entity_contractorBills" DROP CONSTRAINT IF EXISTS cbill_wo_fkey;
ALTER TABLE "entity_contractorBills" ADD CONSTRAINT cbill_wo_fkey FOREIGN KEY (work_order_id_gen) REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_contractorPayments" ADD COLUMN IF NOT EXISTS contractor_bill_id_gen text GENERATED ALWAYS AS (data->>'contractor_bill_id') STORED;
ALTER TABLE "entity_contractorPayments" DROP CONSTRAINT IF EXISTS cpay_cbill_fkey;
ALTER TABLE "entity_contractorPayments" ADD CONSTRAINT cpay_cbill_fkey FOREIGN KEY (contractor_bill_id_gen) REFERENCES "entity_contractorBills"(id);

-- ── Finance Domain ───────────────────────────────────────────────────────
ALTER TABLE "entity_invoices" ADD COLUMN IF NOT EXISTS customer_id_gen text GENERATED ALWAYS AS (data->>'customer_id') STORED;
ALTER TABLE "entity_invoices" DROP CONSTRAINT IF EXISTS inv_customer_fkey;
ALTER TABLE "entity_invoices" ADD CONSTRAINT inv_customer_fkey FOREIGN KEY (customer_id_gen) REFERENCES "entity_customers"(id);

ALTER TABLE "entity_payments" ADD COLUMN IF NOT EXISTS customer_id_gen text GENERATED ALWAYS AS (data->>'customer_id') STORED;
ALTER TABLE "entity_payments" DROP CONSTRAINT IF EXISTS pay_customer_fkey;
ALTER TABLE "entity_payments" ADD CONSTRAINT pay_customer_fkey FOREIGN KEY (customer_id_gen) REFERENCES "entity_customers"(id);

-- ── Master Domain ────────────────────────────────────────────────────────
ALTER TABLE "entity_master_contractorRates" ADD COLUMN IF NOT EXISTS contractor_id_gen text GENERATED ALWAYS AS (data->>'contractor_id') STORED;
ALTER TABLE "entity_master_contractorRates" DROP CONSTRAINT IF EXISTS crate_contractor_fkey;
ALTER TABLE "entity_master_contractorRates" ADD CONSTRAINT crate_contractor_fkey FOREIGN KEY (contractor_id_gen) REFERENCES "entity_master_contractors"(id);

ALTER TABLE "entity_master_vendorRates" ADD COLUMN IF NOT EXISTS vendor_id_gen text GENERATED ALWAYS AS (data->>'vendor_id') STORED;
ALTER TABLE "entity_master_vendorRates" DROP CONSTRAINT IF EXISTS vrate_vendor_fkey;
ALTER TABLE "entity_master_vendorRates" ADD CONSTRAINT vrate_vendor_fkey FOREIGN KEY (vendor_id_gen) REFERENCES "entity_master_vendors"(id);

ALTER TABLE "entity_master_storageFolderInstances" ADD COLUMN IF NOT EXISTS storage_account_id_gen text GENERATED ALWAYS AS (data->>'storage_account_id') STORED;
ALTER TABLE "entity_master_storageFolderInstances" DROP CONSTRAINT IF EXISTS sfi_account_fkey;
ALTER TABLE "entity_master_storageFolderInstances" ADD CONSTRAINT sfi_account_fkey FOREIGN KEY (storage_account_id_gen) REFERENCES "entity_master_storageAccounts"(id);

-- ── Done. 18 FK constraints added across 14 tables. ──
