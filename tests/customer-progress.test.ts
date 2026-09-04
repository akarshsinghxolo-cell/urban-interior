import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { customerProgress } from "../src/lib/rdash/customer-progress";
import type { RDashDatabase, WorkRequiredStatus } from "../src/lib/rdash/types";

function databaseWithWorkRequired(status: WorkRequiredStatus): RDashDatabase {
  const db = structuredClone(buildSeedDatabase());
  db.customers = [{
    id: "customer-progress",
    name: "Progress Customer",
    phone: "9876500000",
    status: "active",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  }];
  db.invoices = [];
  db.workOrders = [];
  db.workRequired = [{
    id: "work-progress",
    customer_id: "customer-progress",
    site_id: "",
    title: "TV Unit",
    area_ids: [],
    status,
    priority: "medium",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  }];
  return db;
}

const LADDER: WorkRequiredStatus[] = [
  "new",
  "contacted",
  "visit_scheduled",
  "measurement_done",
  "quotation_in_progress",
  "quotation_sent",
  "negotiation",
  "accepted",
  "contractor_bidding",
  "awarded",
  "in_progress",
  "completed",
];

describe("customerProgress Work Required ladder", () => {
  test("labels an untouched lead New enquiry at 8 percent", () => {
    const progress = customerProgress(databaseWithWorkRequired("new"), "customer-progress");
    expect(progress.label).toBe("New enquiry");
    expect(progress.label).not.toBe("Contacted");
    expect(progress.percent).toBe(8);
  });

  test("advances contacted to 16 percent without regression", () => {
    const progress = customerProgress(databaseWithWorkRequired("contacted"), "customer-progress");
    expect(progress.label).toBe("Contacted");
    expect(progress.percent).toBe(16);
    expect(progress.percent).toBeGreaterThan(8);
  });

  test("places awarded at 80 percent", () => {
    expect(customerProgress(databaseWithWorkRequired("awarded"), "customer-progress").percent).toBe(80);
  });

  test("keeps the positive-status percent ladder monotonic", () => {
    const percents = LADDER.map((status) => customerProgress(databaseWithWorkRequired(status), "customer-progress").percent);
    expect(percents).toEqual([8, 16, 24, 32, 42, 55, 60, 68, 74, 80, 88, 100]);
    expect(percents.every((percent, i) => i === 0 || percents[i - 1] <= percent)).toBe(true);
  });
});
