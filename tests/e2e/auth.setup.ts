import { expect, test } from "@playwright/test";
import { dismissOnboardingTourIfPresent, pulseRegion, QA_OWNER_EMAIL, QA_OWNER_PASSWORD } from "./helpers/smoke-actions";
import { STORAGE_STATE_PATH } from "./helpers/config";

/**
 * Setup project: signs in through the REAL UI exactly once and saves the
 * authenticated browser state (uc_session cookie + localStorage token) for
 * reuse by every test in the smoke project.
 *
 * This is not just a speed optimization — the app rate-limits login to
 * 5 attempts per email per 15 minutes (src/app/api/auth/login/route.ts), so
 * signing in per-test would make the pack fail deterministically from the
 * sixth test onward (in CI too).
 */
test("authenticate as the seeded owner", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/signin/, { timeout: 90_000 });
  const workEmail = page.getByLabel("Work email");
  await expect(workEmail).toBeVisible({ timeout: 60_000 });
  await workEmail.fill(QA_OWNER_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(QA_OWNER_PASSWORD);
  await page
    .locator("form")
    .getByRole("button", { name: "Sign in" })
    .click();

  await expect(
    pulseRegion(page).getByRole("heading", { name: /Good (morning|afternoon|evening)|Working late/ }),
  ).toBeVisible({ timeout: 90_000 });

  await dismissOnboardingTourIfPresent(page);
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
