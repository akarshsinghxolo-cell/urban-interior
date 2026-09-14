import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Customer Site / Area / Work Required ownership", () => {
  test("Customer portfolio presents Work Required grouped by its Customer Site Areas", async () => {
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    expect(portfolio).toContain("siteAreas");
    expect(portfolio).toContain("work.area_ids.map");
    expect(portfolio).toContain("workRequiredDisplayTitle");
    expect(portfolio).toContain("Capture detailed area");
  });

  test("advanced whole-Site detailed-area capture is implemented only once under Customer", async () => {
    const capture = await source("src/components/rdash/customer/CustomerWorkCaptureDialog.tsx");
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    expect(capture).toContain("seedDetailedAreaLines");
    expect(capture).toContain("captureStructuredWorkRequired");
    expect(capture).toContain("removedSelections");
    expect(capture).toContain("areaDims");
    expect(capture).toContain("CustomerAreaDimensionsFields");
    expect(portfolio).toContain("CustomerWorkCaptureDialog");
    expect(portfolio).not.toContain("captureStructuredWorkRequired");
    expect(portfolio).not.toContain("saveCustomerWithSites");
  });

  test("Customer portfolio and Site Execution are two launchers into one Customer-owned Site/Area/Work Required domain", async () => {
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    const siteExecution = await source("src/components/rdash/modules/SiteExecutionModule.tsx");
    const canonicalCreate = await source("src/components/rdash/customer/CustomerWorkRequiredDialog.tsx");

    expect(portfolio).toContain("WorkRequiredCreateDialog");
    expect(siteExecution).toContain('label: "Areas & Scope"');
    expect(siteExecution).toContain('label: "Scope Register"');
    expect(siteExecution).toContain("WorkRequiredCreateDialog");
    expect(siteExecution).toContain("CustomerWorkCaptureDialog");
    expect(siteExecution).not.toContain("const addArea = useRDashStore");
    expect(siteExecution).not.toContain("const addWorkRequired = useRDashStore");
    expect(canonicalCreate).toContain("addArea");
    expect(canonicalCreate).toContain("addWorkRequired");
  });
});
