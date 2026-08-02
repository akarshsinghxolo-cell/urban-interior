import { describe, expect, test } from "bun:test";

const read = (path: string) => Bun.file(path).text();

describe("Risks and Blockers pre-migration characterization", () => {
  test("pins their current distinct resolution semantics", async () => {
    const slice = await read("src/lib/rdash/store/slices/risks.ts");

    expect(slice).toContain("risks: s.db.risks.filter((r: RiskItem) => r.id !== id)");
    expect(slice).toContain("blocked: s.db.blocked.map((row: BlockedItem) => row.id === id ? { ...row, resolved: true } : row)");
  });

  test("pins Blocker task/thread/audit side effects", async () => {
    const slice = await read("src/lib/rdash/store/slices/risks.ts");

    expect(slice).toContain('get().openThreadFor("blocked", id');
    expect(slice).toContain("get().addTask({");
    expect(slice).toContain('task_type: "obstacle"');
    expect(slice).toContain('task.status === "blocked"');
    expect(slice).toContain('status: "in_progress"');
    expect(slice).toContain("get().addThreadReply(linkedTask.thread_id");
    expect(slice).toContain("get().logAudit({");
    expect(slice).toContain('entity_type: "blocked"');
  });

  test("pins Risk-specific financial/severity fields", async () => {
    const slice = await read("src/lib/rdash/store/slices/risks.ts");

    expect(slice).toContain('type: r.type || "cash"');
    expect(slice).toContain('severity: r.severity || "medium"');
    expect(slice).toContain("amount: r.amount");
  });

  test("keeps both collections in the combined module and scoped read graph before cutover", async () => {
    const exactPlans = await read("src/lib/rdash/server/module-read-plans.ts");
    const scopes = await read("src/lib/rdash/server/module-scoped-collections.ts");
    const entityReads = await read("src/lib/rdash/server/entity-scoped-read.ts");

    expect(exactPlans).toContain("blockedRisks: Object.freeze([");
    expect(exactPlans).toContain('"blocked",\n    "risks",');
    expect(scopes).toContain('"blocked",\n  "risks",');
    expect(entityReads).toContain('"blocked",\n  "risks",');
  });

  test("keeps physical old collections mapped until a later cutover gate", async () => {
    const commitRest = await read("src/lib/rdash/server/commit-rest.ts");

    expect(commitRest).toContain('blocked: "entity_blocked"');
    expect(commitRest).toContain('risks: "entity_risks"');
    expect(commitRest).not.toContain('issues: "entity_issues"');
  });

  test("records the current thread-model asymmetry explicitly", async () => {
    const types = await read("src/lib/rdash/types.ts");

    expect(types).toContain('| "blocked" | "approval"');
    expect(types).not.toContain('| "risk" | "approval"');
  });
});
