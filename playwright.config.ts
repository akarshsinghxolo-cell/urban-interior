import { defineConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * E2E smoke pack — drives the REAL Urban Castle UI against the REAL dev server
 * and the local Supabase mock (scripts/qa-mock-supabase.ts).
 *
 * Environment recipe (see worklog Task 28 + AGENTS.md "Local QA stack"):
 * - The sandbox watchdog kills any `next dev` not bound to port 3000, so the
 *   app webServer is pinned to 3000.
 * - `reuseExistingServer: true` is intentional and unconditional: in CI the
 *   ports are free so both servers boot fresh; in the dev sandbox the config
 *   reuses the already-running double-forked servers instead of failing.
 * - The app webServer passes the mock Supabase env explicitly. Env vars take
 *   precedence over .env.local, so this works both in CI (no .env.local) and
 *   locally (values identical to the committed recipe).
 *
 * Chromium system-library fallback: if `bunx playwright install chromium`
 * downloads a build that cannot launch because system libs are missing and
 * `playwright install-deps` is unavailable (no root), point
 * E2E_CHROME_EXECUTABLE at any system Chrome binary (for example the
 * agent-browser Chrome under /home/z/.agent-browser/browsers/) — the config
 * below feeds it to Playwright via launchOptions.executablePath. Only set the
 * env var when needed; leave it unset to use the official Playwright build.
 */

const MOCK_SUPABASE_PORT = 3210;
const APP_PORT = 3000;
// NOTE: paths are process.cwd()-relative because Playwright compiles this
// config to CJS (import.meta is unavailable) and always invokes it from the
// repo root (npm run test:e2e).
export const STORAGE_STATE = resolve(process.cwd(), "test-results", ".auth", "owner.json");

mkdirSync(resolve(process.cwd(), "test-results", ".auth"), { recursive: true });

const sharedUse = {
  baseURL: `http://127.0.0.1:${APP_PORT}`,
  viewport: { width: 1280, height: 800 },
  // `next dev` compiles lazily; give every step and navigation generous budgets.
  actionTimeout: 20_000,
  navigationTimeout: 90_000,
  trace: "retain-on-failure" as const,
  screenshot: "only-on-failure" as const,
  launchOptions: process.env.E2E_CHROME_EXECUTABLE
    ? { executablePath: process.env.E2E_CHROME_EXECUTABLE }
    : {},
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 150_000,
  expect: { timeout: 20_000 },
  retries: 0,
  // Single worker + no parallelism: every test signs in fresh and the QA mock
  // database is shared, so parallel runs could race on workspace state.
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  webServer: [
    {
      name: "qa-mock-supabase",
      command: "bun run scripts/qa-mock-supabase.ts",
      port: MOCK_SUPABASE_PORT,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      name: "next-dev",
      command: `./node_modules/.bin/next dev -p ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        SUPABASE_URL: `http://127.0.0.1:${MOCK_SUPABASE_PORT}`,
        SUPABASE_PUBLISHABLE_KEY: "qa-publishable-key",
        SUPABASE_SECRET_KEY: "qa-secret-key",
        UC_SESSION_SECRET: "qa-mock-local-session-secret-0123456789abcdef0123456789",
      },
    },
  ],
  projects: [
    {
      // Signs in once through the real UI and saves storageState (see
      // tests/e2e/auth.setup.ts for why per-test sign-in cannot work: the
      // login endpoint rate-limits to 5 attempts / 15 min per email).
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...sharedUse },
    },
    {
      name: "smoke",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...sharedUse, storageState: STORAGE_STATE },
    },
  ],
});
