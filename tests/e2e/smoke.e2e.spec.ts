import { expect, test } from "@playwright/test";

import {
  clickDrawerTab,
  expectNoHorizontalOverflow,
  openCustomerDrawer,
  openCustomersDeskModule,
  pulseRegion,
  QA_OWNER_EMAIL,
  QA_OWNER_PASSWORD,
  recordDrawer,
  SUPER_OWNER_EMAIL,
  SUPER_OWNER_PASSWORD,
} from "./helpers/smoke-actions";

/**
 * Urban Castle e2e smoke pack.
 *
 * Drives the REAL app in a REAL (headless) chromium against `next dev` on
 * port 3000 with the local Supabase mock on port 3210 — the same stack used
 * for the manual browser QA (worklog Task 28). Every action under test goes
 * through the real UI; the network/API layer is never scripted directly.
 *
 * Session strategy: the "setup" project signs in once through the real form
 * and saves storageState (see auth.setup.ts — the login endpoint rate-limits
 * to 5 attempts / 15 min, so per-test sign-in would fail deterministically).
 * Tests that specifically exercise the unauthenticated/form flows opt out
 * with an empty storageState.
 */

test.describe("auth", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated visitors are redirected from / to the sign-in screen", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/signin/, { timeout: 90_000 });
    await expect(page.getByLabel("Work email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  });

  test("sign-in through the real form lands on the workdesk", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/signin/, { timeout: 90_000 });
    await page.getByLabel("Work email").fill(QA_OWNER_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(QA_OWNER_PASSWORD);
    await page
      .locator("form")
      .getByRole("button", { name: "Sign in" })
      .click();

    // Workdesk markers: live pulse strip with greeting and pulse tiles.
    await expect(pulseRegion(page)).toBeVisible({ timeout: 90_000 });
    await expect(
      pulseRegion(page).getByRole("button", { name: /customers/i }).first(),
    ).toBeVisible();
  });

  test("the owner-approved static super-owner credential signs in through the real form", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/signin/, { timeout: 90_000 });
    await page.getByLabel("Work email").fill(SUPER_OWNER_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(SUPER_OWNER_PASSWORD);
    await page
      .locator("form")
      .getByRole("button", { name: "Sign in" })
      .click();

    // Same workdesk markers as the Supabase-backed login above: the static
    // owner lands on a fully working workspace without any Supabase session.
    await expect(pulseRegion(page)).toBeVisible({ timeout: 90_000 });
  });
});

test.describe("workdesk navigation", () => {
  // Signed-in via storageState from the setup project.
  test("the Customer Desk navigation opens the Customers module", async ({ page }) => {
    await openCustomersDeskModule(page);

    // Seeded customers render as clickable cards.
    await expect(page.getByRole("button", { name: /Mr\. Das/ }).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe("customer drawer", () => {
  test("Site coordinate search fills the address and photo selection keeps the editor stable", async ({ page }) => {
    await page.route("**/api/location/reverse?*", async (route) => {
      await route.fulfill({
        json: {
          display_name: "Gorakhpur, Uttar Pradesh, 273001, India",
          address: { city: "Gorakhpur", suburb: "Civil Lines" },
        },
      });
    });
    await openCustomersDeskModule(page);
    await page.getByRole("button", { name: "Add customer", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "Add New Customer", exact: true });
    await dialog.getByRole("button", { name: "Add Site", exact: true }).click();
    const coordinates = dialog.getByPlaceholder("GPS coordinates: 26.739800, 83.371200", { exact: true });
    await coordinates.fill("26.719749, 83.383718");
    await dialog.getByRole("button", { name: "Find address from coordinates", exact: true }).click();
    await expect(dialog.getByPlaceholder("Full Site address", { exact: true })).toHaveValue("Gorakhpur, Uttar Pradesh, 273001, India");
    await expect(dialog.getByPlaceholder("Locality / area", { exact: true })).toHaveValue("Civil Lines");
    await expect(dialog.getByPlaceholder("City", { exact: true })).toHaveValue("Gorakhpur");
    await expect(dialog.getByPlaceholder("Search address or landmark", { exact: true })).toHaveCount(0);

    const uploadButton = dialog.getByRole("button", { name: "Add photos or files", exact: true });
    await expect(uploadButton).toBeVisible();
    await uploadButton.scrollIntoViewIfNeeded();
    const scrollBody = dialog.locator(".rd-scroll");
    const scrollTopBeforeUpload = await scrollBody.evaluate((element) => element.scrollTop);
    const fileChooserPromise = page.waitForEvent("filechooser");
    await uploadButton.click();
    const fileChooser = await fileChooserPromise;
    await expect.poll(async () => scrollBody.evaluate((element) => element.scrollTop)).toBe(scrollTopBeforeUpload);
    await expect(uploadButton).toBeFocused();
    await fileChooser.setFiles({
      name: "site-photo.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNosAAAAASUVORK5CYII=", "base64"),
    });
    await expect.poll(async () => scrollBody.evaluate((element) => element.scrollTop)).toBe(scrollTopBeforeUpload);
    await expect(dialog.getByText("site-photo.png", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);

    const dialogBox = await dialog.boundingBox();
    const saveBox = await dialog.getByRole("button", { name: "Create customer", exact: true }).boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(saveBox).not.toBeNull();
    if (!dialogBox || !saveBox) throw new Error("Customer editor layout could not be measured");
    expect((dialogBox.y + dialogBox.height) - (saveBox.y + saveBox.height)).toBeLessThan(48);
  });

  test("fast customer entry reuses contact, Areas and work scope on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCustomersDeskModule(page);
    await page.getByRole("button", { name: "Add customer", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "Add New Customer", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Contact number (optional)", { exact: true }).fill("9876543210");
    await expect(dialog.getByLabel("WhatsApp number (optional)", { exact: true })).toHaveValue("9876543210");
    await expect(dialog.getByRole("checkbox", { name: "Same as contact number", exact: true })).toBeChecked();

    await dialog.getByRole("button", { name: "Add Work Required", exact: true }).click();
    const firstWork = dialog.locator("article").first();
    await firstWork.getByRole("button", { name: "Add Area", exact: true }).click();
    await firstWork.getByRole("checkbox", { name: "Kitchen", exact: true }).check();
    await firstWork.getByRole("button", { name: "Add selected Areas", exact: true }).click();

    await expect(firstWork.getByLabel("Search Primary category", { exact: true })).toBeVisible();
    await firstWork.getByRole("group", { name: "Primary category", exact: true }).getByRole("checkbox").first().check();
    await expect(firstWork.getByLabel("Search Primary subcategory", { exact: true })).toBeVisible();
    await firstWork.getByRole("group", { name: "Primary subcategory", exact: true }).getByRole("checkbox").first().check();
    await expect(firstWork.getByLabel("Search Work types", { exact: true })).toBeVisible();
    await expect(firstWork.getByRole("textbox", { name: /^Work Required title/ })).not.toHaveValue("");
    await firstWork.getByLabel("Budget (₹)", { exact: true }).fill("25000");

    await firstWork.getByRole("button", { name: "Copy this requirement", exact: true }).click();
    await expect(dialog.locator("article")).toHaveCount(2);
    const copiedWork = dialog.locator("article").nth(1);
    await expect(copiedWork.getByLabel("Budget (₹)", { exact: true })).toHaveValue("");
    await expect(copiedWork.getByRole("checkbox", { name: "Include Area Kitchen", exact: true })).toBeChecked();
    await expectNoHorizontalOverflow(page, "fast customer entry @390px");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  for (const width of [1280, 390]) {
    test(`customer card menu and drawer edit share the customer form at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await openCustomersDeskModule(page);
      const card = page.getByRole("button", { name: /Aarav Mehta/ }).first();
      const trigger = card.getByRole("button", { name: "Record actions", exact: true });
      await trigger.focus();
      await trigger.press("Enter");
      await expect(page.getByRole("menuitem", { name: "Edit", exact: true })).toBeVisible();
      await expect(recordDrawer(page)).not.toBeVisible();
      if (width === 1280) {
        await page.keyboard.press("Escape");
        await card.click({ button: "right" });
      }
      await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Edit Customer and Sites", exact: true });
      await expect(dialog.getByLabel("Customer name *", { exact: true })).toHaveValue("Aarav Mehta");
      await expect(recordDrawer(page)).not.toBeVisible();
      const notes = dialog.getByLabel("Customer notes", { exact: true });
      const originalNotes = await notes.inputValue();
      const editedNotes = `QA customer menu edit at ${width}px`;
      await notes.fill(editedNotes);
      await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(dialog).not.toBeVisible();

      // Read from a fresh document so this checks persistence, not form state.
      await openCustomersDeskModule(page);
      await openCustomerDrawer(page, "Aarav Mehta");
      const edit = recordDrawer(page).getByRole("button", { name: "Edit customer", exact: true });
      await edit.click();
      await expect(notes).toHaveValue(editedNotes);
      await notes.fill(originalNotes);
      await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await openCustomersDeskModule(page);
      await openCustomerDrawer(page, "Aarav Mehta");
      await edit.click();
      await expect(notes).toHaveValue(originalNotes);
      await expectNoHorizontalOverflow(page, `customer edit @${width}px`);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    });
  }

  test("quick actions use the selected customer's existing workflows on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCustomersDeskModule(page);
    await openCustomerDrawer(page, "Mr. Das");
    const drawer = recordDrawer(page);
    const actions = drawer.getByRole("group", { name: "Customer quick actions" });
    await expect(actions.getByRole("link", { name: "Call", exact: true })).toHaveAttribute("href", "tel:9876501933");
    await expect(actions.getByRole("link", { name: "WhatsApp", exact: true })).toHaveAttribute("href", "https://wa.me/919876501933");
    await expectNoHorizontalOverflow(page, "customer quick actions @390px");

    await actions.getByRole("button", { name: "Directions", exact: true }).click();
    const destinations = page.getByRole("menuitem");
    await expect(destinations).toHaveCount(2);
    for (const destination of await destinations.all()) {
      await expect(destination).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\//);
    }
    await page.keyboard.press("Escape");

    await actions.getByRole("button", { name: "Manage site work", exact: true }).click();
    await expect(drawer.getByRole("button", { name: "Edit site", exact: true }).first()).toBeVisible();
    await actions.getByRole("button", { name: "Manage payments", exact: true }).click();
    await expect(drawer.getByRole("button", { name: "Add collection milestone", exact: true })).toHaveCount(2);

    for (const [action, title] of [
      ["Create quotation", "New quotation"],
      ["Schedule visit", "Schedule visit"],
      ["Add collection milestone", "Create Collection Milestone"],
    ]) {
      await actions.getByRole("button", { name: action, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await expect(dialog).toBeVisible();
      if (action === "Add collection milestone") {
        await expect(dialog.getByRole("textbox", { name: "Customer *", exact: true })).toHaveValue("Mr. Das");
      } else {
        // Customer Select items intentionally include location context (for
        // example "Mr. Das · Kanpur"). Assert the selected Customer control,
        // not an exact incidental text node, so this still proves the drawer
        // quick action carried the selected customer into the canonical flow.
        await expect(dialog.getByRole("combobox").first()).toContainText("Mr. Das");
      }
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).not.toBeVisible();
    }
  });

  test("drawer opens from a customer card and every CRM tab keeps it alive", async ({ page }) => {
    await openCustomersDeskModule(page);
    await openCustomerDrawer(page, "Mr. Das");

    // Walk the canonical CRM tabs (labels carry live counts, e.g. "Sites (1)").
    // Finance and procurement are intentionally not Customer Desk tabs.
    const tabs: Array<RegExp | string> = [
      "Overview",
      /^Sites \(\d+\)$/,
      /^Tasks \(\d+\)$/,
      /^Quotations \(\d+\)$/,
      /^Visits \(\d+\)$/,
      /^History & notes \(\d+\)$/,
      /^Files \(\d+\)$/,
    ];
    for (const tab of tabs) {
      await clickDrawerTab(page, tab);
    }

    // The drawer must still be open on the final tab with the customer loaded.
    const drawer = recordDrawer(page);
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Mr. Das").first()).toBeVisible();
  });
});

test.describe("signed-out flow", () => {
  test("sign-out from the profile menu returns to /signin", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Open profile menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/signin/, { timeout: 60_000 });
    await expect(page.getByLabel("Work email")).toBeVisible({ timeout: 60_000 });
  });
});

test.describe("mobile overflow guard (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("workdesk never scrolls horizontally on a phone viewport", async ({ page }) => {
    await page.goto("/");
    await expect(pulseRegion(page)).toBeVisible({ timeout: 90_000 });
    await expectNoHorizontalOverflow(page, "workdesk @390px");
  });

  test("customer drawer never scrolls horizontally on a phone viewport", async ({ page }) => {
    await openCustomersDeskModule(page);
    await openCustomerDrawer(page, "Mr. Das");

    await expectNoHorizontalOverflow(page, "customer drawer @390px");
  });
});
