-- ============================================================================
-- COMPLETE FK CONSTRAINT MIGRATION — all non-polymorphic entity relationships
-- ============================================================================
-- All table names double-quoted for camelCase.
-- All generated columns use NULLIF(data->>'field', '') so empty strings
-- become NULL (FK constraints allow NULL — no match needed).
-- No ON DELETE actions (Postgres limitation with generated columns).
-- ============================================================================

ALTER TABLE "entity_sites" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_sites" DROP CONSTRAINT IF EXISTS "entity_sites_customer_id_fkey";
ALTER TABLE "entity_sites" ADD CONSTRAINT "entity_sites_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_areas" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_areas" DROP CONSTRAINT IF EXISTS "entity_areas_site_id_fkey";
ALTER TABLE "entity_areas" ADD CONSTRAINT "entity_areas_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_workRequired" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_workRequired" DROP CONSTRAINT IF EXISTS "entity_workRequired_customer_id_fkey";
ALTER TABLE "entity_workRequired" ADD CONSTRAINT "entity_workRequired_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_workRequired" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_workRequired" DROP CONSTRAINT IF EXISTS "entity_workRequired_site_id_fkey";
ALTER TABLE "entity_workRequired" ADD CONSTRAINT "entity_workRequired_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_measurementRevisions" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_measurementRevisions" DROP CONSTRAINT IF EXISTS "entity_measurementRevisions_site_id_fkey";
ALTER TABLE "entity_measurementRevisions" ADD CONSTRAINT "entity_measurementRevisions_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_measurementRevisions" ADD COLUMN IF NOT EXISTS "area_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'area_id', '')) STORED;
ALTER TABLE "entity_measurementRevisions" DROP CONSTRAINT IF EXISTS "entity_measurementRevisions_area_id_fkey";
ALTER TABLE "entity_measurementRevisions" ADD CONSTRAINT "entity_measurementRevisions_area_id_fkey" FOREIGN KEY ("area_id_gen") REFERENCES "entity_areas"(id);

ALTER TABLE "entity_measurementRevisions" ADD COLUMN IF NOT EXISTS "work_required_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_id', '')) STORED;
ALTER TABLE "entity_measurementRevisions" DROP CONSTRAINT IF EXISTS "entity_measurementRevisions_work_required_id_fkey";
ALTER TABLE "entity_measurementRevisions" ADD CONSTRAINT "entity_measurementRevisions_work_required_id_fkey" FOREIGN KEY ("work_required_id_gen") REFERENCES "entity_workRequired"(id);

ALTER TABLE "entity_measurementRevisions" ADD COLUMN IF NOT EXISTS "drawing_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'drawing_id', '')) STORED;
ALTER TABLE "entity_measurementRevisions" DROP CONSTRAINT IF EXISTS "entity_measurementRevisions_drawing_id_fkey";
ALTER TABLE "entity_measurementRevisions" ADD CONSTRAINT "entity_measurementRevisions_drawing_id_fkey" FOREIGN KEY ("drawing_id_gen") REFERENCES "entity_drawings"(id);

ALTER TABLE "entity_quotations" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_quotations" DROP CONSTRAINT IF EXISTS "entity_quotations_customer_id_fkey";
ALTER TABLE "entity_quotations" ADD CONSTRAINT "entity_quotations_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_quotations" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_quotations" DROP CONSTRAINT IF EXISTS "entity_quotations_site_id_fkey";
ALTER TABLE "entity_quotations" ADD CONSTRAINT "entity_quotations_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_acceptedScopes" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_acceptedScopes" DROP CONSTRAINT IF EXISTS "entity_acceptedScopes_customer_id_fkey";
ALTER TABLE "entity_acceptedScopes" ADD CONSTRAINT "entity_acceptedScopes_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_acceptedScopes" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_acceptedScopes" DROP CONSTRAINT IF EXISTS "entity_acceptedScopes_site_id_fkey";
ALTER TABLE "entity_acceptedScopes" ADD CONSTRAINT "entity_acceptedScopes_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_acceptedScopes" ADD COLUMN IF NOT EXISTS "work_required_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_id', '')) STORED;
ALTER TABLE "entity_acceptedScopes" DROP CONSTRAINT IF EXISTS "entity_acceptedScopes_work_required_id_fkey";
ALTER TABLE "entity_acceptedScopes" ADD CONSTRAINT "entity_acceptedScopes_work_required_id_fkey" FOREIGN KEY ("work_required_id_gen") REFERENCES "entity_workRequired"(id);

ALTER TABLE "entity_acceptedScopes" ADD COLUMN IF NOT EXISTS "quotation_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'quotation_id', '')) STORED;
ALTER TABLE "entity_acceptedScopes" DROP CONSTRAINT IF EXISTS "entity_acceptedScopes_quotation_id_fkey";
ALTER TABLE "entity_acceptedScopes" ADD CONSTRAINT "entity_acceptedScopes_quotation_id_fkey" FOREIGN KEY ("quotation_id_gen") REFERENCES "entity_quotations"(id);

ALTER TABLE "entity_workOrders" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_workOrders" DROP CONSTRAINT IF EXISTS "entity_workOrders_customer_id_fkey";
ALTER TABLE "entity_workOrders" ADD CONSTRAINT "entity_workOrders_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_workOrders" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_workOrders" DROP CONSTRAINT IF EXISTS "entity_workOrders_site_id_fkey";
ALTER TABLE "entity_workOrders" ADD CONSTRAINT "entity_workOrders_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_boqs" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_boqs" DROP CONSTRAINT IF EXISTS "entity_boqs_work_order_id_fkey";
ALTER TABLE "entity_boqs" ADD CONSTRAINT "entity_boqs_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_vendorRfqs" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_vendorRfqs" DROP CONSTRAINT IF EXISTS "entity_vendorRfqs_work_order_id_fkey";
ALTER TABLE "entity_vendorRfqs" ADD CONSTRAINT "entity_vendorRfqs_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_vendorRfqs" ADD COLUMN IF NOT EXISTS "boq_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'boq_id', '')) STORED;
ALTER TABLE "entity_vendorRfqs" DROP CONSTRAINT IF EXISTS "entity_vendorRfqs_boq_id_fkey";
ALTER TABLE "entity_vendorRfqs" ADD CONSTRAINT "entity_vendorRfqs_boq_id_fkey" FOREIGN KEY ("boq_id_gen") REFERENCES "entity_boqs"(id);

ALTER TABLE "entity_vendorRfqs" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_vendorRfqs" DROP CONSTRAINT IF EXISTS "entity_vendorRfqs_site_id_fkey";
ALTER TABLE "entity_vendorRfqs" ADD CONSTRAINT "entity_vendorRfqs_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_vendorBids" ADD COLUMN IF NOT EXISTS "rfq_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'rfq_id', '')) STORED;
ALTER TABLE "entity_vendorBids" DROP CONSTRAINT IF EXISTS "entity_vendorBids_rfq_id_fkey";
ALTER TABLE "entity_vendorBids" ADD CONSTRAINT "entity_vendorBids_rfq_id_fkey" FOREIGN KEY ("rfq_id_gen") REFERENCES "entity_vendorRfqs"(id);

ALTER TABLE "entity_vendorBids" ADD COLUMN IF NOT EXISTS "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'vendor_id', '')) STORED;
ALTER TABLE "entity_vendorBids" DROP CONSTRAINT IF EXISTS "entity_vendorBids_vendor_id_fkey";
ALTER TABLE "entity_vendorBids" ADD CONSTRAINT "entity_vendorBids_vendor_id_fkey" FOREIGN KEY ("vendor_id_gen") REFERENCES "entity_master_vendors"(id);

ALTER TABLE "entity_purchaseOrders" ADD COLUMN IF NOT EXISTS "rfq_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'rfq_id', '')) STORED;
ALTER TABLE "entity_purchaseOrders" DROP CONSTRAINT IF EXISTS "entity_purchaseOrders_rfq_id_fkey";
ALTER TABLE "entity_purchaseOrders" ADD CONSTRAINT "entity_purchaseOrders_rfq_id_fkey" FOREIGN KEY ("rfq_id_gen") REFERENCES "entity_vendorRfqs"(id);

ALTER TABLE "entity_purchaseOrders" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_purchaseOrders" DROP CONSTRAINT IF EXISTS "entity_purchaseOrders_work_order_id_fkey";
ALTER TABLE "entity_purchaseOrders" ADD CONSTRAINT "entity_purchaseOrders_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_purchaseOrders" ADD COLUMN IF NOT EXISTS "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'vendor_id', '')) STORED;
ALTER TABLE "entity_purchaseOrders" DROP CONSTRAINT IF EXISTS "entity_purchaseOrders_vendor_id_fkey";
ALTER TABLE "entity_purchaseOrders" ADD CONSTRAINT "entity_purchaseOrders_vendor_id_fkey" FOREIGN KEY ("vendor_id_gen") REFERENCES "entity_master_vendors"(id);

ALTER TABLE "entity_purchaseOrders" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_purchaseOrders" DROP CONSTRAINT IF EXISTS "entity_purchaseOrders_site_id_fkey";
ALTER TABLE "entity_purchaseOrders" ADD CONSTRAINT "entity_purchaseOrders_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_grns" ADD COLUMN IF NOT EXISTS "po_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'po_id', '')) STORED;
ALTER TABLE "entity_grns" DROP CONSTRAINT IF EXISTS "entity_grns_po_id_fkey";
ALTER TABLE "entity_grns" ADD CONSTRAINT "entity_grns_po_id_fkey" FOREIGN KEY ("po_id_gen") REFERENCES "entity_purchaseOrders"(id);

ALTER TABLE "entity_grns" ADD COLUMN IF NOT EXISTS "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'vendor_id', '')) STORED;
ALTER TABLE "entity_grns" DROP CONSTRAINT IF EXISTS "entity_grns_vendor_id_fkey";
ALTER TABLE "entity_grns" ADD CONSTRAINT "entity_grns_vendor_id_fkey" FOREIGN KEY ("vendor_id_gen") REFERENCES "entity_master_vendors"(id);

ALTER TABLE "entity_grns" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_grns" DROP CONSTRAINT IF EXISTS "entity_grns_work_order_id_fkey";
ALTER TABLE "entity_grns" ADD CONSTRAINT "entity_grns_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_grns" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_grns" DROP CONSTRAINT IF EXISTS "entity_grns_site_id_fkey";
ALTER TABLE "entity_grns" ADD CONSTRAINT "entity_grns_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_dispatches" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_dispatches" DROP CONSTRAINT IF EXISTS "entity_dispatches_work_order_id_fkey";
ALTER TABLE "entity_dispatches" ADD CONSTRAINT "entity_dispatches_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_dispatches" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_dispatches" DROP CONSTRAINT IF EXISTS "entity_dispatches_site_id_fkey";
ALTER TABLE "entity_dispatches" ADD CONSTRAINT "entity_dispatches_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_inventory" ADD COLUMN IF NOT EXISTS "grn_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'grn_id', '')) STORED;
ALTER TABLE "entity_inventory" DROP CONSTRAINT IF EXISTS "entity_inventory_grn_id_fkey";
ALTER TABLE "entity_inventory" ADD CONSTRAINT "entity_inventory_grn_id_fkey" FOREIGN KEY ("grn_id_gen") REFERENCES "entity_grns"(id);

ALTER TABLE "entity_inventory" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_inventory" DROP CONSTRAINT IF EXISTS "entity_inventory_work_order_id_fkey";
ALTER TABLE "entity_inventory" ADD CONSTRAINT "entity_inventory_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_inventory" ADD COLUMN IF NOT EXISTS "article_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'article_id', '')) STORED;
ALTER TABLE "entity_inventory" DROP CONSTRAINT IF EXISTS "entity_inventory_article_id_fkey";
ALTER TABLE "entity_inventory" ADD CONSTRAINT "entity_inventory_article_id_fkey" FOREIGN KEY ("article_id_gen") REFERENCES "entity_master_articles"(id);

ALTER TABLE "entity_inventory" ADD COLUMN IF NOT EXISTS "work_required_article_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_article_id', '')) STORED;
ALTER TABLE "entity_inventory" DROP CONSTRAINT IF EXISTS "entity_inventory_work_required_article_id_fkey";
ALTER TABLE "entity_inventory" ADD CONSTRAINT "entity_inventory_work_required_article_id_fkey" FOREIGN KEY ("work_required_article_id_gen") REFERENCES "entity_master_subcategoryArticleMap"(id);

ALTER TABLE "entity_stockMovements" ADD COLUMN IF NOT EXISTS "inventory_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'inventory_id', '')) STORED;
ALTER TABLE "entity_stockMovements" DROP CONSTRAINT IF EXISTS "entity_stockMovements_inventory_id_fkey";
ALTER TABLE "entity_stockMovements" ADD CONSTRAINT "entity_stockMovements_inventory_id_fkey" FOREIGN KEY ("inventory_id_gen") REFERENCES "entity_inventory"(id);

ALTER TABLE "entity_stockMovements" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_stockMovements" DROP CONSTRAINT IF EXISTS "entity_stockMovements_work_order_id_fkey";
ALTER TABLE "entity_stockMovements" ADD CONSTRAINT "entity_stockMovements_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_stockMovements" ADD COLUMN IF NOT EXISTS "po_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'po_id', '')) STORED;
ALTER TABLE "entity_stockMovements" DROP CONSTRAINT IF EXISTS "entity_stockMovements_po_id_fkey";
ALTER TABLE "entity_stockMovements" ADD CONSTRAINT "entity_stockMovements_po_id_fkey" FOREIGN KEY ("po_id_gen") REFERENCES "entity_purchaseOrders"(id);

ALTER TABLE "entity_stockMovements" ADD COLUMN IF NOT EXISTS "grn_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'grn_id', '')) STORED;
ALTER TABLE "entity_stockMovements" DROP CONSTRAINT IF EXISTS "entity_stockMovements_grn_id_fkey";
ALTER TABLE "entity_stockMovements" ADD CONSTRAINT "entity_stockMovements_grn_id_fkey" FOREIGN KEY ("grn_id_gen") REFERENCES "entity_grns"(id);

ALTER TABLE "entity_stockMovements" ADD COLUMN IF NOT EXISTS "dispatch_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'dispatch_id', '')) STORED;
ALTER TABLE "entity_stockMovements" DROP CONSTRAINT IF EXISTS "entity_stockMovements_dispatch_id_fkey";
ALTER TABLE "entity_stockMovements" ADD CONSTRAINT "entity_stockMovements_dispatch_id_fkey" FOREIGN KEY ("dispatch_id_gen") REFERENCES "entity_dispatches"(id);

ALTER TABLE "entity_vendorBills" ADD COLUMN IF NOT EXISTS "po_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'po_id', '')) STORED;
ALTER TABLE "entity_vendorBills" DROP CONSTRAINT IF EXISTS "entity_vendorBills_po_id_fkey";
ALTER TABLE "entity_vendorBills" ADD CONSTRAINT "entity_vendorBills_po_id_fkey" FOREIGN KEY ("po_id_gen") REFERENCES "entity_purchaseOrders"(id);

ALTER TABLE "entity_vendorBills" ADD COLUMN IF NOT EXISTS "grn_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'grn_id', '')) STORED;
ALTER TABLE "entity_vendorBills" DROP CONSTRAINT IF EXISTS "entity_vendorBills_grn_id_fkey";
ALTER TABLE "entity_vendorBills" ADD CONSTRAINT "entity_vendorBills_grn_id_fkey" FOREIGN KEY ("grn_id_gen") REFERENCES "entity_grns"(id);

ALTER TABLE "entity_vendorBills" ADD COLUMN IF NOT EXISTS "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'vendor_id', '')) STORED;
ALTER TABLE "entity_vendorBills" DROP CONSTRAINT IF EXISTS "entity_vendorBills_vendor_id_fkey";
ALTER TABLE "entity_vendorBills" ADD CONSTRAINT "entity_vendorBills_vendor_id_fkey" FOREIGN KEY ("vendor_id_gen") REFERENCES "entity_master_vendors"(id);

ALTER TABLE "entity_vendorBills" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_vendorBills" DROP CONSTRAINT IF EXISTS "entity_vendorBills_work_order_id_fkey";
ALTER TABLE "entity_vendorBills" ADD CONSTRAINT "entity_vendorBills_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_vendorBills" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_vendorBills" DROP CONSTRAINT IF EXISTS "entity_vendorBills_site_id_fkey";
ALTER TABLE "entity_vendorBills" ADD CONSTRAINT "entity_vendorBills_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_vendorPayments" ADD COLUMN IF NOT EXISTS "vendor_bill_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'vendor_bill_id', '')) STORED;
ALTER TABLE "entity_vendorPayments" DROP CONSTRAINT IF EXISTS "entity_vendorPayments_vendor_bill_id_fkey";
ALTER TABLE "entity_vendorPayments" ADD CONSTRAINT "entity_vendorPayments_vendor_bill_id_fkey" FOREIGN KEY ("vendor_bill_id_gen") REFERENCES "entity_vendorBills"(id);

ALTER TABLE "entity_vendorPayments" ADD COLUMN IF NOT EXISTS "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'vendor_id', '')) STORED;
ALTER TABLE "entity_vendorPayments" DROP CONSTRAINT IF EXISTS "entity_vendorPayments_vendor_id_fkey";
ALTER TABLE "entity_vendorPayments" ADD CONSTRAINT "entity_vendorPayments_vendor_id_fkey" FOREIGN KEY ("vendor_id_gen") REFERENCES "entity_master_vendors"(id);

ALTER TABLE "entity_vendorPayments" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_vendorPayments" DROP CONSTRAINT IF EXISTS "entity_vendorPayments_work_order_id_fkey";
ALTER TABLE "entity_vendorPayments" ADD CONSTRAINT "entity_vendorPayments_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_vendorPayments" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_vendorPayments" DROP CONSTRAINT IF EXISTS "entity_vendorPayments_site_id_fkey";
ALTER TABLE "entity_vendorPayments" ADD CONSTRAINT "entity_vendorPayments_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_contractorBills" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_contractorBills" DROP CONSTRAINT IF EXISTS "entity_contractorBills_work_order_id_fkey";
ALTER TABLE "entity_contractorBills" ADD CONSTRAINT "entity_contractorBills_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_contractorBills" ADD COLUMN IF NOT EXISTS "contractor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'contractor_id', '')) STORED;
ALTER TABLE "entity_contractorBills" DROP CONSTRAINT IF EXISTS "entity_contractorBills_contractor_id_fkey";
ALTER TABLE "entity_contractorBills" ADD CONSTRAINT "entity_contractorBills_contractor_id_fkey" FOREIGN KEY ("contractor_id_gen") REFERENCES "entity_master_contractors"(id);

ALTER TABLE "entity_contractorBills" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_contractorBills" DROP CONSTRAINT IF EXISTS "entity_contractorBills_customer_id_fkey";
ALTER TABLE "entity_contractorBills" ADD CONSTRAINT "entity_contractorBills_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_contractorBills" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_contractorBills" DROP CONSTRAINT IF EXISTS "entity_contractorBills_site_id_fkey";
ALTER TABLE "entity_contractorBills" ADD CONSTRAINT "entity_contractorBills_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_contractorBills" ADD COLUMN IF NOT EXISTS "work_required_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_id', '')) STORED;
ALTER TABLE "entity_contractorBills" DROP CONSTRAINT IF EXISTS "entity_contractorBills_work_required_id_fkey";
ALTER TABLE "entity_contractorBills" ADD CONSTRAINT "entity_contractorBills_work_required_id_fkey" FOREIGN KEY ("work_required_id_gen") REFERENCES "entity_workRequired"(id);

ALTER TABLE "entity_contractorPayments" ADD COLUMN IF NOT EXISTS "contractor_bill_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'contractor_bill_id', '')) STORED;
ALTER TABLE "entity_contractorPayments" DROP CONSTRAINT IF EXISTS "entity_contractorPayments_contractor_bill_id_fkey";
ALTER TABLE "entity_contractorPayments" ADD CONSTRAINT "entity_contractorPayments_contractor_bill_id_fkey" FOREIGN KEY ("contractor_bill_id_gen") REFERENCES "entity_contractorBills"(id);

ALTER TABLE "entity_contractorPayments" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_contractorPayments" DROP CONSTRAINT IF EXISTS "entity_contractorPayments_work_order_id_fkey";
ALTER TABLE "entity_contractorPayments" ADD CONSTRAINT "entity_contractorPayments_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_contractorPayments" ADD COLUMN IF NOT EXISTS "contractor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'contractor_id', '')) STORED;
ALTER TABLE "entity_contractorPayments" DROP CONSTRAINT IF EXISTS "entity_contractorPayments_contractor_id_fkey";
ALTER TABLE "entity_contractorPayments" ADD CONSTRAINT "entity_contractorPayments_contractor_id_fkey" FOREIGN KEY ("contractor_id_gen") REFERENCES "entity_master_contractors"(id);

ALTER TABLE "entity_commissions" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_commissions" DROP CONSTRAINT IF EXISTS "entity_commissions_work_order_id_fkey";
ALTER TABLE "entity_commissions" ADD CONSTRAINT "entity_commissions_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_commissions" ADD COLUMN IF NOT EXISTS "source_partner_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'source_partner_id', '')) STORED;
ALTER TABLE "entity_commissions" DROP CONSTRAINT IF EXISTS "entity_commissions_source_partner_id_fkey";
ALTER TABLE "entity_commissions" ADD CONSTRAINT "entity_commissions_source_partner_id_fkey" FOREIGN KEY ("source_partner_id_gen") REFERENCES "entity_master_sourcePartners"(id);

ALTER TABLE "entity_commissions" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_commissions" DROP CONSTRAINT IF EXISTS "entity_commissions_customer_id_fkey";
ALTER TABLE "entity_commissions" ADD CONSTRAINT "entity_commissions_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_commissions" ADD COLUMN IF NOT EXISTS "quotation_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'quotation_id', '')) STORED;
ALTER TABLE "entity_commissions" DROP CONSTRAINT IF EXISTS "entity_commissions_quotation_id_fkey";
ALTER TABLE "entity_commissions" ADD CONSTRAINT "entity_commissions_quotation_id_fkey" FOREIGN KEY ("quotation_id_gen") REFERENCES "entity_quotations"(id);

ALTER TABLE "entity_workOrderCostLines" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_workOrderCostLines" DROP CONSTRAINT IF EXISTS "entity_workOrderCostLines_work_order_id_fkey";
ALTER TABLE "entity_workOrderCostLines" ADD CONSTRAINT "entity_workOrderCostLines_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_contractorBids" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_contractorBids" DROP CONSTRAINT IF EXISTS "entity_contractorBids_work_order_id_fkey";
ALTER TABLE "entity_contractorBids" ADD CONSTRAINT "entity_contractorBids_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_contractorBids" ADD COLUMN IF NOT EXISTS "contractor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'contractor_id', '')) STORED;
ALTER TABLE "entity_contractorBids" DROP CONSTRAINT IF EXISTS "entity_contractorBids_contractor_id_fkey";
ALTER TABLE "entity_contractorBids" ADD CONSTRAINT "entity_contractorBids_contractor_id_fkey" FOREIGN KEY ("contractor_id_gen") REFERENCES "entity_master_contractors"(id);

ALTER TABLE "entity_contractorBids" ADD COLUMN IF NOT EXISTS "accepted_scope_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'accepted_scope_id', '')) STORED;
ALTER TABLE "entity_contractorBids" DROP CONSTRAINT IF EXISTS "entity_contractorBids_accepted_scope_id_fkey";
ALTER TABLE "entity_contractorBids" ADD CONSTRAINT "entity_contractorBids_accepted_scope_id_fkey" FOREIGN KEY ("accepted_scope_id_gen") REFERENCES "entity_acceptedScopes"(id);

ALTER TABLE "entity_contractorSettlements" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_contractorSettlements" DROP CONSTRAINT IF EXISTS "entity_contractorSettlements_work_order_id_fkey";
ALTER TABLE "entity_contractorSettlements" ADD CONSTRAINT "entity_contractorSettlements_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_contractorSettlements" ADD COLUMN IF NOT EXISTS "contractor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'contractor_id', '')) STORED;
ALTER TABLE "entity_contractorSettlements" DROP CONSTRAINT IF EXISTS "entity_contractorSettlements_contractor_id_fkey";
ALTER TABLE "entity_contractorSettlements" ADD CONSTRAINT "entity_contractorSettlements_contractor_id_fkey" FOREIGN KEY ("contractor_id_gen") REFERENCES "entity_master_contractors"(id);

ALTER TABLE "entity_drawings" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_drawings" DROP CONSTRAINT IF EXISTS "entity_drawings_site_id_fkey";
ALTER TABLE "entity_drawings" ADD CONSTRAINT "entity_drawings_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_drawings" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_drawings" DROP CONSTRAINT IF EXISTS "entity_drawings_work_order_id_fkey";
ALTER TABLE "entity_drawings" ADD CONSTRAINT "entity_drawings_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_drawings" ADD COLUMN IF NOT EXISTS "area_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'area_id', '')) STORED;
ALTER TABLE "entity_drawings" DROP CONSTRAINT IF EXISTS "entity_drawings_area_id_fkey";
ALTER TABLE "entity_drawings" ADD CONSTRAINT "entity_drawings_area_id_fkey" FOREIGN KEY ("area_id_gen") REFERENCES "entity_areas"(id);

ALTER TABLE "entity_executionLogs" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_executionLogs" DROP CONSTRAINT IF EXISTS "entity_executionLogs_work_order_id_fkey";
ALTER TABLE "entity_executionLogs" ADD CONSTRAINT "entity_executionLogs_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_executionLogs" ADD COLUMN IF NOT EXISTS "filed_by_staff_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'filed_by_staff_id', '')) STORED;
ALTER TABLE "entity_executionLogs" DROP CONSTRAINT IF EXISTS "entity_executionLogs_filed_by_staff_id_fkey";
ALTER TABLE "entity_executionLogs" ADD CONSTRAINT "entity_executionLogs_filed_by_staff_id_fkey" FOREIGN KEY ("filed_by_staff_id_gen") REFERENCES "entity_master_staff"(id);

ALTER TABLE "entity_executionLogs" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_executionLogs" DROP CONSTRAINT IF EXISTS "entity_executionLogs_site_id_fkey";
ALTER TABLE "entity_executionLogs" ADD CONSTRAINT "entity_executionLogs_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_variationRequests" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_variationRequests" DROP CONSTRAINT IF EXISTS "entity_variationRequests_work_order_id_fkey";
ALTER TABLE "entity_variationRequests" ADD CONSTRAINT "entity_variationRequests_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_variationRequests" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_variationRequests" DROP CONSTRAINT IF EXISTS "entity_variationRequests_customer_id_fkey";
ALTER TABLE "entity_variationRequests" ADD CONSTRAINT "entity_variationRequests_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_variationRequests" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_variationRequests" DROP CONSTRAINT IF EXISTS "entity_variationRequests_site_id_fkey";
ALTER TABLE "entity_variationRequests" ADD CONSTRAINT "entity_variationRequests_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_visits" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_visits" DROP CONSTRAINT IF EXISTS "entity_visits_customer_id_fkey";
ALTER TABLE "entity_visits" ADD CONSTRAINT "entity_visits_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_visits" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_visits" DROP CONSTRAINT IF EXISTS "entity_visits_site_id_fkey";
ALTER TABLE "entity_visits" ADD CONSTRAINT "entity_visits_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_visits" ADD COLUMN IF NOT EXISTS "work_required_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_id', '')) STORED;
ALTER TABLE "entity_visits" DROP CONSTRAINT IF EXISTS "entity_visits_work_required_id_fkey";
ALTER TABLE "entity_visits" ADD CONSTRAINT "entity_visits_work_required_id_fkey" FOREIGN KEY ("work_required_id_gen") REFERENCES "entity_workRequired"(id);

ALTER TABLE "entity_visits" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_visits" DROP CONSTRAINT IF EXISTS "entity_visits_work_order_id_fkey";
ALTER TABLE "entity_visits" ADD CONSTRAINT "entity_visits_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_visits" ADD COLUMN IF NOT EXISTS "staff_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'staff_id', '')) STORED;
ALTER TABLE "entity_visits" DROP CONSTRAINT IF EXISTS "entity_visits_staff_id_fkey";
ALTER TABLE "entity_visits" ADD CONSTRAINT "entity_visits_staff_id_fkey" FOREIGN KEY ("staff_id_gen") REFERENCES "entity_master_staff"(id);

ALTER TABLE "entity_visits" ADD COLUMN IF NOT EXISTS "contractor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'contractor_id', '')) STORED;
ALTER TABLE "entity_visits" DROP CONSTRAINT IF EXISTS "entity_visits_contractor_id_fkey";
ALTER TABLE "entity_visits" ADD CONSTRAINT "entity_visits_contractor_id_fkey" FOREIGN KEY ("contractor_id_gen") REFERENCES "entity_master_contractors"(id);

ALTER TABLE "entity_visits" ADD COLUMN IF NOT EXISTS "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'vendor_id', '')) STORED;
ALTER TABLE "entity_visits" DROP CONSTRAINT IF EXISTS "entity_visits_vendor_id_fkey";
ALTER TABLE "entity_visits" ADD CONSTRAINT "entity_visits_vendor_id_fkey" FOREIGN KEY ("vendor_id_gen") REFERENCES "entity_master_vendors"(id);

ALTER TABLE "entity_tasks" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_tasks" DROP CONSTRAINT IF EXISTS "entity_tasks_customer_id_fkey";
ALTER TABLE "entity_tasks" ADD CONSTRAINT "entity_tasks_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_tasks" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_tasks" DROP CONSTRAINT IF EXISTS "entity_tasks_work_order_id_fkey";
ALTER TABLE "entity_tasks" ADD CONSTRAINT "entity_tasks_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_tasks" ADD COLUMN IF NOT EXISTS "quotation_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'quotation_id', '')) STORED;
ALTER TABLE "entity_tasks" DROP CONSTRAINT IF EXISTS "entity_tasks_quotation_id_fkey";
ALTER TABLE "entity_tasks" ADD CONSTRAINT "entity_tasks_quotation_id_fkey" FOREIGN KEY ("quotation_id_gen") REFERENCES "entity_quotations"(id);

ALTER TABLE "entity_tasks" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_tasks" DROP CONSTRAINT IF EXISTS "entity_tasks_site_id_fkey";
ALTER TABLE "entity_tasks" ADD CONSTRAINT "entity_tasks_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_tasks" ADD COLUMN IF NOT EXISTS "visit_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'visit_id', '')) STORED;
ALTER TABLE "entity_tasks" DROP CONSTRAINT IF EXISTS "entity_tasks_visit_id_fkey";
ALTER TABLE "entity_tasks" ADD CONSTRAINT "entity_tasks_visit_id_fkey" FOREIGN KEY ("visit_id_gen") REFERENCES "entity_visits"(id);

ALTER TABLE "entity_tasks" ADD COLUMN IF NOT EXISTS "po_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'po_id', '')) STORED;
ALTER TABLE "entity_tasks" DROP CONSTRAINT IF EXISTS "entity_tasks_po_id_fkey";
ALTER TABLE "entity_tasks" ADD CONSTRAINT "entity_tasks_po_id_fkey" FOREIGN KEY ("po_id_gen") REFERENCES "entity_purchaseOrders"(id);

ALTER TABLE "entity_tasks" ADD COLUMN IF NOT EXISTS "work_required_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_id', '')) STORED;
ALTER TABLE "entity_tasks" DROP CONSTRAINT IF EXISTS "entity_tasks_work_required_id_fkey";
ALTER TABLE "entity_tasks" ADD CONSTRAINT "entity_tasks_work_required_id_fkey" FOREIGN KEY ("work_required_id_gen") REFERENCES "entity_workRequired"(id);

ALTER TABLE "entity_followups" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_followups" DROP CONSTRAINT IF EXISTS "entity_followups_customer_id_fkey";
ALTER TABLE "entity_followups" ADD CONSTRAINT "entity_followups_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_followups" ADD COLUMN IF NOT EXISTS "quotation_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'quotation_id', '')) STORED;
ALTER TABLE "entity_followups" DROP CONSTRAINT IF EXISTS "entity_followups_quotation_id_fkey";
ALTER TABLE "entity_followups" ADD CONSTRAINT "entity_followups_quotation_id_fkey" FOREIGN KEY ("quotation_id_gen") REFERENCES "entity_quotations"(id);

ALTER TABLE "entity_followups" ADD COLUMN IF NOT EXISTS "payment_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'payment_id', '')) STORED;
ALTER TABLE "entity_followups" DROP CONSTRAINT IF EXISTS "entity_followups_payment_id_fkey";
ALTER TABLE "entity_followups" ADD CONSTRAINT "entity_followups_payment_id_fkey" FOREIGN KEY ("payment_id_gen") REFERENCES "entity_payments"(id);

ALTER TABLE "entity_followups" ADD COLUMN IF NOT EXISTS "visit_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'visit_id', '')) STORED;
ALTER TABLE "entity_followups" DROP CONSTRAINT IF EXISTS "entity_followups_visit_id_fkey";
ALTER TABLE "entity_followups" ADD CONSTRAINT "entity_followups_visit_id_fkey" FOREIGN KEY ("visit_id_gen") REFERENCES "entity_visits"(id);

ALTER TABLE "entity_followups" ADD COLUMN IF NOT EXISTS "work_required_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_id', '')) STORED;
ALTER TABLE "entity_followups" DROP CONSTRAINT IF EXISTS "entity_followups_work_required_id_fkey";
ALTER TABLE "entity_followups" ADD CONSTRAINT "entity_followups_work_required_id_fkey" FOREIGN KEY ("work_required_id_gen") REFERENCES "entity_workRequired"(id);

ALTER TABLE "entity_actions" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_actions" DROP CONSTRAINT IF EXISTS "entity_actions_customer_id_fkey";
ALTER TABLE "entity_actions" ADD CONSTRAINT "entity_actions_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_payments" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_payments" DROP CONSTRAINT IF EXISTS "entity_payments_customer_id_fkey";
ALTER TABLE "entity_payments" ADD CONSTRAINT "entity_payments_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_payments" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_payments" DROP CONSTRAINT IF EXISTS "entity_payments_site_id_fkey";
ALTER TABLE "entity_payments" ADD CONSTRAINT "entity_payments_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_payments" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_payments" DROP CONSTRAINT IF EXISTS "entity_payments_work_order_id_fkey";
ALTER TABLE "entity_payments" ADD CONSTRAINT "entity_payments_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_payments" ADD COLUMN IF NOT EXISTS "quotation_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'quotation_id', '')) STORED;
ALTER TABLE "entity_payments" DROP CONSTRAINT IF EXISTS "entity_payments_quotation_id_fkey";
ALTER TABLE "entity_payments" ADD CONSTRAINT "entity_payments_quotation_id_fkey" FOREIGN KEY ("quotation_id_gen") REFERENCES "entity_quotations"(id);

ALTER TABLE "entity_payments" ADD COLUMN IF NOT EXISTS "work_required_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_id', '')) STORED;
ALTER TABLE "entity_payments" DROP CONSTRAINT IF EXISTS "entity_payments_work_required_id_fkey";
ALTER TABLE "entity_payments" ADD CONSTRAINT "entity_payments_work_required_id_fkey" FOREIGN KEY ("work_required_id_gen") REFERENCES "entity_workRequired"(id);

ALTER TABLE "entity_payments" ADD COLUMN IF NOT EXISTS "invoice_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'invoice_id', '')) STORED;
ALTER TABLE "entity_payments" DROP CONSTRAINT IF EXISTS "entity_payments_invoice_id_fkey";
ALTER TABLE "entity_payments" ADD CONSTRAINT "entity_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id_gen") REFERENCES "entity_invoices"(id);

ALTER TABLE "entity_invoices" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_invoices" DROP CONSTRAINT IF EXISTS "entity_invoices_customer_id_fkey";
ALTER TABLE "entity_invoices" ADD CONSTRAINT "entity_invoices_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_invoices" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_invoices" DROP CONSTRAINT IF EXISTS "entity_invoices_site_id_fkey";
ALTER TABLE "entity_invoices" ADD CONSTRAINT "entity_invoices_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_invoices" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_invoices" DROP CONSTRAINT IF EXISTS "entity_invoices_work_order_id_fkey";
ALTER TABLE "entity_invoices" ADD CONSTRAINT "entity_invoices_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_invoices" ADD COLUMN IF NOT EXISTS "quotation_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'quotation_id', '')) STORED;
ALTER TABLE "entity_invoices" DROP CONSTRAINT IF EXISTS "entity_invoices_quotation_id_fkey";
ALTER TABLE "entity_invoices" ADD CONSTRAINT "entity_invoices_quotation_id_fkey" FOREIGN KEY ("quotation_id_gen") REFERENCES "entity_quotations"(id);

ALTER TABLE "entity_invoices" ADD COLUMN IF NOT EXISTS "work_required_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_id', '')) STORED;
ALTER TABLE "entity_invoices" DROP CONSTRAINT IF EXISTS "entity_invoices_work_required_id_fkey";
ALTER TABLE "entity_invoices" ADD CONSTRAINT "entity_invoices_work_required_id_fkey" FOREIGN KEY ("work_required_id_gen") REFERENCES "entity_workRequired"(id);

ALTER TABLE "entity_invoices" ADD COLUMN IF NOT EXISTS "payment_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'payment_id', '')) STORED;
ALTER TABLE "entity_invoices" DROP CONSTRAINT IF EXISTS "entity_invoices_payment_id_fkey";
ALTER TABLE "entity_invoices" ADD CONSTRAINT "entity_invoices_payment_id_fkey" FOREIGN KEY ("payment_id_gen") REFERENCES "entity_payments"(id);

ALTER TABLE "entity_customerReceipts" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_customerReceipts" DROP CONSTRAINT IF EXISTS "entity_customerReceipts_customer_id_fkey";
ALTER TABLE "entity_customerReceipts" ADD CONSTRAINT "entity_customerReceipts_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_customerReceipts" ADD COLUMN IF NOT EXISTS "invoice_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'invoice_id', '')) STORED;
ALTER TABLE "entity_customerReceipts" DROP CONSTRAINT IF EXISTS "entity_customerReceipts_invoice_id_fkey";
ALTER TABLE "entity_customerReceipts" ADD CONSTRAINT "entity_customerReceipts_invoice_id_fkey" FOREIGN KEY ("invoice_id_gen") REFERENCES "entity_invoices"(id);

ALTER TABLE "entity_customerReceipts" ADD COLUMN IF NOT EXISTS "payment_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'payment_id', '')) STORED;
ALTER TABLE "entity_customerReceipts" DROP CONSTRAINT IF EXISTS "entity_customerReceipts_payment_id_fkey";
ALTER TABLE "entity_customerReceipts" ADD CONSTRAINT "entity_customerReceipts_payment_id_fkey" FOREIGN KEY ("payment_id_gen") REFERENCES "entity_payments"(id);

ALTER TABLE "entity_customerReceipts" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_customerReceipts" DROP CONSTRAINT IF EXISTS "entity_customerReceipts_work_order_id_fkey";
ALTER TABLE "entity_customerReceipts" ADD CONSTRAINT "entity_customerReceipts_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_customerReceipts" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_customerReceipts" DROP CONSTRAINT IF EXISTS "entity_customerReceipts_site_id_fkey";
ALTER TABLE "entity_customerReceipts" ADD CONSTRAINT "entity_customerReceipts_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_blocked" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_blocked" DROP CONSTRAINT IF EXISTS "entity_blocked_customer_id_fkey";
ALTER TABLE "entity_blocked" ADD CONSTRAINT "entity_blocked_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_blocked" ADD COLUMN IF NOT EXISTS "linked_work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'linked_work_order_id', '')) STORED;
ALTER TABLE "entity_blocked" DROP CONSTRAINT IF EXISTS "entity_blocked_linked_work_order_id_fkey";
ALTER TABLE "entity_blocked" ADD CONSTRAINT "entity_blocked_linked_work_order_id_fkey" FOREIGN KEY ("linked_work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_blocked" ADD COLUMN IF NOT EXISTS "linked_po_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'linked_po_id', '')) STORED;
ALTER TABLE "entity_blocked" DROP CONSTRAINT IF EXISTS "entity_blocked_linked_po_id_fkey";
ALTER TABLE "entity_blocked" ADD CONSTRAINT "entity_blocked_linked_po_id_fkey" FOREIGN KEY ("linked_po_id_gen") REFERENCES "entity_purchaseOrders"(id);

ALTER TABLE "entity_blocked" ADD COLUMN IF NOT EXISTS "linked_grn_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'linked_grn_id', '')) STORED;
ALTER TABLE "entity_blocked" DROP CONSTRAINT IF EXISTS "entity_blocked_linked_grn_id_fkey";
ALTER TABLE "entity_blocked" ADD CONSTRAINT "entity_blocked_linked_grn_id_fkey" FOREIGN KEY ("linked_grn_id_gen") REFERENCES "entity_grns"(id);

ALTER TABLE "entity_blocked" ADD COLUMN IF NOT EXISTS "linked_task_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'linked_task_id', '')) STORED;
ALTER TABLE "entity_blocked" DROP CONSTRAINT IF EXISTS "entity_blocked_linked_task_id_fkey";
ALTER TABLE "entity_blocked" ADD CONSTRAINT "entity_blocked_linked_task_id_fkey" FOREIGN KEY ("linked_task_id_gen") REFERENCES "entity_tasks"(id);

ALTER TABLE "entity_risks" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_risks" DROP CONSTRAINT IF EXISTS "entity_risks_customer_id_fkey";
ALTER TABLE "entity_risks" ADD CONSTRAINT "entity_risks_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_commSends" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_commSends" DROP CONSTRAINT IF EXISTS "entity_commSends_customer_id_fkey";
ALTER TABLE "entity_commSends" ADD CONSTRAINT "entity_commSends_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_commSends" ADD COLUMN IF NOT EXISTS "followup_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'followup_id', '')) STORED;
ALTER TABLE "entity_commSends" DROP CONSTRAINT IF EXISTS "entity_commSends_followup_id_fkey";
ALTER TABLE "entity_commSends" ADD CONSTRAINT "entity_commSends_followup_id_fkey" FOREIGN KEY ("followup_id_gen") REFERENCES "entity_followups"(id);

ALTER TABLE "entity_commSends" ADD COLUMN IF NOT EXISTS "task_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'task_id', '')) STORED;
ALTER TABLE "entity_commSends" DROP CONSTRAINT IF EXISTS "entity_commSends_task_id_fkey";
ALTER TABLE "entity_commSends" ADD CONSTRAINT "entity_commSends_task_id_fkey" FOREIGN KEY ("task_id_gen") REFERENCES "entity_tasks"(id);

ALTER TABLE "entity_commSends" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_commSends" DROP CONSTRAINT IF EXISTS "entity_commSends_work_order_id_fkey";
ALTER TABLE "entity_commSends" ADD CONSTRAINT "entity_commSends_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_commSends" ADD COLUMN IF NOT EXISTS "quotation_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'quotation_id', '')) STORED;
ALTER TABLE "entity_commSends" DROP CONSTRAINT IF EXISTS "entity_commSends_quotation_id_fkey";
ALTER TABLE "entity_commSends" ADD CONSTRAINT "entity_commSends_quotation_id_fkey" FOREIGN KEY ("quotation_id_gen") REFERENCES "entity_quotations"(id);

ALTER TABLE "entity_attendance" ADD COLUMN IF NOT EXISTS "staff_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'staff_id', '')) STORED;
ALTER TABLE "entity_attendance" DROP CONSTRAINT IF EXISTS "entity_attendance_staff_id_fkey";
ALTER TABLE "entity_attendance" ADD CONSTRAINT "entity_attendance_staff_id_fkey" FOREIGN KEY ("staff_id_gen") REFERENCES "entity_master_staff"(id);

ALTER TABLE "entity_attendance" ADD COLUMN IF NOT EXISTS "visit_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'visit_id', '')) STORED;
ALTER TABLE "entity_attendance" DROP CONSTRAINT IF EXISTS "entity_attendance_visit_id_fkey";
ALTER TABLE "entity_attendance" ADD CONSTRAINT "entity_attendance_visit_id_fkey" FOREIGN KEY ("visit_id_gen") REFERENCES "entity_visits"(id);

ALTER TABLE "entity_staffLocationPings" ADD COLUMN IF NOT EXISTS "staff_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'staff_id', '')) STORED;
ALTER TABLE "entity_staffLocationPings" DROP CONSTRAINT IF EXISTS "entity_staffLocationPings_staff_id_fkey";
ALTER TABLE "entity_staffLocationPings" ADD CONSTRAINT "entity_staffLocationPings_staff_id_fkey" FOREIGN KEY ("staff_id_gen") REFERENCES "entity_master_staff"(id);

ALTER TABLE "entity_leaveRequests" ADD COLUMN IF NOT EXISTS "staff_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'staff_id', '')) STORED;
ALTER TABLE "entity_leaveRequests" DROP CONSTRAINT IF EXISTS "entity_leaveRequests_staff_id_fkey";
ALTER TABLE "entity_leaveRequests" ADD CONSTRAINT "entity_leaveRequests_staff_id_fkey" FOREIGN KEY ("staff_id_gen") REFERENCES "entity_master_staff"(id);

ALTER TABLE "entity_payrollLines" ADD COLUMN IF NOT EXISTS "payroll_period_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'payroll_period_id', '')) STORED;
ALTER TABLE "entity_payrollLines" DROP CONSTRAINT IF EXISTS "entity_payrollLines_payroll_period_id_fkey";
ALTER TABLE "entity_payrollLines" ADD CONSTRAINT "entity_payrollLines_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id_gen") REFERENCES "entity_payrollPeriods"(id);

ALTER TABLE "entity_payrollLines" ADD COLUMN IF NOT EXISTS "staff_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'staff_id', '')) STORED;
ALTER TABLE "entity_payrollLines" DROP CONSTRAINT IF EXISTS "entity_payrollLines_staff_id_fkey";
ALTER TABLE "entity_payrollLines" ADD CONSTRAINT "entity_payrollLines_staff_id_fkey" FOREIGN KEY ("staff_id_gen") REFERENCES "entity_master_staff"(id);

ALTER TABLE "entity_salaryAdjustments" ADD COLUMN IF NOT EXISTS "staff_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'staff_id', '')) STORED;
ALTER TABLE "entity_salaryAdjustments" DROP CONSTRAINT IF EXISTS "entity_salaryAdjustments_staff_id_fkey";
ALTER TABLE "entity_salaryAdjustments" ADD CONSTRAINT "entity_salaryAdjustments_staff_id_fkey" FOREIGN KEY ("staff_id_gen") REFERENCES "entity_master_staff"(id);

ALTER TABLE "entity_salaryAdjustments" ADD COLUMN IF NOT EXISTS "payroll_period_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'payroll_period_id', '')) STORED;
ALTER TABLE "entity_salaryAdjustments" DROP CONSTRAINT IF EXISTS "entity_salaryAdjustments_payroll_period_id_fkey";
ALTER TABLE "entity_salaryAdjustments" ADD CONSTRAINT "entity_salaryAdjustments_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id_gen") REFERENCES "entity_payrollPeriods"(id);

ALTER TABLE "entity_staffDocuments" ADD COLUMN IF NOT EXISTS "staff_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'staff_id', '')) STORED;
ALTER TABLE "entity_staffDocuments" DROP CONSTRAINT IF EXISTS "entity_staffDocuments_staff_id_fkey";
ALTER TABLE "entity_staffDocuments" ADD CONSTRAINT "entity_staffDocuments_staff_id_fkey" FOREIGN KEY ("staff_id_gen") REFERENCES "entity_master_staff"(id);

ALTER TABLE "entity_staffDocuments" ADD COLUMN IF NOT EXISTS "file_asset_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'file_asset_id', '')) STORED;
ALTER TABLE "entity_staffDocuments" DROP CONSTRAINT IF EXISTS "entity_staffDocuments_file_asset_id_fkey";
ALTER TABLE "entity_staffDocuments" ADD CONSTRAINT "entity_staffDocuments_file_asset_id_fkey" FOREIGN KEY ("file_asset_id_gen") REFERENCES "entity_master_fileAssets"(id);

ALTER TABLE "entity_recurringTasks" ADD COLUMN IF NOT EXISTS "assignee_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'assignee_id', '')) STORED;
ALTER TABLE "entity_recurringTasks" DROP CONSTRAINT IF EXISTS "entity_recurringTasks_assignee_id_fkey";
ALTER TABLE "entity_recurringTasks" ADD CONSTRAINT "entity_recurringTasks_assignee_id_fkey" FOREIGN KEY ("assignee_id_gen") REFERENCES "entity_master_staff"(id);

ALTER TABLE "entity_entityFileAttachments" ADD COLUMN IF NOT EXISTS "file_asset_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'file_asset_id', '')) STORED;
ALTER TABLE "entity_entityFileAttachments" DROP CONSTRAINT IF EXISTS "entity_entityFileAttachments_file_asset_id_fkey";
ALTER TABLE "entity_entityFileAttachments" ADD CONSTRAINT "entity_entityFileAttachments_file_asset_id_fkey" FOREIGN KEY ("file_asset_id_gen") REFERENCES "entity_master_fileAssets"(id);

ALTER TABLE "entity_entityReferenceAssignments" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_entityReferenceAssignments" DROP CONSTRAINT IF EXISTS "entity_entityReferenceAssignments_customer_id_fkey";
ALTER TABLE "entity_entityReferenceAssignments" ADD CONSTRAINT "entity_entityReferenceAssignments_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_master_vendorRates" ADD COLUMN IF NOT EXISTS "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'vendor_id', '')) STORED;
ALTER TABLE "entity_master_vendorRates" DROP CONSTRAINT IF EXISTS "entity_master_vendorRates_vendor_id_fkey";
ALTER TABLE "entity_master_vendorRates" ADD CONSTRAINT "entity_master_vendorRates_vendor_id_fkey" FOREIGN KEY ("vendor_id_gen") REFERENCES "entity_master_vendors"(id);

ALTER TABLE "entity_master_vendorRates" ADD COLUMN IF NOT EXISTS "work_required_article_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_article_id', '')) STORED;
ALTER TABLE "entity_master_vendorRates" DROP CONSTRAINT IF EXISTS "entity_master_vendorRates_work_required_article_id_fkey";
ALTER TABLE "entity_master_vendorRates" ADD CONSTRAINT "entity_master_vendorRates_work_required_article_id_fkey" FOREIGN KEY ("work_required_article_id_gen") REFERENCES "entity_master_subcategoryArticleMap"(id);

ALTER TABLE "entity_master_vendorRates" ADD COLUMN IF NOT EXISTS "article_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'article_id', '')) STORED;
ALTER TABLE "entity_master_vendorRates" DROP CONSTRAINT IF EXISTS "entity_master_vendorRates_article_id_fkey";
ALTER TABLE "entity_master_vendorRates" ADD CONSTRAINT "entity_master_vendorRates_article_id_fkey" FOREIGN KEY ("article_id_gen") REFERENCES "entity_master_articles"(id);

ALTER TABLE "entity_master_vendorRateHistories" ADD COLUMN IF NOT EXISTS "vendor_rate_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'vendor_rate_id', '')) STORED;
ALTER TABLE "entity_master_vendorRateHistories" DROP CONSTRAINT IF EXISTS "entity_master_vendorRateHistories_vendor_rate_id_fkey";
ALTER TABLE "entity_master_vendorRateHistories" ADD CONSTRAINT "entity_master_vendorRateHistories_vendor_rate_id_fkey" FOREIGN KEY ("vendor_rate_id_gen") REFERENCES "entity_master_vendorRates"(id);

ALTER TABLE "entity_master_vendorRateHistories" ADD COLUMN IF NOT EXISTS "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'vendor_id', '')) STORED;
ALTER TABLE "entity_master_vendorRateHistories" DROP CONSTRAINT IF EXISTS "entity_master_vendorRateHistories_vendor_id_fkey";
ALTER TABLE "entity_master_vendorRateHistories" ADD CONSTRAINT "entity_master_vendorRateHistories_vendor_id_fkey" FOREIGN KEY ("vendor_id_gen") REFERENCES "entity_master_vendors"(id);

ALTER TABLE "entity_master_vendorRateHistories" ADD COLUMN IF NOT EXISTS "article_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'article_id', '')) STORED;
ALTER TABLE "entity_master_vendorRateHistories" DROP CONSTRAINT IF EXISTS "entity_master_vendorRateHistories_article_id_fkey";
ALTER TABLE "entity_master_vendorRateHistories" ADD CONSTRAINT "entity_master_vendorRateHistories_article_id_fkey" FOREIGN KEY ("article_id_gen") REFERENCES "entity_master_articles"(id);

ALTER TABLE "entity_master_vendorRateHistories" ADD COLUMN IF NOT EXISTS "work_required_article_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_article_id', '')) STORED;
ALTER TABLE "entity_master_vendorRateHistories" DROP CONSTRAINT IF EXISTS "entity_master_vendorRateHistories_work_required_article_id_f";
ALTER TABLE "entity_master_vendorRateHistories" ADD CONSTRAINT "entity_master_vendorRateHistories_work_required_article_id_f" FOREIGN KEY ("work_required_article_id_gen") REFERENCES "entity_master_subcategoryArticleMap"(id);

ALTER TABLE "entity_master_contractorRates" ADD COLUMN IF NOT EXISTS "contractor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'contractor_id', '')) STORED;
ALTER TABLE "entity_master_contractorRates" DROP CONSTRAINT IF EXISTS "entity_master_contractorRates_contractor_id_fkey";
ALTER TABLE "entity_master_contractorRates" ADD CONSTRAINT "entity_master_contractorRates_contractor_id_fkey" FOREIGN KEY ("contractor_id_gen") REFERENCES "entity_master_contractors"(id);

ALTER TABLE "entity_master_articleVariants" ADD COLUMN IF NOT EXISTS "article_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'article_id', '')) STORED;
ALTER TABLE "entity_master_articleVariants" DROP CONSTRAINT IF EXISTS "entity_master_articleVariants_article_id_fkey";
ALTER TABLE "entity_master_articleVariants" ADD CONSTRAINT "entity_master_articleVariants_article_id_fkey" FOREIGN KEY ("article_id_gen") REFERENCES "entity_master_articles"(id);

ALTER TABLE "entity_master_articleVariants" ADD COLUMN IF NOT EXISTS "work_required_article_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_article_id', '')) STORED;
ALTER TABLE "entity_master_articleVariants" DROP CONSTRAINT IF EXISTS "entity_master_articleVariants_work_required_article_id_fkey";
ALTER TABLE "entity_master_articleVariants" ADD CONSTRAINT "entity_master_articleVariants_work_required_article_id_fkey" FOREIGN KEY ("work_required_article_id_gen") REFERENCES "entity_master_subcategoryArticleMap"(id);

ALTER TABLE "entity_master_subcategoryArticleMap" ADD COLUMN IF NOT EXISTS "article_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'article_id', '')) STORED;
ALTER TABLE "entity_master_subcategoryArticleMap" DROP CONSTRAINT IF EXISTS "entity_master_subcategoryArticleMap_article_id_fkey";
ALTER TABLE "entity_master_subcategoryArticleMap" ADD CONSTRAINT "entity_master_subcategoryArticleMap_article_id_fkey" FOREIGN KEY ("article_id_gen") REFERENCES "entity_master_articles"(id);

ALTER TABLE "entity_master_subcategoryArticleMap" ADD COLUMN IF NOT EXISTS "work_required_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_required_id', '')) STORED;
ALTER TABLE "entity_master_subcategoryArticleMap" DROP CONSTRAINT IF EXISTS "entity_master_subcategoryArticleMap_work_required_id_fkey";
ALTER TABLE "entity_master_subcategoryArticleMap" ADD CONSTRAINT "entity_master_subcategoryArticleMap_work_required_id_fkey" FOREIGN KEY ("work_required_id_gen") REFERENCES "entity_master_workSubcategories"(id);

ALTER TABLE "entity_master_storageFolderInstances" ADD COLUMN IF NOT EXISTS "storage_account_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'storage_account_id', '')) STORED;
ALTER TABLE "entity_master_storageFolderInstances" DROP CONSTRAINT IF EXISTS "entity_master_storageFolderInstances_storage_account_id_fkey";
ALTER TABLE "entity_master_storageFolderInstances" ADD CONSTRAINT "entity_master_storageFolderInstances_storage_account_id_fkey" FOREIGN KEY ("storage_account_id_gen") REFERENCES "entity_master_storageAccounts"(id);

ALTER TABLE "entity_master_storageFolderInstances" ADD COLUMN IF NOT EXISTS "template_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'template_id', '')) STORED;
ALTER TABLE "entity_master_storageFolderInstances" DROP CONSTRAINT IF EXISTS "entity_master_storageFolderInstances_template_id_fkey";
ALTER TABLE "entity_master_storageFolderInstances" ADD CONSTRAINT "entity_master_storageFolderInstances_template_id_fkey" FOREIGN KEY ("template_id_gen") REFERENCES "entity_master_storageFolderTemplates"(id);

ALTER TABLE "entity_master_fileAssets" ADD COLUMN IF NOT EXISTS "storage_account_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'storage_account_id', '')) STORED;
ALTER TABLE "entity_master_fileAssets" DROP CONSTRAINT IF EXISTS "entity_master_fileAssets_storage_account_id_fkey";
ALTER TABLE "entity_master_fileAssets" ADD CONSTRAINT "entity_master_fileAssets_storage_account_id_fkey" FOREIGN KEY ("storage_account_id_gen") REFERENCES "entity_master_storageAccounts"(id);

ALTER TABLE "entity_master_fileAssets" ADD COLUMN IF NOT EXISTS "storage_folder_instance_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'storage_folder_instance_id', '')) STORED;
ALTER TABLE "entity_master_fileAssets" DROP CONSTRAINT IF EXISTS "entity_master_fileAssets_storage_folder_instance_id_fkey";
ALTER TABLE "entity_master_fileAssets" ADD CONSTRAINT "entity_master_fileAssets_storage_folder_instance_id_fkey" FOREIGN KEY ("storage_folder_instance_id_gen") REFERENCES "entity_master_storageFolderInstances"(id);

ALTER TABLE "entity_master_catalogueArticleVendorLinks" ADD COLUMN IF NOT EXISTS "catalogue_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'catalogue_id', '')) STORED;
ALTER TABLE "entity_master_catalogueArticleVendorLinks" DROP CONSTRAINT IF EXISTS "entity_master_catalogueArticleVendorLinks_catalogue_id_fkey";
ALTER TABLE "entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "entity_master_catalogueArticleVendorLinks_catalogue_id_fkey" FOREIGN KEY ("catalogue_id_gen") REFERENCES "entity_master_catalogues"(id);

ALTER TABLE "entity_master_catalogueArticleVendorLinks" ADD COLUMN IF NOT EXISTS "article_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'article_id', '')) STORED;
ALTER TABLE "entity_master_catalogueArticleVendorLinks" DROP CONSTRAINT IF EXISTS "entity_master_catalogueArticleVendorLinks_article_id_fkey";
ALTER TABLE "entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "entity_master_catalogueArticleVendorLinks_article_id_fkey" FOREIGN KEY ("article_id_gen") REFERENCES "entity_master_articles"(id);

ALTER TABLE "entity_master_catalogueArticleVendorLinks" ADD COLUMN IF NOT EXISTS "vendor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'vendor_id', '')) STORED;
ALTER TABLE "entity_master_catalogueArticleVendorLinks" DROP CONSTRAINT IF EXISTS "entity_master_catalogueArticleVendorLinks_vendor_id_fkey";
ALTER TABLE "entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "entity_master_catalogueArticleVendorLinks_vendor_id_fkey" FOREIGN KEY ("vendor_id_gen") REFERENCES "entity_master_vendors"(id);

ALTER TABLE "entity_master_commissionRules" ADD COLUMN IF NOT EXISTS "source_partner_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'source_partner_id', '')) STORED;
ALTER TABLE "entity_master_commissionRules" DROP CONSTRAINT IF EXISTS "entity_master_commissionRules_source_partner_id_fkey";
ALTER TABLE "entity_master_commissionRules" ADD CONSTRAINT "entity_master_commissionRules_source_partner_id_fkey" FOREIGN KEY ("source_partner_id_gen") REFERENCES "entity_master_sourcePartners"(id);

ALTER TABLE "entity_master_commissionRules" ADD COLUMN IF NOT EXISTS "category_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'category_id', '')) STORED;
ALTER TABLE "entity_master_commissionRules" DROP CONSTRAINT IF EXISTS "entity_master_commissionRules_category_id_fkey";
ALTER TABLE "entity_master_commissionRules" ADD CONSTRAINT "entity_master_commissionRules_category_id_fkey" FOREIGN KEY ("category_id_gen") REFERENCES "entity_master_workCategories"(id);

ALTER TABLE "entity_master_pinterestBoards" ADD COLUMN IF NOT EXISTS "category_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'category_id', '')) STORED;
ALTER TABLE "entity_master_pinterestBoards" DROP CONSTRAINT IF EXISTS "entity_master_pinterestBoards_category_id_fkey";
ALTER TABLE "entity_master_pinterestBoards" ADD CONSTRAINT "entity_master_pinterestBoards_category_id_fkey" FOREIGN KEY ("category_id_gen") REFERENCES "entity_master_workCategories"(id);

ALTER TABLE "entity_master_pinterestBoards" ADD COLUMN IF NOT EXISTS "subcategory_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'subcategory_id', '')) STORED;
ALTER TABLE "entity_master_pinterestBoards" DROP CONSTRAINT IF EXISTS "entity_master_pinterestBoards_subcategory_id_fkey";
ALTER TABLE "entity_master_pinterestBoards" ADD CONSTRAINT "entity_master_pinterestBoards_subcategory_id_fkey" FOREIGN KEY ("subcategory_id_gen") REFERENCES "entity_master_workSubcategories"(id);

ALTER TABLE "entity_master_pinterestBoards" ADD COLUMN IF NOT EXISTS "article_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'article_id', '')) STORED;
ALTER TABLE "entity_master_pinterestBoards" DROP CONSTRAINT IF EXISTS "entity_master_pinterestBoards_article_id_fkey";
ALTER TABLE "entity_master_pinterestBoards" ADD CONSTRAINT "entity_master_pinterestBoards_article_id_fkey" FOREIGN KEY ("article_id_gen") REFERENCES "entity_master_articles"(id);

ALTER TABLE "entity_master_referenceMedia" ADD COLUMN IF NOT EXISTS "category_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'category_id', '')) STORED;
ALTER TABLE "entity_master_referenceMedia" DROP CONSTRAINT IF EXISTS "entity_master_referenceMedia_category_id_fkey";
ALTER TABLE "entity_master_referenceMedia" ADD CONSTRAINT "entity_master_referenceMedia_category_id_fkey" FOREIGN KEY ("category_id_gen") REFERENCES "entity_master_workCategories"(id);

ALTER TABLE "entity_master_referenceMedia" ADD COLUMN IF NOT EXISTS "subcategory_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'subcategory_id', '')) STORED;
ALTER TABLE "entity_master_referenceMedia" DROP CONSTRAINT IF EXISTS "entity_master_referenceMedia_subcategory_id_fkey";
ALTER TABLE "entity_master_referenceMedia" ADD CONSTRAINT "entity_master_referenceMedia_subcategory_id_fkey" FOREIGN KEY ("subcategory_id_gen") REFERENCES "entity_master_workSubcategories"(id);

ALTER TABLE "entity_master_referenceMedia" ADD COLUMN IF NOT EXISTS "article_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'article_id', '')) STORED;
ALTER TABLE "entity_master_referenceMedia" DROP CONSTRAINT IF EXISTS "entity_master_referenceMedia_article_id_fkey";
ALTER TABLE "entity_master_referenceMedia" ADD CONSTRAINT "entity_master_referenceMedia_article_id_fkey" FOREIGN KEY ("article_id_gen") REFERENCES "entity_master_articles"(id);

ALTER TABLE "entity_master_catalogues" ADD COLUMN IF NOT EXISTS "drive_asset_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'drive_asset_id', '')) STORED;
ALTER TABLE "entity_master_catalogues" DROP CONSTRAINT IF EXISTS "entity_master_catalogues_drive_asset_id_fkey";
ALTER TABLE "entity_master_catalogues" ADD CONSTRAINT "entity_master_catalogues_drive_asset_id_fkey" FOREIGN KEY ("drive_asset_id_gen") REFERENCES "entity_master_fileAssets"(id);

ALTER TABLE "entity_visits" ADD COLUMN IF NOT EXISTS "recovery_followup_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'recovery_followup_id', '')) STORED;
ALTER TABLE "entity_visits" DROP CONSTRAINT IF EXISTS "entity_visits_recovery_followup_id_fkey";
ALTER TABLE "entity_visits" ADD CONSTRAINT "entity_visits_recovery_followup_id_fkey" FOREIGN KEY ("recovery_followup_id_gen") REFERENCES "entity_followups"(id);

ALTER TABLE "entity_visits" ADD COLUMN IF NOT EXISTS "report_task_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'report_task_id', '')) STORED;
ALTER TABLE "entity_visits" DROP CONSTRAINT IF EXISTS "entity_visits_report_task_id_fkey";
ALTER TABLE "entity_visits" ADD CONSTRAINT "entity_visits_report_task_id_fkey" FOREIGN KEY ("report_task_id_gen") REFERENCES "entity_tasks"(id);

ALTER TABLE "entity_visits" ADD COLUMN IF NOT EXISTS "checkout_thread_message_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'checkout_thread_message_id', '')) STORED;
ALTER TABLE "entity_visits" DROP CONSTRAINT IF EXISTS "entity_visits_checkout_thread_message_id_fkey";
ALTER TABLE "entity_visits" ADD CONSTRAINT "entity_visits_checkout_thread_message_id_fkey" FOREIGN KEY ("checkout_thread_message_id_gen") REFERENCES "entity_threadMessages"(id);

ALTER TABLE "entity_visits" ADD COLUMN IF NOT EXISTS "report_thread_message_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'report_thread_message_id', '')) STORED;
ALTER TABLE "entity_visits" DROP CONSTRAINT IF EXISTS "entity_visits_report_thread_message_id_fkey";
ALTER TABLE "entity_visits" ADD CONSTRAINT "entity_visits_report_thread_message_id_fkey" FOREIGN KEY ("report_thread_message_id_gen") REFERENCES "entity_threadMessages"(id);

ALTER TABLE "entity_tasks" ADD COLUMN IF NOT EXISTS "blocked_item_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'blocked_item_id', '')) STORED;
ALTER TABLE "entity_tasks" DROP CONSTRAINT IF EXISTS "entity_tasks_blocked_item_id_fkey";
ALTER TABLE "entity_tasks" ADD CONSTRAINT "entity_tasks_blocked_item_id_fkey" FOREIGN KEY ("blocked_item_id_gen") REFERENCES "entity_blocked"(id);

ALTER TABLE "entity_payments" ADD COLUMN IF NOT EXISTS "milestone_term_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'milestone_term_id', '')) STORED;
ALTER TABLE "entity_payments" DROP CONSTRAINT IF EXISTS "entity_payments_milestone_term_id_fkey";
ALTER TABLE "entity_payments" ADD CONSTRAINT "entity_payments_milestone_term_id_fkey" FOREIGN KEY ("milestone_term_id_gen") REFERENCES "entity_paymentTermTemplates"(id);

ALTER TABLE "entity_workOrders" ADD COLUMN IF NOT EXISTS "abandoned_contractor_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'abandoned_contractor_id', '')) STORED;
ALTER TABLE "entity_workOrders" DROP CONSTRAINT IF EXISTS "entity_workOrders_abandoned_contractor_id_fkey";
ALTER TABLE "entity_workOrders" ADD CONSTRAINT "entity_workOrders_abandoned_contractor_id_fkey" FOREIGN KEY ("abandoned_contractor_id_gen") REFERENCES "entity_master_contractors"(id);

ALTER TABLE "entity_grns" ADD COLUMN IF NOT EXISTS "obstacle_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'obstacle_id', '')) STORED;
ALTER TABLE "entity_grns" DROP CONSTRAINT IF EXISTS "entity_grns_obstacle_id_fkey";
ALTER TABLE "entity_grns" ADD CONSTRAINT "entity_grns_obstacle_id_fkey" FOREIGN KEY ("obstacle_id_gen") REFERENCES "entity_blocked"(id);

ALTER TABLE "entity_grns" ADD COLUMN IF NOT EXISTS "bill_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'bill_id', '')) STORED;
ALTER TABLE "entity_grns" DROP CONSTRAINT IF EXISTS "entity_grns_bill_id_fkey";
ALTER TABLE "entity_grns" ADD CONSTRAINT "entity_grns_bill_id_fkey" FOREIGN KEY ("bill_id_gen") REFERENCES "entity_vendorBills"(id);

ALTER TABLE "entity_vendorBills" ADD COLUMN IF NOT EXISTS "three_way_match_obstacle_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'three_way_match.obstacle_id', '')) STORED;
ALTER TABLE "entity_vendorBills" DROP CONSTRAINT IF EXISTS "entity_vendorBills_three_way_match_obstacle_id_fkey";
ALTER TABLE "entity_vendorBills" ADD CONSTRAINT "entity_vendorBills_three_way_match_obstacle_id_fkey" FOREIGN KEY ("three_way_match_obstacle_id_gen") REFERENCES "entity_blocked"(id);

ALTER TABLE "entity_variationRequests" ADD COLUMN IF NOT EXISTS "execution_log_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'execution_log_id', '')) STORED;
ALTER TABLE "entity_variationRequests" DROP CONSTRAINT IF EXISTS "entity_variationRequests_execution_log_id_fkey";
ALTER TABLE "entity_variationRequests" ADD CONSTRAINT "entity_variationRequests_execution_log_id_fkey" FOREIGN KEY ("execution_log_id_gen") REFERENCES "entity_executionLogs"(id);

ALTER TABLE "entity_threadMessages" ADD COLUMN IF NOT EXISTS "related_thread_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'related_thread_id', '')) STORED;
ALTER TABLE "entity_threadMessages" DROP CONSTRAINT IF EXISTS "entity_threadMessages_related_thread_id_fkey";
ALTER TABLE "entity_threadMessages" ADD CONSTRAINT "entity_threadMessages_related_thread_id_fkey" FOREIGN KEY ("related_thread_id_gen") REFERENCES "entity_threads"(id);

ALTER TABLE "entity_threadMessages" ADD COLUMN IF NOT EXISTS "related_audit_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'related_audit_id', '')) STORED;
ALTER TABLE "entity_threadMessages" DROP CONSTRAINT IF EXISTS "entity_threadMessages_related_audit_id_fkey";
ALTER TABLE "entity_threadMessages" ADD CONSTRAINT "entity_threadMessages_related_audit_id_fkey" FOREIGN KEY ("related_audit_id_gen") REFERENCES "entity_auditLog"(id);

ALTER TABLE "entity_threadMessageAttachments" ADD COLUMN IF NOT EXISTS "entity_file_attachment_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'entity_file_attachment_id', '')) STORED;
ALTER TABLE "entity_threadMessageAttachments" DROP CONSTRAINT IF EXISTS "entity_threadMessageAttachments_entity_file_attachment_id_fk";
ALTER TABLE "entity_threadMessageAttachments" ADD CONSTRAINT "entity_threadMessageAttachments_entity_file_attachment_id_fk" FOREIGN KEY ("entity_file_attachment_id_gen") REFERENCES "entity_entityFileAttachments"(id);

ALTER TABLE "entity_customers" ADD COLUMN IF NOT EXISTS "source_partner_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'source_partner_id', '')) STORED;
ALTER TABLE "entity_customers" DROP CONSTRAINT IF EXISTS "entity_customers_source_partner_id_fkey";
ALTER TABLE "entity_customers" ADD CONSTRAINT "entity_customers_source_partner_id_fkey" FOREIGN KEY ("source_partner_id_gen") REFERENCES "entity_master_sourcePartners"(id);

ALTER TABLE "entity_sites" ADD COLUMN IF NOT EXISTS "source_partner_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'source_partner_id', '')) STORED;
ALTER TABLE "entity_sites" DROP CONSTRAINT IF EXISTS "entity_sites_source_partner_id_fkey";
ALTER TABLE "entity_sites" ADD CONSTRAINT "entity_sites_source_partner_id_fkey" FOREIGN KEY ("source_partner_id_gen") REFERENCES "entity_master_sourcePartners"(id);

ALTER TABLE "entity_acceptedScopes" ADD COLUMN IF NOT EXISTS "contractor_bid_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'contractor_bid_id', '')) STORED;
ALTER TABLE "entity_acceptedScopes" DROP CONSTRAINT IF EXISTS "entity_acceptedScopes_contractor_bid_id_fkey";
ALTER TABLE "entity_acceptedScopes" ADD CONSTRAINT "entity_acceptedScopes_contractor_bid_id_fkey" FOREIGN KEY ("contractor_bid_id_gen") REFERENCES "entity_contractorBids"(id);

ALTER TABLE "entity_contractorSettlements" ADD COLUMN IF NOT EXISTS "replacement_work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'replacement_work_order_id', '')) STORED;
ALTER TABLE "entity_contractorSettlements" DROP CONSTRAINT IF EXISTS "entity_contractorSettlements_replacement_work_order_id_fkey";
ALTER TABLE "entity_contractorSettlements" ADD CONSTRAINT "entity_contractorSettlements_replacement_work_order_id_fkey" FOREIGN KEY ("replacement_work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_leaveRequests" ADD COLUMN IF NOT EXISTS "approved_by_staff_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'approved_by_staff_id', '')) STORED;
ALTER TABLE "entity_leaveRequests" DROP CONSTRAINT IF EXISTS "entity_leaveRequests_approved_by_staff_id_fkey";
ALTER TABLE "entity_leaveRequests" ADD CONSTRAINT "entity_leaveRequests_approved_by_staff_id_fkey" FOREIGN KEY ("approved_by_staff_id_gen") REFERENCES "entity_master_staff"(id);

ALTER TABLE "entity_attendance" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_attendance" DROP CONSTRAINT IF EXISTS "entity_attendance_work_order_id_fkey";
ALTER TABLE "entity_attendance" ADD CONSTRAINT "entity_attendance_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_salaryAdjustments" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_salaryAdjustments" DROP CONSTRAINT IF EXISTS "entity_salaryAdjustments_work_order_id_fkey";
ALTER TABLE "entity_salaryAdjustments" ADD CONSTRAINT "entity_salaryAdjustments_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_recurringTasks" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_recurringTasks" DROP CONSTRAINT IF EXISTS "entity_recurringTasks_customer_id_fkey";
ALTER TABLE "entity_recurringTasks" ADD CONSTRAINT "entity_recurringTasks_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_recurringTasks" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_recurringTasks" DROP CONSTRAINT IF EXISTS "entity_recurringTasks_site_id_fkey";
ALTER TABLE "entity_recurringTasks" ADD CONSTRAINT "entity_recurringTasks_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_recurringTasks" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_recurringTasks" DROP CONSTRAINT IF EXISTS "entity_recurringTasks_work_order_id_fkey";
ALTER TABLE "entity_recurringTasks" ADD CONSTRAINT "entity_recurringTasks_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);

ALTER TABLE "entity_blocked" ADD COLUMN IF NOT EXISTS "linked_quotation_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'linked_quotation_id', '')) STORED;
ALTER TABLE "entity_blocked" DROP CONSTRAINT IF EXISTS "entity_blocked_linked_quotation_id_fkey";
ALTER TABLE "entity_blocked" ADD CONSTRAINT "entity_blocked_linked_quotation_id_fkey" FOREIGN KEY ("linked_quotation_id_gen") REFERENCES "entity_quotations"(id);

ALTER TABLE "entity_auditLog" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_auditLog" DROP CONSTRAINT IF EXISTS "entity_auditLog_customer_id_fkey";
ALTER TABLE "entity_auditLog" ADD CONSTRAINT "entity_auditLog_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_master_fileAssets" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_master_fileAssets" DROP CONSTRAINT IF EXISTS "entity_master_fileAssets_customer_id_fkey";
ALTER TABLE "entity_master_fileAssets" ADD CONSTRAINT "entity_master_fileAssets_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_master_fileAssets" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_master_fileAssets" DROP CONSTRAINT IF EXISTS "entity_master_fileAssets_site_id_fkey";
ALTER TABLE "entity_master_fileAssets" ADD CONSTRAINT "entity_master_fileAssets_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_master_storageFolderInstances" ADD COLUMN IF NOT EXISTS "customer_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'customer_id', '')) STORED;
ALTER TABLE "entity_master_storageFolderInstances" DROP CONSTRAINT IF EXISTS "entity_master_storageFolderInstances_customer_id_fkey";
ALTER TABLE "entity_master_storageFolderInstances" ADD CONSTRAINT "entity_master_storageFolderInstances_customer_id_fkey" FOREIGN KEY ("customer_id_gen") REFERENCES "entity_customers"(id);

ALTER TABLE "entity_master_storageFolderInstances" ADD COLUMN IF NOT EXISTS "site_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'site_id', '')) STORED;
ALTER TABLE "entity_master_storageFolderInstances" DROP CONSTRAINT IF EXISTS "entity_master_storageFolderInstances_site_id_fkey";
ALTER TABLE "entity_master_storageFolderInstances" ADD CONSTRAINT "entity_master_storageFolderInstances_site_id_fkey" FOREIGN KEY ("site_id_gen") REFERENCES "entity_sites"(id);

ALTER TABLE "entity_master_storageFolderInstances" ADD COLUMN IF NOT EXISTS "work_order_id_gen" text GENERATED ALWAYS AS (NULLIF(data->>'work_order_id', '')) STORED;
ALTER TABLE "entity_master_storageFolderInstances" DROP CONSTRAINT IF EXISTS "entity_master_storageFolderInstances_work_order_id_fkey";
ALTER TABLE "entity_master_storageFolderInstances" ADD CONSTRAINT "entity_master_storageFolderInstances_work_order_id_fkey" FOREIGN KEY ("work_order_id_gen") REFERENCES "entity_workOrders"(id);
