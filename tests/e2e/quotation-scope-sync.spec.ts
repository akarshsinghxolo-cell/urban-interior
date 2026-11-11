import { expect, test } from "@playwright/test";
import { COLLECTION_TO_TABLE, isSharedCollection } from "../../src/lib/rdash/shared-domain-storage";

test("quotation can add new customer scope and keeps article suggestions visible", async ({ page, request }) => {
  const base = "http://127.0.0.1:3210/rest/v1";
  const suffix = Date.now().toString(36);
  const customerId = `cust-quote-scope-${suffix}`;
  const siteId = `site-quote-scope-${suffix}`;
  const areaId = `area-quote-scope-${suffix}`;
  const workId = `work-quote-scope-${suffix}`;
  const quoteId = `quote-scope-${suffix}`;
  const phone = `9${Date.now().toString().slice(-9)}`;
  const now = new Date().toISOString();
  const insert = async (collection: string, data: Record<string, unknown>) => {
    const table = COLLECTION_TO_TABLE[collection];
    const response = await request.post(`${base}/${table}`, {
      data: [{ ...(isSharedCollection(collection) ? { collection } : {}), id: data.id, workspace_id: "default", revision: 1, updated_at: now, data }],
    });
    expect(response.ok()).toBe(true);
  };

  const masterRows = await (await request.get(`${base}/entity_work_definitions?collection=eq.master.workSubcategories`)).json();
  const initialSubcategory = masterRows.find((row: any) => row.id === "fc_grid").data;
  const addedSubcategory = masterRows.find((row: any) => row.id === "fc_gyp").data;
  const initialWorkType = initialSubcategory.work_types[0];
  const addedWorkType = addedSubcategory.work_types[0];

  await insert("customers", { id: customerId, name: `QA Quotation Scope ${suffix}`, phone, status: "active", created_at: now, updated_at: now });
  await insert("sites", { id: siteId, customer_id: customerId, name: "QA Scope Site", site_type: "apartment", stage: "measured", created_at: now, updated_at: now });
  await insert("areas", { id: areaId, site_id: siteId, name: "Living Room", area_type: "living_room", stage: "measured", created_at: now, updated_at: now });
  await insert("workRequired", {
    id: workId,
    customer_id: customerId,
    site_id: siteId,
    title: `${initialSubcategory.name} · ${initialWorkType.name}`,
    area_ids: [areaId],
    work_subcategory_ids: [initialSubcategory.id],
    work_type_ids: [initialWorkType.id],
    status: "quotation_in_progress",
    priority: "medium",
    created_at: now,
    updated_at: now,
  });
  await insert("quotations", {
    id: quoteId,
    quotation_no: `QA-SCOPE-${suffix}`,
    customer_id: customerId,
    customer_name: `QA Quotation Scope ${suffix}`,
    site_id: siteId,
    title: "QA quotation scope sync",
    status: "draft",
    revision_no: 0,
    valid_until: now.slice(0, 10),
    coverage: [{ id: `coverage-${suffix}`, work_required_id: workId, area_ids: [areaId], measurement_revision_ids: [], coverage_label: "Living Room", status: "proposed" }],
    scope_lines: [],
    items: [],
    work_order_ids: [],
    payment_terms: [],
    subtotal: 0,
    tax_amount: 0,
    total_amount: 0,
    created_at: now,
    updated_at: now,
  });

  await page.goto(`/workspace/finance/quotations/${quoteId}`);
  const workTypeSelect = page.getByLabel("Choose another work type", { exact: true });
  await expect(workTypeSelect).toBeVisible();
  const addedLabel = `${addedSubcategory.name} · ${addedWorkType.name}`;
  await workTypeSelect.selectOption({ label: addedLabel });
  const saved = page.waitForResponse((response) => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Add work type", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole("button", { name: `Remove work type ${addedLabel} from this line`, exact: true })).toBeVisible();

  const workRows = await (await request.get(`${base}/${COLLECTION_TO_TABLE.workRequired}?collection=eq.workRequired&id=eq.${workId}`)).json();
  expect(workRows[0].data.work_subcategory_ids).toContain(addedSubcategory.id);
  expect(workRows[0].data.work_type_ids).toContain(addedWorkType.id);

  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const articleSearch = page.getByPlaceholder("Type to search articles…", { exact: true });
  await articleSearch.fill("Epoxy");
  const articleList = page.getByRole("listbox", { name: "" });
  await expect(articleList).toBeVisible();
  const clippingAncestors = await articleList.evaluate((list) => {
    const listBox = list.getBoundingClientRect();
    const clipped: string[] = [];
    for (let parent = list.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (!["hidden", "clip"].includes(style.overflowY)) continue;
      const parentBox = parent.getBoundingClientRect();
      if (parentBox.bottom + 1 < listBox.bottom) clipped.push(parent.className);
    }
    return clipped;
  });
  expect(clippingAncestors).toEqual([]);
});
