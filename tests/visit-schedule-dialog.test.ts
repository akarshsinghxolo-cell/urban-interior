import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Schedule Visit uses customer-owned site and GPS context", () => {
  test("customer picker searches, sorts, filters, and asks for a site only when needed", async () => {
    const dialog = await source("src/components/rdash/CreateMenuCore.tsx");

    expect(dialog).toContain("VisitCustomerSitePicker");
    expect(dialog).toContain('aria-label="Search customers or sites"');
    expect(dialog).toContain('aria-label="Sort customers"');
    expect(dialog).toContain('aria-label="Filter customers"');
    expect(dialog).toContain("customerSites.length === 1");
    expect(dialog).toContain("customerSites.length > 1");
    expect(dialog).not.toContain('<Field label="Site *">');
  });

  test("redundant visit controls are replaced by notes and automatic GPS facts", async () => {
    const dialog = await source("src/components/rdash/CreateMenuCore.tsx");
    const visits = await source("src/lib/rdash/store/slices/visits.ts");
    const detail = await source("src/components/rdash/DetailPanel.tsx");

    for (const label of ["Geofence destination *", "Work Required (optional)", 'Field label="Visit type"', "Duration (minutes)"]) {
      expect(dialog).not.toContain(label);
    }
    expect(dialog).toContain('<Field label="Notes">');
    expect(dialog).toContain("notes: description.trim()");
    expect(dialog).toContain('location_target_type: "site"');
    expect(dialog).toContain("GPS check-in and check-out calculate the actual time spent on site");
    expect(visits).not.toContain("A Measurement Visit must be linked to the Work Required being measured.");
    expect(detail).toContain('Field label="GPS duration"');
  });
});

