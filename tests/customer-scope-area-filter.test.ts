import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Customer scope ownership", () => {
  test("restores the requested area-chip filter in the Customer portfolio", async () => {
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    expect(portfolio).toContain("scopeAreaId");
    expect(portfolio).toContain("Show only work required in");
    expect(portfolio).toContain("No Work Required in the selected area");
    expect(portfolio).toContain("workRequiredDisplayTitle");
  });

  test("restores the advanced whole-site detailed-area capture without a second data model", async () => {
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    expect(portfolio).toContain("StructuredWorkRequiredDialog");
    expect(portfolio).toContain("Capture detailed area");
    expect(portfolio).toContain("seedDetailedAreaLines");
    expect(portfolio).toContain("captureStructuredWorkRequired");
    expect(portfolio).toContain("removedSelections");
    expect(portfolio).toContain("areaDims");
    expect(portfolio).not.toContain("saveCustomerWithSites");
  });

  test("Customer portfolio and Site Execution remain two entry points into the same Site/Area/Work Required domain", async () => {
    const portfolio = await source("src/components/rdash/modules/CustomerDeskPortfolio.tsx");
    const siteExecution = await source("src/components/rdash/modules/SiteExecutionModule.tsx");

    expect(portfolio).toContain("WorkRequiredCreateDialog");
    expect(portfolio).toContain("db.workRequired.filter");
    expect(portfolio).toContain("db.areas.filter");
    expect(siteExecution).toContain('label: "Areas & Scope"');
    expect(siteExecution).toContain('label: "Scope Register"');
    expect(siteExecution).toContain("WorkRequiredCreateDialog");
  });
});
