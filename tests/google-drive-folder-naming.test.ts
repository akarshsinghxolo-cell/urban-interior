import { describe, expect, test } from "bun:test";
import { destinationSegments } from "@/lib/rdash/server/drive-folder-hierarchy";
import type { RDashDatabase } from "@/lib/rdash/types";

function namingFixture(): RDashDatabase {
  return {
    customers: [{
      id: "customer-internal-4b0e89c1",
      name: "Rahul Verma",
      phone: "9999999999",
      customer_segments: ["service_customer"],
      status: "active",
      created_at: "2026-08-07T00:00:00.000Z",
      updated_at: "2026-08-07T00:00:00.000Z",
    }],
    sites: [{
      id: "site-internal-739a2b11",
      customer_id: "customer-internal-4b0e89c1",
      name: "Gomti Nagar Residence",
      site_type: "villa",
      stage: "execution",
      locality: "Vibhuti Khand",
      city: "Lucknow",
      created_at: "2026-08-07T00:00:00.000Z",
      updated_at: "2026-08-07T00:00:00.000Z",
    }],
    workOrders: [{
      id: "work-order-internal-80f2ce91",
      work_order_no: "WO-2026-041",
      customer_id: "customer-internal-4b0e89c1",
      accepted_scope_ids: [],
      work_required_ids: [],
      quotation_ids: [],
      site_id: "site-internal-739a2b11",
      area_ids: [],
      title: "False Ceiling - Living Room",
      status: "in_progress",
      start_date: "2026-08-07",
      value: 50000,
      progress: 10,
      created_at: "2026-08-07T00:00:00.000Z",
      updated_at: "2026-08-07T00:00:00.000Z",
    }],
    purchaseOrders: [{
      id: "purchase-order-internal-eec19321",
      po_no: "PO-2026-118",
      site_id: "site-internal-739a2b11",
      vendor_id: "vendor-internal-d51f9981",
      vendor_name: "Shree Plywood",
      status: "sent",
      items: [],
      subtotal: 10000,
      tax_amount: 1800,
      total_amount: 11800,
      created_at: "2026-08-07T00:00:00.000Z",
      updated_at: "2026-08-07T00:00:00.000Z",
    }],
    grns: [],
    vendorBills: [],
    master: {
      vendors: [{
        id: "vendor-internal-d51f9981",
        name: "Shree Plywood",
        city: "Lucknow",
      }],
      contractors: [{
        id: "contractor-internal-91bdab41",
        name: "Ravi Interiors",
        categories: ["False Ceiling"],
      }],
      staff: [{
        id: "staff-internal-049afb91",
        name: "Neha Singh",
      }],
    },
  } as unknown as RDashDatabase;
}

function names(segments: ReturnType<typeof destinationSegments>) {
  return segments.map((segment) => segment.name);
}

describe("human-readable Google Drive folder names", () => {
  test("uses app-entered Customer and Site names without technical IDs", () => {
    const db = namingFixture();
    expect(names(destinationSegments(db, "customer_document", "customer", "customer-internal-4b0e89c1")))
      .toEqual(["Customers", "Rahul Verma", "Customer Documents", "General"]);
    expect(names(destinationSegments(db, "site_evidence", "site", "site-internal-739a2b11")))
      .toEqual(["Customers", "Rahul Verma", "Gomti Nagar Residence - Vibhuti Khand", "Site Evidence"]);
  });

  test("uses human business labels for Work Orders and Purchase Orders", () => {
    const db = namingFixture();
    expect(names(destinationSegments(db, "work_order_document", "workOrder", "work-order-internal-80f2ce91")))
      .toEqual([
        "Customers",
        "Rahul Verma",
        "Gomti Nagar Residence - Vibhuti Khand",
        "False Ceiling - Living Room - WO-2026-041",
        "Documents",
      ]);
    expect(names(destinationSegments(db, "purchase_order", "purchase_order", "purchase-order-internal-eec19321")))
      .toEqual(["Procurement", "PO-2026-118 - Shree Plywood", "Purchase Order"]);
  });

  test("uses Vendor, Contractor and Staff names while IDs remain hidden in canonical keys", () => {
    const db = namingFixture();
    const vendor = destinationSegments(db, "vendor_document", "vendor", "vendor-internal-d51f9981");
    const contractor = destinationSegments(db, "contractor_document", "contractor", "contractor-internal-91bdab41");
    const staff = destinationSegments(db, "staff_document", "staff", "staff-internal-049afb91");

    expect(names(vendor)).toEqual(["Vendors", "Shree Plywood - Lucknow", "Business Documents"]);
    expect(names(contractor)).toEqual(["Contractors", "Ravi Interiors - False Ceiling", "Business Documents"]);
    expect(names(staff)).toEqual(["Staff", "Neha Singh", "Documents"]);

    expect(vendor[1]?.key).toBe("vendor:vendor-internal-d51f9981");
    expect(contractor[1]?.key).toBe("contractor:contractor-internal-91bdab41");
    expect(staff[1]?.key).toBe("staff:staff-internal-049afb91");

    for (const segment of [...vendor, ...contractor, ...staff]) {
      expect(segment.name).not.toMatch(/\b(?:CUST|SITE|VEND|CONT|STAFF)-/);
      expect(segment.name).not.toContain("internal-");
    }
  });

  test("uses a normal System folder name for internal app operations", () => {
    const db = namingFixture();
    expect(names(destinationSegments(db, "import_source", "general", "import"))).toEqual(["System", "Imports"]);
    expect(names(destinationSegments(db, "diagnostic", "general", "diagnostic"))).toEqual(["System", "Diagnostics"]);
  });
});
