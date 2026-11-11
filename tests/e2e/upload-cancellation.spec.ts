import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("missing local uploads cancel without server cleanup and stay gone after refresh", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Work email").fill("owner@urban.test");
  await page.getByLabel("Password", { exact: true }).fill("local-test-password");
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/signin/);
  await page.goto("/workspace/customers");
  await expect(page.getByRole("button", { name: /pending background items/ })).toBeVisible();
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await expect(page.getByRole("button", { name: "Skip tour", exact: true })).toHaveCount(0);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("urban-castle-uploads", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["upload_batches", "upload_items"], "readwrite");
    const batch = { id: "qa-cancel-batch", sourceLabel: "Cancellation test", targetLabel: "Disposable test uploads", status: "open", createdAt: "2026-11-01" };
    tx.objectStore("upload_batches").put(batch);
    for (const id of ["one", "two"]) tx.objectStore("upload_items").put({
      id: `qa-cancel-${id}`, batchId: batch.id, fileName: `Missing test ${id}.png`,
      status: "paused", retryCount: 1343, retryAt: "2020-01-01",
      sizeBytes: 100, confirmedBytes: 0, progress: 0, createdAt: "2026-11-01",
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  const cleanupRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/uploads/")) cleanupRequests.push(request.url());
  });
  await page.reload();
  await page.getByRole("button", { name: /2 pending background items/ }).press("Enter");
  await expect(page.getByText("Original file required", { exact: true })).toHaveCount(2);
  await expect(page.getByText("1343 retries")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry all", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel batch", exact: true }).first().click();
  const confirmation = page.getByRole("dialog", { name: "Cancel these uploads?", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel uploads", exact: true }).click();
  await expect(page.getByText("No pending uploads", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /0 pending background items/ }).press("Enter");
  await expect(page.getByText("No pending uploads", { exact: true })).toBeVisible();
  expect(cleanupRequests).toEqual([]);
});
