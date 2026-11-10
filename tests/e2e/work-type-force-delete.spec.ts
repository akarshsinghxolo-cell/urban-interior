import { expect, test } from "@playwright/test";
import { COLLECTION_TO_TABLE, isSharedCollection } from "../../src/lib/rdash/shared-domain-storage";
import { dismissOnboardingTourIfPresent, QA_OWNER_EMAIL, QA_OWNER_PASSWORD } from "./helpers/smoke-actions";

test.use({ storageState: { cookies: [], origins: [] } });

test("used work type can be moved to the next type and force deleted", async ({ page, request }) => {
  const login = await page.request.post("/api/auth/login", { data: { email: QA_OWNER_EMAIL, password: QA_OWNER_PASSWORD } });
  expect(login.ok()).toBe(true);
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
      { id: replacementId, name: "Premium", unit_id: "sqft", created_at: now, updated_at: now },
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
  const contractorId = `contractor-taxonomy-${suffix}`;
  await insert("master.contractors", { id: contractorId, name: "Taxonomy contractor", work_capabilities: [{ subcategory_id: subcategoryId, work_type_rates: [{ work_type_id: workTypeId, unit_id: "sqft", labour_rate: 19 }] }] });
  const articleRows = await (await request.get(`${base}/${COLLECTION_TO_TABLE["master.articles"]}?collection=eq.master.articles&limit=1`)).json();
  const mapId = `map-taxonomy-${suffix}`;
  await insert("master.subcategoryArticleMap", { id: mapId, work_required_id: subcategoryId, article_id: articleRows[0].id, unit_id: "sqft" });

  await page.goto("/workspace/masters");
  await dismissOnboardingTourIfPresent(page);
  await page.getByPlaceholder("Search category, sub category, material or note...").fill(`QA Force Delete ${suffix}`);
  await page.getByText(`QA Force Delete ${suffix}`, { exact: true }).click();
  await page.getByRole("button", { name: "Delete Hehsh", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Force delete Hehsh", exact: true });
  await expect(dialog.getByLabel("Replacement work type")).toHaveValue(replacementId);
  const saved = page.waitForResponse((response) => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Move to Premium and delete", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Delete Hehsh", exact: true })).toHaveCount(0);

  const persisted = await (await request.get(`${base}/${COLLECTION_TO_TABLE.workRequired}?collection=eq.workRequired&id=eq.${workRequiredId}`)).json();
  expect(persisted[0].data.work_type_ids).toEqual([replacementId]);
  await page.reload();
  await page.getByPlaceholder("Search category, sub category, material or note...").fill(`QA Force Delete ${suffix}`);
  await page.getByText(`QA Force Delete ${suffix}`, { exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete Hehsh", exact: true })).toHaveCount(0);
  const contractor = await (await request.get(`${base}/entity_master_contractors?id=eq.${contractorId}`)).json();
  expect(contractor[0].data.work_capabilities[0].work_type_rates[0]).toMatchObject({ work_type_id: replacementId, labour_rate: 19 });

  // This quotation was never loaded, but its material link was: the server must handle both.
  const quoteId = `quote-taxonomy-${suffix}`;
  await insert("quotations", {
    id: quoteId, quotation_no: `QA-${suffix}`, customer_id: customerRows[0].id, site_id: "", title: `QA Force Delete ${suffix}`,
    status: "draft", revision_no: 0, valid_until: "2027-01-01", subtotal: 875, tax_amount: 0, total_amount: 875,
    payment_terms: [], coverage: [], work_order_ids: [], created_at: now, updated_at: now,
    scope_lines: [{ id: `line-${suffix}`, title: `QA Force Delete ${suffix}`, subcategory_id: subcategoryId, work_type_id: replacementId,
      work_required_article_id: mapId, article_id: articleRows[0].id, unit_id: "sqft", quantity: 7, rate: 125, amount: 875 }],
  });

  await page.getByRole("button", { name: `Delete QA Force Delete ${suffix}`, exact: true }).click();
  const deleteDialog = page.getByRole("dialog", { name: `Delete subcategory QA Force Delete ${suffix}`, exact: true });
  await expect(deleteDialog).toContainText("Deleted subcategory");
  const deletion = page.waitForResponse((response) => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
  await deleteDialog.getByRole("button", { name: "Delete subcategory", exact: true }).click();
  const deletionResponse = await deletion;
  expect(deletionResponse.status(), await deletionResponse.text()).toBe(200);
  await expect(page.getByText(`QA Force Delete ${suffix}`, { exact: true })).toHaveCount(0);
  const history = await (await request.get(`${base}/${COLLECTION_TO_TABLE.workRequired}?collection=eq.workRequired&id=eq.${workRequiredId}`)).json();
  expect(history[0].data.work_subcategory_ids).toEqual([`deleted-subcategory:${subcategoryId}`]);
  expect(history[0].data.title).toContain("Deleted subcategory");
  const cleared = await (await request.get(`${base}/entity_master_contractors?id=eq.${contractorId}`)).json();
  expect(cleared[0].data.work_capabilities).toEqual([]);
  const deletedMap = await (await request.get(`${base}/${COLLECTION_TO_TABLE["master.subcategoryArticleMap"]}?collection=eq.master.subcategoryArticleMap&id=eq.${mapId}`)).json();
  expect(deletedMap).toEqual([]);
  const preservedQuote = await (await request.get(`${base}/${COLLECTION_TO_TABLE.quotations}?collection=eq.quotations&id=eq.${quoteId}`)).json();
  expect(preservedQuote[0].data.scope_lines[0]).toMatchObject({ title: "Deleted subcategory", quantity: 7, rate: 125, amount: 875 });
  expect(preservedQuote[0].data.total_amount).toBe(875);
});
