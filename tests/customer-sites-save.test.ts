import { describe, expect, test } from "bun:test";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { applyCustomerWithSitesSave } from "../src/lib/rdash/customer-sites-save";
import type { RDashDatabase } from "../src/lib/rdash/types";

function database(): RDashDatabase {
  const db = structuredClone(buildSeedDatabase());
  db.customers = [{
    id: "customer-1",
    name: "Existing Customer",
    phone: "9876543210",
    whatsapp: "9876543210",
    customer_segments: ["service_customer"],
    status: "active",
    interest_category_ids: [],
    interest_work_subcategory_ids: [],
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  }];
  db.sites = [{
    id: "site-1",
    customer_id: "customer-1",
    name: "Existing Site",
    site_type: "apartment",
    stage: "planning",
    address: "Old address",
    photo_attachment_ids: ["attachment-1"],
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  }];
  db.entityFileAttachments = [{
    id: "attachment-1",
    file_asset_id: "file-1",
    entity_type: "site",
    entity_id: "site-1",
    entity_label: "Existing Site",
    role: "photo",
    visibility: "internal",
    customer_shareable: false,
    created_by: "Owner",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  }];
  return db;
}

const options = {
  now: "2026-07-30T10:00:00.000Z",
  createId: (prefix: "cust" | "site") => `${prefix}-created`,
};

describe("canonical customer and Sites save", () => {
  test("creates a customer and first Site atomically", () => {
    const db = database();
    db.customers = [];
    db.sites = [];
    const result = applyCustomerWithSitesSave(db, {
      customer: {
        name: "New Customer",
        phone: "9123456789",
        customer_segments: ["service_customer"],
        status: "active",
      },
      sites: [{ name: "New Residence", site_type: "villa", stage: "enquiry" }],
    }, options);
    expect(result.customerId).toBe("cust-created");
    expect(result.siteIds).toEqual(["site-created"]);
    expect(result.db.customers.find((row) => row.id === "cust-created")?.name).toBe("New Customer");
    expect(result.db.sites.find((row) => row.id === "site-created")?.customer_id).toBe("cust-created");
    expect(result.changed).toBe(true);
    expect(result.customerCreated).toBe(true);
  });

  test("updates only changed customer and Site values", () => {
    const db = database();
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: {
        name: "Existing Customer",
        phone: "9876543210",
        whatsapp: "9876543210",
        customer_segments: ["service_customer"],
        status: "active",
        interest_category_ids: [],
        interest_work_subcategory_ids: [],
      },
      sites: [{
        id: "site-1",
        name: "Existing Site",
        site_type: "apartment",
        stage: "planning",
        address: "New address",
        photo_attachment_ids: ["attachment-1"],
      }],
    }, options);
    expect(result.customerChanges).toEqual([]);
    expect(result.siteChanges).toHaveLength(1);
    expect(result.siteChanges[0].after.address).toBe("New address");
    expect(result.db.customers[0].updated_at).toBe("2026-07-01T00:00:00.000Z");
    expect(result.db.sites[0].updated_at).toBe(options.now);
  });

  test("returns the original database when nothing changed", () => {
    const db = database();
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{ ...db.sites[0] }],
    }, options);
    expect(result.changed).toBe(false);
    expect(result.db).toBe(db);
  });

  test("adds another Site while preserving existing Sites", () => {
    const db = database();
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{ id: "site-2", name: "Office", site_type: "office", stage: "enquiry" }],
    }, options);
    expect(result.db.sites.map((site) => site.id).sort()).toEqual(["site-1", "site-2"]);
    expect(result.siteChanges[0].kind).toBe("create");
  });

  test("detaches an existing Site photo in the same transformation", () => {
    const db = database();
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{ ...db.sites[0], photo_attachment_ids: [] }],
      detachAttachmentIds: ["attachment-1"],
    }, options);
    expect(result.db.entityFileAttachments).toHaveLength(0);
    expect(result.db.sites[0].photo_attachment_ids).toEqual([]);
    expect(result.detachedAttachmentIds).toEqual(["attachment-1"]);
  });

  test("rejects duplicate customer identity", () => {
    const db = database();
    expect(() => applyCustomerWithSitesSave(db, {
      customer: { name: "Duplicate", phone: "9876543210", customer_segments: ["service_customer"] },
    }, options)).toThrow(/customer/i);
  });

  test("rejects moving a Site to another customer", () => {
    const db = database();
    db.customers.push({
      ...db.customers[0],
      id: "customer-2",
      name: "Other Customer",
      phone: "9999999999",
      whatsapp: "9999999999",
    });
    expect(() => applyCustomerWithSitesSave(db, {
      customerId: "customer-2",
      customer: { ...db.customers[1] },
      sites: [{ ...db.sites[0] }],
    }, options)).toThrow(/cannot be moved/i);
  });

  test("preserves omitted customer and Site fields for patch-style callers", () => {
    const db = database();
    db.customers[0].email = "existing@example.com";
    db.sites[0].notes = "Keep this note";
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { name: "Renamed Customer" },
      sites: [{ id: "site-1", name: "Renamed Site" }],
    }, options);
    expect(result.db.customers[0].email).toBe("existing@example.com");
    expect(result.db.sites[0].notes).toBe("Keep this note");
  });

  test("rejects detaching a Site file owned by another Customer", () => {
    const db = database();
    db.customers.push({
      ...db.customers[0],
      id: "customer-2",
      name: "Other Customer",
      phone: "9999999999",
      whatsapp: "9999999999",
    });
    db.sites.push({
      ...db.sites[0],
      id: "site-2",
      customer_id: "customer-2",
      name: "Other Site",
      photo_attachment_ids: ["attachment-2"],
    });
    db.entityFileAttachments.push({
      ...db.entityFileAttachments[0],
      id: "attachment-2",
      entity_id: "site-2",
    });
    expect(() => applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{ ...db.sites[0] }],
      detachAttachmentIds: ["attachment-2"],
    }, options)).toThrow(/another Customer/i);
  });

  test("requires the owning Site to be included before detaching its file", () => {
    const db = database();
    expect(() => applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [],
      detachAttachmentIds: ["attachment-1"],
    }, options)).toThrow(/Include Site/i);
  });

  test("requires a Site name for every supplied Site", () => {
    const db = database();
    expect(() => applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{ id: "site-2", name: "", site_type: "other" }],
    }, options)).toThrow(/Site name is required/i);
  });
});
