-- Drop any array-field FK constraints that were accidentally created
-- (array fields like area_ids, quotation_ids can't be FKs via generated columns)
ALTER TABLE "entity_workRequired" DROP CONSTRAINT IF EXISTS "entity_workRequired_area_ids_fkey";
ALTER TABLE "entity_workOrders" DROP CONSTRAINT IF EXISTS "entity_workOrders_quotation_ids_fkey";
ALTER TABLE "entity_workOrders" DROP CONSTRAINT IF EXISTS "entity_workOrders_accepted_scope_ids_fkey";
ALTER TABLE "entity_workOrders" DROP CONSTRAINT IF EXISTS "entity_workOrders_work_required_ids_fkey";
ALTER TABLE "entity_workOrders" DROP CONSTRAINT IF EXISTS "entity_workOrders_area_ids_fkey";
ALTER TABLE "entity_drawings" DROP CONSTRAINT IF EXISTS "entity_drawings_derived_boq_item_ids_fkey";
ALTER TABLE "entity_variationRequests" DROP CONSTRAINT IF EXISTS "entity_variationRequests_affected_boq_item_ids_fkey";
ALTER TABLE "entity_blocked" DROP CONSTRAINT IF EXISTS "entity_blocked_area_ids_fkey";
ALTER TABLE "entity_customerReceipts" DROP CONSTRAINT IF EXISTS "entity_customerReceipts_area_ids_fkey";
ALTER TABLE "entity_invoices" DROP CONSTRAINT IF EXISTS "entity_invoices_area_ids_fkey";
ALTER TABLE "entity_payments" DROP CONSTRAINT IF EXISTS "entity_payments_area_ids_fkey";
ALTER TABLE "entity_contractorBills" DROP CONSTRAINT IF EXISTS "entity_contractorBills_area_ids_fkey";
ALTER TABLE "entity_acceptedScopes" DROP CONSTRAINT IF EXISTS "entity_acceptedScopes_area_ids_fkey";
ALTER TABLE "entity_commSends" DROP CONSTRAINT IF EXISTS "entity_commSends_attachment_ids_fkey";
