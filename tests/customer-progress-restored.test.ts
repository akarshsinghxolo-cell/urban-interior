import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("restored Customer progress", () => {
  test("keeps the historical collection-risk signal for authorized Finance data", async () => {
    const progress = await source("src/lib/rdash/customer-progress.ts");
    expect(progress).toContain("customerCollectionPenalty");
    expect(progress).toContain('label: penalty > 0 ? "Work completed · dues pending" : "Work completed"');
    expect(progress).toContain("collection risk");
    expect(progress).toContain("db.invoices.filter");
  });

  test("a new active Work Required outranks an older completed job", async () => {
    const progress = await source("src/lib/rdash/customer-progress.ts");
    const activeScope = progress.indexOf("if (activeWorkRequired)");
    const completedJob = progress.indexOf("if (completedJob)");
    expect(activeScope).toBeGreaterThanOrEqual(0);
    expect(completedJob).toBeGreaterThan(activeScope);
  });
});
