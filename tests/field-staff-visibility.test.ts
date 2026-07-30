import { describe, expect, test } from "bun:test";
import { fieldStaffVisibleDatabase } from "@/lib/rdash/field-staff-visibility";
import { buildSeedDatabase } from "@/lib/rdash/seed";

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
    { id: "work-created", customer_id: "cust-created", site_id: "site-created", title: "Created work", area_ids: [], structured_items: [], status: "new", priority: "medium", created_at: "", updated_at: "" },
    { id: "work-visit", customer_id: "cust-visit", site_id: "site-visit", title: "Visit work", area_ids: [], structured_items: [], status: "in_progress", priority: "medium", created_at: "", updated_at: "" },
    { id: "work-hidden", customer_id: "cust-hidden", site_id: "site-hidden", title: "Hidden work", area_ids: [], structured_items: [], status: "new", priority: "medium", created_at: "", updated_at: "" },
  ] as never[];
  db.workOrders = [
    { id: "wo-visible", work_order_no: "WO-1", customer_id: "cust-visit", accepted_scope_ids: [], work_required_ids: ["work-visit"], quotation_ids: [], site_id: "site-visit", area_ids: [], title: "Visible work order", status: "in_progress", contractor_id: "contractor-linked", start_date: "2026-07-30", value: 100, progress: 10, created_at: "", updated_at: "" },
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
      { id: "vendor-created", name: "Created vendor" },
      { id: "vendor-visit", name: "Visit vendor" },
      { id: "vendor-hidden", name: "Hidden vendor" },
    ],
    contractors: [
      { id: "contractor-created", name: "Created contractor" },
      { id: "contractor-linked", name: "Linked contractor" },
      { id: "contractor-hidden", name: "Hidden contractor" },
    ],
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
    const visible = fieldStaffVisibleDatabase(db, { ...fieldUser, role: "Owner" });
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

    const visible = fieldStaffVisibleDatabase(db, fieldUser);
    expect(ids(visible.followups)).toEqual(["role-followup"]);
    expect(ids(visible.customers)).toContain("cust-hidden");
  });
});
