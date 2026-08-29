import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Notification panel mobile usability", () => {
  test("the notification popover is viewport-pinned on phones instead of overflowing the left edge", async () => {
    const center = await source("src/components/rdash/NotificationCenter.tsx");
    // Mobile: fixed full-width sheet pinned to the viewport with side margins.
    expect(center).toContain("fixed inset-x-3 top-16");
    expect(center).toContain("max-h-[calc(100dvh-5rem)]");
    // Desktop keeps the right-anchored 22rem popover.
    expect(center).toContain("sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:max-h-[32rem] sm:w-[22rem]");
  });

  test("panel header actions wrap to a second row instead of wrapping mid-button on phones", async () => {
    const center = await source("src/components/rdash/NotificationCenter.tsx");
    expect(center).toContain("flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-2.5");
    // Every header action must be non-shrinking and single-line.
    expect(center).toContain("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[10px] font-medium text-primary");
    expect(center).toContain("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground");
    expect(center).toContain("shrink-0 whitespace-nowrap rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground");
  });

  test("per-item snooze/dismiss actions are touch-visible (hover-reveal only on sm+)", async () => {
    const center = await source("src/components/rdash/NotificationCenter.tsx");
    // The old hover-only pattern must be gone.
    expect(center).not.toContain("opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100");
    // Touch-visible by default, hover-reveal restored on sm+.
    const touchVisible = center.match(/opacity-100 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100/g) || [];
    expect(touchVisible.length).toBeGreaterThanOrEqual(2);
  });

  test("dashboard greeting time stays on one line on phones", async () => {
    const pulse = await source("src/components/rdash/WorkspacePulseStrip.tsx");
    expect(pulse).toContain('rd-tabular whitespace-nowrap font-semibold text-foreground/80');
  });
});

describe("Theme reachable on mobile", () => {
  test("profile dropdown exposes a theme switcher on every viewport", async () => {
    const header = await source("src/components/rdash/WorkspaceHeader.tsx");
    expect(header).toContain('import { ThemeMenuItem } from "./ThemeMenuItem"');
    expect(header).toContain("<ThemeMenuItem />");
  });

  test("ThemeMenuItem cycles light → dark → system with hydration guard", async () => {
    const item = await source("src/components/rdash/ThemeMenuItem.tsx");
    expect(item).toContain('setTheme("dark")');
    expect(item).toContain('setTheme("system")');
    expect(item).toContain('setTheme("light")');
    expect(item).toContain("if (!mounted) return null");
    expect(item).toContain("<DropdownMenuItem");
  });
});
