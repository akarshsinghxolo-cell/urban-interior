import { expect, test } from "@playwright/test";

test("finance shows a traceable confirmed cash list and truthful balance wording on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workspace/finance");
    const panel = page.locator('main [role="tabpanel"]:not([hidden])');
    await expect(panel.getByRole("heading", { name: "Finance Control", exact: true })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "7-Day Cash Flow", exact: true })).toBeVisible();
    const details = panel.locator("details").filter({ hasText: "Trace these totals" });
    await details.locator("summary").click();
    await expect(details).toContainText("not a reconciled cash/bank balance");
    await expect(details).toContainText("recorded transactions");
    expect(await details.evaluate(el => el.getBoundingClientRect().right <= innerWidth + 1)).toBe(true);
    await page.goto("/workspace");
    await expect(page.getByRole("region", { name: "Cash flow forecast" })).toContainText("Recorded net is not your bank balance");
});
