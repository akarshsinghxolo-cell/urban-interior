import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Customer scope ownership", () => {
  test("Customer Desk exposes the familiar capture flow without inventing a second data model", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    const capture = await source("src/components/rdash/CustomerWorkCaptureDialog.tsx");

    expect(desk).toContain("WorkRequiredCreateDialog");
    expect(desk).toContain("CustomerWorkCaptureDialog");
    expect(desk).toContain("Capture detailed area");
    expect(capture).toContain("captureStructuredWorkRequired");
    expect(capture).toContain("areaDims: changedAreaDimensions");
    expect(capture).not.toContain("saveCustomerWithSites");
  });

  test("Customer Desk and Site Execution are two entry points into the same Site/Area/Work Required domain", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    const capture = await source("src/components/rdash/CustomerWorkCaptureDialog.tsx");
    const siteExecution = await source("src/components/rdash/modules/SiteExecutionModule.tsx");

    expect(desk).toContain('setActiveModule("siteExecution")');
    expect(desk).toContain('openDetail("site", site.id)');
    expect(capture).toContain("db.workRequired.filter((row) => row.site_id === site.id)");
    expect(capture).toContain("areas.filter((row) => !row.is_archived)");
    expect(siteExecution).toContain('label: "Areas & Scope"');
    expect(siteExecution).toContain('label: "Scope Register"');
    expect(siteExecution).toContain("WorkRequiredCreateDialog");
  });
});
