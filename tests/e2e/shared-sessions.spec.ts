import { expect, test, type Page } from "@playwright/test";
import { dismissOnboardingTourIfPresent } from "./helpers/smoke-actions";

async function editNotes(page: Page, notes: string) {
    await page.getByTestId("partner-profile").getByRole("button", { name: "Edit profile", exact: true }).click();
    await page.getByRole("textbox", { name: "Notes", exact: true }).fill(notes);
}

async function saveNotes(page: Page) {
    const commit = page.waitForResponse(response => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save Vendor", exact: true }).click();
    expect((await commit).status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Edit Vendor", exact: true })).toHaveCount(0);
}

async function signInProcurement(page: Page) {
    await page.goto("/signin");
    await page.getByLabel("Work email").fill("procurement@urban.test");
    await page.getByLabel("Password", { exact: true }).fill("qa-session-password");
    await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace/);
    await dismissOnboardingTourIfPresent(page);
}

test("two signed-in sessions share updates while a dirty form retains its local draft", async ({ page, browser, baseURL }) => {
    const observerContext = await browser.newContext({ baseURL });
    const observer = await observerContext.newPage();
    try {
        await signInProcurement(observer);
        for (const session of [page, observer]) {
            await session.goto("/workspace/vendors/ven-build");
            await expect(session.getByTestId("partner-profile")).toBeVisible();
            await session.getByRole("group", { name: "Partner sections" }).getByRole("button", { name: "Profile", exact: true }).click();
        }
        const note = `Shared session ${Date.now()}`;
        await editNotes(page, note);
        await saveNotes(page);
        await observer.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(observer.getByTestId("partner-profile").getByText(note, { exact: true })).toBeVisible();

        const localDraft = `${note} local unsaved`;
        await editNotes(observer, localDraft);
        await editNotes(page, `${note} remote newer`);
        await saveNotes(page);
        await observer.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(observer.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue(localDraft);
        await observer.getByRole("button", { name: "Cancel", exact: true }).click();
        await observer.getByRole("button", { name: /Discard/i }).click();
        await expect(observer.getByRole("heading", { name: "Edit Vendor", exact: true })).toHaveCount(0);
        await observer.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(observer.getByTestId("partner-profile").getByText(`${note} remote newer`, { exact: true })).toBeVisible();
    } finally {
        await observerContext.close();
    }
});

test("a stale second-session edit cannot overwrite a newer canonical Vendor record", async ({ page, browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const other = await context.newPage();
    try {
        await signInProcurement(other);
        for (const session of [page, other]) {
            await session.goto("/workspace/vendors/ven-ceiling");
            await expect(session.getByTestId("partner-profile")).toBeVisible();
        }
        const newer = `Confirmed newer ${Date.now()}`, stale = `Stale edit ${Date.now()}`;
        await editNotes(other, stale);
        await editNotes(page, newer);
        await saveNotes(page);
        const conflict = other.waitForResponse(response => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
        await other.getByRole("button", { name: "Save Vendor", exact: true }).click();
        expect((await conflict).status()).toBe(409);
        await expect(other.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue(stale);
        await page.reload();
        await page.getByRole("group", { name: "Partner sections" }).getByRole("button", { name: "Profile", exact: true }).click();
        await expect(page.getByTestId("partner-profile").getByText(newer, { exact: true })).toBeVisible();
    } finally {
        await context.close();
    }
});

test("an open session revalidates when its module access is revoked", async ({ page }) => {
    await page.goto("/workspace/vendors/ven-build");
    await expect(page.getByTestId("partner-profile")).toBeVisible();
    let denied = false;
    await page.route("**/api/changes?*", async route => {
        denied = true;
        await route.fulfill({ status: 403, json: { error: "Your role cannot open Vendors." } });
    });
    const navigation = page.waitForEvent("framenavigated", frame => frame === page.mainFrame());
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await navigation;
    expect(denied).toBe(true);
});
