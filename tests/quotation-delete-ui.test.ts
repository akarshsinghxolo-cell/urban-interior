import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const detailPanel = readFileSync("src/components/rdash/DetailPanel.tsx", "utf8");
const recordActions = readFileSync("src/components/rdash/recordActions.tsx", "utf8");
const helpers = readFileSync("src/lib/rdash/store/quotations-helpers.ts", "utf8");

describe("quotation delete UI guard", () => {
  test("both quotation action surfaces use the shared permanent-delete rule", () => {
    expect(detailPanel).toContain("canPermanentlyDeleteQuotation(q)");
    expect(recordActions).toContain("canPermanentlyDeleteQuotation(quote)");
  });

  test("the shared rule retains commercial history and revision drafts", () => {
    expect(helpers).toContain('quotation.status === "draft"');
    expect(helpers).toContain("quotation.revision_no === 0");
    expect(helpers).toContain("!quotation.parent_quotation_id");
    expect(helpers).toContain("!quotation.superseded_by_quotation_id");
    expect(helpers).toContain("!quotation.accepted_at");
  });

  test("legacy broad delete eligibility is absent", () => {
    expect(recordActions).not.toContain('quote.status !== "accepted" && quote.work_order_ids.length === 0');
    expect(detailPanel).not.toContain('q.status !== "accepted" && q.work_order_ids.length === 0 && (<Button size="sm" variant="destructive"');
  });
});
