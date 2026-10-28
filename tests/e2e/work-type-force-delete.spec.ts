import { expect, test } from "@playwright/test";
import { COLLECTION_TO_TABLE, isSharedCollection } from "../../src/lib/rdash/shared-domain-storage";

test("used work type can be moved to the next type and force deleted", async ({ page, request }) => {
  const base = "http://127.0.0.1:3210/rest/v1";
  const suffix = Date.now().toString(36);
  const now = new Date().toISOString();
  const subcategoryId = `work-force-delete-${suffix}`;
  const workTypeId = `wt-force-delete-${suffix}`;
  const replacementId = `wt-force-replacement-${suffix}`;
  const workRequiredId = `required-force-delete-${suffix}`;
  const customerRows = await (await request.get(`${base}/entity_customers?limit=1`)).json();
  const siteRows = await (await request.get(`${base}/entity_sites?limit=1`)).json();
  const categoryRows = await (await request.get(`${base}/entity_work_definitions?collection=eq.master.workCategories&limit=1`)).json();
  const insert = async (collection: string, data: Record<string, unknown>) => {
    const table = COLLECTION_TO_TABLE[collection];
    expect(table).toBeTruthy();
    const response = await request.post(`${base}/${table}`, { data: { ...(isSharedCollection(collection) ? { collection } : {}), id: data.id, workspace_id: "default", revision: 1, updated_at: now, data } });
    expect(response.ok()).toBe(true);
  };
  await insert("master.workSubcategories", {
    id: subcategoryId,
    category_id: categoryRows[0].data.id,
    name: `QA Force Delete ${suffix}`,
    unit_id: "sqft",
    work_types: [
      { id: replacementId, name: "Standard", unit_id: "sqft", created_at: now, updated_at: now },
      { id: workTypeId, name: "Hehsh", unit_id: "sqft", created_at: now, updated_at: now },
    ],
    created_at: now,
    updated_at: now,
  });
  await insert("workRequired", {
    id: workRequiredId,
    customer_id: customerRows[0].data.id,
    site_id: siteRows[0].data.id,
    title: "QA Hehsh",
    work_subcategory_ids: [subcategoryId],
    work_type_ids: [workTypeId],
    area_ids: [],
    status: "new",
    priority: "medium",
    created_at: now,
    updated_at: now,
  });

  await page.goto("/workspace/masters");
  await page.getByPlaceholder("Search category, sub category, material or note...").fill(`QA Force Delete ${suffix}`);
  await page.getByText(`QA Force Delete ${suffix}`, { exact: true }).click();
  await page.getByRole("button", { name: "Delete Hehsh", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Force delete Hehsh", exact: true });
  await expect(dialog).toContainText("will be moved to Standard");
  const saved = page.waitForResponse((response) => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Move to Standard and delete", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Delete Hehsh", exact: true })).toHaveCount(0);

  const persisted = await (await request.get(`${base}/${COLLECTION_TO_TABLE.workRequired}?collection=eq.workRequired&id=eq.${workRequiredId}`)).json();
  expect(persisted[0].data.work_type_ids).toEqual([replacementId]);
  await page.reload();
  await page.getByPlaceholder("Search category, sub category, material or note...").fill(`QA Force Delete ${suffix}`);
  await page.getByText(`QA Force Delete ${suffix}`, { exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete Hehsh", exact: true })).toHaveCount(0);
});
