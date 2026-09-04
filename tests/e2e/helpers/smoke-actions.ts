import { expect, type Page } from "@playwright/test";

/**
 * Shared helpers for the e2e smoke pack.
 *
 * Selectors are derived from the real UI (src/app/signin/page.tsx,
 * WorkspacePulseStrip, WorkspaceHeader, CustomerDesk, DetailPanel) and prefer
 * role/label queries so refactors of layout classes don't break the pack.
 *
 * QA identity: the local Supabase mock (scripts/qa-mock-supabase.ts) accepts
 * owner@urban.test with ANY password and maps it to the seeded owner staff
 * record (see AGENTS.md "Local QA stack").
 */
export const QA_OWNER_EMAIL = "owner@urban.test";
export const QA_OWNER_PASSWORD = "urban-castle-qa-password";

/** The live pulse strip on the Workdesk dashboard. */
export function pulseRegion(page: Page) {
  return page.getByRole("region", { name: "Workspace pulse" });
}

/** The slide-over record context panel ("customer drawer"). */
export function recordDrawer(page: Page) {
  return page.locator('aside[aria-label="Record context panel"]');
}

/**
 * Dismisses the onboarding tour overlay when it appears after sign-in.
 * The tour remembers dismissal in localStorage, but every Playwright test gets
 * a fresh context, so it shows up on every sign-in.
 */
export async function dismissOnboardingTourIfPresent(page: Page): Promise<void> {
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  try {
    await skipTour.click({ timeout: 8_000 });
    await expect(skipTour).toHaveCount(0, { timeout: 10_000 });
  } catch {
    // Tour not rendered (or already gone) — nothing to dismiss.
  }
}

/**
 * Opens the Customers Desk module through the workspace navigation.
 *
 * The workdesk pulse tile labelled "N Customers" intentionally routes to
 * Customer Timeline (WorkspacePulseStrip), so the reliable path to the DESK
 * (which hosts the customer cards) is the navigation sidebar: open the nav
 * drawer and click "Customer Desk". Works on desktop and mobile viewports.
 */
export async function openCustomersDeskModule(page: Page): Promise<void> {
  // Always start from the signed-in workdesk (callers may hold a blank page).
  await page.goto("/");

  // Desktop shows the sidebar directly (expanded or as an icon rail); mobile
  // tucks navigation behind "Open navigation". Try the direct click first and
  // fall back to the nav drawer — self-healing across viewports/collapse state.
  const openNav = page.getByRole("button", { name: "Open navigation" });
  const deskButton = page.getByRole("button", { name: "Customer Desk", exact: true }).first();
  try {
    await deskButton.click({ timeout: 5_000 });
  } catch {
    await openNav.click();
    await deskButton.click();
    const closeNav = page.getByRole("button", { name: "Close navigation" }).first();
    if (await closeNav.isVisible().catch(() => false)) await closeNav.click();
  }

  // Active module breadcrumb + the module's Customers heading.
  const crumb = page
    .getByRole("navigation", { name: "Workspace location" })
    .getByRole("button", { name: "Customer Desk" });
  await expect(crumb).toBeDisabled({ timeout: 60_000 });
  await expect(
    page.getByRole("heading", { name: "Customers", exact: true }).first(),
  ).toBeVisible({ timeout: 60_000 });
}

/** Opens the customer drawer by clicking the seeded "Mr. Das" card. */
export async function openCustomerDrawer(page: Page, customerName = "Mr. Das"): Promise<void> {
  await page.getByRole("button", { name: new RegExp(customerName) }).first().click();
  const drawer = recordDrawer(page);
  await expect(drawer).toBeVisible({ timeout: 30_000 });
  await expect(drawer.getByText(customerName).first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Clicks a tab button inside the customer drawer and asserts the drawer is
 * still open afterwards. Tab labels carry live counts (e.g. "Sites (1)"), so
 * callers pass an anchored regex. "Overview" exists twice (drawer header tab +
 * portfolio tab row) — the portfolio one is the last in DOM order.
 */
export async function clickDrawerTab(page: Page, tabName: RegExp | string): Promise<void> {
  const drawer = recordDrawer(page);
  const tab =
    typeof tabName === "string"
      ? drawer.getByRole("button", { name: tabName, exact: true }).last()
      : drawer.getByRole("button", { name: tabName }).first();
  await tab.click();
  await expect(drawer).toBeVisible();
}

/**
 * e2e regression net for the mobile overflow fixes (Tasks 26–28): the document
 * must never scroll horizontally — content hosts scroll internally instead.
 */
export async function expectNoHorizontalOverflow(page: Page, contextLabel: string): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    metrics.scrollWidth,
    `${contextLabel}: documentElement.scrollWidth ${metrics.scrollWidth} exceeds viewport ${metrics.innerWidth}`,
  ).toBeLessThanOrEqual(metrics.innerWidth);
}
