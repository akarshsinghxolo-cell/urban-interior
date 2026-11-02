import { expect, test } from "@playwright/test";
import { COLLECTION_TO_TABLE, isSharedCollection } from "../../src/lib/rdash/shared-domain-storage";

test("site cards search, sort and filter, then open the selected site's complete workspace", async ({ page, request }, testInfo) => {
  const suffix = Date.now().toString(36);
  const customerId = `customer-site-layout-${suffix}`;
  const customerName = `QA Site Layout ${suffix}`;
  const now = new Date().toISOString();
  const insert = async (collection: string, rows: Array<Record<string, unknown>>) => {
    const response = await request.post(`http://127.0.0.1:3210/rest/v1/${COLLECTION_TO_TABLE[collection]}`, {
      data: rows.map((data) => ({ ...(isSharedCollection(collection) ? { collection } : {}), id: data.id, workspace_id: "default", revision: 1, updated_at: now, data })),
    });
    expect(response.ok()).toBe(true);
  };
  await insert("customers", [{ id: customerId, name: customerName, status: "active", created_at: now, updated_at: now }]);
  await insert("sites", [
    { id: `site-alpha-${suffix}`, name: "Alpha layout site", stage: "planning", created_at: "2026-01-01T00:00:00Z" },
    { id: `site-beta-${suffix}`, name: "Beta layout site", stage: "execution", created_at: "2026-02-01T00:00:00Z" },
  ].map((site) => ({ ...site, customer_id: customerId, site_type: "apartment", updated_at: now })));
  await insert("areas", [{ id: `area-alpha-${suffix}`, site_id: `site-alpha-${suffix}`, name: "Alpha living room", area_type: "living", stage: "unmeasured", created_at: now, updated_at: now }]);

  await page.setViewportSize({ width: 1202, height: 988 });
  await page.goto("/workspace/sites");
  const directory = page.getByRole("tabpanel", { name: "Sites & Execution", exact: true });
  await directory.getByRole("textbox", { name: "Search sites" }).fill(customerName);
  const alpha = directory.getByRole("button", { name: /^Alpha layout site/ });
  const beta = directory.getByRole("button", { name: /^Beta layout site/ });
  await expect(alpha).toBeVisible();
  await expect(beta).toBeVisible();
  await expect(directory.getByRole("button", { name: "Edit site profile" })).toHaveCount(0);
  await directory.getByLabel("Sort sites").selectOption("name-asc");
  let a = await alpha.boundingBox();
  let b = await beta.boundingBox();
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  expect(a!.x).toBeLessThan(b!.x);
  await directory.getByLabel("Sort sites").selectOption("newest");
  a = await alpha.boundingBox(); b = await beta.boundingBox();
  expect(b!.x).toBeLessThan(a!.x);
  await directory.getByLabel("Filter sites").selectOption("planning");
  await expect(alpha).toBeVisible();
  await expect(beta).toHaveCount(0);
  await directory.getByLabel("Filter sites").selectOption("all");
  await page.screenshot({ path: testInfo.outputPath("site-directory.png") });
  await alpha.click();
  const panel = page.getByRole("dialog", { name: "Record context panel" });
  await expect(panel.getByRole("heading", { name: "Alpha layout site", exact: true }).first()).toBeVisible();
  const panelBox = await panel.boundingBox();
  expect(panelBox!.width).toBeGreaterThanOrEqual(1202 * 0.75);
  await expect(panel.getByRole("heading", { name: "Site progression" })).toBeVisible();
  await panel.getByRole("button", { name: "Edit site profile", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit Customer and Sites", exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Customer name" })).toHaveValue(new RegExp(`^${customerName}$`, "i"));
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await panel.getByRole("button", { name: "Areas & Scope", exact: true }).click();
  await expect(panel.getByText("Alpha living room", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Commercial", exact: true }).click();
  await expect(panel.getByRole("button", { name: "New quotation", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "New quotation", exact: true }).click();
  const quoteDialog = page.getByRole("dialog", { name: "Work wise quotation", exact: true });
  await expect(quoteDialog).toBeVisible();
  await quoteDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("site-workspace.png") });
  await panel.getByRole("button", { name: "Close panel" }).click();
  await directory.getByRole("textbox", { name: "Search sites" }).fill(customerName);
  await beta.click();
  await expect(panel.getByRole("heading", { name: "Beta layout site", exact: true }).first()).toBeVisible();
  await panel.getByRole("button", { name: "Areas & Scope", exact: true }).click();
  await expect(panel.getByText("Alpha living room", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
