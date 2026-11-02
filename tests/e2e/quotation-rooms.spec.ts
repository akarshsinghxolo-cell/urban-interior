import { expect, test } from "@playwright/test";
import { COLLECTION_TO_TABLE, isSharedCollection } from "../../src/lib/rdash/shared-domain-storage";

test("individual types from one combined requirement control rooms and prices in both quotation layouts", async ({ page, request }) => {
  // Seed only the local, in-memory QA backend; all quotation saves use the real UI/API.
  const base = "http://127.0.0.1:3210/rest/v1";
  const suffix = Date.now().toString(36);
  const customerId = `cust-quote-rooms-${suffix}`;
  const siteId = `site-quote-rooms-${suffix}`;
  const bedroom = `bedroom-${suffix}`;
  const living = `living-${suffix}`;
  const now = new Date().toISOString();
  const insert = async (collection: string, rows: Array<Record<string, unknown>>) => {
    const table = COLLECTION_TO_TABLE[collection];
    expect(table).toBeTruthy();
    const response = await request.post(`${base}/${table}`, { data: rows.map((data) => ({ ...(isSharedCollection(collection) ? { collection } : {}), id: data.id, workspace_id: "default", revision: 1, updated_at: now, data })) });
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
  const combinedWork = { ...works[0], title: works.map((work) => work.title).join(" / "),
    work_subcategory_ids: works.flatMap((work) => work.work_subcategory_ids), work_type_ids: works.flatMap((work) => work.work_type_ids),
    structured_items: works.flatMap((work) => work.structured_items.map((item) => ({ ...item, work_required_id: works[0].id }))) };
  await insert("workRequired", [combinedWork]);
  await insert("measurementRevisions", [bedroom, living].map((areaId) => ({ id: `measurement-${combinedWork.id}-${areaId}`, site_id: siteId, work_required_id: combinedWork.id, area_id: areaId, revision_no: 1, status: "verified", captured_at: now, captured_by: "QA" })));

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
  await expect(dialog.getByRole("region", { name: "Bedroom", exact: true }).getByRole("button", { name: /^Remove / })).toHaveCount(2);
  await expect(dialog.getByRole("region", { name: "Bedroom", exact: true }).getByRole("button", { name: "Bedroom", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Remove Gypsum False Ceiling · Standard in Bedroom", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Remove TV Unit · Standard in Bedroom", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Include Gypsum False Ceiling · Standard in Bedroom", exact: true }).click();
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
  expect(persisted[0].coverage.map((entry: any) => entry.area_ids)).toEqual([[bedroom]]);
  expect(persisted[0].scope_lines.map((line: any) => line.work_type_id).sort()).toEqual(combinedWork.work_type_ids.sort());
  expect(persisted[0].scope_lines.every((line: any) => !line.option_pairs?.length)).toBe(true);
  expect(persisted[0].scope_lines.every((line: any) => line.area_chips.length === 1 && line.area_chips[0].area_id === bedroom)).toBe(true);
  await expect(page.getByText("Bedroom · 1 sqft", { exact: true })).toBeVisible();
  await expect(page.getByText("Bedroom · 10 sqft", { exact: true })).toBeVisible();
  const removeTv = page.getByRole("button", { name: "Remove work type TV Unit · Standard from this line", exact: true });
  await expect(removeTv).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove work type Gypsum False Ceiling · Standard from this line", exact: true })).toBeVisible();
  for (const width of [1092, 390]) {
    await page.setViewportSize({ width, height: 986 });
    const rate = await page.getByRole("spinbutton", { name: "Rate", exact: true }).first().boundingBox();
    const qty = await page.getByLabel("Quantity (sum of areas)").first().boundingBox();
    expect(rate!.x + rate!.width).toBeLessThan(qty!.x);
    expect(Math.abs(rate!.y - qty!.y)).toBeLessThan(2);
    expect(rate!.width).toBeGreaterThan(50);
    const calculationGaps = await page.evaluate(() => {
      const rateInput = document.querySelector<HTMLInputElement>('input[aria-label="Rate"]')!;
      const quantityInput = document.querySelector<HTMLInputElement>('input[aria-label="Quantity (sum of areas)"]')!;
      const currency = rateInput.previousElementSibling!.getBoundingClientRect();
      const rateBox = rateInput.getBoundingClientRect();
      const times = quantityInput.previousElementSibling!.getBoundingClientRect();
      const quantityBox = quantityInput.getBoundingClientRect();
      return { currencyToRate: rateBox.left - currency.right, rateToTimes: times.left - rateBox.right, timesToQuantity: quantityBox.left - times.right };
    });
    expect(calculationGaps.currencyToRate).toBeLessThanOrEqual(4);
    expect(calculationGaps.rateToTimes).toBeLessThanOrEqual(12);
    expect(calculationGaps.timesToQuantity).toBeLessThanOrEqual(4);
    await expect(removeTv).toBeVisible();
  }
  await page.setViewportSize({ width: 1092, height: 986 });
  await page.screenshot({ path: "test-results/quotation-wrapped-names.png" });

  // The same scope can be offered as a room-wise alternative. Only acceptance
  // decides which quotation becomes active for the customer.
  await openCustomerQuotations();
  await page.getByRole("button", { name: "Add quotation Area/room wise", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Area/room wise quotation", exact: true });
  await dialog.getByRole("region", { name: "Bedroom", exact: true }).getByRole("button", { name: "Bedroom", exact: true }).click();
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
  expect(roomQuote.subtotal).toBe(1500);
  expect(roomQuote.coverage.map((entry: any) => entry.area_ids)).toEqual([[bedroom]]);
  expect(roomQuote.scope_lines.map((line: any) => line.area_id)).toEqual([bedroom, bedroom]);
  await page.reload();
  await openCustomerQuotations();
  await page.getByRole("button", { name: new RegExp(roomQuote.quotation_no) }).click();
  await expect(page.getByRole("heading", { name: "Bedroom", exact: true })).toBeVisible();

  // Disabled quoted checkboxes must stay in the submitted data as well as the UI.
  await openCustomerQuotations();
  await page.getByRole("button", { name: "Edit customer", exact: true }).click();
  const customerForm = page.getByRole("dialog", { name: "Edit Customer and Sites", exact: true });
  await customerForm.getByRole("button", { name: "Edit Work Required 1", exact: true }).click();
  const clear = customerForm.getByRole("button", { name: "Clear editable", exact: true });
  await clear.click();
  await expect(customerForm.getByRole("checkbox", { name: "Include Area Bedroom", exact: true })).toBeChecked();
  await expect(customerForm.getByRole("checkbox", { name: "Include Area Bedroom", exact: true })).toBeDisabled();
  await customerForm.getByLabel("Customer notes", { exact: true }).fill("Quoted coverage remains canonical after clearing editable areas.");
  saved = page.waitForResponse((response) => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
  await customerForm.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(customerForm).toHaveCount(0);
  const workRows = await (await request.get(`${base}/${COLLECTION_TO_TABLE.workRequired}?collection=eq.workRequired&id=eq.${works[0].id}`)).json();
  expect(workRows[0].data.area_ids).toEqual([bedroom]);

  await openCustomerQuotations();
  await page.getByRole("button", { name: new RegExp(roomQuote.quotation_no) }).click();
  saved = page.waitForResponse((response) => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Remove work type TV Unit · Standard from this line", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove work type TV Unit · Standard from this line", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove work type Gypsum False Ceiling · Standard from this line", exact: true })).toBeVisible();
  const afterRemoval = (await quotes()).find((quote: any) => quote.id === roomQuote.id);
  expect(afterRemoval.scope_lines).toHaveLength(1);
  expect(afterRemoval.subtotal).toBe(1000);
});
