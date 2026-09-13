import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Customer scope ownership", () => {
  test("Customer Desk no longer owns an independent area/work capture state machine", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    expect(desk).not.toContain("scopeAreaId");
    expect(desk).not.toContain("StructuredWorkRequiredDialog");
    expect(desk).not.toContain("Capture detailed area");
  });

  test("Customer Desk routes site-level work to the canonical Site Execution surface", async () => {
    const desk = await source("src/components/rdash/modules/CustomerDesk.tsx");
    const siteExecution = await source("src/components/rdash/modules/SiteExecutionModule.tsx");

    expect(desk).toContain('setActiveModule("siteExecution")');
    expect(desk).toContain('openDetail("site", site.id)');
    expect(siteExecution).toContain('label: "Areas & Scope"');
    expect(siteExecution).toContain('label: "Scope Register"');
    expect(siteExecution).toContain("WorkRequiredCreateDialog");
  });
});
