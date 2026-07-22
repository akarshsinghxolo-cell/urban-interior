-- ============================================================================
-- Urban Castle — Seed Data
-- ============================================================================
-- This file populates the Supabase database with demo data on first run.
-- Run AFTER applying schema.sql and schema-entity-tables.sql.
--
-- Usage in Supabase SQL Editor:
--   1. Run supabase/schema.sql (auth + base tables)
--   2. Run supabase/schema-entity-tables.sql (entity_* tables)
--   3. Run this file (supabase/seed.sql) to populate demo data
-- ============================================================================

-- Workspace revision
INSERT INTO entity_workspace_revision (id, revision, "updatedAt")
VALUES ('default', 1, NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- MASTER DATA — Work Categories, Articles, Units, Vendors, Contractors, Staff
-- ============================================================================

-- Work Categories
INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('workCategories', 'cat-ceiling', '{"id":"cat-ceiling","name":"False Ceiling","icon":"ceiling"}', 1),
('workCategories', 'cat-flooring', '{"id":"cat-flooring","name":"Flooring & Tiles","icon":"floor"}', 1),
('workCategories', 'cat-wall', '{"id":"cat-wall","name":"Wall Treatments","icon":"wall"}', 1),
('workCategories', 'cat-paint', '{"id":"cat-paint","name":"Paint Work","icon":"paint"}', 1),
('workCategories', 'cat-carpentry', '{"id":"cat-carpentry","name":"Furniture & Carpentry","icon":"furniture"}', 1)
ON CONFLICT DO NOTHING;

-- Units
INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('units', 'unit-sft', '{"id":"unit-sft","name":"Square Feet","symbol":"sq.ft","family":"area"}', 1),
('units', 'unit-ltr', '{"id":"unit-ltr","name":"Litre","symbol":"ltr","family":"volume"}', 1),
('units', 'unit-pcs', '{"id":"unit-pcs","name":"Pieces","symbol":"pcs","family":"count"}', 1),
('units', 'unit-ft', '{"id":"unit-ft","name":"Feet","symbol":"ft","family":"length"}', 1)
ON CONFLICT DO NOTHING;

-- Vendors
INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('vendors', 'ven-build', '{"id":"ven-build","name":"Build Mart","phone":"+91 9000001001","city":"Gorakhpur","locality":"Taramandal","category":"Ceiling materials","reliability_score":88,"on_time_pct":91}', 1),
('vendors', 'ven-ceiling', '{"id":"ven-ceiling","name":"Ceiling Hub","phone":"+91 9000001002","city":"Gorakhpur","locality":"Golghar","category":"Gypsum and grid systems","reliability_score":83,"on_time_pct":88}', 1)
ON CONFLICT DO NOTHING;

-- Contractors
INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('contractors', 'con-gypsum', '{"id":"con-gypsum","name":"Sharma Ceiling Works","phone":"+91 9000002001","city":"Gorakhpur","trade":"False ceiling","rating":4.7,"reliability_score":90,"on_time_pct":92,"past_jobs_count":31,"specializations":["Gypsum false ceiling","Grid ceiling"]}', 1),
('contractors', 'con-paint', '{"id":"con-paint","name":"Verma Paint Team","phone":"+91 9000002002","city":"Gorakhpur","trade":"Painting","rating":4.6,"reliability_score":88,"on_time_pct":91,"past_jobs_count":26,"specializations":["Interior painting","Texture paint"]}', 1)
ON CONFLICT DO NOTHING;

-- Staff
INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('staff', 'staff-ops', '{"id":"staff-ops","name":"Anita Rao","phone":"+91 9000004001","email":"anita@urbancastle.app","role":"Operations Manager","role_key":"OPERATIONS_MANAGER","status":"active","city":"Gorakhpur","gps_tracking_enabled":true,"login_enabled":true,"login_email":"anita@urbancastle.app"}', 1),
('staff', 'staff-field', '{"id":"staff-field","name":"Ravi Kumar","phone":"+91 9000004002","email":"ravi@urbancastle.app","role":"Field Staff","role_key":"FIELD_STAFF","status":"active","city":"Gorakhpur","gps_tracking_enabled":true,"login_enabled":true,"login_email":"ravi@urbancastle.app"}', 1),
('staff', 'staff-finance', '{"id":"staff-finance","name":"Meera Nair","phone":"+91 9000004003","email":"meera@urbancastle.app","role":"Finance","role_key":"FINANCE","status":"active","city":"Gorakhpur","gps_tracking_enabled":false,"login_enabled":true,"login_email":"meera@urbancastle.app"}', 1),
('staff', 'staff-sales', '{"id":"staff-sales","name":"Pooja Singh","phone":"+91 9000004004","email":"pooja@urbancastle.app","role":"Sales / Telecaller","role_key":"SALES_TELECALLER","status":"active","city":"Gorakhpur","gps_tracking_enabled":false,"login_enabled":true,"login_email":"pooja@urbancastle.app"}', 1),
('staff', 'staff-proc', '{"id":"staff-proc","name":"Vikas Tiwari","phone":"+91 9000004005","email":"vikas@urbancastle.app","role":"Procurement Staff","role_key":"PROCUREMENT_STAFF","status":"active","city":"Gorakhpur","gps_tracking_enabled":false,"login_enabled":true,"login_email":"vikas@urbancastle.app"}', 1)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- CUSTOMERS & SITES
-- ============================================================================

INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('customers', 'cust-das', '{"id":"cust-das","name":"Mr. Das","phone":"+91 9876501933","whatsapp":"+91 9876501933","email":"mr.das@example.demo","customer_segments":["service_customer","repeat_customer"],"status":"active","notes":"Apartment and office details live on separate Sites.","created_at":"2026-06-30T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z"}', 1),
('customers', 'cust-aarav', '{"id":"cust-aarav","name":"Aarav Mehta","phone":"+91 9876520110","whatsapp":"+91 9876520110","email":"aarav@example.demo","customer_segments":["service_customer"],"status":"active","created_at":"2026-07-01T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z"}', 1),
('customers', 'cust-nisha', '{"id":"cust-nisha","name":"Nisha Rao","phone":"+91 9876592010","whatsapp":"+91 9876592010","email":"nisha@example.demo","customer_segments":["service_customer"],"status":"active","created_at":"2026-07-05T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z"}', 1)
ON CONFLICT DO NOTHING;

-- Sites
INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('sites', 'site-das-apartment', '{"id":"site-das-apartment","customer_id":"cust-das","name":"Das Residence — 3BHK Apartment","site_type":"apartment","building_name":"Legio Apartment","address":"Legio Apartment, Taramandal, Gorakhpur","city":"Gorakhpur","locality":"Taramandal","stage":"execution","created_at":"2026-06-30T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z"}', 1),
('sites', 'site-das-office', '{"id":"site-das-office","customer_id":"cust-das","name":"Das Office","site_type":"office","building_name":"Das Trade Centre","address":"Civil Lines, Gorakhpur","city":"Gorakhpur","locality":"Civil Lines","stage":"planning","created_at":"2026-07-05T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z"}', 1),
('sites', 'site-aarav-home', '{"id":"site-aarav-home","customer_id":"cust-aarav","name":"Mehta Residence","site_type":"apartment","building_name":"Prestige Apartments","address":"Indiranagar, Bengaluru","city":"Bengaluru","locality":"Indiranagar","stage":"quoted","created_at":"2026-07-01T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z"}', 1)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- QUOTATIONS, WORK ORDERS, PURCHASE ORDERS
-- ============================================================================

INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('quotations', 'quote-das-ceiling', '{"id":"quote-das-ceiling","quotation_no":"Q-2026-201","customer_id":"cust-das","site_id":"site-das-apartment","title":"Das Apartment — Master Bedroom Gypsum Ceiling","status":"accepted","revision_no":1,"total_amount":55000,"created_at":"2026-07-01T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z","work_order_ids":["wo-das-ceiling"]}', 1),
('quotations', 'quote-das-paint', '{"id":"quote-das-paint","quotation_no":"Q-2026-202","customer_id":"cust-das","site_id":"site-das-apartment","title":"Das Apartment — Bedroom Painting Package","status":"accepted","revision_no":0,"total_amount":18000,"created_at":"2026-07-04T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z","work_order_ids":[]}', 1),
('quotations', 'quote-das-office', '{"id":"quote-das-office","quotation_no":"Q-2026-203","customer_id":"cust-das","site_id":"site-das-office","title":"Das Office — Reception Grid Ceiling","status":"draft","revision_no":0,"total_amount":80240,"created_at":"2026-07-12T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z","work_order_ids":[]}', 1),
('quotations', 'quote-aarav-kitchen', '{"id":"quote-aarav-kitchen","quotation_no":"Q-2026-204","customer_id":"cust-aarav","site_id":"site-aarav-home","title":"Mehta Residence — Modular Kitchen","status":"sent","revision_no":0,"total_amount":145000,"created_at":"2026-07-08T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z","work_order_ids":[]}', 1),
('quotations', 'quote-das-ceiling-v2', '{"id":"quote-das-ceiling-v2","quotation_no":"Q-2026-201-R2","customer_id":"cust-das","site_id":"site-das-apartment","title":"Das Apartment — Master Bedroom Ceiling (Variation: LED Cove Added)","status":"accepted","revision_no":2,"revision_kind":"variation","revision_reason":"Customer requested LED cove lighting addition after work order started.","revision_approved_by":"Akarsh Singh","total_amount":65030,"created_at":"2026-07-14T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z","work_order_ids":["wo-das-ceiling"]}', 1)
ON CONFLICT DO NOTHING;

-- Work Orders
INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('workOrders', 'wo-das-ceiling', '{"id":"wo-das-ceiling","work_order_no":"WO-2026-301","customer_id":"cust-das","quotation_ids":["quote-das-ceiling"],"site_id":"site-das-apartment","title":"Master Bedroom Gypsum Ceiling Execution","status":"in_progress","contractor_id":"con-gypsum","contractor_name":"Sharma Ceiling Works","start_date":"2026-07-08","expected_end":"2026-07-20","value":55000,"progress":48,"site_address":"Legio Apartment, Taramandal, Gorakhpur","created_at":"2026-07-06T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z"}', 1)
ON CONFLICT DO NOTHING;

-- Purchase Orders
INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('purchaseOrders', 'po-das-ceiling', '{"id":"po-das-ceiling","po_no":"PO-2026-601","rfq_id":"rfq-das-ceiling","work_order_id":"wo-das-ceiling","work_order_no":"WO-2026-301","site_id":"site-das-apartment","vendor_id":"ven-build","vendor_name":"Build Mart","status":"partially_received","total_amount":19829,"award_basis":"competitive","expected_delivery":"2026-07-16","grn_ids":["grn-das-ceiling"],"bill_ids":["vb-das-ceiling"],"created_at":"2026-07-12T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z"}', 1),
('purchaseOrders', 'po-das-paint-direct', '{"id":"po-das-paint-direct","po_no":"PO-2026-602","work_order_id":"wo-das-ceiling","work_order_no":"WO-2026-301","site_id":"site-das-apartment","vendor_id":"ven-build","vendor_name":"Build Mart","status":"sent","direct_award":true,"award_basis":"direct","award_reason":"Trusted vendor with existing rate agreement for premium paint brands; urgent site requirement.","award_approved_by":"Akarsh Singh","total_amount":6230.4,"expected_delivery":"2026-07-18","grn_ids":[],"bill_ids":[],"created_at":"2026-07-15T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z"}', 1)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- FINANCE — Payments, Invoices, Receipts, Cost Lines
-- ============================================================================

INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('payments', 'pay-das-ceiling-advance', '{"id":"pay-das-ceiling-advance","finance_context":"service","customer_id":"cust-das","quotation_id":"quote-das-ceiling","work_order_id":"wo-das-ceiling","site_id":"site-das-apartment","amount":16500,"received_amount":12000,"invoice_id":"inv-das-ceiling-advance","status":"partial","mode":"upi","due_date":"2026-07-05","received_date":"2026-07-06","milestone_label":"Advance 30%","is_advance":true,"created_at":"2026-07-05T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z"}', 1),
('invoices', 'inv-das-ceiling-advance', '{"id":"inv-das-ceiling-advance","invoice_no":"INV-2026-101","finance_context":"service","customer_id":"cust-das","site_id":"site-das-apartment","quotation_id":"quote-das-ceiling","work_order_id":"wo-das-ceiling","payment_id":"pay-das-ceiling-advance","title":"Gypsum ceiling advance","status":"partial","total_amount":16500,"paid_amount":12000,"balance_amount":4500,"issued_at":"2026-07-05","due_date":"2026-07-05","created_at":"2026-07-05T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z"}', 1),
('customerReceipts', 'receipt-das-ceiling-advance', '{"id":"receipt-das-ceiling-advance","receipt_no":"CR-2026-101","finance_context":"service","customer_id":"cust-das","site_id":"site-das-apartment","quotation_id":"quote-das-ceiling","work_order_id":"wo-das-ceiling","invoice_id":"inv-das-ceiling-advance","payment_id":"pay-das-ceiling-advance","amount":12000,"mode":"upi","reference":"UPI-DAS-ADV-101","received_at":"2026-07-06","created_by":"Meera Nair","created_at":"2026-07-06T00:00:00.000Z","updated_at":"2026-07-17T00:00:00.000Z"}', 1)
ON CONFLICT DO NOTHING;

-- Work Order Cost Lines
-- FIX-CONTRACTOR-BATCH1 / F.3: contractor cost lines now write vendor_id
-- (the canonical runtime field, matching contractors.ts:756-757 + 573-574
-- and the ContractorDetailModule filter `cl.vendor_id === c.id`). The
-- legacy contractor_id is mirrored for backward compatibility.
INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('workOrderCostLines', 'cost-das-contractor-accrual', '{"id":"cost-das-contractor-accrual","work_order_id":"wo-das-ceiling","type":"contractor","description":"Sharma Ceiling Works — verified RA bill (50% progress)","amount":14500,"date":"2026-07-16","source_kind":"bill","source_id":"cbill-das-ceiling","vendor_id":"con-gypsum","vendor_name":"Sharma Ceiling Works","contractor_id":"con-gypsum","contractor_name":"Sharma Ceiling Works","created_at":"2026-07-16T00:00:00.000Z"}', 1),
('workOrderCostLines', 'cost-das-material-po', '{"id":"cost-das-material-po","work_order_id":"wo-das-ceiling","type":"material","description":"Build Mart — Gypsum board + channels (PO-2026-601)","amount":19829,"date":"2026-07-12","source_kind":"po","source_id":"po-das-ceiling","vendor_id":"ven-build","vendor_name":"Build Mart","created_at":"2026-07-12T00:00:00.000Z"}', 1),
('workOrderCostLines', 'cost-das-material-direct', '{"id":"cost-das-material-direct","work_order_id":"wo-das-ceiling","type":"material","description":"Build Mart — Paint + primer (PO-2026-602 direct award)","amount":6230.4,"date":"2026-07-15","source_kind":"po","source_id":"po-das-paint-direct","vendor_id":"ven-build","vendor_name":"Build Mart","created_at":"2026-07-15T00:00:00.000Z"}', 1),
('workOrderCostLines', 'cost-das-labour-advance', '{"id":"cost-das-labour-advance","work_order_id":"wo-das-ceiling","type":"labour","description":"Labour advance — carpenter helper (3 days)","amount":2400,"date":"2026-07-14","source_kind":"manual","created_at":"2026-07-14T00:00:00.000Z"}', 1)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('auditLog', 'audit-vendor-rate-demo', '{"id":"audit-vendor-rate-demo","timestamp":"2026-07-13T00:00:00.000Z","actor":"Owner","actor_role":"Owner","action":"Vendor rate updated from PO line","entity_type":"vendor_rate","entity_id":"vr_ven-build_wia_fc_gyp_1","entity_label":"Build Mart · Gypsum Board","kind":"update","source_module":"vendorRates","reason":"Accepted PO price became latest vendor rate","changes":[{"field":"rate","before":42,"after":44},{"field":"current_source_type","before":"SEED","after":"PO"}]}', 1),
('auditLog', 'audit-direct-award-po', '{"id":"audit-direct-award-po","timestamp":"2026-07-15T00:00:00.000Z","actor":"Akarsh Singh","actor_role":"Owner","action":"Direct award PO created (skipped RFQ/bidding)","entity_type":"purchase_order","entity_id":"po-das-paint-direct","entity_label":"PO-2026-602","kind":"decision","source_module":"procurement","reason":"Trusted vendor with existing rate agreement for premium paint brands; urgent site requirement."}', 1),
('auditLog', 'audit-quotation-variation', '{"id":"audit-quotation-variation","timestamp":"2026-07-14T00:00:00.000Z","actor":"Akarsh Singh","actor_role":"Owner","action":"Quotation variation created (scope expansion post Work Order)","entity_type":"quotation","entity_id":"quote-das-ceiling-v2","entity_label":"Q-2026-201-R2","kind":"decision","source_module":"quotationDesk","reason":"Customer requested LED cove lighting addition after work order started."}', 1),
('auditLog', 'audit-quotation-accepted', '{"id":"audit-quotation-accepted","timestamp":"2026-07-14T00:00:00.000Z","actor":"Mr. Das","actor_role":"Customer","action":"Quotation variation accepted by customer","entity_type":"quotation","entity_id":"quote-das-ceiling-v2","entity_label":"Q-2026-201-R2","kind":"approve","source_module":"quotationDesk"}', 1)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VENDOR RATES & HISTORIES
-- ============================================================================

INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('vendorRates', 'vr-build-gypsum-board', '{"id":"vr-build-gypsum-board","vendor_id":"ven-build","article_id":"art-gypsum-board","article_name":"Gypsum Board (12.5mm)","rate":44,"unit_id":"unit-sft","brand":"USG Boral","preferred":true,"current_source_type":"PO","current_source_id":"po-das-ceiling","current_source_no":"PO-2026-601","valid_from":"2026-07-12","updated_at":"2026-07-12T00:00:00.000Z","gst_inclusive":false}', 1),
('vendorRates', 'vr-build-gypsum-channel', '{"id":"vr-build-gypsum-channel","vendor_id":"ven-build","article_id":"art-gypsum-channel","article_name":"Gypsum Ceiling Channel","rate":38,"unit_id":"unit-sft","brand":"USG Boral","preferred":true,"current_source_type":"SEED","valid_from":"2026-06-17","updated_at":"2026-06-17T00:00:00.000Z"}', 1),
('vendorRates', 'vr-build-paint-royale', '{"id":"vr-build-paint-royale","vendor_id":"ven-build","article_id":"art-paint-premium","article_name":"Asian Paints Royale (Premium Emulsion)","rate":520,"unit_id":"unit-ltr","brand":"Asian Paints","preferred":true,"current_source_type":"PO","current_source_id":"po-das-paint-direct","current_source_no":"PO-2026-602","valid_from":"2026-07-15","updated_at":"2026-07-15T00:00:00.000Z","gst_inclusive":true}', 1),
('vendorRates', 'vr-build-primer', '{"id":"vr-build-primer","vendor_id":"ven-build","article_id":"art-primer","article_name":"Asian Paints Primer","rate":280,"unit_id":"unit-ltr","brand":"Asian Paints","current_source_type":"PO","current_source_id":"po-das-paint-direct","current_source_no":"PO-2026-602","valid_from":"2026-07-15","updated_at":"2026-07-15T00:00:00.000Z"}', 1),
('vendorRates', 'vr-ceiling-grid-tee', '{"id":"vr-ceiling-grid-tee","vendor_id":"ven-ceiling","article_id":"art-grid-tee","article_name":"Grid Ceiling Main Tee","rate":85,"unit_id":"unit-pcs","brand":"Armstrong","current_source_type":"SEED","valid_from":"2026-06-27","updated_at":"2026-06-27T00:00:00.000Z"}', 1)
ON CONFLICT DO NOTHING;

INSERT INTO entity_* (collection, id, data_json, revision) VALUES
('vendorRateHistories', 'vrh-1', '{"id":"vrh-1","vendor_rate_id":"vr-build-gypsum-board","vendor_id":"ven-build","article_id":"art-gypsum-board","article_name":"Gypsum Board (12.5mm)","work_required_article_id":"wra-gypsum-board","unit_id":"unit-sft","old_rate":42,"new_rate":44,"source_type":"PO","source_id":"po-das-ceiling","source_no":"PO-2026-601","status":"active","effective_from":"2026-07-12","changed_by":"Owner","notes":"Accepted PO price became latest vendor rate","created_at":"2026-07-12T00:00:00.000Z"}', 1),
('vendorRateHistories', 'vrh-2', '{"id":"vrh-2","vendor_rate_id":"vr-build-paint-royale","vendor_id":"ven-build","article_id":"art-paint-premium","article_name":"Asian Paints Royale (Premium Emulsion)","work_required_article_id":"wra-paint","unit_id":"unit-ltr","old_rate":495,"new_rate":520,"source_type":"PO","source_id":"po-das-paint-direct","source_no":"PO-2026-602","status":"active","effective_from":"2026-07-15","changed_by":"Owner","notes":"Direct award PO set new rate","created_at":"2026-07-15T00:00:00.000Z"}', 1),
('vendorRateHistories', 'vrh-3', '{"id":"vrh-3","vendor_rate_id":"vr-build-primer","vendor_id":"ven-build","article_id":"art-primer","article_name":"Asian Paints Primer","work_required_article_id":"wra-primer","unit_id":"unit-ltr","old_rate":265,"new_rate":280,"source_type":"PO","source_id":"po-das-paint-direct","source_no":"PO-2026-602","status":"active","effective_from":"2026-07-15","changed_by":"Owner","created_at":"2026-07-15T00:00:00.000Z"}', 1),
('vendorRateHistories', 'vrh-4', '{"id":"vrh-4","vendor_rate_id":"vr-build-gypsum-channel","vendor_id":"ven-build","article_id":"art-gypsum-channel","article_name":"Gypsum Ceiling Channel","work_required_article_id":"wra-channel","unit_id":"unit-sft","old_rate":40,"new_rate":38,"source_type":"MANUAL","status":"active","effective_from":"2026-07-02","changed_by":"Vikas Tiwari","notes":"Negotiated bulk discount","created_at":"2026-07-02T00:00:00.000Z"}', 1),
('vendorRateHistories', 'vrh-5', '{"id":"vrh-5","vendor_rate_id":"vr-ceiling-grid-tee","vendor_id":"ven-ceiling","article_id":"art-grid-tee","article_name":"Grid Ceiling Main Tee","work_required_article_id":"wra-grid","unit_id":"unit-pcs","old_rate":90,"new_rate":85,"source_type":"MANUAL","status":"active","effective_from":"2026-07-07","changed_by":"Vikas Tiwari","notes":"New vendor agreement","created_at":"2026-07-07T00:00:00.000Z"}', 1)
ON CONFLICT DO NOTHING;

-- Done
SELECT 'Seed data inserted successfully!' as result;
