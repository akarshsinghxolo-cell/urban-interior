import type { AcceptedScope, Area, ContractorBill, ContractorBid, ContractorPayment, CustomerInvoice, CustomerReceipt, GRN, InventoryItem, LineItem, Master, MeasurementRevision, Payment, Customer, PurchaseOrder, Quotation, RDashDatabase, Site, VendorBid, VendorBill, VendorRFQ, WorkOrder, WorkOrderBOQ, WorkOrderCostLine, VendorPayment, WorkRequired, Drawing, DailyExecutionLog, SiteDispatch, RiskItem, BlockedItem, ApprovalAction, Followup, Commission, PinterestBoard, StorageAccount, SourcePartner, } from "./types";
import { buildWorkCategoryCatalog, prepareWorkspaceData } from "./work-category-master";
import { createDefaultAttendancePolicy } from "./attendance-policy";
import { createSeedStaffRecords, createSeedAttendanceRecords, createSeedTasks, createSeedVisits } from "./staff-operations";
import { repairOperationalWorkspace } from "./operational-repair";
import { backfillSeedThreads } from "./backfill-threads";
const now = () => new Date().toISOString();
const date = (offset = 0) => {
    const value = new Date();
    value.setDate(value.getDate() + offset);
    return value.toISOString().slice(0, 10);
};
const at = (offset = 0) => {
    const value = new Date();
    value.setDate(value.getDate() + offset);
    return value.toISOString();
};
const line = (id: string, title: string, quantity: number, rate: number, extra: Partial<LineItem> = {}): LineItem => ({
    id,
    title,
    quantity,
    rate,
    amount: Math.round(quantity * rate * 100) / 100,  // STAGE-5-FIX: 2dp (was integer rounding, missed in Stage 3.3)
    unit_id: "sqft",
    unit_name: "Square feet",
    tax_rate: 18,
    ordered_qty: 0,
    received_qty: 0,
    issued_qty: 0,
    consumed_qty: 0,
    ...extra,
});
const customers: Customer[] = [
    { id: "cust-das", name: "Mr. Das", phone: "+91 9876501933", whatsapp: "+91 9876501933", alternate_phone: "+91 9876501934", email: "mr.das@example.demo", customer_segments: ["service_customer"], status: "active", interest_category_ids: ["fc", "pw", "fc2"], source_partner_name: "Walk-in", notes: "Customer identity only. Apartment and office details live on separate Sites.", created_at: at(-28), updated_at: now() },
    { id: "cust-aarav", name: "Aarav Mehta", phone: "+91 9876520110", whatsapp: "+91 9876520110", email: "aarav.mehta@example.demo", customer_segments: ["service_customer"], status: "active", interest_category_ids: ["fc2", "fc"], created_at: at(-20), updated_at: now() },
    { id: "cust-nisha", name: "Nisha Rao", phone: "+91 9876592010", whatsapp: "+91 9876592010", email: "nisha.rao@example.demo", customer_segments: ["service_customer"], status: "active", interest_category_ids: ["fc2", "pw"], created_at: at(-14), updated_at: now() },
];
const sites: Site[] = [
    { id: "site-das-apartment", customer_id: "cust-das", name: "Das Residence — 3BHK Apartment", building_name: "Legio Apartment, Tower B", site_type: "apartment", stage: "execution", address: "Legio Apartment, Taramandal, Gorakhpur", city: "Gorakhpur", locality: "Taramandal", latitude: 26.7398, longitude: 83.3712, notes: "Residence project. Bedroom ceiling and painting package is active.", created_at: at(-24), updated_at: now() },
    { id: "site-das-office", customer_id: "cust-das", name: "Das Office — Commercial Workspace", building_name: "Das Business Centre", site_type: "office", stage: "planning", address: "Civil Lines, Gorakhpur", city: "Gorakhpur", locality: "Civil Lines", latitude: 26.7606, longitude: 83.3732, notes: "Separate commercial site. No apartment dimensions or quotations can be used here.", created_at: at(-18), updated_at: now() },
    { id: "site-aarav-home", customer_id: "cust-aarav", name: "Mehta Residence — Apartment", building_name: "Mehta Residence", site_type: "apartment", stage: "quoted", address: "Indiranagar, Bengaluru", city: "Bengaluru", locality: "Indiranagar", latitude: 12.9784, longitude: 77.6408, notes: "Modular kitchen and living room media wall.", created_at: at(-12), updated_at: now() },
    { id: "site-nisha-home", customer_id: "cust-nisha", name: "Rao Residence — Apartment", building_name: "Rao Residence", site_type: "apartment", stage: "enquiry", address: "Whitefield, Bengaluru", city: "Bengaluru", locality: "Whitefield", latitude: 12.9698, longitude: 77.7499, notes: "Wardrobe and TV unit enquiry.", created_at: at(-7), updated_at: now() },
];
const areas: Area[] = [
    { id: "area-das-master", site_id: "site-das-apartment", name: "Master Bedroom", area_type: "bedroom", stage: "active", length: 12, width: 11, height: 9, unit: "ft", floor_area: 132, perimeter: 46, notes: "Gypsum ceiling, painting, wardrobe and TV unit.", created_at: at(-23), updated_at: now() },
    { id: "area-das-guest", site_id: "site-das-apartment", name: "Guest Room", area_type: "guest_room", stage: "quoted", length: 11, width: 10, height: 9, unit: "ft", floor_area: 110, perimeter: 42, notes: "Painting option quoted room-wise.", created_at: at(-23), updated_at: now() },
    { id: "area-das-balcony", site_id: "site-das-apartment", name: "Balcony", area_type: "balcony", stage: "measured", length: 10, width: 4, height: 9, unit: "ft", floor_area: 40, perimeter: 28, notes: "Exterior/weatherproof paint option pending.", created_at: at(-23), updated_at: now() },
    { id: "area-das-reception", site_id: "site-das-office", name: "Reception", area_type: "reception", stage: "measured", length: 18, width: 14, height: 10, unit: "ft", floor_area: 252, perimeter: 64, notes: "Commercial ceiling, paint and reception counter scope.", created_at: at(-17), updated_at: now() },
    { id: "area-das-cabin", site_id: "site-das-office", name: "Director Cabin", area_type: "office_cabin", stage: "unmeasured", notes: "Measurements pending site visit.", created_at: at(-17), updated_at: now() },
    { id: "area-aarav-kitchen", site_id: "site-aarav-home", name: "Kitchen", area_type: "kitchen", stage: "quoted", length: 12, width: 9, height: 9, unit: "ft", floor_area: 108, perimeter: 42, notes: "Modular kitchen measurement is approved for quotation.", created_at: at(-11), updated_at: now() },
    { id: "area-nisha-bedroom", site_id: "site-nisha-home", name: "Bedroom", area_type: "bedroom", stage: "unmeasured", notes: "First site visit is not yet scheduled.", created_at: at(-6), updated_at: now() },
];
const measurementRevisions: MeasurementRevision[] = [
    { id: "measure-das-master-v1", site_id: "site-das-apartment", area_id: "area-das-master", work_required_id: "work-das-ceiling", revision_no: 1, length: 12, width: 11, height: 9, unit: "ft", calculated_area: 132, calculated_perimeter: 46, notes: "Verified ceiling take-off.", captured_by: "Ravi Kumar", captured_at: at(-15), photo_count: 4, status: "verified" },
    { id: "measure-das-guest-v1", site_id: "site-das-apartment", area_id: "area-das-guest", work_required_id: "work-das-paint", revision_no: 1, length: 11, width: 10, height: 9, unit: "ft", calculated_area: 110, calculated_perimeter: 42, notes: "Verified paintable wall basis.", captured_by: "Ravi Kumar", captured_at: at(-14), photo_count: 3, status: "verified" },
    { id: "measure-office-reception-v1", site_id: "site-das-office", area_id: "area-das-reception", work_required_id: "work-das-office-ceiling", revision_no: 1, length: 18, width: 14, height: 10, unit: "ft", calculated_area: 252, calculated_perimeter: 64, notes: "Office measurement, not available to residence quotation selection.", captured_by: "Ravi Kumar", captured_at: at(-8), photo_count: 4, status: "verified" },
    { id: "measure-aarav-kitchen-v1", site_id: "site-aarav-home", area_id: "area-aarav-kitchen", work_required_id: "work-aarav-kitchen", revision_no: 1, length: 12, width: 9, height: 9, unit: "ft", calculated_area: 108, calculated_perimeter: 42, notes: "Kitchen wall and counter run measurement.", captured_by: "Ravi Kumar", captured_at: at(-10), photo_count: 5, status: "verified" },
];
const workRequired: WorkRequired[] = [
    { id: "work-das-ceiling", customer_id: "cust-das", site_id: "site-das-apartment", area_ids: ["area-das-master"], title: "Gypsum False Ceiling", work_category_id: "fc", system_name: "Gypsum false ceiling", specification: "12.5 mm gypsum board, GI framework, suspension system and jointing finish.", description: "Master Bedroom ceiling execution package.", status: "in_progress", source: "Referral", priority: "high", budget: 54000, created_at: at(-21), updated_at: now() },
    { id: "work-das-paint", customer_id: "cust-das", site_id: "site-das-apartment", area_ids: ["area-das-master", "area-das-guest"], title: "Interior Painting", work_category_id: "pw", system_name: "Premium interior emulsion", specification: "Putty correction, primer and two finish coats.", description: "Can be quoted room-wise or as an apartment package without creating duplicate work required records.", status: "contractor_bidding", source: "Referral", priority: "high", budget: 42000, created_at: at(-20), updated_at: now() },
    { id: "work-das-wardrobe", customer_id: "cust-das", site_id: "site-das-apartment", area_ids: ["area-das-master"], title: "Wardrobe and TV Unit", work_category_id: "fc2", system_name: "BWP plywood wardrobe", specification: "BWP carcass, laminate shutters, soft-close hardware.", description: "Awaiting final design selection.", status: "quotation_in_progress", source: "Referral", priority: "medium", budget: 125000, created_at: at(-19), updated_at: now() },
    { id: "work-das-office-ceiling", customer_id: "cust-das", site_id: "site-das-office", area_ids: ["area-das-reception"], title: "Grid False Ceiling", work_category_id: "fc", system_name: "Grid false ceiling", specification: "600×600 acoustic tiles with GI T-grid.", description: "Office-only scope.", status: "measurement_done", source: "Direct", priority: "high", budget: 86000, created_at: at(-9), updated_at: now() },
    { id: "work-das-office-paint", customer_id: "cust-das", site_id: "site-das-office", area_ids: ["area-das-reception"], title: "Office Interior Painting", work_category_id: "pw", system_name: "Commercial emulsion", specification: "Surface preparation, primer and finish coats.", description: "Office-only paint scope.", status: "new", source: "Direct", priority: "medium", budget: 32000, created_at: at(-8), updated_at: now() },
    { id: "work-aarav-kitchen", customer_id: "cust-aarav", site_id: "site-aarav-home", area_ids: ["area-aarav-kitchen"], title: "Modular Kitchen", work_category_id: "fc2", system_name: "Modular kitchen", specification: "BWP carcass, acrylic shutters, soft-close hardware.", description: "Customer quotation is sent.", status: "quotation_sent", source: "Instagram", priority: "high", budget: 180000, created_at: at(-12), updated_at: now() },
    { id: "work-nisha-wardrobe", customer_id: "cust-nisha", site_id: "site-nisha-home", area_ids: ["area-nisha-bedroom"], title: "Wardrobe and TV Unit", work_category_id: "fc2", system_name: "Bedroom furniture", specification: "To be specified after site measurement.", description: "New enquiry.", status: "new", source: "Walk-in", priority: "medium", budget: 145000, created_at: at(-6), updated_at: now() },
];
const ceilingQuoteLines = [
    line("qline-ceiling-board", "Gypsum board 12.5 mm supply and installation", 132, 95, { site_id: "site-das-apartment", area_id: "area-das-master", work_required_id: "work-das-ceiling" }),
    line("qline-ceiling-framework", "GI framework and suspension system", 132, 58, { site_id: "site-das-apartment", area_id: "area-das-master", work_required_id: "work-das-ceiling" }),
    line("qline-ceiling-finish", "Jointing, sanding and finish", 132, 27, { site_id: "site-das-apartment", area_id: "area-das-master", work_required_id: "work-das-ceiling" }),
];
const paintQuoteLines = [
    line("qline-paint-master", "Master Bedroom premium interior painting", 132, 62, { site_id: "site-das-apartment", area_id: "area-das-master", work_required_id: "work-das-paint" }),
    line("qline-paint-guest", "Guest Room premium interior painting", 110, 62, { site_id: "site-das-apartment", area_id: "area-das-guest", work_required_id: "work-das-paint" }),
];
const kitchenQuoteLines = [line("qline-kitchen", "BWP plywood modular kitchen package", 1, 180000, { site_id: "site-aarav-home", area_id: "area-aarav-kitchen", work_required_id: "work-aarav-kitchen", unit_id: "set", unit_name: "Set" })];
const total = (items: LineItem[]) => items.reduce((sum, item) => sum + item.amount, 0);
const tax = (items: LineItem[]) => Math.round(total(items) * 0.18);
const quotations: Quotation[] = [
    { id: "quote-das-ceiling", quotation_no: "Q-2026-201", customer_id: "cust-das", site_id: "site-das-apartment", title: "Das Apartment — Master Bedroom Gypsum Ceiling", status: "accepted", revision_no: 1, valid_until: date(10), subtotal: total(ceilingQuoteLines), tax_amount: tax(ceilingQuoteLines), total_amount: total(ceilingQuoteLines) + tax(ceilingQuoteLines), payment_terms: [{ id: "term-201-a", label: "Advance", percentage: 30, due_event: "on acceptance" }, { id: "term-201-b", label: "Progress", percentage: 40, due_event: "after material issue" }, { id: "term-201-c", label: "Completion", percentage: 30, due_event: "handover" }], commercial_terms: { gst_inclusive: false, warranty: "12 month labour warranty", delivery_days: 12 }, coverage: [{ id: "coverage-das-ceiling", work_required_id: "work-das-ceiling", area_ids: ["area-das-master"], measurement_revision_ids: ["measure-das-master-v1"], coverage_label: "Master Bedroom — Gypsum False Ceiling", status: "accepted" }], scope_lines: ceilingQuoteLines, items: [], work_order_ids: ["wo-das-ceiling"], created_at: at(-16), updated_at: now() },
    { id: "quote-das-paint", quotation_no: "Q-2026-202", customer_id: "cust-das", site_id: "site-das-apartment", title: "Das Apartment — Bedroom Painting Package", status: "accepted", revision_no: 0, valid_until: date(12), subtotal: total(paintQuoteLines), tax_amount: tax(paintQuoteLines), total_amount: total(paintQuoteLines) + tax(paintQuoteLines), payment_terms: [{ id: "term-202-a", label: "Advance", percentage: 30, due_event: "on acceptance" }, { id: "term-202-b", label: "Completion", percentage: 70, due_event: "handover" }], commercial_terms: { gst_inclusive: false, warranty: "6 month paint warranty", delivery_days: 7 }, coverage: [{ id: "coverage-das-paint", work_required_id: "work-das-paint", area_ids: ["area-das-master", "area-das-guest"], measurement_revision_ids: ["measure-das-master-v1", "measure-das-guest-v1"], coverage_label: "Master Bedroom + Guest Room — Interior Painting", status: "accepted" }], scope_lines: paintQuoteLines, items: [], work_order_ids: [], created_at: at(-13), updated_at: now() },
    { id: "quote-das-office", quotation_no: "Q-2026-203", customer_id: "cust-das", site_id: "site-das-office", title: "Das Office — Reception Grid Ceiling", status: "draft", revision_no: 0, valid_until: date(14), subtotal: 68000, tax_amount: 12240, total_amount: 80240, payment_terms: [{ id: "term-203-a", label: "Advance", percentage: 30, due_event: "on acceptance" }], coverage: [{ id: "coverage-das-office", work_required_id: "work-das-office-ceiling", area_ids: ["area-das-reception"], measurement_revision_ids: ["measure-office-reception-v1"], coverage_label: "Reception — Grid False Ceiling", status: "proposed" }], scope_lines: [line("qline-office-grid", "Reception grid ceiling", 252, 270, { site_id: "site-das-office", area_id: "area-das-reception", work_required_id: "work-das-office-ceiling" })], items: [], work_order_ids: [], created_at: at(-5), updated_at: now() },
    { id: "quote-aarav-kitchen", quotation_no: "Q-2026-204", customer_id: "cust-aarav", site_id: "site-aarav-home", title: "Mehta Residence — Modular Kitchen", status: "sent", revision_no: 0, valid_until: date(9), subtotal: total(kitchenQuoteLines), tax_amount: tax(kitchenQuoteLines), total_amount: total(kitchenQuoteLines) + tax(kitchenQuoteLines), payment_terms: [{ id: "term-204-a", label: "Advance", percentage: 30, due_event: "on acceptance" }, { id: "term-204-b", label: "Delivery", percentage: 50, due_event: "material delivery" }, { id: "term-204-c", label: "Completion", percentage: 20, due_event: "handover" }], coverage: [{ id: "coverage-aarav-kitchen", work_required_id: "work-aarav-kitchen", area_ids: ["area-aarav-kitchen"], measurement_revision_ids: ["measure-aarav-kitchen-v1"], coverage_label: "Kitchen — Modular Kitchen", status: "proposed" }], scope_lines: kitchenQuoteLines, items: [], work_order_ids: [], created_at: at(-9), updated_at: now() },
    { id: "quote-das-ceiling-v2", quotation_no: "Q-2026-201-R2", customer_id: "cust-das", site_id: "site-das-apartment", title: "Das Apartment — Master Bedroom Ceiling (Variation: LED Cove Added)", status: "accepted", revision_no: 2, revision_kind: "variation", revision_reason: "Customer requested LED cove lighting addition after work order started. Scope expanded to include LED strip + driver + cove framing.", revision_approved_by: "Akarsh Singh", superseded_by_quotation_id: undefined, valid_until: date(8), subtotal: total(ceilingQuoteLines) + 8500, tax_amount: tax(ceilingQuoteLines) + 1530, total_amount: total(ceilingQuoteLines) + tax(ceilingQuoteLines) + 10030, payment_terms: [{ id: "term-201r2-a", label: "Advance", percentage: 30, due_event: "on acceptance" }, { id: "term-201r2-b", label: "Progress", percentage: 40, due_event: "after material issue" }, { id: "term-201r2-c", label: "Completion", percentage: 30, due_event: "handover" }], commercial_terms: { gst_inclusive: false, warranty: "12 month labour warranty", delivery_days: 14 }, coverage: [{ id: "coverage-das-ceiling-v2", work_required_id: "work-das-ceiling", area_ids: ["area-das-master"], measurement_revision_ids: ["measure-das-master-v1"], coverage_label: "Master Bedroom — Gypsum Ceiling + LED Cove", status: "accepted" }], scope_lines: [...ceilingQuoteLines, line("qline-led-cove", "LED cove framing + strip + driver", 30, 283, { site_id: "site-das-apartment", area_id: "area-das-master", work_required_id: "work-das-ceiling" })], items: [], work_order_ids: ["wo-das-ceiling"], created_at: at(-3), updated_at: now() },
];
const acceptedScopes: AcceptedScope[] = [
    { id: "scope-das-ceiling", quotation_id: "quote-das-ceiling", customer_id: "cust-das", site_id: "site-das-apartment", work_required_id: "work-das-ceiling", area_ids: ["area-das-master"], measurement_revision_ids: ["measure-das-master-v1"], label: "Master Bedroom — Gypsum False Ceiling", accepted_value: quotations[0].total_amount, status: "in_work_order", work_order_id: "wo-das-ceiling", accepted_at: at(-12) },
    { id: "scope-das-paint", quotation_id: "quote-das-paint", customer_id: "cust-das", site_id: "site-das-apartment", work_required_id: "work-das-paint", area_ids: ["area-das-master", "area-das-guest"], measurement_revision_ids: ["measure-das-master-v1", "measure-das-guest-v1"], label: "Master Bedroom + Guest Room — Interior Painting", accepted_value: quotations[1].total_amount, status: "contractor_bidding", accepted_at: at(-7) },
];
const workOrders: WorkOrder[] = [
    { id: "wo-das-ceiling", work_order_no: "WO-2026-301", customer_id: "cust-das", accepted_scope_ids: ["scope-das-ceiling"], work_required_ids: ["work-das-ceiling"], quotation_ids: ["quote-das-ceiling"], site_id: "site-das-apartment", area_ids: ["area-das-master"], title: "Master Bedroom Gypsum Ceiling Execution", status: "in_progress", contractor_id: "con-gypsum", contractor_name: "Sharma Ceiling Works", with_material: false, start_date: date(-9), expected_end: date(3), value: quotations[0].total_amount, progress: 48, site_address: "Legio Apartment, Taramandal, Gorakhpur", created_at: at(-11), updated_at: now() },
];
const boqItems: LineItem[] = [
    line("boq-board", "Gypsum board 12.5 mm", 10, 780, { article_id: "article_1", work_required_id: "work-das-ceiling", site_id: "site-das-apartment", area_id: "area-das-master", source_kind: "boq" }),
    line("boq-channel", "GI main/perimeter channel", 132, 34, { article_id: "article_2", work_required_id: "work-das-ceiling", site_id: "site-das-apartment", area_id: "area-das-master", source_kind: "boq" }),
    line("boq-thread", "Suspension thread and fasteners", 132, 11, { article_id: "article_3", work_required_id: "work-das-ceiling", site_id: "site-das-apartment", area_id: "area-das-master", source_kind: "boq" }),
    line("boq-finish", "Jointing compound and tape", 6, 470, { article_id: "article_4", work_required_id: "work-das-ceiling", site_id: "site-das-apartment", area_id: "area-das-master", source_kind: "boq" }),
];
const boqs: WorkOrderBOQ[] = [{ id: "boq-das-ceiling", work_order_id: "wo-das-ceiling", accepted_scope_ids: ["scope-das-ceiling"], work_order_no: "WO-2026-301", site_id: "site-das-apartment", title: "Gypsum Ceiling — Article BOQ", status: "approved", items: boqItems, total_amount: total(boqItems), approved_at: at(-8), approved_by: "Owner", created_at: at(-8), updated_at: now() }];
const contractorBids: ContractorBid[] = [
    { id: "bid-paint-1", bid_no: "CB-2026-401", accepted_scope_id: "scope-das-paint", site_id: "site-das-apartment", work_order_no: "Pending award", contractor_id: "con-paint", contractor_name: "Verma Paint Team", scope: "Bedroom painting package", quote_amount: 16000, estimated_days: 4, with_material: false, reliability_score: 88, on_time_pct: 91, past_jobs_count: 26, rating: 4.6, status: "submitted", submitted_at: at(-4), created_at: at(-4), updated_at: now() },
    { id: "bid-paint-2", bid_no: "CB-2026-402", accepted_scope_id: "scope-das-paint", site_id: "site-das-apartment", work_order_no: "Pending award", contractor_id: "con-paint-2", contractor_name: "Khan Finishes", scope: "Bedroom painting package", quote_amount: 14800, estimated_days: 5, with_material: false, reliability_score: 82, on_time_pct: 87, past_jobs_count: 18, rating: 4.3, status: "submitted", submitted_at: at(-3), created_at: at(-3), updated_at: now() },
];
const vendorRfqs: VendorRFQ[] = [{ id: "rfq-das-ceiling", rfq_no: "RFQ-2026-501", site_id: "site-das-apartment", work_order_id: "wo-das-ceiling", boq_id: "boq-das-ceiling", item_ids: boqItems.map((item) => item.id), vendor_ids: ["ven-build", "ven-ceiling"], status: "responses_received", created_at: at(-7), updated_at: now() }];
const buildVendorBidLines = (rates: number[]) => boqItems.map((item, index) => ({
    boq_item_id: item.id,
    article_id: item.article_id,
    title: item.title,
    quantity: item.quantity,
    unit_id: item.unit_id,
    unit_name: item.unit_name,
    rate: rates[index],
    amount: Math.round(item.quantity * rates[index] * 100) / 100,  // STAGE-5-FIX: 2dp (was integer rounding)
    tax_rate: 18,
}));
const vendorBids: VendorBid[] = [
    { id: "vbid-1", rfq_id: "rfq-das-ceiling", vendor_id: "ven-build", vendor_name: "Build Mart", lines: buildVendorBidLines([760, 35, 12, 500]), quoted_amount: 16604, delivery_days: 2, status: "selected", created_at: at(-6), updated_at: now() },
    { id: "vbid-2", rfq_id: "rfq-das-ceiling", vendor_id: "ven-ceiling", vendor_name: "Ceiling Hub", lines: buildVendorBidLines([790, 36, 12, 505]), quoted_amount: 17067, delivery_days: 1, status: "shortlisted", created_at: at(-6), updated_at: now() },
];
const selectedBidItems: LineItem[] = boqItems.map((item, index) => {
    const bidLine = vendorBids[0].lines[index];
    return { ...item, rate: bidLine.rate, rate_basis: "vendor_bid" as const, amount: bidLine.amount, ordered_qty: item.quantity, received_qty: item.id === "boq-board" ? 8 : item.quantity, source_kind: "po" };
});
const purchaseOrders: PurchaseOrder[] = [
  { id: "po-das-ceiling", po_no: "PO-2026-601", rfq_id: "rfq-das-ceiling", work_order_id: "wo-das-ceiling", work_order_no: "WO-2026-301", site_id: "site-das-apartment", vendor_id: "ven-build", vendor_name: "Build Mart", status: "partially_received", items: selectedBidItems, subtotal: total(selectedBidItems), tax_amount: tax(selectedBidItems), total_amount: total(selectedBidItems) + tax(selectedBidItems), expected_delivery: date(-1), grn_ids: ["grn-das-ceiling"], bill_ids: ["vb-das-ceiling"], award_basis: "competitive", created_at: at(-5), updated_at: now() },
  { id: "po-das-paint-direct", po_no: "PO-2026-602", work_order_id: "wo-das-ceiling", work_order_no: "WO-2026-301", site_id: "site-das-apartment", vendor_id: "ven-build", vendor_name: "Build Mart", status: "sent", direct_award: true, award_basis: "direct", award_reason: "Trusted vendor with existing rate agreement for premium paint brands; urgent site requirement.", award_approved_by: "Akarsh Singh", items: [{ id: "po-paint-item-1", article_id: "art-paint-premium", title: "Asian Paints Royale (Premium Emulsion)", quantity: 8, unit_id: "unit-ltr", unit_name: "Ltr", rate: 520, amount: 4160, source_kind: "po", source_item_id: "po-paint-item-1" }, { id: "po-paint-item-2", article_id: "art-primer", title: "Asian Paints Primer", quantity: 4, unit_id: "unit-ltr", unit_name: "Ltr", rate: 280, amount: 1120, source_kind: "po", source_item_id: "po-paint-item-2" }], subtotal: 5280, tax_amount: 950.4, total_amount: 6230.4, expected_delivery: date(1), grn_ids: [], bill_ids: [], created_at: at(-2), updated_at: now() }
];
const grns: GRN[] = [{ id: "grn-das-ceiling", grn_no: "GRN-2026-701", po_id: "po-das-ceiling", po_no: "PO-2026-601", vendor_id: "ven-build", vendor_name: "Build Mart", site_id: "site-das-apartment", work_order_id: "wo-das-ceiling", work_order_no: "WO-2026-301", status: "matched", bill_id: "vb-das-ceiling", items: purchaseOrders[0].items.map((item) => ({ ...item, received_qty: item.id === "boq-board" ? 8 : item.quantity, quantity: item.id === "boq-board" ? 8 : item.quantity, amount: (item.id === "boq-board" ? 8 : item.quantity) * item.rate, source_kind: "grn", source_item_id: item.id })), received_at: at(-1), received_by: "Ravi Kumar", created_at: at(-1), updated_at: now() }];
const inventory: InventoryItem[] = grns[0].items.map((item) => ({ id: `inv-${item.id}`, article_id: item.article_id, name: item.title, unit_id: item.unit_id, unit_name: item.unit_name, quantity: item.received_qty || 0, received_qty: item.received_qty || 0, issued_qty: 0, reserved_qty: 0, rate: item.rate, work_order_id: "wo-das-ceiling", work_order_no: "WO-2026-301", grn_id: "grn-das-ceiling", location: "Main store", created_at: now(), updated_at: now() }));
const vendorBillAmount = total(grns[0].items);
const vendorBillTotal = vendorBillAmount + tax(grns[0].items);
const vendorBills: VendorBill[] = [{ id: "vb-das-ceiling", bill_no: "VB-2026-801", vendor_id: "ven-build", vendor_name: "Build Mart", site_id: "site-das-apartment", work_order_id: "wo-das-ceiling", po_id: "po-das-ceiling", po_no: "PO-2026-601", grn_id: "grn-das-ceiling", grn_no: "GRN-2026-701", amount: vendorBillAmount, tax_amount: tax(grns[0].items), total_amount: vendorBillTotal, paid_amount: 0, balance_amount: vendorBillTotal, status: "draft", due_date: date(7), matched: false, vendor_invoice_no: "BM-INV-771", vendor_invoice_date: date(-1), invoice_lines: grns[0].items.map((item) => ({ po_item_id: item.source_item_id, article_id: item.article_id, title: item.title, quantity: item.quantity, rate: item.rate, amount: item.amount })), created_at: at(-1), updated_at: now() }];
const vendorPayments: VendorPayment[] = [];
const contractorBills: ContractorBill[] = [{ id: "cbill-das-ceiling", bill_no: "CTB-2026-901", ra_no: "RA-01", description: "Master bedroom gypsum ceiling verified progress", customer_id: "cust-das", site_id: "site-das-apartment", work_order_id: "wo-das-ceiling", work_required_id: "work-das-ceiling", area_ids: ["area-das-master"], contractor_id: "con-gypsum", contractor_name: "Sharma Ceiling Works", amount: 14500, paid_amount: 0, balance_amount: 14500, status: "verified", progress_pct: 48, due_date: date(4), verified_at: at(-1), verified_by: "Anita Rao", created_at: at(-1), updated_at: now() }];
const contractorPayments: ContractorPayment[] = [];
const advanceAmount = Math.round(quotations[0].total_amount * 0.3);
const advanceReceived = Math.min(12000, advanceAmount);
const payments: Payment[] = [{ id: "pay-das-ceiling-advance", finance_context: "service", customer_id: "cust-das", quotation_id: "quote-das-ceiling", work_order_id: "wo-das-ceiling", site_id: "site-das-apartment", amount: advanceAmount, received_amount: advanceReceived, invoice_id: "inv-das-ceiling-advance", status: advanceReceived === advanceAmount ? "received" : "partial", mode: "upi", due_date: date(-12), received_date: date(-11), milestone_label: "Advance 30%", is_advance: true, created_at: at(-12), updated_at: now() }];
const invoices: CustomerInvoice[] = [{ id: "inv-das-ceiling-advance", invoice_no: "INV-2026-101", finance_context: "service", customer_id: "cust-das", site_id: "site-das-apartment", quotation_id: "quote-das-ceiling", work_order_id: "wo-das-ceiling", payment_id: "pay-das-ceiling-advance", title: "Gypsum ceiling advance", status: advanceReceived === advanceAmount ? "paid" : "partial", subtotal: advanceAmount, tax_amount: 0, total_amount: advanceAmount, paid_amount: advanceReceived, balance_amount: advanceAmount - advanceReceived, issued_at: date(-12), due_date: date(-12), created_at: at(-12), updated_at: now() }];
const customerReceipts: CustomerReceipt[] = [
    { id: "receipt-das-ceiling-advance", receipt_no: "CR-2026-101", finance_context: "service", customer_id: "cust-das", site_id: "site-das-apartment", work_required_id: "work-das-ceiling", quotation_id: "quote-das-ceiling", work_order_id: "wo-das-ceiling", invoice_id: "inv-das-ceiling-advance", payment_id: "pay-das-ceiling-advance", amount: advanceReceived, mode: "upi", reference: "UPI-DAS-ADV-101", received_at: date(-11), created_by: "Meera Nair", created_at: at(-11), updated_at: now() },
    // Recent milestone receipts (within the 7-day sparkline window) so the
    // health-widget revenue trend visualizes real data instead of a flat line.
    { id: "receipt-das-ceiling-milestone-1", receipt_no: "CR-2026-102", finance_context: "service", customer_id: "cust-das", site_id: "site-das-apartment", work_required_id: "work-das-ceiling", quotation_id: "quote-das-ceiling", work_order_id: "wo-das-ceiling", invoice_id: "inv-das-ceiling-advance", amount: 18000, mode: "rtgs", reference: "RTGS-DAS-MS1-102", received_at: date(-3), created_by: "Meera Nair", created_at: at(-3), updated_at: now() },
    { id: "receipt-aarav-kitchen-advance", receipt_no: "CR-2026-103", finance_context: "service", customer_id: "cust-aarav", site_id: "site-aarav-home", work_required_id: "work-aarav-kitchen", quotation_id: "quote-aarav-kitchen", invoice_id: "inv-aarav-kitchen-advance", amount: 25000, mode: "upi", reference: "UPI-AARAV-ADV-103", received_at: date(0), created_by: "Pooja Singh", created_at: at(0), updated_at: now() },
];
const workOrderCostLines: WorkOrderCostLine[] = [
    // FIX-CONTRACTOR-BATCH1 / F.3: Standardize on `vendor_id` / `vendor_name`
    // as the canonical counterparty field for cost lines (matches runtime
    // code in contractors.ts:756-757 + 573-574 and the ContractorDetailModule
    // filter `cl.vendor_id === c.id`). Previously the seed wrote
    // `contractor_id` / `contractor_name` here, so the contractor cost line
    // was invisible in ContractorDetailModule's "Recent payments" list and
    // the totalEarned aggregate was understated. We mirror to contractor_id
    // too for backward compatibility with any consumer that still reads it.
    { id: "cost-das-contractor-accrual", work_order_id: "wo-das-ceiling", type: "contractor", description: "Sharma Ceiling Works — verified RA bill (50% progress)", amount: 14500, date: at(-1), source_kind: "bill", source_id: "cbill-das-ceiling", vendor_id: "con-gypsum", vendor_name: "Sharma Ceiling Works", contractor_id: "con-gypsum", contractor_name: "Sharma Ceiling Works", created_at: at(-1) },
    { id: "cost-das-material-po", work_order_id: "wo-das-ceiling", type: "material", description: "Build Mart — Gypsum board + channels (PO-2026-601)", amount: purchaseOrders[0].total_amount, date: at(-4), source_kind: "po", source_id: "po-das-ceiling", vendor_id: "ven-build", vendor_name: "Build Mart", created_at: at(-4) },
    { id: "cost-das-material-direct", work_order_id: "wo-das-ceiling", type: "material", description: "Build Mart — Paint + primer (PO-2026-602 direct award)", amount: purchaseOrders[1].total_amount, date: at(-2), source_kind: "po", source_id: "po-das-paint-direct", vendor_id: "ven-build", vendor_name: "Build Mart", created_at: at(-2) },
    { id: "cost-das-labour-advance", work_order_id: "wo-das-ceiling", type: "labour", description: "Labour advance — carpenter helper (3 days)", amount: 2400, date: at(-3), source_kind: "manual", created_at: at(-3) },
];
const catalog = buildWorkCategoryCatalog();
/**
 * J: Seed data for the previously-empty collections so the operations,
 * execution, finance, and HR modules have realistic content on a fresh
 * workspace. Every record references an existing customer / site / work
 * order / vendor / contractor / staff so the cross-module deep-links
 * resolve correctly. NEVER modify the existing seed rows above — these
 * arrays are purely additive.
 */
const seedSourcePartners: SourcePartner[] = [
    { id: "sp-referral-das", name: "Anand Interiors (referral)", type: "interior_designer", phone: "+91 9000004001", commission_pct: 5 },
    { id: "sp-instagram", name: "Instagram Lead Source", type: "marketing", commission_pct: 2 },
];
const seedDrawings: Drawing[] = [
    { id: "drawing-das-ceiling-v1", drawing_no: "DRW-2026-001", title: "Master Bedroom Ceiling Layout", kind: "2D", site_id: "site-das-apartment", site_name: "Das Residence — 3BHK Apartment", area_id: "area-das-master", area_name: "Master Bedroom", work_order_id: "wo-das-ceiling", work_order_no: "WO-2026-301", version: 1, status: "approved", uploaded_by: "Anita Rao", uploaded_at: at(-9), approved_by: "Akarsh Singh", approved_at: at(-8), notes: "Initial 2D ceiling layout showing grid + cove placement.", primary_file_attachment_id: "file-po-das-ceiling", created_at: at(-9), updated_at: now() },
    { id: "drawing-das-ceiling-v2", drawing_no: "DRW-2026-001-R2", title: "Master Bedroom Ceiling — LED Cove Revision", kind: "2D", site_id: "site-das-apartment", site_name: "Das Residence — 3BHK Apartment", area_id: "area-das-master", area_name: "Master Bedroom", work_order_id: "wo-das-ceiling", work_order_no: "WO-2026-301", version: 2, parent_drawing_id: "drawing-das-ceiling-v1", status: "in_review", uploaded_by: "Anita Rao", uploaded_at: at(-2), notes: "Customer-requested LED cove addition; awaiting final approval.", created_at: at(-2), updated_at: now() },
    { id: "drawing-das-ceiling-3d", drawing_no: "DRW-2026-002", title: "Master Bedroom Ceiling 3D Render", kind: "3D", site_id: "site-das-apartment", site_name: "Das Residence — 3BHK Apartment", area_id: "area-das-master", area_name: "Master Bedroom", work_order_id: "wo-das-ceiling", work_order_no: "WO-2026-301", version: 1, status: "approved", uploaded_by: "Pooja Singh", uploaded_at: at(-7), approved_by: "Akarsh Singh", approved_at: at(-6), notes: "3D render for customer confirmation.", created_at: at(-7), updated_at: now() },
];
const seedExecutionLogs: DailyExecutionLog[] = [
    { id: "elog-das-ceiling-d1", log_no: "LOG-2026-001", work_order_id: "wo-das-ceiling", work_order_no: "WO-2026-301", site_id: "site-das-apartment", site_name: "Das Residence — 3BHK Apartment", date: date(-5), progress_pct: 12, progress_delta: 12, materials_used: [{ description: "GI framework perimeter channel", article_id: "article_2", qty: 46, unit: "sft", amount: 1564 }], extra_work_notes: "Site preparation, marked layout, fixed perimeter channels.", site_condition: "Good", photo_attachment_ids: [], filed_by: "Ravi Kumar", filed_by_staff_id: "staff-field", created_at: at(-5), updated_at: at(-5) },
    { id: "elog-das-ceiling-d2", log_no: "LOG-2026-002", work_order_id: "wo-das-ceiling", work_order_no: "WO-2026-301", site_id: "site-das-apartment", site_name: "Das Residence — 3BHK Apartment", date: date(-3), progress_pct: 32, progress_delta: 20, materials_used: [{ description: "Gypsum board 12.5mm", article_id: "article_1", qty: 8, unit: "sft", amount: 6240 }, { description: "Suspension thread + fasteners", article_id: "article_3", qty: 60, unit: "sft", amount: 660 }], extra_work_notes: "Board fixing started on master bedroom ceiling.", site_condition: "Good", photo_attachment_ids: [], filed_by: "Ravi Kumar", filed_by_staff_id: "staff-field", created_at: at(-3), updated_at: at(-3) },
    { id: "elog-das-ceiling-d3", log_no: "LOG-2026-003", work_order_id: "wo-das-ceiling", work_order_no: "WO-2026-301", site_id: "site-das-apartment", site_name: "Das Residence — 3BHK Apartment", date: date(0), progress_pct: 48, progress_delta: 16, materials_used: [{ description: "Jointing compound + tape", article_id: "article_4", qty: 4, unit: "sft", amount: 1880 }], extra_work_notes: "Jointing + sanding in progress; LED cove framing started.", site_condition: "Customer visited site; happy with progress.", photo_attachment_ids: [], filed_by: "Ravi Kumar", filed_by_staff_id: "staff-field", created_at: at(0), updated_at: at(0) },
];
const seedDispatches: SiteDispatch[] = [
    { id: "disp-das-ceiling-1", dispatch_no: "DSP-2026-001", work_order_id: "wo-das-ceiling", customer_name: "Mr. Das", work_order_no: "WO-2026-301", site_id: "site-das-apartment", site_address: "Legio Apartment, Taramandal, Gorakhpur", status: "acknowledged", items: [line("disp-line-board", "Gypsum board 12.5mm", 8, 780, { article_id: "article_1", work_required_id: "work-das-ceiling", site_id: "site-das-apartment", area_id: "area-das-master", source_kind: "grn", source_item_id: "boq-board" })], issued_at: at(-4), issued_by: "Vikas Tiwari", acknowledged_at: at(-3), created_at: at(-4), updated_at: now() },
    { id: "disp-das-ceiling-2", dispatch_no: "DSP-2026-002", work_order_id: "wo-das-ceiling", customer_name: "Mr. Das", work_order_no: "WO-2026-301", site_id: "site-das-apartment", site_address: "Legio Apartment, Taramandal, Gorakhpur", status: "issued", items: [line("disp-line-channel", "GI main/perimeter channel", 60, 34, { article_id: "article_2", work_required_id: "work-das-ceiling", site_id: "site-das-apartment", area_id: "area-das-master", source_kind: "grn", source_item_id: "boq-channel" })], issued_at: at(-2), issued_by: "Vikas Tiwari", created_at: at(-2), updated_at: now() },
];
const seedRisks: RiskItem[] = [
    { id: "risk-das-payment-delay", title: "Das ceiling — payment delay risk", type: "cash", severity: "high", customer_id: "cust-das", customer_name: "Mr. Das", amount: 12000, reason: "Advance receipt is partial (₹12,000 of ₹16,434). Next milestone due on material issue — flag if not received before drywall starts.", created_at: at(-2) },
    { id: "risk-aarav-quotation-expiry", title: "Aarav kitchen quotation expiring soon", type: "collection", severity: "medium", customer_id: "cust-aarav", customer_name: "Aarav Mehta", amount: 212400, reason: "Quotation Q-2026-204 valid until " + date(9) + " (9 days). No customer response since sent.", created_at: at(-1) },
    { id: "risk-build-mart-supply", title: "Build Mart supply reliability", type: "vendor", severity: "low", customer_id: "cust-das", customer_name: "Mr. Das", reason: "Gypsum board short-delivered on PO-2026-601 (8 of 10). Vendor rate locked but supply tracking required for next order.", created_at: at(-1) },
];
const seedBlocked: BlockedItem[] = [
    { id: "blocked-das-cove-design", title: "LED cove design pending customer approval", reason: "Customer requested LED cove addition but hasn't approved the revised drawing DRW-2026-001-R2. Ceiling work in master bedroom is partially blocked.", customer_id: "cust-das", customer_name: "Mr. Das", linked_work_order_id: "wo-das-ceiling", linked_task_id: "task-field-progress-photo", resolved: false, created_at: at(-1) },
    { id: "blocked-paint-bid-award", title: "Painting contractor bid award pending", reason: "Two contractor bids received (Verma Paint Team ₹16,000 / Khan Finishes ₹14,800). Award decision pending Operations Manager review.", customer_id: "cust-das", customer_name: "Mr. Das", resolved: false, created_at: at(-2) },
];
const seedApprovalActions: ApprovalAction[] = [
    { id: "action-po-paint-direct", title: "Direct award PO-2026-602 (paint + primer)", type: "po_amount", status: "approved", customer_id: "cust-das", customer_name: "Mr. Das", amount: 6230.4, requested_by: "Vikas Tiwari", due_date: date(-1), linked_record_id: "po-das-paint-direct", linked_record_type: "po", created_at: at(-2) },
    { id: "action-vendor-bill-ceiling", title: "Vendor bill VB-2026-801 (Build Mart)", type: "vendor_bill", status: "pending", customer_id: "cust-das", customer_name: "Mr. Das", amount: vendorBillTotal, requested_by: "Vikas Tiwari", due_date: date(7), linked_record_id: "po-das-ceiling", linked_record_type: "po", created_at: at(-1) },
    { id: "action-contractor-payment-ceiling", title: "Contractor payment — Sharma Ceiling Works (progress)", type: "contractor_payment", status: "pending", customer_id: "cust-das", customer_name: "Mr. Das", amount: 4500, requested_by: "Anita Rao", due_date: date(4), linked_record_id: "cpay-das-ceiling-progress", linked_record_type: "contractor_payment", created_at: at(0) },
];
const seedFollowups: Followup[] = [
    { id: "fu-das-advance-balance", customer_id: "cust-das", quotation_id: "quote-das-ceiling", payment_id: "pay-das-ceiling-advance", title: "Chase advance balance payment", notes: "₹4,434 advance balance pending. Customer promised to pay this week.", status: "scheduled", priority: "high", due_at: at(1), due_date: date(1), assigned_to: "Meera Nair", assigned_role: "Finance", followup_type: "payment", promise_date: date(1), notes_history: [], created_at: at(-1), updated_at: now() },
    { id: "fu-das-cove-approval", customer_id: "cust-das", quotation_id: "quote-das-ceiling-v2", title: "Get LED cove revision approved", notes: "Customer requested LED cove addition; revised quotation Q-2026-201-R2 sent. Need explicit approval before cove framing continues.", status: "pending", priority: "urgent", due_at: at(0), due_date: date(0), assigned_to: "Pooja Singh", assigned_role: "Sales / Telecaller", followup_type: "quotation", notes_history: [], created_at: at(-1), updated_at: now() },
    { id: "fu-aarav-kitchen-followup", customer_id: "cust-aarav", quotation_id: "quote-aarav-kitchen", title: "Aarav kitchen quotation follow-up", notes: "Quotation Q-2026-204 sent 9 days ago. Customer visited Mehta Residence for kitchen discussion today. Follow up to convert.", status: "pending", priority: "high", due_at: at(0), due_date: date(0), assigned_to: "Pooja Singh", assigned_role: "Sales / Telecaller", followup_type: "quotation", notes_history: [], created_at: at(-2), updated_at: now() },
    { id: "fu-nisha-wardrobe-visit", customer_id: "cust-nisha", title: "Schedule Nisha wardrobe site visit", notes: "Customer walk-in for wardrobe + TV unit. Need to schedule first site visit for measurement.", status: "pending", priority: "medium", due_at: at(2), due_date: date(2), assigned_to: "Pooja Singh", assigned_role: "Sales / Telecaller", followup_type: "general", notes_history: [], created_at: at(-3), updated_at: now() },
    { id: "fu-das-paint-bid-award", customer_id: "cust-das", quotation_id: "quote-das-paint", title: "Award painting contractor bid", notes: "Two bids received. Khan Finishes is cheaper (₹14,800) but Verma Paint Team has better reliability (88 vs 82). Operations Manager to decide.", status: "scheduled", priority: "medium", due_at: at(1), due_date: date(1), assigned_to: "Anita Rao", assigned_role: "Operations Manager", followup_type: "general", notes_history: [], created_at: at(-2), updated_at: now() },
];
const seedVendorPayments: VendorPayment[] = [
    { id: "vpay-das-ceiling-partial", payment_no: "VP-2026-001", vendor_bill_id: "vb-das-ceiling", vendor_id: "ven-build", vendor_name: "Build Mart", site_id: "site-das-apartment", work_order_id: "wo-das-ceiling", amount: Math.round(vendorBillTotal * 0.5), mode: "bank_transfer", reference: "UTR-BUILD-50PCT", status: "paid", paid_at: at(-1), created_by: "Meera Nair", approved_by: "Akarsh Singh", created_at: at(-1), updated_at: now() },
];
const seedContractorPayments: ContractorPayment[] = [
    { id: "cpay-das-ceiling-advance", payment_no: "CP-2026-001", contractor_bill_id: "cbill-das-ceiling", work_order_id: "wo-das-ceiling", site_id: "site-das-apartment", contractor_id: "con-gypsum", contractor_name: "Sharma Ceiling Works", amount: 5000, mode: "upi", reference: "UPI-ADV-SHARMA", status: "paid", paid_at: at(-4), approved_at: at(-4), approved_by: "Akarsh Singh", created_at: at(-4), updated_at: now() },
    { id: "cpay-das-ceiling-progress", payment_no: "CP-2026-002", contractor_bill_id: "cbill-das-ceiling", work_order_id: "wo-das-ceiling", site_id: "site-das-apartment", contractor_id: "con-gypsum", contractor_name: "Sharma Ceiling Works", amount: 4500, mode: "bank_transfer", reference: "NEFT-PROG-SHARMA", status: "pending", approved_at: at(-1), approved_by: "Anita Rao", created_at: at(-1), updated_at: now() },
];
const seedCommissions: Commission[] = [
    { id: "comm-das-ceiling-referral", commission_no: "COMM-2026-001", source_partner_id: "sp-referral-das", source_partner_name: "Anand Interiors (referral)", customer_id: "cust-das", customer_name: "Mr. Das", site_id: "site-das-apartment", work_order_id: "wo-das-ceiling", work_order_no: "WO-2026-301", quotation_id: "quote-das-ceiling", base_amount: quotations[0].total_amount, rate_pct: 5, amount: Math.round(quotations[0].total_amount * 0.05), status: "accrued", accrued_at: at(-9), notes: "Referral commission accrued on work order acceptance (5% of total contract value).", created_at: at(-9), updated_at: now() },
    { id: "comm-aarav-instagram", commission_no: "COMM-2026-002", source_partner_id: "sp-instagram", source_partner_name: "Instagram Lead Source", customer_id: "cust-aarav", customer_name: "Aarav Mehta", quotation_id: "quote-aarav-kitchen", base_amount: quotations[3].total_amount, rate_pct: 2, amount: Math.round(quotations[3].total_amount * 0.02), status: "accrued", accrued_at: at(-9), notes: "Marketing channel commission accrued on quotation sent (will pay on acceptance).", created_at: at(-9), updated_at: now() },
];
const seedPinterestBoards: PinterestBoard[] = [
    { id: "pb-gypsum-ceiling-ideas", title: "Gypsum Ceiling Ideas", board_url: "https://www.pinterest.com/urbancastle/gypsum-ceiling-ideas", thumbnail_url: "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=400", category_id: "fc", tags: ["gypsum", "ceiling", "modern"], sendable_to_customer: true, status: "active", sort_order: 1, created_at: at(-15), updated_at: now() },
    { id: "pb-modular-kitchen", title: "Modular Kitchen Inspiration", board_url: "https://www.pinterest.com/urbancastle/modular-kitchen", thumbnail_url: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400", category_id: "fc2", tags: ["kitchen", "modular", "plywood"], sendable_to_customer: true, status: "active", sort_order: 2, created_at: at(-12), updated_at: now() },
    { id: "pb-wardrobe-designs", title: "Wardrobe Design Options", board_url: "https://www.pinterest.com/urbancastle/wardrobe-designs", thumbnail_url: "https://images.unsplash.com/photo-1558997519-83ea9252edf8?w=400", category_id: "fc2", tags: ["wardrobe", "sliding", "plywood"], sendable_to_customer: true, status: "active", sort_order: 3, created_at: at(-10), updated_at: now() },
    { id: "pb-paint-colors", title: "Premium Paint Color Palette", board_url: "https://www.pinterest.com/urbancastle/paint-colors", thumbnail_url: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400", category_id: "pw", tags: ["paint", "interior", "colors"], sendable_to_customer: true, status: "active", sort_order: 4, created_at: at(-8), updated_at: now() },
];
const seedStorageAccounts: StorageAccount[] = [
    { id: "sa-google-drive-primary", label: "Urban Castle — Primary Google Drive", email: "drive@urbancastle.in", oauth_connection_id: "oauth-google-primary", status: "connected", write_enabled: true, priority_order: 1, quota_used_bytes: 4_820_000_000, quota_limit_bytes: 15_000_000_000, switch_threshold_percent: 85, root_folder_id: "root-folder-urbancastle", root_folder_name: "UrbanCastle Workspace", web_view_link: "https://drive.google.com/drive/folders/root-folder-urbancastle", notes: "Primary drive for customer documents, site proofs, quotations and POs. Auto-switch to backup at 85% capacity.", created_at: at(-90), updated_at: at(-1) },
    { id: "sa-google-drive-backup", label: "Urban Castle — Backup Drive", email: "backup@urbancastle.in", oauth_connection_id: "oauth-google-backup", status: "connected", write_enabled: false, priority_order: 2, quota_used_bytes: 1_200_000_000, quota_limit_bytes: 15_000_000_000, switch_threshold_percent: 90, root_folder_id: "root-folder-backup", root_folder_name: "UrbanCastle Backup", web_view_link: "https://drive.google.com/drive/folders/root-folder-backup", notes: "Backup drive — read-only replication. Auto-promoted to write-enabled when primary hits 85% capacity.", created_at: at(-60), updated_at: at(-7) },
];
const fileAssets = [
    { id: "file-catalogue-gypsum-board", file_name: "Gypsum Board Catalogue.pdf", mime_type: "application/pdf", kind: "catalogue" as const, web_view_link: "https://drive.google.com/file/d/file-catalogue-gypsum-board/view", storage_provider: "google_drive" as const, storage_mode: "external_reference" as const, sync_status: "uploaded" as const, tags: ["catalogue", "gypsum", "vendor"], status: "active" as const, created_at: at(-10), updated_at: now() },
    { id: "file-reference-ceiling-joint", file_name: "Gypsum Ceiling Joint Detail.jpg", mime_type: "image/jpeg", kind: "media" as const, web_view_link: "https://drive.google.com/file/d/file-reference-ceiling-joint/view", storage_provider: "google_drive" as const, storage_mode: "external_reference" as const, sync_status: "uploaded" as const, tags: ["reference", "ceiling", "jointing"], status: "active" as const, created_at: at(-9), updated_at: now() },
    { id: "file-po-das-ceiling", file_name: "PO-2026-601 vendor copy.pdf", mime_type: "application/pdf", kind: "document" as const, web_view_link: "https://drive.google.com/file/d/file-po-das-ceiling/view", storage_provider: "google_drive" as const, storage_mode: "external_reference" as const, sync_status: "uploaded" as const, tags: ["po", "vendor", "ceiling"], status: "active" as const, created_at: at(-5), updated_at: now() },
];
const catalogues = [
    { id: "cat-gypsum-board", title: "Gypsum Board Catalogue", drive_asset_id: "file-catalogue-gypsum-board", catalog_type: "product_catalog" as const, sendable_to_customer: true, tags: ["gypsum", "ceiling"], status: "active" as const, created_at: at(-10), updated_at: now() },
];
const referenceMedia = [
    { id: "ref-ceiling-joint", title: "Gypsum ceiling joint detail", drive_asset_id: "file-reference-ceiling-joint", category_id: "fc", tags: ["jointing", "finish"], sendable_to_customer: true, status: "active" as const, sort_order: 1, created_at: at(-9), updated_at: now() },
];
const catalogueArticleVendorLinks = [
    { id: "cat-link-gypsum-board", catalogue_id: "cat-gypsum-board", article_id: "article_1", vendor_id: "ven-build", notes: "Main vendor catalogue for gypsum board procurement", status: "active" as const, created_at: at(-10), updated_at: now() },
];
const entityFileAttachments = [
    { id: "file-link-vendor-build-catalogue", file_asset_id: "file-catalogue-gypsum-board", entity_type: "vendor" as const, entity_id: "ven-build", entity_label: "Build Mart", role: "catalogue" as const, visibility: "internal" as const, customer_shareable: false, created_by: "Owner", created_at: at(-10), updated_at: now() },
    { id: "file-link-po-das-ceiling", file_asset_id: "file-po-das-ceiling", entity_type: "purchase_order" as const, entity_id: "po-das-ceiling", entity_label: "PO-2026-601", role: "document" as const, visibility: "vendor" as const, customer_shareable: false, created_by: "Owner", created_at: at(-5), updated_at: now() },
    { id: "file-link-quote-reference", file_asset_id: "file-reference-ceiling-joint", entity_type: "quotation" as const, entity_id: "quote-das-ceiling", entity_label: "Q-2026-101", role: "other" as const, visibility: "customer" as const, customer_shareable: true, created_by: "Owner", created_at: at(-9), updated_at: now() },
];
const seedAuditLog = [
    { id: "audit-vendor-rate-demo", timestamp: at(-4), actor: "Owner", actor_role: "Owner", action: "Vendor rate updated from PO line", entity_type: "vendor_rate", entity_id: "vr_ven-build_wia_fc_gyp_1", entity_label: "Build Mart · Gypsum Board", kind: "update" as const, source_module: "vendorRates", reason: "Accepted PO price became latest vendor rate", changes: [{ id: "audit-vendor-rate-demo-rate", field_path: "rate", before: 42, after: 44 }, { id: "audit-vendor-rate-demo-source", field_path: "current_source_type", before: "SEED", after: "PO" }] },
    { id: "audit-direct-award-po", timestamp: at(-2), actor: "Akarsh Singh", actor_role: "Owner", action: "Direct award PO created (skipped RFQ/bidding)", entity_type: "purchase_order", entity_id: "po-das-paint-direct", entity_label: "PO-2026-602", kind: "decision" as const, source_module: "procurement", reason: "Trusted vendor with existing rate agreement for premium paint brands; urgent site requirement." },
    { id: "audit-quotation-variation", timestamp: at(-3), actor: "Akarsh Singh", actor_role: "Owner", action: "Quotation variation created (scope expansion post Work Order)", entity_type: "quotation", entity_id: "quote-das-ceiling-v2", entity_label: "Q-2026-201-R2", kind: "decision" as const, source_module: "quotationDesk", reason: "Customer requested LED cove lighting addition after work order started. Scope expanded to include LED strip + driver + cove framing." },
    { id: "audit-quotation-accepted", timestamp: at(-3), actor: "Mr. Das", actor_role: "Customer", action: "Quotation variation accepted by customer", entity_type: "quotation", entity_id: "quote-das-ceiling-v2", entity_label: "Q-2026-201-R2", kind: "approve" as const, source_module: "quotationDesk" },
];
const master: Master = {
    ...catalog,
    vendors: [
        { id: "ven-build", name: "Build Mart", phone: "+91 9000001001", city: "Gorakhpur", locality: "Taramandal", category: "Ceiling materials", reliability_score: 88, on_time_pct: 91 },
        { id: "ven-ceiling", name: "Ceiling Hub", phone: "+91 9000001002", city: "Gorakhpur", locality: "Golghar", category: "Gypsum and grid systems", reliability_score: 83, on_time_pct: 88 },
    ],
    contractors: [
        { id: "con-gypsum", name: "Sharma Ceiling Works", phone: "+91 9000002001", city: "Gorakhpur", trade: "False ceiling", rating: 4.7, reliability_score: 90, on_time_pct: 92, past_jobs_count: 31, specializations: ["Gypsum false ceiling", "Grid ceiling"] },
        { id: "con-paint", name: "Verma Paint Team", phone: "+91 9000002002", city: "Gorakhpur", trade: "Painting", rating: 4.6, reliability_score: 88, on_time_pct: 91, past_jobs_count: 26, specializations: ["Interior painting", "Texture paint"] },
        { id: "con-paint-2", name: "Khan Finishes", phone: "+91 9000002003", city: "Gorakhpur", trade: "Painting", rating: 4.3, reliability_score: 82, on_time_pct: 87, past_jobs_count: 18, specializations: ["Interior painting"] },
    ],
    staff: createSeedStaffRecords(),
    sourcePartners: seedSourcePartners, commissionRules: [],
    vendorRates: [
        { id: "vr-build-gypsum-board", vendor_id: "ven-build", article_id: "art-gypsum-board", article_name: "Gypsum Board (12.5mm)", rate: 44, unit_id: "unit-sft", brand: "USG Boral", grade: "Standard", preferred: true, current_source_type: "PO", current_source_id: "po-das-ceiling", current_source_no: "PO-2026-601", valid_from: at(-5), updated_at: at(-5), gst_inclusive: false },
        { id: "vr-build-gypsum-channel", vendor_id: "ven-build", article_id: "art-gypsum-channel", article_name: "Gypsum Ceiling Channel", rate: 38, unit_id: "unit-sft", brand: "USG Boral", preferred: true, current_source_type: "SEED", valid_from: at(-30), updated_at: at(-30) },
        { id: "vr-build-paint-royale", vendor_id: "ven-build", article_id: "art-paint-premium", article_name: "Asian Paints Royale (Premium Emulsion)", rate: 520, unit_id: "unit-ltr", brand: "Asian Paints", preferred: true, current_source_type: "PO", current_source_id: "po-das-paint-direct", current_source_no: "PO-2026-602", valid_from: at(-2), updated_at: at(-2), gst_inclusive: true },
        { id: "vr-build-primer", vendor_id: "ven-build", article_id: "art-primer", article_name: "Asian Paints Primer", rate: 280, unit_id: "unit-ltr", brand: "Asian Paints", current_source_type: "PO", current_source_id: "po-das-paint-direct", current_source_no: "PO-2026-602", valid_from: at(-2), updated_at: at(-2) },
        { id: "vr-ceiling-grid-tee", vendor_id: "ven-ceiling", article_id: "art-grid-tee", article_name: "Grid Ceiling Main Tee", rate: 85, unit_id: "unit-pcs", brand: "Armstrong", current_source_type: "SEED", valid_from: at(-20), updated_at: at(-20) },
    ],
    // vendorRateHistories: left empty — repairOperationalWorkspace.ensureVendorRateCoverage
    // auto-generates correct histories from the generated vendorRates with proper IDs.
    // Hardcoded seed histories referenced stale vendor_rate_id / work_required_article_id
    // values that were replaced during operational repair, causing integrity violations.
    vendorRateHistories: [],
    contractorRates: [], customerRateSuggestions: [],
    storageAccounts: seedStorageAccounts, storageFolderTemplates: [], storageFolderInstances: [], fileAssets, catalogues, catalogueArticleVendorLinks, pinterestBoards: seedPinterestBoards, referenceMedia,
};
const recurringTasks = [
    { id: "recurring-site-progress", title: "Daily site progress photo upload", frequency: "daily" as const, assignee_id: "staff-field", assignee_name: "Ravi Kumar", scope: "site" as const, priority: "medium" as const, next_run: date(), last_run: date(-1), runs_count: 42, enabled: true, created_at: at(-42), updated_at: now() },
    { id: "recurring-payment-review", title: "Weekly payment recovery review", frequency: "weekly" as const, assignee_id: "staff-finance", assignee_name: "Meera Nair", scope: "office" as const, priority: "high" as const, next_run: date(), last_run: date(-7), runs_count: 8, enabled: true, created_at: at(-56), updated_at: now() },
    { id: "recurring-attendance-review", title: "Monthly staff attendance reconciliation", frequency: "monthly" as const, assignee_id: "staff-owner", assignee_name: "Owner", scope: "office" as const, priority: "medium" as const, next_run: date(12), last_run: date(-18), runs_count: 2, enabled: false, created_at: at(-75), updated_at: now() },
];
export const workByCustomer: Record<string, string> = {
    "cust-das": "Two independent sites: Apartment and Office",
    "cust-aarav": "Apartment modular kitchen",
    "cust-nisha": "Bedroom wardrobe and TV unit",
};
function buildRawSeedDatabase(): RDashDatabase {
    return prepareWorkspaceData({
        customers, sites, areas, workRequired, measurementRevisions, quotations, acceptedScopes, workOrders, boqs, vendorRfqs, vendorBids,
        purchaseOrders, grns, inventory, stockMovements: [], dispatches: seedDispatches, vendorBills, vendorPayments: seedVendorPayments, contractorBills, contractorPayments: seedContractorPayments, commissions: seedCommissions, workOrderCostLines, contractorBids, contractorSettlements: [], drawings: seedDrawings, executionLogs: seedExecutionLogs, variationRequests: [], visits: createSeedVisits(), tasks: createSeedTasks(), followups: seedFollowups, actions: seedApprovalActions, payments, invoices, customerReceipts, blocked: seedBlocked, risks: seedRisks, threads: [], attendance: createSeedAttendanceRecords(master.staff), approvalPolicies: [], automationRules: [], recurringTasks, auditLog: seedAuditLog, commSends: [], entityFileAttachments, entityReferenceAssignments: [], commercialTerms: [], paymentTermTemplates: [], taxConfigs: [{ id: "tax-gst18", name: "GST 18%", rate: 18, type: "gst", enabled: true }], validityConfigs: [{ id: "validity-14", name: "Standard 14 days", default_days: 14, expiry_action: "alert", enabled: true }], master,
        _workspace_mode: "prototype-fresh-site-first", _data_source: "fresh-canonical-site-area-work-required-seed",
    });
}

export function buildSeedDatabase(): RDashDatabase {
    const raw = buildRawSeedDatabase();
    const repaired = repairOperationalWorkspace(raw);
    return backfillSeedThreads(repaired);
}
