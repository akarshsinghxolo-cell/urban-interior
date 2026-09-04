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
  test("drawer opens from a customer card and every tab keeps it alive", async ({ page }) => {
    await openCustomersDeskModule(page);
    await openCustomerDrawer(page, "Mr. Das");

    // Walk the portfolio tabs (labels carry live counts, e.g. "Sites (1)").
    // At least Overview, Sites and Quotations are required; the extra tabs
    // widen the regression net from the Task 26 drawer overflow fixes.
    const tabs: Array<RegExp | string> = [
      "Overview",
      /^Sites \(\d+\)$/,
      /^Tasks \(\d+\)$/,
      /^Quotations \(\d+\)$/,
      /^Payments \(\d+\)$/,
      /^Visits \(\d+\)$/,
      /^Activity \(\d+\)$/,
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
