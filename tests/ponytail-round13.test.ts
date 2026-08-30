import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

describe("Ponytail round 13 guards", () => {
  test("unused dependencies stay out of package.json", async () => {
    const pkg = JSON.parse(await source("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    // Removed 2026-08 after repo-wide import scan: none of these were imported
    // anywhere in src/ or config. Re-adding them needs a usage, not a hunch.
    const removed = [
      "@dnd-kit/sortable", "@hookform/resolvers", "@mdxeditor/editor",
      "@tanstack/react-query", "@tanstack/react-table", "date-fns",
      "framer-motion", "react-markdown", "sharp", "z-ai-web-dev-sdk", "zod",
    ];
    for (const name of removed) {
      expect(deps[name], `${name} re-introduced without an import`).toBeUndefined();
    }
  });

  test("command palette surfaces recent modules in its empty state", async () => {
    const palette = await source("src/components/rdash/CommandPalette.tsx");
    expect(palette).toContain("s.moduleHistory");
    expect(palette).toContain("Recent modules");
    expect(palette).toContain("setActiveModule(tab.moduleId)");
  });

  test("palette rows and chips keep 44px touch targets on mobile", async () => {
    const palette = await source("src/components/rdash/CommandPalette.tsx");
    // Result rows: mobile min-height, compact again on sm+.
    expect(palette).toContain("min-h-11 w-full items-center gap-2.5 rounded-md px-2.5");
    expect(palette).toContain("sm:min-h-0 sm:py-1.5");
    // Recent-search chips and recent-module tiles are touch-sized too.
    expect(palette).toContain("min-h-11 rounded-md border px-3 py-2 text-[11px]");
    expect(palette).toContain("min-h-11 items-center gap-2 rounded-md border border-border");
  });
});
