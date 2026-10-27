import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("authoritative workspace integrity", () => {
  test("the integrity screen never checks or repairs the scoped browser snapshot", () => {
    const moduleSource = source("src/components/rdash/modules/IntegrityModule.tsx");

    expect(moduleSource).toContain('fetch("/api/integrity", { cache: "no-store" })');
    expect(moduleSource).toContain('action: "repair"');
    expect(moduleSource).toContain('action: "cascade-preview"');
    expect(moduleSource).toContain('action: "cascade-delete"');
    expect(moduleSource).not.toContain("const runIntegrityCheck = useRDashStore");
    expect(moduleSource).not.toContain("const repairIntegrityNow = useRDashStore");
    expect(moduleSource).not.toContain("const cascadeDeleteRecord = useRDashStore");
  });

  test("the integrity endpoint reads the full workspace before checking or mutating", () => {
    const route = source("src/app/api/integrity/route.ts");
    const restReader = source("src/lib/rdash/server/commit-rest.ts");
    const fullRead = restReader.slice(
      restReader.indexOf("export async function getRestWorkspace()"),
      restReader.indexOf("interface AtomicCommitResult"),
    );

    expect(route).toContain("const ws = await getWorkspace();");
    expect(route).toContain('body.action === "cascade-preview"');
    expect(fullRead).not.toContain("DEFAULT_COLLECTION_LIMITS");
    expect(fullRead).toContain("AUTHORITATIVE_READ_PAGE_SIZE");
    expect(fullRead).toContain("while (true)");
    expect(fullRead).toContain("offset += page.length");
  });

  test("the health card accepts the authoritative report without running a local scan", () => {
    const widget = source("src/components/rdash/HealthDashboardWidget.tsx");

    expect(widget).toContain("authoritativeReport?: IntegrityReport | null");
    expect(widget).toContain("if (!isActive || usesAuthoritativeReport) return;");
  });
});
