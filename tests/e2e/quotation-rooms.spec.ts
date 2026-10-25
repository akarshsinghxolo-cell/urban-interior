import { expect, test } from "@playwright/test";

test("room selections control saved coverage and prices in both quotation layouts", async ({ page, request }) => {
  // Seed only the local, in-memory QA backend; all quotation saves use the real UI/API.
  const base = "http://127.0.0.1:3210/rest/v1";
  const suffix = Date.now().toString(36);
  const customerId = `cust-quote-rooms-${suffix}`;
  const siteId = `site-quote-rooms-${suffix}`;
  const bedroom = `bedroom-${suffix}`;
  const living = `living-${suffix}`;
  const now = new Date().toISOString();
  const insert = async (table: string, rows: Array<Record<string, unknown>>) => {
    const shared = table === "measurementRevisions";
    const response = await request.post(`${base}/${shared ? "entity_site_records" : `entity_${table}`}`, { data: rows.map((data) => ({ ...(shared ? { collection: table } : {}), id: data.id, workspace_id: "default", revision: 1, updated_at: now, data })) });
    expect(response.ok()).toBe(true);
  };
  const masters = await (await request.get(`${base}/entity_work_definitions?collection=eq.master.workSubcategories`)).json();
  const subcategories = ["fc2_tv", "fc_gyp"].map((id) => masters.find((row: any) => row.id === id).data);
  const works = subcategories.map((sub: any, index: number) => {
    const id = `work-quote-rooms-${index}-${suffix}`;
    const workType = sub.work_types[0];
    return { id, customer_id: customerId, site_id: siteId, title: sub.name, area_ids: [bedroom, living],
      work_subcategory_ids: [sub.id], work_type_ids: [workType.id], status: "measurement_done", priority: "medium", created_at: now, updated_at: now,
      structured_items: [bedroom, living].map((areaId, room) => ({ id: `line-${id}-${room}`, title: sub.name,
        site_id: siteId, area_id: areaId, work_required_id: id, category_id: sub.category_id, subcategory_id: sub.id, work_type_id: workType.id,
        quantity: (index === 0 ? 1 : 10) * (room + 1), rate: index === 0 ? 500 : 100, amount: (index === 0 ? 500 : 1000) * (room + 1),
        unit_id: workType.unit_id || sub.unit_id, tax_rate: 0 })) };
  });
  await insert("customers", [{ id: customerId, name: `QA Room Quote ${suffix}`, phone: "9000001234", status: "active", created_at: now, updated_at: now }]);
  await insert("sites", [{ id: siteId, customer_id: customerId, name: "QA Rooms Site", site_type: "apartment", stage: "measured", created_at: now, updated_at: now }]);
  await insert("areas", [bedroom, living].map((id, index) => ({ id, site_id: siteId, name: index === 0 ? "Bedroom" : "Living Room", area_type: "bedroom", stage: "measured", created_at: now, updated_at: now })));
  await insert("workRequired", works);
  await insert("measurementRevisions", works.flatMap((work) => [bedroom, living].map((areaId) => ({ id: `measurement-${work.id}-${areaId}`, site_id: siteId, work_required_id: work.id, area_id: areaId, revision_no: 1, status: "verified", captured_at: now, captured_by: "QA" }))));

  const openCustomerQuotations = async () => {
    await page.goto("/workspace/customers");
    await page.getByRole("button", { name: new RegExp(`QA Room Quote ${suffix}`, "i") }).click();
    await page.getByRole("button", { name: /^Quotations \(/ }).click();
  };
  await openCustomerQuotations();
  await page.getByRole("button", { name: "Work wise quotation", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Work wise quotation", exact: true });
  const tv = dialog.getByRole("region", { name: "TV Unit · Standard", exact: true });
  await expect(tv.getByRole("button", { name: "Bedroom", exact: true })).toHaveAttribute("aria-pressed", "false");
  await tv.getByRole("checkbox").check();
  await expect(tv.getByRole("button", { name: "Bedroom", exact: true })).toHaveAttribute("aria-pressed", "true");
  await tv.getByRole("button", { name: "Living Room", exact: true }).click();
  await expect(tv.getByRole("button", { name: "Living Room", exact: true })).toHaveAttribute("aria-pressed", "false");
  await dialog.getByRole("region", { name: "Gypsum False Ceiling · Standard", exact: true }).getByRole("button", { name: "Bedroom", exact: true }).click();
  await dialog.getByRole("button", { name: "Area/room wise", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Area/room wise quotation", exact: true });
  await expect(dialog.getByRole("region", { name: "Bedroom", exact: true }).getByRole("checkbox")).toHaveCount(2);
  await expect(dialog.getByRole("region", { name: "Bedroom", exact: true }).getByRole("button")).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Work wise", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Work wise quotation", exact: true });
  let saved = page.waitForResponse((response) => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Create quotation", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  const quotes = async () => (await (await request.get(`${base}/entity_commercial_documents?collection=eq.quotations`)).json()).map((row: any) => row.data).filter((quote: any) => quote.customer_id === customerId);
  let persisted = await quotes();
  expect(persisted).toHaveLength(1);
  expect(persisted[0].grouping).toBe("work");
  expect(persisted[0].subtotal).toBe(1500);
  expect(persisted[0].coverage.map((entry: any) => entry.area_ids)).toEqual([[bedroom], [bedroom]]);
  expect(persisted[0].scope_lines.every((line: any) => line.area_chips.length === 1 && line.area_chips[0].area_id === bedroom)).toBe(true);

  // The other room can be quoted independently for the same Work Required.
  await openCustomerQuotations();
  await page.getByRole("button", { name: "Add quotation Area/room wise", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Area/room wise quotation", exact: true });
  await dialog.getByRole("region", { name: "Living Room", exact: true }).getByRole("button").click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  saved = page.waitForResponse((response) => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Create quotation", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  persisted = await quotes();
  const roomQuote = persisted.find((quote: any) => quote.grouping === "area");
  expect(persisted).toHaveLength(2);
  expect(roomQuote.subtotal).toBe(3000);
  expect(roomQuote.coverage.map((entry: any) => entry.area_ids)).toEqual([[living], [living]]);
  expect(roomQuote.scope_lines.map((line: any) => line.area_id)).toEqual([living, living]);
  await page.reload();
  await openCustomerQuotations();
  await page.getByRole("button", { name: new RegExp(roomQuote.quotation_no) }).click();
  await expect(page.getByRole("heading", { name: "Living Room", exact: true })).toBeVisible();
});
