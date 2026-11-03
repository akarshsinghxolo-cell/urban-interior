import { expect, test } from "@playwright/test";
import { COLLECTION_TO_TABLE, isSharedCollection } from "../../src/lib/rdash/shared-domain-storage";

test("customer pipeline derives progress and material options use the real scoped catalogue", async ({ page, request }, testInfo) => {
  const suffix = Date.now().toString(36);
  const id = `sales-qa-${suffix}`;
  const now = new Date().toISOString();
  const insert = async (collection: string, data: Record<string, unknown>) => {
    const response = await request.post(`http://127.0.0.1:3210/rest/v1/${COLLECTION_TO_TABLE[collection]}`, {
      data: { ...(isSharedCollection(collection) ? { collection } : {}), id: data.id, workspace_id: "default", revision: 1, updated_at: now, data },
    });
    expect(response.ok()).toBe(true);
  };
  await insert("customers", { id, name: `QA Sales ${suffix}`, status: "active", created_at: now, updated_at: now });
  await insert("sites", { id: `${id}-site`, customer_id: id, name: "QA sales site", site_type: "apartment", stage: "enquiry", created_at: now, updated_at: now });
  await insert("master.workCategories", { id: `${id}-cat`, name: "QA finishes" });
  await insert("master.workSubcategories", { id: `${id}-sub`, category_id: `${id}-cat`, name: "QA wall finish", unit_id: "sqft", work_types: [{ id: `${id}-wt`, name: "Standard", unit_id: "sqft" }] });
  await insert("master.articles", { id: `${id}-article`, name: "QA actual catalogue panel", unit_id: "sqft" });
  await insert("master.subcategoryArticleMap", { id: `${id}-map`, work_required_id: `${id}-sub`, article_id: `${id}-article` });
  await insert("workRequired", { id: `${id}-work`, customer_id: id, site_id: `${id}-site`, title: "QA wall finish · Standard", status: "new", work_subcategory_ids: [`${id}-sub`], work_type_ids: [`${id}-wt`], area_ids: [], priority: "medium", created_at: now, updated_at: now });
  await insert("quotations", { id: `${id}-quote`, customer_id: id, site_id: `${id}-site`, quotation_no: "QA-AUTO-QUOTE", title: "QA quotation", status: "sent", coverage: [{ id: `${id}-coverage`, work_required_id: `${id}-work`, area_ids: [], measurement_revision_ids: [], coverage_label: "QA scope", status: "proposed" }], items: [], subtotal: 0, total: 0, created_at: now, updated_at: now });

  await page.goto("/workspace/customers");
  const desk = page.getByRole("tabpanel", { name: "Customer Desk", exact: true });
  await desk.getByLabel("Search customers").fill(`QA Sales ${suffix}`);
  await desk.getByRole("button", { name: "Sales pipeline", exact: true }).click();
  await desk.getByLabel("Filter sales stage").selectOption("Awaiting customer decision");
  const card = desk.locator(".contextEnabledRow").filter({ hasText: `QA Sales ${suffix}` });
  await expect(card).toContainText("Awaiting customer decision");
  await card.click();
  const panel = page.getByRole("dialog", { name: "Record context panel" });
  const pipeline = panel.getByRole("region", { name: "Customer sales pipeline" });
  await expect(pipeline.getByText("Active quotations: 1", { exact: true })).toBeVisible();
  await expect(pipeline.getByRole("button", { name: "QA-AUTO-QUOTE · sent" })).toBeVisible();
  await pipeline.getByRole("button", { name: "Put on hold", exact: true }).click();
  const decision = page.getByRole("dialog", { name: "Record sales decision", exact: true });
  await expect(decision.getByRole("button", { name: "Save decision" })).toBeDisabled();
  await decision.getByLabel("Sales decision reason").fill("Customer requested a review next week");
  await decision.getByRole("button", { name: "Save decision" }).click();
  await expect(pipeline.getByText("On hold", { exact: true })).toBeVisible();
  await pipeline.getByRole("button", { name: "Resume work", exact: true }).click();
  await decision.getByLabel("Sales decision reason").fill("Customer is ready to review the sent quotation");
  await decision.getByRole("button", { name: "Save decision" }).click();
  await expect(pipeline.getByText("Awaiting customer decision", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("customer-pipeline.png") });
  await panel.getByRole("button", { name: "Close panel" }).click();
  await desk.getByLabel("Filter sales stage").selectOption("all");
  await card.hover();
  await card.getByRole("button", { name: "Record actions" }).click();
  await page.getByRole("menuitem", { name: "Send material options", exact: true }).click();
  const materials = page.getByRole("dialog", { name: `Material options for QA Sales ${suffix}` });
  await expect(materials.getByRole("checkbox", { name: "QA actual catalogue panel", exact: true })).not.toBeChecked();
  await expect(materials.getByRole("button", { name: "Prepare share" })).toBeDisabled();
  await materials.getByRole("checkbox", { name: "QA actual catalogue panel", exact: true }).check();
  await expect(materials.getByLabel("Material message preview")).toContainText("QA wall finish: QA actual catalogue panel");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await materials.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("material-options-mobile.png") });
  await materials.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("master rate cards expose every field and action at desktop and mobile widths", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1202, height: 990 });
  await page.goto("/workspace/masters");
  const master = page.getByRole("tabpanel", { name: "Master Setup", exact: true });
  await expect(master.getByRole("button", { name: /^False Ceiling \d/ })).toBeVisible();
  if (!(await master.getByRole("button", { name: /^Gypsum False Ceiling \d/ }).isVisible())) await master.getByRole("button", { name: /^False Ceiling \d/ }).click();
  await master.getByRole("button", { name: /^Gypsum False Ceiling \d/ }).click();
  const row = master.locator(".work-type-rate-row").filter({ has: page.getByRole("textbox", { name: "Work type for Gypsum False Ceiling", exact: true }) }).first();
  for (const width of [1202, 390]) {
    await page.setViewportSize({ width, height: 990 });
    await expect(row.getByText("Labour rate", { exact: true })).toBeVisible();
    await expect(row.getByText("Total rate", { exact: true })).toBeVisible();
    const remove = row.getByRole("button", { name: /^Delete / });
    await remove.scrollIntoViewIfNeeded();
    const box = await remove.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`master-${width}.png`) });
  }
});
