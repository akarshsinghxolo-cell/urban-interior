import { describe, expect, test, vi } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import {
  advanceSiteStage,
  advanceSitesStage,
  siteArchiveBlockers,
} from "../src/lib/rdash/site-lifecycle";
import { createQuotationsSlice } from "../src/lib/rdash/store/slices/quotations";
import type { RDashDatabase, Site, Visit, WorkOrder, WorkRequired } from "../src/lib/rdash/types";
import type { StoreContext } from "../src/lib/rdash/store/context";

const NOW = "2026-08-01T10:00:00.000Z";

describe("advanceSiteStage (monotonic Site stage ladder)", () => {
  test("advances up the enquiry → planning → quoted → awarded → execution → completed ladder", () => {
    expect(advanceSiteStage("enquiry", "planning")).toBe("planning");
    expect(advanceSiteStage("planning", "quoted")).toBe("quoted");
    expect(advanceSiteStage("quoted", "awarded")).toBe("awarded");
    expect(advanceSiteStage("awarded", "execution")).toBe("execution");
    expect(advanceSiteStage("execution", "completed")).toBe("completed");
  });

  test("never regresses: same or lower target leaves the current stage in place", () => {
    expect(advanceSiteStage("quoted", "quoted")).toBe("quoted");
    expect(advanceSiteStage("awarded", "quoted")).toBe("awarded");
    expect(advanceSiteStage("execution", "planning")).toBe("execution");
    expect(advanceSiteStage("completed", "enquiry")).toBe("completed");
  });

  test("on_hold and cancelled are frozen: never auto-advanced FROM them", () => {
    expect(advanceSiteStage("on_hold", "completed")).toBe("on_hold");
    expect(advanceSiteStage("on_hold", "planning")).toBe("on_hold");
    expect(advanceSiteStage("cancelled", "completed")).toBe("cancelled");
    expect(advanceSiteStage("cancelled", "execution")).toBe("cancelled");
  });

  test("on_hold and cancelled are terminal-ish: never auto-advanced TO them", () => {
    expect(advanceSiteStage("planning", "on_hold")).toBe("planning");
    expect(advanceSiteStage("execution", "on_hold")).toBe("execution");
    expect(advanceSiteStage("awarded", "cancelled")).toBe("awarded");
    expect(advanceSiteStage("enquiry", "cancelled")).toBe("enquiry");
  });
});

describe("advanceSitesStage (slice-side one-liner)", () => {
  const site = (stage: Site["stage"], id = "site-1"): Site => ({
    id,
    customer_id: "customer-1",
    name: "Residence",
    site_type: "apartment",
    stage,
    created_at: NOW,
    updated_at: NOW,
  });

  test("advances only the target Site and stamps updated_at", () => {
    const sites = [site("planning"), site("enquiry", "site-2")];
    const next = advanceSitesStage(sites, "site-1", "quoted", NOW);
    expect(next.find((row) => row.id === "site-1")).toMatchObject({ stage: "quoted", updated_at: NOW });
    expect(next.find((row) => row.id === "site-2")).toMatchObject({ stage: "enquiry", updated_at: NOW });
  });

  test("no-ops without a Site (customer-level quotation) or without a stage step", () => {
    const sites = [site("planning")];
    expect(advanceSitesStage(sites, "", "quoted", NOW)).toBe(sites);
    expect(advanceSitesStage(sites, undefined, "quoted", NOW)).toBe(sites);
    expect(advanceSitesStage(sites, "site-1", undefined, NOW)).toBe(sites);
  });

  test("returns the untouched row when the stage would not change (clean state diff)", () => {
    const sites = [site("execution")];
    const next = advanceSitesStage(sites, "site-1", "execution", NOW);
    expect(next[0]).toBe(sites[0]);
  });
});

describe("siteArchiveBlockers (active linked records for a Site)", () => {
  const work = (id: string, status: WorkRequired["status"]): WorkRequired => ({
    id,
    customer_id: "customer-1",
    site_id: "site-1",
    title: id,
    area_ids: [],
    status,
    priority: "medium",
    created_at: NOW,
    updated_at: NOW,
  });
  const visit = (id: string, status: Visit["status"]): Visit => ({
    id,
    customer_id: "customer-1",
    site_id: "site-1",
    staff_id: "staff-1",
    staff_name: "Staff",
    visit_type: "measurement",
    location_name: "Residence",
    status,
    scheduled_at: NOW,
    proof_attachment_ids: [],
    created_at: NOW,
    updated_at: NOW,
  });
  const order = (id: string, status: WorkOrder["status"]): WorkOrder => ({
    id,
    work_order_no: id,
    customer_id: "customer-1",
    accepted_scope_ids: [],
    work_required_ids: [],
    quotation_ids: [],
    site_id: "site-1",
    area_ids: [],
    title: id,
    status,
    start_date: "2026-08-01",
    value: 1000,
    progress: 0,
    created_at: NOW,
    updated_at: NOW,
  });

  test("counts only active workRequired, visits, and workOrders", () => {
    const blockers = siteArchiveBlockers(
      {
        // lost/completed Work Required is history; a customer-level row (site_id "") never matches.
        workRequired: [work("w-active", "in_progress"), work("w-lost", "lost"), work("w-done", "completed"), { ...work("w-other", "new"), site_id: "" }],
        // Only cancelled visits are dead; completed/missed visits still belong to the Site record.
        visits: [visit("v-scheduled", "scheduled"), visit("v-done", "completed"), visit("v-cancelled", "cancelled")],
        // Completed and cancelled Work Orders are history; abandoned is unresolved and still blocks.
        workOrders: [order("wo-active", "in_progress"), order("wo-done", "completed"), order("wo-cancelled", "cancelled"), order("wo-abandoned", "abandoned")],
      },
      "site-1",
    );
    expect(blockers).toEqual({ workRequired: 1, visits: 2, workOrders: 2, total: 5 });
  });

  test("an empty Site has no blockers and archives exactly as before", () => {
    const blockers = siteArchiveBlockers({ workRequired: [], visits: [], workOrders: [] }, "site-1");
    expect(blockers.total).toBe(0);
  });
});

// --- Thin integration checks: the one-line wirings inside the existing store actions. ---

function siteDatabase(siteStage: Site["stage"]): RDashDatabase {
  const db = structuredClone(buildSeedDatabase());
  db.customers = [{
    id: "customer-1",
    name: "Customer One",
    phone: "9000000001",
    status: "active",
    created_at: NOW,
    updated_at: NOW,
  }];
  db.sites = [{
    id: "site-1",
    customer_id: "customer-1",
    name: "Residence",
    site_type: "apartment",
    stage: siteStage,
    created_at: NOW,
    updated_at: NOW,
  }];
  db.quotations = [];
  db.acceptedScopes = [];
  db.workRequired = [];
  db.workOrders = [];
  db.visits = [];
  db.followups = [];
  return db;
}

function quotationHarness(db: RDashDatabase) {
  const state: any = {
    db,
    requiresApproval: vi.fn(() => null),
    openThreadFor: vi.fn(() => "thread-1"),
    addThreadReply: vi.fn(),
    logAudit: vi.fn(),
    fireAutomation: vi.fn(),
    addFollowup: vi.fn(() => "followup-1"),
    updateFollowup: vi.fn(),
    currentUser: vi.fn(() => ({ name: "Owner", role: "Owner" })),
  };
  const context: StoreContext = {
    get: () => state,
    setBase: () => undefined,
    isNestedTransaction: () => false,
    commitState: (partial: any) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      Object.assign(state, patch);
    },
  };
  const slice = createQuotationsSlice(context);
  Object.assign(state, slice);
  return { state, slice };
}

function quotationFixture(overrides: Partial<RDashDatabase["quotations"][number]>): RDashDatabase["quotations"][number] {
  return {
    id: "quot-1",
    quotation_no: "Q-2026-001",
    customer_id: "customer-1",
    site_id: "site-1",
    title: "Residence quotation",
    status: "draft",
    revision_no: 0,
    valid_until: "2026-12-01",
    subtotal: 1000,
    tax_amount: 0,
    total_amount: 1000,
    payment_terms: [{ id: "term-1", label: "Full", percentage: 100, due_event: "on_acceptance" }],
    coverage: [],
    scope_lines: [],
    work_order_ids: [],
    thread_id: "thread-quot",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe("site stage wirings in the existing store actions", () => {
  test("sending a quotation advances its Site to quoted; a customer-level quotation is skipped", () => {
    const db = siteDatabase("planning");
    db.quotations = [
      quotationFixture({ id: "quot-site", site_id: "site-1" }),
      quotationFixture({ id: "quot-customer-level", site_id: "" }),
    ];
    const { state, slice } = quotationHarness(db);

    slice.updateQuotation("quot-site", { status: "sent" });
    expect(state.db.sites[0].stage).toBe("quoted");

    slice.updateQuotation("quot-customer-level", { status: "sent" });
    expect(state.db.sites[0].stage).toBe("quoted");
  });

  test("accepting a quotation advances its Site to awarded", () => {
    const db = siteDatabase("quoted");
    db.workRequired = [{
      id: "work-1",
      customer_id: "customer-1",
      site_id: "site-1",
      title: "False ceiling",
      area_ids: [],
      status: "quotation_sent",
      priority: "medium",
      created_at: NOW,
      updated_at: NOW,
    }];
    db.quotations = [quotationFixture({
      id: "quot-1",
      status: "sent",
      coverage: [{ id: "cov-1", work_required_id: "work-1", area_ids: [], measurement_revision_ids: [], coverage_label: "False ceiling", status: "proposed" }],
      scope_lines: [{ id: "line-1", title: "False ceiling", quantity: 1, rate: 1000, amount: 1000, work_required_id: "work-1" }],
    })];
    const { state, slice } = quotationHarness(db);

    slice.acceptQuotationForBidding("quot-1");
    expect(state.db.quotations[0].status).toBe("accepted");
    expect(state.db.sites[0].stage).toBe("awarded");
  });

  test("completing the Work Order advances its Site to completed", () => {
    const db = siteDatabase("execution");
    db.workOrders = [{
      id: "wo-1",
      work_order_no: "WO-2026-001",
      customer_id: "customer-1",
      accepted_scope_ids: [],
      work_required_ids: [],
      quotation_ids: [],
      site_id: "site-1",
      area_ids: [],
      title: "False ceiling",
      status: "in_progress",
      start_date: "2026-08-01",
      value: 1000,
      progress: 100,
      created_at: NOW,
      updated_at: NOW,
    }];
    const { state, slice } = quotationHarness(db);

    slice.updateJob("wo-1", { status: "completed" });
    expect(state.db.workOrders[0].status).toBe("completed");
    expect(state.db.sites[0].stage).toBe("completed");
  });
});
