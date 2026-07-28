import { describe, expect, test } from "bun:test";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import {
  workspaceLocationPresentation,
  workspaceRecordKindLabel,
  workspaceRecordTitle,
} from "../src/lib/rdash/workspace-location-presentation";

const db = buildSeedDatabase();

describe("workspace location presentation", () => {
  test("builds a module-only browser title", () => {
    const location = workspaceLocationPresentation({
      db,
      moduleId: "workdesk",
      detail: { kind: null, recordId: null },
      contextHistory: [],
      contextHistoryIndex: -1,
    });

    expect(location.moduleLabel).toBe("Workdesk Dashboard");
    expect(location.recordLabel).toBeUndefined();
    expect(location.documentTitle).toBe("Workdesk Dashboard | Urban Castle");
  });

  test("uses hydrated record names for routed titles", () => {
    const task = db.tasks.find((row) => row.customer_id) || db.tasks[0];
    expect(task).toBeDefined();

    const location = workspaceLocationPresentation({
      db,
      moduleId: "tasks",
      detail: { kind: "task", recordId: task.id, panelTab: "thread", fromModule: "context" },
      contextHistory: [{
        kind: "task",
        recordId: task.id,
        customerId: task.customer_id,
        sourceModule: "tasks",
        detailTab: "thread",
      }],
      contextHistoryIndex: 0,
    });

    expect(location.kindLabel).toBe("Task");
    expect(location.recordLabel).toBe(task.title);
    expect(location.viewLabel).toBe("Thread");
    expect(location.documentTitle).toBe(`${task.title} · Thread · Tasks & Follow-ups | Urban Castle`);
  });

  test("shows the customer root for nested context navigation", () => {
    const customer = db.customers[0];
    const site = db.sites.find((row) => row.customer_id === customer.id)!;

    const location = workspaceLocationPresentation({
      db,
      moduleId: "siteExecution",
      detail: { kind: "site", recordId: site.id, fromModule: "context" },
      contextHistory: [
        {
          kind: "customer",
          recordId: customer.id,
          customerId: customer.id,
          sourceModule: "siteExecution",
          customerTab: "overview",
          detailTab: "overview",
        },
        {
          kind: "site",
          recordId: site.id,
          customerId: customer.id,
          sourceModule: "siteExecution",
          detailTab: "overview",
        },
      ],
      contextHistoryIndex: 1,
    });

    expect(location.customerContextLabel).toBe(customer.name);
    expect(location.recordLabel).toBe(site.name);
    expect(location.documentTitle).toBe(`${site.name} · Sites & Execution | Urban Castle`);
  });

  test("uses the existing customer workspace view in the title", () => {
    const customer = db.customers[0];
    const location = workspaceLocationPresentation({
      db,
      moduleId: "customerDesk",
      detail: { kind: "customer", recordId: customer.id, fromModule: "context" },
      contextHistory: [{
        kind: "customer",
        recordId: customer.id,
        customerId: customer.id,
        sourceModule: "customerDesk",
        customerTab: "activity",
        detailTab: "overview",
      }],
      contextHistoryIndex: 0,
    });

    expect(location.recordLabel).toBe(customer.name);
    expect(location.viewLabel).toBe("Activity");
    expect(location.documentTitle).toBe(`${customer.name} · Activity · Customer Desk | Urban Castle`);
  });

  test("keeps record labels aligned with existing detail semantics", () => {
    const customer = db.customers[0];
    const site = db.sites.find((row) => row.customer_id === customer.id)!;
    const area = db.areas.find((row) => row.site_id === site.id)!;

    expect(workspaceRecordKindLabel("po")).toBe("Purchase Order");
    expect(workspaceRecordKindLabel("vendorBill")).toBe("Vendor Bill");
    expect(workspaceRecordTitle(db, "customer", customer.id)).toBe(customer.name);
    expect(workspaceRecordTitle(db, "area", area.id)).toBe(`${site.name} · ${area.name}`);
  });
});
