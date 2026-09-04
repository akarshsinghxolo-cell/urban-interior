import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Unit tests live in tests/*.test.ts. Scope the glob so vitest does NOT
    // collect the Playwright e2e specs in tests/e2e/*.e2e.spec.ts (vitest's
    // default include matches **/*.spec.ts and cannot run Playwright tests).
    include: ["tests/**/*.test.ts"],
  },
});
