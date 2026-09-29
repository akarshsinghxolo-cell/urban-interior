import { expect, test, type Locator, type Page } from "@playwright/test";

async function fitsPhone(page: Page, dialog: Locator) {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await dialog.getByRole("group", { name: "Capability categories" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`capabilities-${width}.png`) });
    await dialog.getByRole("spinbutton", { name: /Article price|Standard material rate/ }).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`prices-${width}.png`) });
  }
}

test("vendor browses the shared catalogue and saves prices to the Price Matrix", async ({ page }) => {
  const name = `QA catalogue vendor ${Date.now()}`;
  await page.goto("/workspace/vendors");
  await page.getByRole("button", { name: "Add vendor", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Vendor", exact: true });
  await dialog.getByLabel("Vendor name", { exact: true }).fill(name);
  const articles = dialog.getByRole("group", { name: "Available articles" });
  expect(await articles.getByRole("button").count()).toBeGreaterThan(8);
  await dialog.getByRole("group", { name: "Capability categories" }).getByRole("button", { name: "False Ceiling", exact: true }).click();
  await dialog.getByRole("button", { name: "PVC False Ceiling", exact: true }).click();
  await expect(articles.getByRole("button", { name: /^PVC Panel / })).toBeVisible();
  await expect(articles.getByRole("button", { name: /^Gypsum Board / })).toHaveCount(0);
  await articles.getByRole("button", { name: /^PVC Panel / }).click();
  const price = dialog.getByRole("spinbutton", { name: /^Article price/ });
  await price.fill("-1");
  await expect(dialog.getByRole("button", { name: "Create Vendor", exact: true })).toBeDisabled();
  await price.fill("185.50");
  await dialog.getByRole("button", { name: "Standard · PVC False Ceiling", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: /^Standard · PVC False Ceiling price/ }).fill("198");
  await fitsPhone(page, dialog);
  const commit = page.waitForResponse((res) => res.url().includes("/api/operations/commit") && res.request().method() === "POST");
  await dialog.getByRole("button", { name: "Create Vendor", exact: true }).click();
  expect((await commit).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  const profile = page.getByTestId("partner-profile");
  await expect(profile.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.reload();
  await profile.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: /^Article price/ })).toHaveValue("185.5");
  await expect(page.getByRole("spinbutton", { name: /^Standard · PVC False Ceiling price/ })).toHaveValue("198");
  await page.getByRole("spinbutton", { name: /^Article price/ }).fill("190.25");
  await page.getByRole("button", { name: "Save Vendor", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit Vendor", exact: true })).toHaveCount(0);
  await profile.getByRole("button", { name: "Capabilities & rates", exact: true }).click();
  await expect(profile.getByText("PVC Panel", { exact: true }).first()).toBeVisible();
  const rates = profile.getByRole("spinbutton", { name: "Edit quoted rate", exact: true });
  await expect(rates).toHaveCount(2);
  expect(await rates.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value).sort())).toEqual(["190.25", "198"]);
});

test("contractor reuses catalogue work types and adds new capabilities above saved rates", async ({ page }) => {
  const name = `QA shared work types ${Date.now()}`;
  await page.goto("/workspace/contractors");
  await page.getByRole("button", { name: "Add contractor", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Add New Contractor", exact: true });
  await dialog.getByPlaceholder("Contractor / firm name", { exact: true }).fill(name);
  await dialog.getByLabel("Primary number", { exact: true }).fill(`90000${String(Date.now()).slice(-5)}`);
  await dialog.getByPlaceholder("City", { exact: true }).fill("Gorakhpur");
  await dialog.getByRole("button", { name: "False Ceiling", exact: true }).click();
  await dialog.getByRole("button", { name: "Gypsum False Ceiling", exact: true }).click();
  await dialog.getByRole("group", { name: "Work types for Gypsum False Ceiling" }).getByRole("checkbox", { name: "Standard", exact: true }).check();
  await dialog.getByLabel("Standard material rate", { exact: true }).fill("120");
  await dialog.getByRole("button", { name: "Create contractor", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByTestId("partner-profile").getByRole("button", { name: "Edit profile", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit Contractor", exact: true });
  await expect(dialog.getByLabel("Standard material rate", { exact: true })).toHaveValue("120");
  await dialog.getByRole("button", { name: "Furniture & Carpentry", exact: true }).click();
  await dialog.getByRole("button", { name: "Kitchen Cabinets (Modular)", exact: true }).click();
  const kitchen = dialog.getByRole("group", { name: "Work types for Kitchen Cabinets (Modular)" });
  await expect(kitchen.getByRole("checkbox", { name: "Standard", exact: true })).toBeVisible();
  const groups = dialog.getByRole("group", { name: /^Work types for / });
  await expect(groups.first()).toHaveAttribute("aria-label", "Work types for Kitchen Cabinets (Modular)");
  await kitchen.getByRole("checkbox", { name: "Standard", exact: true }).check();
  await expect(dialog.getByLabel("Standard material rate", { exact: true }).first()).toHaveValue("");
  await dialog.getByLabel("Standard material rate", { exact: true }).first().fill("600");
  await fitsPhone(page, dialog);
  await dialog.getByRole("button", { name: "Save contractor", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByTestId("partner-profile").getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page.getByRole("group", { name: "Work types for Kitchen Cabinets (Modular)" }).getByRole("checkbox", { name: "Standard", exact: true })).toBeChecked();
  await expect(page.getByLabel("Standard material rate", { exact: true }).first()).toHaveValue("600");
});

test("contractor saves multiple categories, subcategories and unpriced work types together", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace/contractors");
  await page.getByRole("button", { name: "Add contractor", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Add New Contractor", exact: true });
  await dialog.getByPlaceholder("Contractor / firm name", { exact: true }).fill(`QA multi-trade ${Date.now()}`);
  await dialog.getByLabel("Primary number", { exact: true }).fill(`91000${String(Date.now()).slice(-5)}`);
  await dialog.getByPlaceholder("City", { exact: true }).fill("Gorakhpur");
  const selections = [
    { category: "Railing Work", subcategories: ["MS Railing", "SS Railing"] },
    { category: "Paint Work", subcategories: ["Interior Emulsion Paint", "Exterior Weather Shield Paint"] },
    { category: "Facade & Exterior Cladding", subcategories: ["ACP Cladding"] },
  ];
  for (const { category, subcategories } of selections) {
    await dialog.getByRole("group", { name: "Capability categories", exact: true }).getByRole("button", { name: category, exact: true }).click();
    for (const subcategory of subcategories) {
      await dialog.getByRole("group", { name: `${category} subcategories`, exact: true }).getByRole("button", { name: subcategory, exact: true }).click();
      await dialog.getByRole("group", { name: `Work types for ${subcategory}`, exact: true }).getByRole("checkbox", { name: "Standard", exact: true }).check();
    }
  }
  const railing = dialog.getByRole("group", { name: "SS Railing capability", exact: true });
  await railing.getByLabel("Standard material rate", { exact: true }).fill("620");
  const cladding = dialog.getByRole("group", { name: "ACP Cladding capability", exact: true });
  await cladding.getByRole("button", { name: "+ Add work type", exact: true }).click();
  await cladding.getByPlaceholder("Work type", { exact: true }).fill("QA premium cladding");
  for (const { category } of selections) {
    await expect(dialog.getByRole("group", { name: `${category} subcategories`, exact: true })).toBeVisible();
    await expect(dialog.getByRole("group", { name: "Capability categories", exact: true }).getByRole("button", { name: category, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  const created = page.waitForResponse((res) => res.url().includes("/api/operations/commit") && res.request().method() === "POST");
  await dialog.getByRole("button", { name: "Create contractor", exact: true }).click();
  expect((await created).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByTestId("partner-profile").getByRole("button", { name: "Edit profile", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Edit Contractor", exact: true });
  for (const { category, subcategories } of selections) {
    await expect(dialog.getByRole("group", { name: "Capability categories", exact: true }).getByRole("button", { name: category, exact: true })).toHaveAttribute("aria-pressed", "true");
    for (const subcategory of subcategories) {
      await expect(dialog.getByRole("group", { name: `${category} subcategories`, exact: true }).getByRole("button", { name: subcategory, exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(dialog.getByRole("group", { name: `Work types for ${subcategory}`, exact: true }).getByRole("checkbox", { name: "Standard", exact: true })).toBeChecked();
    }
  }
  await expect(dialog.getByRole("group", { name: "Work types for ACP Cladding", exact: true }).getByRole("checkbox", { name: "QA premium cladding", exact: true })).toBeChecked();
  await expect(dialog.getByRole("group", { name: "ACP Cladding capability", exact: true }).getByLabel("Standard material rate", { exact: true })).toHaveValue("");
  await dialog.getByRole("group", { name: "Capability categories", exact: true }).getByRole("button", { name: "Paint Work", exact: true }).click();
  await expect(dialog.getByRole("group", { name: "Interior Emulsion Paint capability", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("group", { name: "Exterior Weather Shield Paint capability", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save contractor", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByTestId("partner-profile").getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(dialog.getByRole("group", { name: "Capability categories", exact: true }).getByRole("button", { name: "Paint Work", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("group", { name: "SS Railing capability", exact: true }).getByLabel("Standard material rate", { exact: true })).toHaveValue("620");
  await expect(dialog.getByRole("group", { name: "Work types for ACP Cladding", exact: true }).getByRole("checkbox", { name: "QA premium cladding", exact: true })).toBeChecked();
});
