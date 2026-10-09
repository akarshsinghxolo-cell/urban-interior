import { expect, test, type Page } from "@playwright/test";

async function openCentre(page: Page) {
  await page.goto("/workspace/media/communication");
  const panel = page.locator('main [role="tabpanel"]:not([hidden])');
  await expect(panel.getByRole("heading", { name: "Communication Centre", exact: true })).toBeVisible();
  await expect(panel).not.toContainText(/Loading module data|Preparing module data/);
  return panel;
}

test("email is saved as prepared, survives reload, and fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const panel = await openCentre(page);
  let deliveries = 0;
  await page.route("**/api/whatsapp/send", async (route) => { deliveries++; await route.abort(); });
  await panel.getByRole("button", { name: /Email.*Formal email communication/ }).click();
  const dialog = page.getByRole("dialog", { name: "Prepare Email" });
  await expect(dialog).toContainText("does not send an email");
  const subject = `Prepared QA ${Date.now()}`;
  await dialog.getByLabel("Subject", { exact: true }).fill(subject);
  await dialog.getByLabel("Message", { exact: true }).fill("Prepared content for separate delivery");
  const save = dialog.getByRole("button", { name: "Save prepared message", exact: true });
  await expect(save).toBeInViewport();
  expect(await dialog.evaluate((el) => el.getBoundingClientRect().right <= innerWidth)).toBe(true);
  await save.click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const record = page.getByRole("button").filter({ has: page.getByText(subject, { exact: true }) });
  await expect(record).toContainText("Prepared");
  expect(deliveries).toBe(0);
});

test("interrupted history save retains the same WhatsApp payload and creates one record on retry", async ({ page }) => {
  const panel = await openCentre(page);
  const requests: unknown[] = [];
  await page.route("**/api/whatsapp/send", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { success: true } });
  });
  let rejectCommit = true;
  await page.route("**/api/operations/commit", async (route) => {
    if (rejectCommit && JSON.stringify(route.request().postDataJSON()).includes("QA interrupted message")) {
      rejectCommit = false;
      await route.fulfill({ status: 202, json: { status: "processing" } });
    } else await route.continue();
  });
  await panel.getByRole("button", { name: "New message", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Send via WhatsApp" });
  await dialog.getByLabel("Subject", { exact: true }).fill("QA interrupted message");
  await dialog.getByRole("button", { name: "Send WhatsApp", exact: true }).click();
  const retry = dialog.getByRole("button", { name: "Retry same message", exact: true });
  await expect(retry).toBeEnabled();
  await expect(dialog.getByLabel("Customer", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Subject", { exact: true })).toBeDisabled();
  await retry.click();
  await expect(dialog).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  await page.reload();
  const record = page.getByRole("button").filter({ has: page.getByText("QA interrupted message", { exact: true }) });
  await expect(record).toHaveCount(1);
  await expect(record).toContainText("Sent");
});

test("attachment upload starts before Send and blocks sending while unfinished", async ({ page }) => {
  const panel = await openCentre(page);
  let uploadTarget: Record<string, unknown> | undefined;
  await page.route("**/api/uploads/initiate", async (route) => {
    uploadTarget = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: "QA upload paused", code: "NETWORK_ERROR" } });
  });
  await panel.getByRole("button", { name: "New message", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Send via WhatsApp" });
  await dialog.getByLabel("Subject", { exact: true }).fill("Attachment readiness");
  const customerId = await dialog.getByLabel("Customer", { exact: true }).inputValue();
  await dialog.locator('input[type="file"]').setInputFiles({ name: "qa-reference.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nQA attachment") });
  await expect.poll(() => uploadTarget).toBeTruthy();
  expect(uploadTarget).toMatchObject({ targetEntityType: "customer", targetEntityId: customerId, sourceFlow: "communication_compose" });
  await expect(dialog.getByRole("button", { name: "Send WhatsApp", exact: true })).toBeDisabled();
  await expect(dialog).toContainText("Waiting for attachments");
  await dialog.getByRole("button", { name: "Remove qa-reference.pdf", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Send WhatsApp", exact: true })).toBeEnabled();
});
