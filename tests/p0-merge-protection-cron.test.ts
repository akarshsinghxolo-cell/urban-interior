import { expectNoTokens, expectTokens, readSrc } from "./helpers/source-contract";
import { describe, expect, test } from "vitest";
import { testFile } from "./test-file";

const source = async (path: string) => testFile(path).text();

/**
 * P0 round (Task 35): merge protection + scheduled QA must actually run.
 *
 * Root causes pinned here:
 *  - CI hand-listed ~35 targeted vitest runs while 40+ test files (incl. all
 *    Task 33 fixes) had no merge protection. The workflow must run the full
 *    `npm run test` suite (every file matching tests + "*.test.ts") as its
 *    coverage gate.
 *  - /api/qa/cron failed closed (503) whenever CRON_SECRET was unset, but
 *    vercel.json schedules it daily — so daily QA never ran in production.
 *    The route must accept Vercel Cron invocations (x-vercel-cron) as a
 *    rate-limited, summary-only fallback while keeping the 503 for arbitrary
 *    unauthenticated callers and full diagnostics for bearer callers.
 */
describe("P0 — CI runs the full test suite", () => {
  test("application-ci gates merges on the whole vitest suite, not a hand list", async () => {
    const workflow = await readSrc(".github/workflows/application-ci.yml");
    expectTokens(workflow, [
      "- name: Test (full vitest suite)",
      "run: npm run test",
      "run: npx tsc --noEmit",
      "run: npm run lint",
      "run: npm run build",
      "run: npm run test:e2e",
    ]);
    expectNoTokens(workflow, [
      // Markers of the hand-list era: targeted one-file vitest steps that
      // left 40+ suite files unprotected.
      "Test Phase 2B commit policy",
      "Test workspace route registry",
      "Test authentication source security",
      "Test Sales Pipeline progression",
      "Test bug hunt regressions",
    ]);
  });

  test("package.json test script is the full vitest suite (e2e excluded by config)", async () => {
    const pkg = JSON.parse(await source("package.json"));
    expect(pkg.scripts.test).toBe("vitest run");
    const config = await readSrc("vitest.config.mts");
    expectTokens(config, ['include: ["tests/**/*.test.ts"]']);
  });
});

describe("P0 — qa/cron guard matches its real invocation contract", () => {
  test("fail-closed 503 stays for unauthenticated non-Vercel callers", async () => {
    const route = await source("src/app/api/qa/cron/route.ts");
    expectTokens(route, [
      'request.headers.get("x-vercel-cron") !== "1"',
      "Cron endpoint disabled: CRON_SECRET is not configured.",
      "status: 503",
      // Bearer mode keeps the timing-safe compare and 401.
      "timingSafeEqual",
      "status: 401",
    ]);
  });

  test("Vercel Cron fallback is rate limited and returns summary-only diagnostics", async () => {
    const route = await source("src/app/api/qa/cron/route.ts");
    expectTokens(route, [
      // Reuse of the shared rate limiter caps spoofed-header scan farming.
      "rateLimit(`qa-cron:${clientIp(request)}`",
      "status: 429",
      'mode: "vercel-cron-fallback"',
      // The fallback warns so unconfigured deployments are visible in logs.
      "set CRON_SECRET to require bearer auth",
    ]);
    // Data-minimization: the fallback payload must not embed raw workspace
    // internals — those stay in the bearer branch only.
    expectNoTokens(route, [
      "vercel-cron-fallback\".firstError",
    ]);
  });

  test("bearer mode keeps full diagnostics; fallback omits record counts and rule text", async () => {
    const route = await source("src/app/api/qa/cron/route.ts");
    const fallbackStart = route.indexOf('mode: "vercel-cron-fallback"');
    const fallbackLiteral = route.slice(fallbackStart, route.indexOf("},", fallbackStart));
    expectTokens(fallbackLiteral, ["integrity: integritySummary", "maintenance"]);
    expectNoTokens(fallbackLiteral, [
      "counts",
      "revision",
      "firstError",
      "healthScore",
    ]);
  });
});
