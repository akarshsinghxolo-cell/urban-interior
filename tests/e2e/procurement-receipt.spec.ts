import { expect, test } from "@playwright/test";

test("GRN uses remaining PO quantities and uploads to the existing PO before filing", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workspace/procurement/grn");
    const panel = page.locator('main [role="tabpanel"]:not([hidden])');
    await expect(panel.getByRole("heading", { name: "Delivery / GRN", exact: true })).toBeVisible();
    await expect(panel).not.toContainText(/Loading module data|Preparing module data/);
    await panel.getByRole("button", { name: "File GRN", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "File GRN" });
    await dialog.getByLabel("Against PO", { exact: true }).selectOption("po-das-ceiling");
    await expect(dialog).toContainText("Remaining");
    const quantities = dialog.getByRole("spinbutton");
    await expect(quantities.first()).toHaveValue("2");
    // The other articles were fully received in the seed delivery.
    for (let index = 1; index < await quantities.count(); index++) await expect(quantities.nth(index)).toHaveValue("0");
    let target: Record<string, unknown> | undefined;
    await page.route("**/api/uploads/initiate", async (route) => {
        target = route.request().postDataJSON();
        await route.fulfill({ status: 503, json: { error: "QA upload paused", code: "NETWORK_ERROR" } });
    });
    const fileChooser = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "Add receiving proofs", exact: true }).click();
    await (await fileChooser).setFiles({ name: "qa-delivery.jpg", mimeType: "image/jpeg", buffer: Buffer.from("QA receiving evidence") });
    await expect.poll(() => target).toBeTruthy();
    expect(target).toMatchObject({ targetEntityType: "purchase_order", targetEntityId: "po-das-ceiling", purpose: "purchase_order" });
    await expect(dialog.getByLabel("Against PO", { exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "File GRN", exact: true })).toBeDisabled();
    await expect(dialog).toContainText("wait for uploads to complete");
    expect(await dialog.evaluate((element) => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
    await dialog.getByRole("button", { name: "File GRN", exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "File GRN", exact: true })).toBeInViewport();
});
