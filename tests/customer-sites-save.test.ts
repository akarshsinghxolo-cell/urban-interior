import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { applyCustomerWithSitesSave } from "../src/lib/rdash/customer-sites-save";
import { validateBusinessData } from "../src/lib/rdash/business-rules";
import type { RDashDatabase } from "../src/lib/rdash/types";
import { normalizeCustomerRow, titleCaseCustomerName } from "../src/lib/rdash/customer-record";
import {
  confirmedPhotoAttachmentIds,
  customerPayload,
  defaultSiteName,
  draftForWorkRequired,
  newSiteDraft,
  siteNameFollowsCustomer,
  sitePayload,
  validCustomerEmail,
  workRequiredBudgetValue,
  workRequiredPayload,
  type CustomerDraft,
  type CustomerWorkRequiredDraft,
  type SiteDraft,
} from "../src/components/rdash/customer-sites-form-model";

function database(): RDashDatabase {
  const db = structuredClone(buildSeedDatabase());
  db.customers = [{
    id: "customer-1",
    name: "Existing Customer",
    phone: "9876543210",
    whatsapp: "9876543210",
    status: "active",
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
  createId: (prefix: "cust" | "site" | "area" | "workRequired") => `${prefix}-created`,
};

describe("customer Site form defaults", () => {
  test("defaults a new Site to the customer name plus Site", () => {
    expect(defaultSiteName("Mr Das")).toBe("Mr Das Site");
    expect(defaultSiteName("  Mr Das  ")).toBe("Mr Das Site");
    expect(newSiteDraft("Mr Das").name).toBe("Mr Das Site");
    expect(newSiteDraft("").name).toBe("");
  });

  test("defaults a new Site to the customer name and locality once known", () => {
    expect(defaultSiteName("Mr Das", "Gorakhpur")).toBe("Mr Das · Gorakhpur");
    expect(defaultSiteName("Mr Das", "  ")).toBe("Mr Das Site");
  });

  test("keeps deferred upload IDs out of the initial Site mutation", () => {
    const draft = newSiteDraft("Mr Das");
    draft.pendingPhotos = [{
      attachmentId: "attachment-pending",
      mimeType: "image/png",
    } as SiteDraft["pendingPhotos"][number]];

    expect(sitePayload(draft, "Owner").photo_attachment_ids).toEqual([]);
  });

  test("keeps only confirmed, non-detached attachment IDs", () => {
    expect(confirmedPhotoAttachmentIds(
      ["attachment-1", "attachment-1", "attachment-2"],
      ["attachment-1"],
    )).toEqual(["attachment-2"]);
  });

  test("automatic Site names follow customer renames until manually changed", () => {
    expect(siteNameFollowsCustomer({ existing: false, name: "Mr Das Site", locality: "" }, "Mr Das")).toBe(true);
    expect(siteNameFollowsCustomer({ existing: false, name: "", locality: "" }, "Mr Das")).toBe(true);
    expect(siteNameFollowsCustomer({ existing: false, name: "Das Residence", locality: "" }, "Mr Das")).toBe(false);
    expect(siteNameFollowsCustomer({ existing: true, name: "Mr Das Site", locality: "" }, "Mr Das")).toBe(false);
  });

  test("untouched default names follow renames even after a locality is set", () => {
    expect(siteNameFollowsCustomer({ existing: false, name: "Mr Das Site", locality: "Gorakhpur" }, "Mr Das")).toBe(true);
    expect(siteNameFollowsCustomer({ existing: false, name: "Mr Das · Gorakhpur", locality: "Gorakhpur" }, "Mr Das")).toBe(true);
    expect(siteNameFollowsCustomer({ existing: false, name: "Das Residence", locality: "Gorakhpur" }, "Mr Das")).toBe(false);
  });
});

describe("customer name canonical casing", () => {
  test("title-cases lowercase names while preserving intentional casing", () => {
    expect(titleCaseCustomerName("rahul chobay")).toBe("Rahul Chobay");
    expect(titleCaseCustomerName("rahul  chobay")).toBe("Rahul Chobay");
    expect(titleCaseCustomerName("  rahul chobay ")).toBe("Rahul Chobay");
    expect(titleCaseCustomerName("")).toBe("");
    expect(titleCaseCustomerName("MC Gupta")).toBe("MC Gupta");
    expect(titleCaseCustomerName("SK Traders")).toBe("SK Traders");
    expect(titleCaseCustomerName("McDonald")).toBe("McDonald");
    expect(titleCaseCustomerName("deepak k. yadav")).toBe("Deepak K. Yadav");
  });

  test("rows loaded from the server display title-cased without any DB write", () => {
    expect(normalizeCustomerRow({
      id: "cust-1",
      name: "rahul chobay",
      phone: "9876543210",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    }).name).toBe("Rahul Chobay");
  });

  test("names entered via the customer form are stored title-cased", () => {
    const db = database();
    db.customers = [];
    const result = applyCustomerWithSitesSave(db, {
      customer: { name: "rahul chobay", phone: "9123456789" },
    }, options);
    expect(result.db.customers[0].name).toBe("Rahul Chobay");
  });
});

describe("Work Required budget", () => {
  const draft = (budget: string): CustomerWorkRequiredDraft => ({
    id: "work-budget",
    existing: false,
    siteId: "site-1",
    title: "Modular Kitchen",
    categoryId: "fc2",
    subcategoryIds: ["fc2_kit"],
    workTypeIds: [],
    areaIds: [],
    description: "",
    priority: "medium",
    budget,
  });

  test("parses blank, invalid, or negative budgets as empty", () => {
    expect(workRequiredBudgetValue("")).toBeUndefined();
    expect(workRequiredBudgetValue("  ")).toBeUndefined();
    expect(workRequiredBudgetValue("abc")).toBeUndefined();
    expect(workRequiredBudgetValue("-5")).toBeUndefined();
    expect(workRequiredBudgetValue("150000")).toBe(150000);
  });

  test("carries the budget through the save bundle into the Work Required row", () => {
    const db = database();
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { name: "Existing Customer" },
      workRequired: [workRequiredPayload(draft("250000"))],
    }, options);
    expect(result.db.workRequired[0].budget).toBe(250000);
    expect(result.workRequiredChanges[0].after.budget).toBe(250000);
  });

  test("registers a budget-only edit on an existing Work Required, including clearing it", () => {
    const db = database();
    db.workRequired = [{
      id: "work-budget",
      customer_id: "customer-1",
      site_id: "site-1",
      title: "Modular Kitchen",
      work_category_id: "fc2",
      work_subcategory_ids: ["fc2_kit"],
      area_ids: [],
      status: "new",
      priority: "medium",
      budget: 100000,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    }];
    const raised = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { name: "Existing Customer" },
      workRequired: [workRequiredPayload({ ...draft("150000"), existing: true })],
    }, options);
    expect(raised.workRequiredChanges).toHaveLength(1);
    expect(raised.db.workRequired[0].budget).toBe(150000);

    const cleared = applyCustomerWithSitesSave(raised.db, {
      customerId: "customer-1",
      customer: { name: "Existing Customer" },
      workRequired: [workRequiredPayload({ ...draft(""), existing: true })],
    }, options);
    expect(cleared.workRequiredChanges).toHaveLength(1);
    expect(cleared.db.workRequired[0].budget).toBeUndefined();
  });

  test("loads an existing budget back into the form draft", () => {
    const work = { id: "w1", customer_id: "c1", site_id: "s1", title: "T", area_ids: [], status: "new" as const, priority: "medium" as const, created_at: "", updated_at: "" };
    expect(draftForWorkRequired({ ...work, budget: 125000 }).budget).toBe("125000");
    expect(draftForWorkRequired(work).budget).toBe("");
  });
});

describe("customer identity payload", () => {
  const baseDraft: CustomerDraft = {
    name: "New Customer",
    phone: "9123456789",
    whatsapp: "",
    alternatePhone: "",
    email: "",
    notes: "",
    referralQuery: "",
    referralLegacyName: "",
    referralSelected: null,
  };

  test("maps only non-empty identity fields into the save payload", () => {
    expect(customerPayload(baseDraft).whatsapp).toBeUndefined();
    expect(customerPayload(baseDraft).alternate_phone).toBeUndefined();
    expect(customerPayload(baseDraft).email).toBeUndefined();
    expect(customerPayload({ ...baseDraft, whatsapp: "9123456789", alternatePhone: "9988776655", email: "new@example.com" }))
      .toMatchObject({ whatsapp: "9123456789", alternate_phone: "9988776655", email: "new@example.com" });
  });

  test("blocks a save on an email, WhatsApp, or alternate-phone collision", () => {
    const db = database();
    db.customers[0].email = "existing@example.com";
    db.customers[0].whatsapp = "9876501933";
    db.customers[0].alternate_phone = "+91 9123409876";
    for (const candidate of [
      { name: "Email collision", phone: "9123456789", email: "Existing@Example.com" },
      { name: "WhatsApp collision", phone: "9123456789", whatsapp: "+91 9876501933" },
      { name: "Alt phone collision", phone: "9123456789", alternate_phone: "09123409876" },
    ]) {
      expect(() => applyCustomerWithSitesSave(structuredClone(db), { customer: candidate }, options)).toThrow(/customer/i);
    }
  });

  test("does not self-block an unchanged identity when editing", () => {
    const db = database();
    db.customers[0].email = "existing@example.com";
    db.customers[0].whatsapp = "9876543210";
    db.customers[0].alternate_phone = "9988776655";
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
    }, options);
    expect(result.changed).toBe(false);
  });

  test("accepts a blank email but rejects one without @", () => {
    expect(validCustomerEmail("")).toBe(true);
    expect(validCustomerEmail("  ")).toBe(true);
    expect(validCustomerEmail("owner@urban.test")).toBe(true);
    expect(validCustomerEmail("owner-at-urban.test")).toBe(false);
  });
});

describe("canonical customer and Sites save", () => {
  test("creates a customer and first Site atomically", () => {
    const db = database();
    db.customers = [];
    db.sites = [];
    const result = applyCustomerWithSitesSave(db, {
      customer: {
        name: "New Customer",
        phone: "9123456789",
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

  test("creates a customer, Site, and Area atomically", () => {
    const db = database();
    db.customers = [];
    db.sites = [];
    db.areas = [];
    const result = applyCustomerWithSitesSave(db, {
      customer: { name: "New Customer", phone: "9123456789", status: "active" },
      sites: [{ id: "site-new", name: "New Residence", site_type: "villa", stage: "enquiry" }],
      areas: [{ id: "area-new", site_id: "site-new", name: "Living Room", area_type: "living_room" }],
    }, options);

    expect(result.siteIds).toEqual(["site-new"]);
    expect(result.areaIds).toEqual(["area-new"]);
    expect(result.db.areas.find((area) => area.id === "area-new")).toMatchObject({
      site_id: "site-new",
      name: "Living Room",
      area_type: "living_room",
      stage: "unmeasured",
    });
    expect(result.areaChanges[0].kind).toBe("create");
  });

  test("creates Customer, Site, Area, and Work Required in one atomic bundle", () => {
    const db = database();
    db.customers = [];
    db.sites = [];
    db.areas = [];
    db.workRequired = [];
    const result = applyCustomerWithSitesSave(db, {
      customer: { name: "New Customer", phone: "9123456789", status: "active" },
      sites: [{ id: "site-new", name: "New Residence", site_type: "villa", stage: "enquiry" }],
      areas: [{ id: "area-new", site_id: "site-new", name: "Kitchen", area_type: "kitchen", notes: "First floor" }],
      workRequired: [{
        id: "work-new",
        site_id: "site-new",
        title: "Modular Kitchen",
        work_category_id: "fc2",
        work_subcategory_ids: ["fc2_kit"],
        area_ids: ["area-new"],
        description: "Use moisture-resistant carcass material.",
        priority: "high",
      }],
    }, options);

    expect(result.workRequiredIds).toEqual(["work-new"]);
    expect(result.db.workRequired.find((work) => work.id === "work-new")).toMatchObject({
      customer_id: "cust-created",
      site_id: "site-new",
      title: "Modular Kitchen",
      area_ids: ["area-new"],
      description: "Use moisture-resistant carcass material.",
    });
    expect(result.workRequiredChanges[0].kind).toBe("create");
  });

  test("stores several subcategories on one Work Required", () => {
    const db = database();
    db.workRequired = [];
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { name: "Existing Customer" },
      workRequired: [{
        id: "work-multi",
        site_id: "site-1",
        title: "PVC False Ceiling / Grid False Ceiling / Gypsum False Ceiling",
        work_category_id: "fc",
        work_subcategory_ids: ["fc_pvc", "fc_grid", "fc_gyp"],
        area_ids: [],
      }],
    }, options);

    expect(result.db.workRequired).toHaveLength(1);
    expect(result.db.workRequired[0].work_subcategory_ids).toEqual(["fc_pvc", "fc_grid", "fc_gyp"]);
  });

  test("persists selected work types alongside the subcategories", () => {
    const db = database();
    db.workRequired = [];
    const subcategory = db.master.workSubcategories.find((row) => row.id === "fc2_kit")!;
    subcategory.work_types = [
      { id: "wt-fc2_kit-standard", name: "Standard", unit_id: "rft" },
      { id: "wt-fc2_kit-premium", name: "Premium", unit_id: "rft" },
      { id: "wt-fc2_kit-luxury", name: "Luxury", unit_id: "rft" },
    ];
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { name: "Existing Customer" },
      workRequired: [{
        id: "work-wt",
        site_id: "site-1",
        title: "Kitchen Cabinets (Modular)",
        work_category_id: "fc2",
        work_subcategory_ids: ["fc2_kit"],
        work_type_ids: ["wt-fc2_kit-premium", "wt-fc2_kit-luxury"],
        area_ids: [],
      }],
    }, options);

    expect(result.db.workRequired).toHaveLength(1);
    expect(result.db.workRequired[0].work_type_ids).toEqual(["wt-fc2_kit-premium", "wt-fc2_kit-luxury"]);
    expect(result.workRequiredChanges[0].kind).toBe("create");
  });

  test("rejects a work type outside the selected subcategories", () => {
    const db = database();
    db.workRequired = [];
    expect(() => applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { name: "Existing Customer" },
      workRequired: [{
        id: "work-wt-bad",
        site_id: "site-1",
        title: "Kitchen Cabinets (Modular)",
        work_category_id: "fc2",
        work_subcategory_ids: ["fc2_kit"],
        work_type_ids: ["wt-fc_pvc-standard"],
        area_ids: [],
      }],
    }, options)).toThrow(/work type/);
  });

  test("maps new Work Required to the customer's sole Site", () => {
    const db = database();
    db.workRequired = [];
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { name: "Existing Customer" },
      workRequired: [{
        id: "work-customer",
        site_id: "",
        title: "Modular Kitchen",
        work_category_id: "fc2",
        work_subcategory_ids: ["fc2_kit"],
        area_ids: [],
      }],
    }, options);

    expect(result.db.workRequired.find((work) => work.id === "work-customer")).toMatchObject({
      customer_id: "customer-1",
      site_id: "site-1",
      area_ids: [],
    });
  });

  test("keeps customer-level Areas and Work Required together, then maps both to the first Site", () => {
    const db = database();
    db.sites = [];
    db.areas = [];
    db.workRequired = [];

    const customerLevel = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { name: "Existing Customer" },
      areas: [{ id: "area-customer", site_id: "", name: "Kitchen", area_type: "kitchen" }],
      workRequired: [{
        id: "work-customer",
        site_id: "",
        title: "Modular Kitchen",
        work_category_id: "fc2",
        work_subcategory_ids: ["fc2_kit"],
        area_ids: ["area-customer"],
      }],
    }, options);

    expect(customerLevel.db.areas[0].site_id).toBe("");
    expect(customerLevel.db.workRequired[0]).toMatchObject({ site_id: "", area_ids: ["area-customer"] });
    expect(validateBusinessData(customerLevel.db).filter((issue) => issue.includes("area-customer") || issue.includes("work-customer"))).toEqual([]);

    const linked = applyCustomerWithSitesSave(customerLevel.db, {
      customerId: "customer-1",
      customer: { name: "Existing Customer" },
      sites: [{ id: "site-first", name: "First Site", site_type: "apartment" }],
    }, options);

    expect(linked.db.areas.find((area) => area.id === "area-customer")?.site_id).toBe("site-first");
    expect(linked.db.workRequired.find((work) => work.id === "work-customer")?.site_id).toBe("site-first");
    expect(linked.areaChanges).toHaveLength(1);
    expect(linked.workRequiredChanges).toHaveLength(1);
  });

  test("updates an existing Work Required without resetting lifecycle data", () => {
    const db = database();
    db.areas = [{
      id: "area-existing",
      site_id: "site-1",
      name: "Kitchen",
      area_type: "kitchen",
      stage: "measured",
      unit: "ft",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    }];
    db.workRequired = [{
      id: "work-existing",
      customer_id: "customer-1",
      site_id: "site-1",
      title: "Old title",
      work_category_id: "fc2",
      work_subcategory_ids: ["fc2_kit"],
      area_ids: ["area-existing"],
      description: "Keep lifecycle context",
      structured_items: [{ id: "line-1", title: "Existing line", quantity: 1, unit_id: "sqft", rate: 10, amount: 10 }],
      status: "quotation_in_progress",
      source: "site-visit",
      priority: "medium",
      budget: 45000,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    }];

    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{ ...db.sites[0] }],
      areas: [{ ...db.areas[0] }],
      workRequired: [{
        id: "work-existing",
        site_id: "site-1",
        title: "Modular Kitchen",
        work_category_id: "fc2",
        work_subcategory_ids: ["fc2_kit"],
        area_ids: ["area-existing"],
        description: "Updated scope notes",
        priority: "high",
      }],
    }, options);

    expect(result.workRequiredChanges).toHaveLength(1);
    expect(result.workRequiredChanges[0]).toMatchObject({ kind: "update", before: { id: "work-existing", title: "Old title" } });
    expect(result.db.workRequired[0]).toMatchObject({
      title: "Modular Kitchen",
      description: "Updated scope notes",
      status: "quotation_in_progress",
      source: "site-visit",
      budget: 45000,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: options.now,
    });
    expect(result.db.workRequired[0].structured_items).toHaveLength(1);
  });

  test("rejects moving an existing Work Required to another Site", () => {
    const db = database();
    db.sites.push({ ...db.sites[0], id: "site-2", name: "Second Site" });
    db.areas = [{ id: "area-2", site_id: "site-2", name: "Office", area_type: "office_cabin", stage: "unmeasured", unit: "ft", created_at: options.now, updated_at: options.now }];
    db.workRequired = [{
      id: "work-existing",
      customer_id: "customer-1",
      site_id: "site-1",
      title: "Existing work",
      work_category_id: "fc2",
      work_subcategory_ids: ["fc2_kit"],
      area_ids: [],
      status: "new",
      priority: "medium",
      created_at: options.now,
      updated_at: options.now,
    }];

    expect(() => applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: db.sites.map((site) => ({ ...site })),
      areas: [{ ...db.areas[0] }],
      workRequired: [{
        id: "work-existing",
        site_id: "site-2",
        title: "Existing work",
        work_category_id: "fc2",
        work_subcategory_ids: ["fc2_kit"],
        area_ids: ["area-2"],
      }],
    }, options)).toThrow(/cannot be moved to another Site/i);
  });

  test("rejects an Area linked outside the saved Customer's Sites", () => {
    const db = database();
    db.sites.push({ ...db.sites[0], id: "site-other", customer_id: "customer-other", name: "Other Site" });
    expect(() => applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{ ...db.sites[0] }],
      areas: [{ id: "area-new", site_id: "site-other", name: "Office", area_type: "office_cabin" }],
    }, options)).toThrow(/Customer's Sites/i);
  });

  test("preserves an existing Area stage when the form edits its details", () => {
    const db = database();
    db.areas = [{
      id: "area-existing",
      site_id: "site-1",
      name: "Living Room",
      area_type: "living_room",
      stage: "measured",
      unit: "ft",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    }];
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{ ...db.sites[0] }],
      areas: [{ id: "area-existing", site_id: "site-1", name: "Main Living Room" }],
    }, options);

    expect(result.db.areas[0]).toMatchObject({ name: "Main Living Room", stage: "measured" });
  });

  test("archives an existing Area removed from the customer form", () => {
    const db = database();
    db.areas = [{
      id: "area-existing",
      site_id: "site-1",
      name: "Pantry",
      area_type: "pantry",
      stage: "unmeasured",
      unit: "ft",
      created_at: options.now,
      updated_at: options.now,
    }];
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { name: "Existing Customer" },
      areas: [{
        id: "area-existing",
        site_id: "site-1",
        is_archived: true,
        archived_by: "Rahul Chauhan",
        archive_reason: "Removed from customer form",
      }],
    }, options);

    expect(result.db.areas[0]).toMatchObject({
      is_archived: true,
      archived_by: "Rahul Chauhan",
      archive_reason: "Removed from customer form",
    });
  });

  test("creates a customer without a Site", () => {
    const db = database();
    db.customers = [];
    db.sites = [];
    const result = applyCustomerWithSitesSave(db, {
      customer: {
        name: "Customer Without Site",
        phone: "9123456789",
        status: "active",
      },
      sites: [],
    }, options);
    expect(result.customerId).toBe("cust-created");
    expect(result.siteIds).toEqual([]);
    expect(result.db.sites).toEqual([]);
  });

  test("updates only changed customer and Site values", () => {
    const db = database();
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: {
        name: "Existing Customer",
        phone: "9876543210",
        whatsapp: "9876543210",
        status: "active",
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

  test("archives an existing Site with a required reason", () => {
    const db = database();
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{
        ...db.sites[0],
        is_archived: true,
        archived_at: options.now,
        archived_by: "Owner",
        archive_reason: "Duplicate property record",
        stage: "cancelled",
      }],
    }, options);
    expect(result.siteChanges).toHaveLength(1);
    expect(result.siteChanges[0].kind).toBe("update");
    expect(result.siteChanges[0].archived).toBe(true);
    expect(result.db.sites[0].is_archived).toBe(true);
    expect(result.db.sites[0].archive_reason).toBe("Duplicate property record");
    expect(result.db.sites[0].archived_by).toBe("Owner");
    expect(result.db.sites[0].stage).toBe("cancelled");
  });

  test("rejects archiving a Site without a reason", () => {
    const db = database();
    expect(() => applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{ ...db.sites[0], is_archived: true, archive_reason: "" }],
    }, options)).toThrow(/archive reason/i);
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


  test("detaches a direct Customer file in the same save", () => {
    const db = database();
    db.entityFileAttachments.push({
      ...db.entityFileAttachments[0],
      id: "attachment-customer",
      entity_type: "customer",
      entity_id: "customer-1",
      entity_label: "Existing Customer",
      role: "document",
    });
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{ ...db.sites[0] }],
      detachAttachmentIds: ["attachment-customer"],
    }, options);
    expect(result.db.entityFileAttachments.some((row) => row.id === "attachment-customer")).toBe(false);
    expect(result.detachedAttachmentIds).toEqual(["attachment-customer"]);
  });

  test("rejects detaching a direct Customer file owned by another Customer", () => {
    const db = database();
    db.entityFileAttachments.push({
      ...db.entityFileAttachments[0],
      id: "attachment-other-customer",
      entity_type: "customer",
      entity_id: "customer-2",
      entity_label: "Other Customer",
      role: "document",
    });
    expect(() => applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { ...db.customers[0] },
      sites: [{ ...db.sites[0] }],
      detachAttachmentIds: ["attachment-other-customer"],
    }, options)).toThrow(/another Customer/i);
  });

  test("rejects duplicate customer identity", () => {
    const db = database();
    expect(() => applyCustomerWithSitesSave(db, {
      customer: { name: "Duplicate", phone: "9876543210" },
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
    db.customers[0].alternate_phone = "9988776655";
    db.customers[0].status = "inactive";
    db.sites[0].building_name = "Existing Tower";
    db.sites[0].notes = "Keep this note";
    const result = applyCustomerWithSitesSave(db, {
      customerId: "customer-1",
      customer: { name: "Renamed Customer" },
      sites: [{ id: "site-1", name: "Renamed Site" }],
    }, options);
    expect(result.db.customers[0].email).toBe("existing@example.com");
    expect(result.db.customers[0].alternate_phone).toBe("9988776655");
    expect(result.db.customers[0].status).toBe("inactive");
    expect(result.db.sites[0].building_name).toBe("Existing Tower");
    expect(result.db.sites[0].stage).toBe("planning");
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
