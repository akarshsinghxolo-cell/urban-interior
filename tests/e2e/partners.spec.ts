import { expect, test } from "@playwright/test";

test("vendor directory filters, correct profile, scoped tabs and deep-link reload", async ({ page }) => {
  const note = `Partner workspace QA persistence check ${Date.now()}`;
  await page.goto("/workspace/vendors");
  await expect(page.getByRole("heading", { name: "Vendors", exact: true })).toBeVisible();
  await page.getByLabel("Search vendors").fill("Ceiling Hub");
  await expect(page.getByRole("button", { name: "Open Build Mart", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open Ceiling Hub", exact: true }).click();
  const profile = page.getByTestId("partner-profile");
  await expect(profile.getByRole("heading", { name: "Ceiling Hub", exact: true })).toBeVisible();
  await page.reload();
  await expect(profile.getByRole("heading", { name: "Ceiling Hub", exact: true })).toBeVisible();
  const sections = profile.getByRole("group", { name: "Partner sections" });
  await profile.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByRole("textbox", { name: "Notes", exact: true }).fill(note);
  const commit = page.waitForResponse((response) => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save Vendor", exact: true }).click();
  expect((await commit).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Edit Vendor", exact: true })).toHaveCount(0);
  await page.reload();
  await sections.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(profile.getByText(note, { exact: true })).toBeVisible();
  await sections.getByRole("button", { name: "Capabilities & rates", exact: true }).click();
  await expect(profile.getByLabel("Vendor", { exact: true })).toHaveValue("ven-ceiling");
  await expect(profile.getByLabel("Vendor", { exact: true })).toBeDisabled();
  await sections.getByRole("button", { name: "Work & orders", exact: true }).click();
  await expect(profile.getByText("PO-2026-601", { exact: false })).toHaveCount(0);
  await sections.getByRole("button", { name: "Bills & payments", exact: true }).click();
  await expect(profile.getByRole("heading", { name: "Payment history" })).toBeVisible();
  for (const name of [/^Tasks/, /^Files/, /^Activity$/]) {
    await sections.getByRole("button", { name }).click();
    await expect(profile).toBeVisible();
  }
});

test("contractor profile keeps execution and finance linked on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace/contractors");
  await page.getByRole("button", { name: "Open Sharma Ceiling Works", exact: true }).click();
  const profile = page.getByTestId("partner-profile");
  const sections = profile.getByRole("group", { name: "Partner sections" });
  for (const name of [/^Overview$/, /^Profile$/, /^Capabilities/, /^Work & orders$/, /^Bills & payments$/, /^Tasks/, /^Files/, /^Activity$/]) {
    await sections.getByRole("button", { name }).click();
    await expect(profile).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await sections.getByRole("button", { name: "Work & orders", exact: true }).click();
  await expect(profile.getByRole("button", { name: "Create RA bill", exact: true })).toBeVisible();
  await profile.getByRole("button", { name: /WO-2026-301/ }).click();
  await expect(page).toHaveURL(/work-orders\/wo-das-ceiling/);
});

test("a contractor can be created without a photo and survives a reload", async ({ page }) => {
  const name = `QA photo-optional contractor ${Date.now()}`;
  await page.goto("/workspace/contractors");
  await page.getByRole("button", { name: "Add contractor", exact: true }).click();
  await page.getByPlaceholder("Contractor / firm name", { exact: true }).fill(name);
  await page.getByPlaceholder("Primary mobile", { exact: true }).fill("9000098765");
  await page.getByPlaceholder("City", { exact: true }).fill("Gorakhpur");
  await page.getByRole("button", { name: "False Ceiling", exact: true }).click();
  await page.getByRole("button", { name: "Gypsum False Ceiling", exact: true }).click();
  const commit = page.waitForResponse((response) => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create contractor", exact: true }).click();
  expect((await commit).status()).toBe(200);
  await expect(page.getByTestId("partner-profile").getByRole("heading", { name, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("partner-profile").getByRole("heading", { name, exact: true })).toBeVisible();
});
