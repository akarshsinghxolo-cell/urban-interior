import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Version parity guard: package.json must match the newest CHANGELOG entry.
 *
 * The signin "What's new" panel is driven by CHANGELOG.md while the installed
 * app version comes from package.json — when they drift, users see a changelog
 * for a version the app does not report. This test fails on any new
 * `## vX.Y.Z` changelog entry until package.json is bumped to match.
 */
const repoRoot = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as { version: string };
const changelog = readFileSync(resolve(repoRoot, "CHANGELOG.md"), "utf8");

function latestChangelogVersion(): string | null {
  const headers = changelog.match(/^## v(\d+\.\d+\.\d+)\b/gm);
  if (!headers || headers.length === 0) return null;
  const latest = headers[0].match(/v(\d+\.\d+\.\d+)/);
  return latest ? latest[1] : null;
}

describe("version parity", () => {
  it("package.json version matches the latest CHANGELOG entry", () => {
    const latest = latestChangelogVersion();
    expect(latest, "CHANGELOG.md must declare at least one `## vX.Y.Z` entry").toBeTruthy();
    expect(packageJson.version).toBe(latest);
  });
});
