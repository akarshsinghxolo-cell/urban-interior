import { describe, expect, test } from "vitest";
import {
  fieldStaffCanViewRoute,
  fieldStaffPresentationDatabase,
} from "@/lib/rdash/field-staff-presentation";
import { fieldStaffVisibleDatabase } from "@/lib/rdash/field-staff-visibility";
import { buildSeedDatabase } from "@/lib/rdash/seed";
import { workspaceRouteAccessDecision } from "@/lib/rdash/workspace-route-access";

const fieldUser = {
  name: "Field One",
  role: "Field Staff",
  staffId: "staff-field",
  email: "field@example.com",
  expiresAt: Date.now() + 60_000,
};

function ids(rows: Array<{ id: string }>): string[] {
  return rows.map((row) => row.id).sort();
}

function visibilityFixture() {
  const db = buildSeedDatabase();
  db.customers = [
    { id: "cust-created", name: "Created", phone: "1", status: "active", created_at: "", updated_at: "" },
    { id: "cust-followup", name: "Follow-up", phone: "2", status: "active", created_at: "", updated_at: "" },
    { id: "cust-visit", name: "Visit", phone: "3", status: "active", created_at: "", updated_at: "" },
    { id: "cust-hidden", name: "Hidden", phone: "4", status: "active", created_at: "", updated_at: "" },
  ] as never[];
  db.sites = [
    { id: "site-created", customer_id: "cust-created", name: "Created site", site_type: "other", stage: "enquiry", photo_attachment_ids: [], created_at: "", updated_at: "" },
    { id: "site-visit", customer_id: "cust-visit", name: "Visit site", site_type: "other", stage: "execution", photo_attachment_ids: [], created_at: "", updated_at: "" },
    { id: "site-hidden", customer_id: "cust-hidden", name: "Hidden site", site_type: "other", stage: "enquiry", photo_attachment_ids: [], created_at: "", updated_at: "" },
  ] as never[];
  db.workRequired = [
    { id: "work-created", customer_id: "cust-created", site_id: "site-created", title: "Created work", area_ids: [], structured_items: [], status: "new", priority: "medium", budget: 10_000, created_at: "", updated_at: "" },
    { id: "work-visit", customer_id: "cust-visit", site_id: "site-visit", title: "Visit work", area_ids: [], structured_items: [], status: "in_progress", priority: "medium", budget: 50_000, created_at: "", updated_at: "" },
    { id: "work-hidden", customer_id: "cust-hidden", site_id: "site-hidden", title: "Hidden work", area_ids: [], structured_items: [], status: "new", priority: "medium", created_at: "", updated_at: "" },
  ] as never[];
  db.workOrders = [
    { id: "wo-visible", work_order_no: "WO-1", customer_id: "cust-visit", accepted_scope_ids: [], work_required_ids: ["work-visit"], quotation_ids: [], site_id: "site-visit", area_ids: [], title: "Visible work order", status: "in_progress", contractor_id: "contractor-linked", contractor_award_amount: 75_000, start_date: "2026-07-30", value: 100_000, progress: 10, created_at: "", updated_at: "" },
    { id: "wo-hidden", work_order_no: "WO-2", customer_id: "cust-hidden", accepted_scope_ids: [], work_required_ids: ["work-hidden"], quotation_ids: [], site_id: "site-hidden", area_ids: [], title: "Hidden work order", status: "in_progress", contractor_id: "contractor-hidden", start_date: "2026-07-30", value: 100, progress: 10, created_at: "", updated_at: "" },
  ] as never[];
  db.followups = [
    { id: "follow-visible", title: "Call", status: "pending", priority: "medium", due_at: "2026-07-30T10:00:00Z", due_date: "2026-07-30", assigned_to: "Field One", customer_id: "cust-followup", notes_history: [], created_at: "", updated_at: "" },
    { id: "follow-hidden", title: "Other call", status: "pending", priority: "medium", due_at: "2026-07-30T10:00:00Z", due_date: "2026-07-30", assigned_to: "Other Staff", customer_id: "cust-hidden", notes_history: [], created_at: "", updated_at: "" },
  ] as never[];
  db.visits = [
    { id: "visit-visible", customer_id: "cust-visit", site_id: "site-visit", work_required_id: "work-visit", work_order_id: "wo-visible", vendor_id: "vendor-visit", staff_id: "staff-field", staff_name: "Field One", visit_type: "site_visit", location_name: "Visit site", status: "scheduled", scheduled_at: "2026-07-31T10:00:00Z", proof_attachment_ids: [], created_at: "", updated_at: "" },
    { id: "visit-hidden", customer_id: "cust-hidden", site_id: "site-hidden", work_required_id: "work-hidden", work_order_id: "wo-hidden", vendor_id: "vendor-hidden", staff_id: "staff-other", staff_name: "Other Staff", visit_type: "site_visit", location_name: "Hidden site", status: "scheduled", scheduled_at: "2026-07-31T10:00:00Z", proof_attachment_ids: [], created_at: "", updated_at: "" },
  ] as never[];
  db.tasks = [
    { id: "task-visible", title: "Assigned task", status: "todo", priority: "medium", assignee_id: "staff-field", customer_id: "cust-visit", work_order_id: "wo-visible", due_date: "2026-07-31", task_scope: "site", comments: [], checklist: [], proofs: [], created_at: "", updated_at: "" },
    { id: "task-hidden", title: "Hidden task", status: "todo", priority: "medium", assignee_id: "staff-other", customer_id: "cust-hidden", work_order_id: "wo-hidden", due_date: "2026-07-31", task_scope: "site", comments: [], checklist: [], proofs: [], created_at: "", updated_at: "" },
  ] as never[];
  db.master = {
    ...db.master,
    vendors: [
      { id: "vendor-created", name: "Created vendor", outstanding: 20_000, reliability_score: 95, notes: "Manager-only note" },
      { id: "vendor-visit", name: "Visit vendor", outstanding: 30_000, reliability_score: 70 },
      { id: "vendor-hidden", name: "Hidden vendor" },
    ],
    contractors: [
      { id: "contractor-created", name: "Created contractor", outstanding: 40_000, reliability_score: 90 },
      { id: "contractor-linked", name: "Linked contractor", outstanding: 50_000, reliability_score: 80, work_capabilities: [{ subcategory_id: "work-1", work_type_rates: [{ work_type_id: "wt-1", work_type_name: "Standard", unit_id: "sqft", material_rate: 40, labour_rate: 20 }] }] },
      { id: "contractor-hidden", name: "Hidden contractor" },
    ],
    staff: [
      { id: "staff-field", name: "Field One", role: "Field Staff", monthly_salary: 25_000, daily_wage: 900, bank_details: { account: "own" }, attendance_policy: db.master.staff[0]?.attendance_policy },
      { id: "staff-other", name: "Other Staff", role: "Field Staff", monthly_salary: 30_000, bank_details: { account: "other" }, attendance_policy: db.master.staff[0]?.attendance_policy },
    ] as never[],
    vendorRates: [],
    vendorRateHistories: [],
    contractorRates: [],
    catalogueArticleVendorLinks: [],
  };
  db.auditLog = [
    { id: "a1", timestamp: "", actor: "Field One", actor_role: "Field Staff", action: "Created customer", entity_type: "customer", entity_id: "cust-created", kind: "create" },
    { id: "a2", timestamp: "", actor: "Field One", actor_role: "Field Staff", action: "Created site", entity_type: "site", entity_id: "site-created", kind: "create" },
    { id: "a3", timestamp: "", actor: "Field One", actor_role: "Field Staff", action: "Created work", entity_type: "workRequired", entity_id: "work-created", kind: "create" },
    { id: "a4", timestamp: "", actor: "Field One", actor_role: "Field Staff", action: "Created vendor", entity_type: "vendor", entity_id: "vendor-created", kind: "create" },
    { id: "a5", timestamp: "", actor: "Field One", actor_role: "Field Staff", action: "Created contractor", entity_type: "contractor", entity_id: "contractor-created", kind: "create" },
  ] as never[];
  return db;
}

describe("field staff UI visibility", () => {
  test("shows created and assigned customer, site, work and partner records", () => {
    const visible = fieldStaffVisibleDatabase(visibilityFixture(), fieldUser);

    expect(ids(visible.customers)).toEqual(["cust-created", "cust-followup", "cust-visit"]);
    expect(ids(visible.sites)).toEqual(["site-created", "site-visit"]);
    expect(ids(visible.workRequired)).toEqual(["work-created", "work-visit"]);
    expect(ids(visible.workOrders)).toEqual(["wo-visible"]);
    expect(ids(visible.followups)).toEqual(["follow-visible"]);
    expect(ids(visible.visits)).toEqual(["visit-visible"]);
    expect(ids(visible.tasks)).toEqual(["task-visible"]);
    expect(ids(visible.master.vendors)).toEqual(["vendor-created", "vendor-visit"]);
    expect(ids(visible.master.contractors)).toEqual(["contractor-created", "contractor-linked"]);
  });

  test("does not alter the database view for managers", () => {
    const db = visibilityFixture();
    const visible = fieldStaffPresentationDatabase(db, { ...fieldUser, role: "Owner" });
    expect(visible).toBe(db);
    expect(visible.customers).toHaveLength(4);
  });

  test("treats role-assigned follow-ups as assigned to field staff", () => {
    const db = visibilityFixture();
    db.followups = [{
      id: "role-followup",
      title: "Field queue",
      status: "pending",
      priority: "medium",
      due_at: "2026-07-30T10:00:00Z",
      due_date: "2026-07-30",
      assigned_role: "Field Staff",
      customer_id: "cust-hidden",
      notes_history: [],
      created_at: "",
      updated_at: "",
    }] as never[];

    const visible = fieldStaffPresentationDatabase(db, fieldUser);
    expect(ids(visible.followups)).toEqual(["role-followup"]);
    expect(ids(visible.customers)).toContain("cust-hidden");
  });

  test("removes financial collections and masks money on allowed operational records", () => {
    const db = visibilityFixture();
    db.purchaseOrders = [{
      id: "po-visible",
      po_no: "PO-1",
      work_order_id: "wo-visible",
      work_order_no: "WO-1",
      site_id: "site-visit",
      vendor_id: "vendor-visit",
      vendor_name: "Visit vendor",
      status: "sent",
      items: [{ id: "line-1", title: "Paint", quantity: 10, rate: 100, amount: 1000 }],
      subtotal: 1000,
      tax_amount: 180,
      total_amount: 1180,
      expected_delivery: "2026-08-01",
      grn_ids: [],
      bill_ids: [],
      created_at: "",
      updated_at: "",
    }] as never[];
    db.inventory = [{
      id: "inv-visible",
      name: "Paint",
      quantity: 10,
      rate: 100,
      work_order_id: "wo-visible",
      created_at: "",
      updated_at: "",
    }] as never[];
    db.payments = [{
      id: "pay-visible",
      customer_id: "cust-visit",
      work_order_id: "wo-visible",
      finance_context: "service",
      amount: 25_000,
      status: "pending",
      due_date: "2026-08-01",
      created_at: "",
      updated_at: "",
    }] as never[];
    db.vendorBills = [{ id: "vb-visible", bill_no: "VB-1", vendor_id: "vendor-visit", vendor_name: "Visit vendor", site_id: "site-visit", work_order_id: "wo-visible", po_id: "po-visible", po_no: "PO-1", grn_id: "grn-1", grn_no: "GRN-1", amount: 1000, total_amount: 1180, paid_amount: 0, balance_amount: 1180, status: "approved", due_date: "2026-08-01", created_at: "", updated_at: "" }] as never[];

    const visible = fieldStaffPresentationDatabase(db, fieldUser);
    expect(visible.payments).toEqual([]);
    expect(visible.vendorBills).toEqual([]);
    expect(visible.contractorBills).toEqual([]);
    expect(visible.commissions).toEqual([]);
    expect(visible.workOrderCostLines).toEqual([]);
    expect(visible.workOrders[0]?.value).toBe(0);
    expect(visible.workOrders[0]?.contractor_award_amount).toBeUndefined();
    expect(visible.workRequired.find((row) => row.id === "work-visit")?.budget).toBeUndefined();
    expect(visible.purchaseOrders[0]?.total_amount).toBe(0);
    expect(visible.purchaseOrders[0]?.items[0]?.rate).toBe(0);
    expect(visible.inventory[0]?.rate).toBeUndefined();
    expect(visible.master.vendors.find((row) => row.id === "vendor-visit")?.outstanding).toBeUndefined();
    expect(visible.master.contractors.find((row) => row.id === "contractor-linked")?.work_capabilities?.[0]?.work_type_rates).toBeUndefined();
  });

  test("shows only the signed-in staff member's attendance, GPS, staff profile and files", () => {
    const db = visibilityFixture();
    db.attendance = [
      { id: "att-own", staff_id: "staff-field", staff_name: "Field One", date: "2026-07-30", attendance_mode: "field_visit", status: "present", created_at: "" },
      { id: "att-other", staff_id: "staff-other", staff_name: "Other Staff", date: "2026-07-30", attendance_mode: "field_visit", status: "present", created_at: "" },
    ] as never[];
    db.staffLocationPings = [
      { id: "ping-own", staff_id: "staff-field", latitude: 1, longitude: 1, captured_at: "", source: "pwa" },
      { id: "ping-other", staff_id: "staff-other", latitude: 2, longitude: 2, captured_at: "", source: "pwa" },
    ];
    db.master.fileAssets = [
      { id: "file-visible", file_name: "visible.jpg", mime_type: "image/jpeg", kind: "image", storage_provider: "google_drive", storage_mode: "external_reference", sync_status: "uploaded", status: "active", created_at: "", updated_at: "" },
      { id: "file-hidden", file_name: "hidden.jpg", mime_type: "image/jpeg", kind: "image", storage_provider: "google_drive", storage_mode: "external_reference", sync_status: "uploaded", status: "active", created_at: "", updated_at: "" },
    ] as never[];
    db.entityFileAttachments = [
      { id: "efa-visible", file_asset_id: "file-visible", entity_type: "visit", entity_id: "visit-visible", role: "proof", visibility: "internal", created_at: "", updated_at: "" },
      { id: "efa-hidden", file_asset_id: "file-hidden", entity_type: "visit", entity_id: "visit-hidden", role: "proof", visibility: "internal", created_at: "", updated_at: "" },
    ] as never[];

    const visible = fieldStaffPresentationDatabase(db, fieldUser);
    expect(ids(visible.attendance)).toEqual(["att-own"]);
    expect(ids(visible.staffLocationPings || [])).toEqual(["ping-own"]);
    expect(ids(visible.master.staff)).toEqual(["staff-field"]);
    expect(visible.master.staff[0]?.monthly_salary).toBeUndefined();
    expect(visible.master.staff[0]?.bank_details).toBeUndefined();
    expect(ids(visible.entityFileAttachments)).toEqual(["efa-visible"]);
    expect(ids(visible.master.fileAssets)).toEqual(["file-visible"]);
  });

  test("fixes Field Staff module visibility and denies sensitive direct routes", () => {
    const visible = fieldStaffPresentationDatabase(visibilityFixture(), fieldUser);
    const permission = (moduleKey: string) => visible.staffRolePermissions?.find((row) => row.module_key === moduleKey);

    expect(permission("customers")?.can_view).toBe(true);
    expect(permission("workOrders")?.can_view).toBe(true);
    expect(permission("vendors")?.can_view).toBe(true);
    expect(permission("contractors")?.can_view).toBe(true);
    expect(permission("finance")?.can_view).toBe(false);
    expect(permission("payroll")?.can_view).toBe(false);
    expect(permission("reports")?.can_view).toBe(false);
    expect(permission("system")?.can_view).toBe(false);

    expect(fieldStaffCanViewRoute("customerDesk", "customers")).toBe(true);
    expect(fieldStaffCanViewRoute("vendorRates", "vendors")).toBe(false);
    expect(fieldStaffCanViewRoute("profitability", "sites")).toBe(false);
    expect(fieldStaffCanViewRoute("driveManager", "workspace")).toBe(false);
    expect(fieldStaffCanViewRoute("integrity", "workspace")).toBe(false);

    const permissiveSiteRow = [{
      id: "custom-field-sites",
      role_key: "FIELD_STAFF",
      module_key: "sites",
      module_label: "Sites",
      can_view: true,
      can_create: true,
      can_update: true,
      can_approve: true,
      can_delete: true,
      updated_at: "",
    }];
    expect(workspaceRouteAccessDecision(
      "profitability",
      "Field Staff",
      permissiveSiteRow,
    ).status).toBe("denied");
  });
});
