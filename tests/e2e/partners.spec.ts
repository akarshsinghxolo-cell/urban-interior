import { expect, test } from "@playwright/test";

for (const kind of ["vendor", "contractor"] as const) {
  test(`${kind} GPS keeps typed addresses and ignores lookups after manual coordinate edits`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
        getCurrentPosition(success: PositionCallback) {
          success({ coords: { latitude: 26.7606, longitude: 83.3732, accuracy: 10 }, timestamp: Date.now() } as GeolocationPosition);
        },
        watchPosition() { return 1; },
        clearWatch() {},
      } });
    });
    let release!: () => void;
    let started!: () => void;
    let gate = new Promise<void>((resolve) => { release = resolve; });
    let requestStarted = new Promise<void>((resolve) => { started = resolve; });
    await page.route("**/api/location/reverse?*", async (route) => {
      started();
      await gate;
      await route.fulfill({ json: { display_name: "GPS supplied address", address: { city: "GPS city", suburb: "GPS locality" } } });
    });
    await page.goto(`/workspace/${kind}s`);
    await page.getByRole("button", { name: `Add ${kind}`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    const city = kind === "vendor" ? dialog.getByLabel("City", { exact: true }) : dialog.getByPlaceholder("City", { exact: true });
    const address = kind === "vendor" ? dialog.getByRole("textbox", { name: "Full address", exact: true }) : dialog.getByPlaceholder("Address", { exact: true });
    const locality = kind === "vendor" ? dialog.getByLabel("Locality", { exact: true }) : dialog.getByPlaceholder("Locality / Area", { exact: true });
    const coordinates = kind === "vendor" ? dialog.getByLabel("Coordinates", { exact: true }) : dialog.getByPlaceholder("26.739800, 83.371200", { exact: true });
    await dialog.getByRole("button", { name: "Capture GPS", exact: true }).click();
    await requestStarted;
    await expect(coordinates).toHaveValue("26.760600, 83.373200");
    await city.fill("My typed city");
    await address.fill("My typed address");
    release();
    await expect(locality).toHaveValue("GPS locality");
    await expect(city).toHaveValue("My typed city");
    await expect(address).toHaveValue("My typed address");

    gate = new Promise<void>((resolve) => { release = resolve; });
    requestStarted = new Promise<void>((resolve) => { started = resolve; });
    await locality.fill("");
    await dialog.getByRole("button", { name: "Capture GPS", exact: true }).click();
    await requestStarted;
    await coordinates.fill("25.000000, 82.000000");
    const response = page.waitForResponse((row) => row.url().includes("/api/location/reverse?"));
    release();
    await (await response).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(coordinates).toHaveValue("25.000000, 82.000000");
    await expect(locality).toHaveValue("");
    await expect(dialog.getByRole("button", { name: "Capture GPS", exact: true })).toBeEnabled();

    gate = new Promise<void>((resolve) => { release = resolve; });
    requestStarted = new Promise<void>((resolve) => { started = resolve; });
    await dialog.getByRole("button", { name: "Capture GPS", exact: true }).click();
    await requestStarted;
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: `Add ${kind}`, exact: true }).click();
    const staleResponse = page.waitForResponse((row) => row.url().includes("/api/location/reverse?"));
    release();
    await (await staleResponse).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(coordinates).toHaveValue("");
    await expect(address).toHaveValue("");
    await expect(city).toHaveValue("");
    await expect(locality).toHaveValue("");
  });

  test(`${kind} photo draft stays local and is removed when discarded`, async ({ page }) => {
    const fileName = `${kind}-refactor-photo.png`;
    const uploadRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/uploads/initiate") uploadRequests.push(request.url());
    });
    await page.goto(`/workspace/${kind}s`);
    await page.getByRole("button", { name: `Add ${kind}`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').first().setInputFiles({
      name: fileName,
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNosAAAAASUVORK5CYII=", "base64"),
    });
    await expect(dialog.getByTitle(`Preview ${fileName}`)).toBeVisible();
    const queued = () => page.evaluate((name) => new Promise<Array<{ deferred: boolean; status: string }>>((resolve, reject) => {
      const request = indexedDB.open("urban-castle-uploads");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const rows = db.transaction("upload_items", "readonly").objectStore("upload_items").getAll();
        rows.onerror = () => { db.close(); reject(rows.error); };
        rows.onsuccess = () => { db.close(); resolve(rows.result.filter((row) => row.fileName === name)); };
      };
    }), fileName);
    await expect.poll(async () => (await queued()).map((row) => row.deferred)).toEqual([true]);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(queued).toEqual([]);
    expect(uploadRequests).toEqual([]);
  });
}

test("vendor directory filters, correct profile, scoped tabs and deep-link reload", async ({ page }) => {
  const note = `Partner workspace QA persistence check ${Date.now()}`;
  await page.goto("/workspace/vendors");
  await expect(page.getByRole("heading", { name: "Vendors", exact: true })).toBeVisible();
  await page.getByLabel("Search vendors").fill("Ceiling Hub");
  await expect(page.getByRole("button", { name: "Open Build Mart", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open Ceiling Hub", exact: true }).click();
  const profile = page.getByTestId("partner-profile");
  await expect(profile.getByRole("heading", { name: "Ceiling Hub", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/workspace\/vendors\/ven-ceiling(?:[/?#]|$)/);
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
  await profile.getByRole("button", { name: "Create RA bill", exact: true }).click();
  const billDialog = page.getByRole("dialog", { name: "Create RA bill", exact: true });
  await expect(billDialog.getByRole("button", { name: "Submit bill", exact: true })).toBeDisabled();
  await billDialog.getByPlaceholder("e.g. 58000").fill("-1");
  await expect(billDialog.getByRole("button", { name: "Submit bill", exact: true })).toBeDisabled();
  await billDialog.getByPlaceholder("e.g. 58000").fill("1000");
  await expect(billDialog.getByRole("button", { name: "Submit bill", exact: true })).toBeEnabled();
  await billDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  // Exercise keyboard navigation without hovering over the transient mobile GPS notice.
  await profile.getByRole("button", { name: /WO-2026-301/ }).press("Enter");
  await expect(page).toHaveURL(/work-orders\/wo-das-ceiling/);
});

test("a contractor can be created without a photo and survives a reload", async ({ page }) => {
  const name = `QA photo-optional contractor ${Date.now()}`;
  await page.goto("/workspace/contractors");
  await page.getByRole("button", { name: "Add contractor", exact: true }).click();
  await page.getByPlaceholder("Contractor / firm name", { exact: true }).fill(name);
  await page.getByLabel("Primary number", { exact: true }).fill(`90000${String(Date.now()).slice(-5)}`);
  await page.getByPlaceholder("City", { exact: true }).fill("Gorakhpur");
  await page.getByRole("button", { name: "False Ceiling", exact: true }).click();
  await page.getByRole("button", { name: "Gypsum False Ceiling", exact: true }).click();
  const commit = page.waitForResponse((response) => response.url().includes("/api/operations/commit") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create contractor", exact: true }).click();
  expect((await commit).status()).toBe(200);
  await expect(page.getByTestId("partner-profile").getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/workspace\/contractors\/[^/?#]+(?:[/?#]|$)/);
  await page.reload();
  await expect(page.getByTestId("partner-profile").getByRole("heading", { name, exact: true })).toBeVisible();
});
