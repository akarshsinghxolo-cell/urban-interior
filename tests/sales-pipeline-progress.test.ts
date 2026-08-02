import { describe, expect, test } from "bun:test";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import {
  buildProgressionPipelineEntries,
  pipelineStageForSiteStage,
} from "../src/lib/rdash/sales-pipeline-progress";
import type { RDashDatabase, WorkRequired } from "../src/lib/rdash/types";

function database(): RDashDatabase {
  const db = structuredClone(buildSeedDatabase());
  const timestamp = "2026-08-01T10:00:00.000Z";

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
  return db;
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
      customer_id: "customer-only",
    });
  });

  test("stops emitting a Site fallback after Work Required becomes the source of truth", () => {
    const db = database();
    const timestamp = "2026-08-01T11:00:00.000Z";
    const work: WorkRequired = {
      id: "work-1",
      customer_id: "customer-with-site",
      site_id: "site-1",
      title: "False ceiling",
      area_ids: [],
      status: "new",
      priority: "medium",
      created_at: timestamp,
      updated_at: timestamp,
    };
    db.workRequired = [work];

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
