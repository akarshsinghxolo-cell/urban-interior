import { expect, test, type Locator, type Page } from "@playwright/test";
import { WORKSPACE_ROUTE_DEFINITIONS } from "../../src/lib/rdash/workspace-routes";

// Check content inside the shell too: overflow-x-hidden can hide broken layouts
// while document.scrollWidth still matches the phone width.
async function expectContentFits(root: Locator) {
  await expect.poll(() => root.evaluate((panel) => {
    const failures: string[] = [];
    for (const element of panel.querySelectorAll<HTMLElement>("*")) {
      if (!element.getClientRects().length || element.getAttribute("aria-hidden") === "true") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || (rect.left >= -1 && rect.right <= innerWidth + 1)) continue;
      let scrollable = false;
      for (let parent = element.parentElement; parent && parent !== panel; parent = parent.parentElement) {
        const bounds = parent.getBoundingClientRect();
        if (["auto", "scroll"].includes(getComputedStyle(parent).overflowX)
          && bounds.left >= -1 && bounds.right <= innerWidth + 1) {
          scrollable = true;
          break;
        }
      }
      if (!scrollable) failures.push(`${element.tagName}#${element.id}: ${element.textContent?.trim().slice(0, 70)}`);
    }
    return failures.slice(0, 5);
  })).toEqual([]);
  // Wide data tables must be reachable by a local scroller, not clipped.
  const scrollers = root.locator("div");
  await scrollers.evaluateAll((elements) => {
    for (const element of elements) {
      if (["auto", "scroll"].includes(getComputedStyle(element).overflowX)
        && element.scrollWidth > element.clientWidth + 1) {
        element.scrollLeft = element.scrollWidth;
        if (!element.scrollLeft) throw new Error("Horizontal content cannot be reached");
        element.scrollLeft = 0;
      }
    }
  });
}

async function openModule(page: Page, path: string) {
  await page.goto(path);
  const panel = page.locator('main [role="tabpanel"]:not([hidden])');
  await expect(panel).toBeVisible();
  await expect(panel).not.toContainText(/Loading module data|Preparing module data|Loading workspace module/);
  await expect.poll(() => panel.innerText().then(text => text.length)).toBeGreaterThan(80);
  const skip = page.getByRole("button", { name: "Skip tour", exact: true });
  if (await skip.isVisible()) await skip.click();
  return panel;
}

const views: Record<string, string[]> = {
  "/workspace/media": ["Catalogue links", "Pinterest boards", "Reference media", "Operational audit"],
  "/workspace/reports/sales": ["Sales Overview", "Quotation Conversion", "Lead Sources"],
  "/workspace/reports/collections": ["Collections", "Receivables Aging"],
  "/workspace/reports/operations": ["Staff Productivity", "Visit Compliance", "Task Throughput"],
  "/workspace/reports/financial": ["Work Order P&L", "Vendor Exposure", "Tax / GST"],
};

for (const width of [320, 390]) {
  for (const family of ["media", "finance", "staff", "reports", "settings", "masters"]) {
    test(`${family} layouts and subviews fit a ${width}px phone`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const prefix = `/workspace/${family}`;
      const routes = WORKSPACE_ROUTE_DEFINITIONS.filter(route => route.canonicalPath === prefix || route.canonicalPath.startsWith(`${prefix}/`));
      for (const { canonicalPath } of routes) {
        const panel = await openModule(page, canonicalPath);
        await expectContentFits(panel);
        if (canonicalPath === "/workspace/media/drive") {
          const mobileSessions = panel.getByTestId("resumable-sessions-mobile").first();
          if (await mobileSessions.count()) {
            await expect(mobileSessions).toBeVisible();
            await expect(panel.getByTestId("resumable-sessions-table").first()).toBeHidden();
          }
        }
        for (const view of views[canonicalPath] || []) {
          await panel.getByRole("button", { name: view, exact: true }).click();
          await expectContentFits(panel);
        }
      }
    });
  }

  test(`forms stay usable on a ${width}px phone and short landscape viewport`, async ({ page }) => {
    for (const height of [844, 480]) {
      await page.setViewportSize({ width, height });
      for (const [path, action] of [
        ["/workspace/media/communication", "New message"],
        ["/workspace/masters/article-variants", "Manage variants"],
        ["/workspace/settings/approval-rules", "New Policy"],
        ["/workspace/finance/collections", "Add collection milestone"],
      ]) {
        const panel = await openModule(page, path);
        await panel.getByRole("button", { name: action, exact: true }).first().click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expectContentFits(dialog);
        const lastButton = dialog.getByRole("button").filter({ hasNotText: /^Close$/ }).last();
        await lastButton.scrollIntoViewIfNeeded();
        await expect(lastButton).toBeInViewport();
        await dialog.getByRole("button", { name: "Close", exact: true }).click();
        await expect(dialog).toHaveCount(0);
      }
    }
  });
}
