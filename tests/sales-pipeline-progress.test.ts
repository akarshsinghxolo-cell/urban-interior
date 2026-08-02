import { describe, expect, test } from "bun:test";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { customerProgress } from "../src/lib/rdash/customer-progress";
import { planVisitLeadWork } from "../src/lib/rdash/lead-lifecycle";
import {
  buildProgressionPipelineEntries,
  pipelineStageForSiteStage,
} from "../src/lib/rdash/sales-pipeline-progress";
import type { RDashDatabase, WorkRequired } from "../src/lib/rdash/types";

const timestamp = "2026-08-01T10:00:00.000Z";

function database(): RDashDatabase {
  const db = structuredClone(buildSeedDatabase());

  db.customers = [
    {
      id: "customer-with-site",
      name: "Customer With Site",
      phone: "9000000001",
      customer_segments: ["service_customer"],
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: "customer-only",
      name: "Customer Only",
      phone: "9000000002",
      customer_segments: ["service_customer"],
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
  db.sites = [
    {
      id: "site-1",
      customer_id: "customer-with-site",
      name: "Residence",
      site_type: "apartment",
      stage: "planning",
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
  db.workRequired = [];
  db.workOrders = [];
  db.quotations = [];
  db.invoices = [];
  db.payments = [];
  db.customerReceipts = [];
  db.followups = [];
  db.visits = [];
  db.measurementRevisions = [];
  db.areas = [];
  return db;
}

function work(id: string, status: WorkRequired["status"] = "new"): WorkRequired {
  return {
    id,
    customer_id: "customer-with-site",
    site_id: "site-1",
    title: `Scope ${id}`,
    area_ids: [],
    status,
    priority: "medium",
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function contactedFollowup(customerId: string) {
  return {
    id: `followup-${customerId}`,
    customer_id: customerId,
    title: "Qualification call",
    notes: "Customer confirmed the requirement.",
    status: "completed" as const,
    priority: "medium" as const,
    due_at: timestamp,
    due_date: "2026-08-01",
    followup_type: "call" as const,
    outcome: "contacted" as const,
    outcome_note: "Requirement confirmed",
    completed_at: timestamp,
    completed_by: "Owner",
    notes_history: [],
    created_at: timestamp,
    updated_at: timestamp,
  };
}

describe("Sales Pipeline progression fallbacks", () => {
  test("uses Site progression when a Site exists and Customer progression otherwise", () => {
    const entries = buildProgressionPipelineEntries(database());

    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.site_id === "site-1")).toMatchObject({
      source: "site_progress",
      stage: "contacted",
      progress_label: "Planning",
      customer_id: "customer-with-site",
    });
    expect(entries.find((entry) => entry.customer_id === "customer-only")).toMatchObject({
      source: "customer_progress",
      stage: "new",
      progress_label: "New enquiry",
      customer_id: "customer-only",
    });
  });

  test("successful customer contact moves a customer-only lead to Qualified", () => {
    const db = database();
    db.followups = [contactedFollowup("customer-only")];

    expect(customerProgress(db, "customer-only")).toMatchObject({
      key: "contacted",
      label: "Qualified",
    });
    expect(buildProgressionPipelineEntries(db).find((entry) => entry.customer_id === "customer-only")).toMatchObject({
      stage: "contacted",
      progress_label: "Qualified",
    });
  });

  test("Customer milestones can advance an Enquiry Site fallback without manually changing Site stage", () => {
    const db = database();
    db.sites[0] = { ...db.sites[0], stage: "enquiry" };
    db.followups = [contactedFollowup("customer-with-site")];

    expect(buildProgressionPipelineEntries(db).find((entry) => entry.site_id === "site-1")).toMatchObject({
      stage: "contacted",
      progress_label: "Qualified",
      source_label: "Customer + Site progression",
    });
  });

  test("a real scheduled Site Visit advances the fallback to Visit planned even before Work Required exists", () => {
    const db = database();
    db.sites[0] = { ...db.sites[0], stage: "enquiry" };
    db.visits = [{
      id: "visit-1",
      customer_id: "customer-with-site",
      site_id: "site-1",
      assignee_type: "staff",
      staff_id: "",
      staff_name: "Unassigned",
      visit_type: "site_visit",
      location_target_type: "site",
      location_name: "Residence",
      status: "scheduled",
      scheduled_at: "2026-08-03T10:00:00.000Z",
      scheduled_duration_minutes: 60,
      route_points: [],
      notes: "",
      proof_attachment_ids: [],
      created_at: timestamp,
      updated_at: timestamp,
    }];

    expect(buildProgressionPipelineEntries(db).find((entry) => entry.site_id === "site-1")).toMatchObject({
      stage: "visit_scheduled",
      progress_label: "Site visit planned",
    });
  });

  test("stops emitting a Site fallback after Work Required becomes the source of truth", () => {
    const db = database();
    db.workRequired = [work("work-1")];

    const entries = buildProgressionPipelineEntries(db);

    expect(entries.some((entry) => entry.site_id === "site-1")).toBe(false);
    expect(entries.some((entry) => entry.customer_id === "customer-only")).toBe(true);
  });

  test("maps Site lifecycle stages into the Sales Pipeline without exposing execution-only columns", () => {
    expect(pipelineStageForSiteStage("enquiry")).toBe("new");
    expect(pipelineStageForSiteStage("planning")).toBe("contacted");
    expect(pipelineStageForSiteStage("quoted")).toBe("quotation_sent");
    expect(pipelineStageForSiteStage("awarded")).toBe("accepted");
    expect(pipelineStageForSiteStage("execution")).toBe("accepted");
    expect(pipelineStageForSiteStage("completed")).toBe("accepted");
    expect(pipelineStageForSiteStage("on_hold")).toBe("on_hold");
    expect(pipelineStageForSiteStage("cancelled")).toBe("lost");
  });
});

describe("Visit lead Work Required resolution", () => {
  test("creates the first Site scope from Customer interest fields", () => {
    const db = database();
    const subcategory = db.master.workSubcategories[0];
    const category = subcategory
      ? db.master.workCategories.find((row) => row.id === subcategory.category_id)
      : db.master.workCategories[0];
    db.customers[0] = {
      ...db.customers[0],
      interest_category_ids: category ? [category.id] : [],
      interest_work_subcategory_ids: subcategory ? [subcategory.id] : [],
    };

    const plan = planVisitLeadWork(db, {
      customerId: "customer-with-site",
      siteId: "site-1",
      visitType: "site_visit",
      locationTargetType: "site",
      now: timestamp,
      createId: () => "work-auto",
    });

    expect(plan).toMatchObject({
      workRequiredId: "work-auto",
      requiresSelection: false,
      source: "customer_interests",
    });
    expect(plan.createdWorkRequired).toMatchObject({
      id: "work-auto",
      customer_id: "customer-with-site",
      site_id: "site-1",
      status: "contacted",
      priority: "medium",
    });
    if (subcategory) {
      expect(plan.createdWorkRequired?.work_subcategory_id).toBe(subcategory.id);
      expect(plan.createdWorkRequired?.title).toContain(subcategory.name);
    }
  });

  test("auto-links the only active Site scope instead of creating a duplicate", () => {
    const db = database();
    db.workRequired = [work("work-1", "contacted")];

    const plan = planVisitLeadWork(db, {
      customerId: "customer-with-site",
      siteId: "site-1",
      visitType: "measurement",
      locationTargetType: "site",
      now: timestamp,
      createId: () => "should-not-be-used",
    });

    expect(plan).toMatchObject({
      workRequiredId: "work-1",
      requiresSelection: false,
      source: "existing",
    });
    expect(plan.createdWorkRequired).toBeUndefined();
  });

  test("requires an explicit scope when a Site has multiple active Work Required records", () => {
    const db = database();
    db.workRequired = [work("work-1"), work("work-2", "contacted")];

    const plan = planVisitLeadWork(db, {
      customerId: "customer-with-site",
      siteId: "site-1",
      visitType: "site_visit",
      locationTargetType: "site",
      now: timestamp,
      createId: () => "should-not-be-used",
    });

    expect(plan.requiresSelection).toBe(true);
    expect(plan.workRequiredId).toBeUndefined();
    expect(plan.reason).toContain("multiple active Work Required");
  });

  test("does not manufacture lead scope for vendor or logistics Visits", () => {
    const db = database();
    const plan = planVisitLeadWork(db, {
      customerId: "customer-with-site",
      siteId: "site-1",
      visitType: "delivery",
      locationTargetType: "site",
      now: timestamp,
      createId: () => "should-not-be-used",
    });

    expect(plan).toMatchObject({ requiresSelection: false, source: "none" });
    expect(plan.workRequiredId).toBeUndefined();
    expect(plan.createdWorkRequired).toBeUndefined();
  });
});
