import { describe, expect, test } from "bun:test";

import { COLLECTION_ARCHITECTURE } from "../src/lib/rdash/database-architecture-registry";
import { SPECIAL_DATABASE_OBJECT_ARCHITECTURE } from "../src/lib/rdash/database-physical-object-registry";
import { COLLECTION_TO_TABLE } from "../src/lib/rdash/server/commit-rest";

const sorted = (values: string[]) => [...values].sort();

describe("database architecture registry", () => {
  test("classifies every persisted workspace collection exactly once", () => {
    expect(sorted(Object.keys(COLLECTION_ARCHITECTURE))).toEqual(
      sorted(Object.keys(COLLECTION_TO_TABLE)),
    );
  });

  test("requires an explicit canonical truth and risk for every collection", () => {
    for (const [collection, architecture] of Object.entries(COLLECTION_ARCHITECTURE)) {
      expect(collection.length).toBeGreaterThan(0);
      expect(architecture.domain.length).toBeGreaterThan(0);
      expect(architecture.decision.length).toBeGreaterThan(0);
      expect(architecture.canonicalTruth.trim().length).toBeGreaterThan(0);
      expect(["low", "medium", "high", "critical"]).toContain(architecture.risk);
    }
  });

  test("documents every specialized public persistence object outside ordinary collections", () => {
    expect(sorted(Object.keys(SPECIAL_DATABASE_OBJECT_ARCHITECTURE))).toEqual(sorted([
      "GenericRecord",
      "StaffProfile",
      "StaffRouteBundle",
      "uc_drive_folders",
      "uc_upload_batches",
      "uc_upload_events",
      "uc_upload_items",
      "uc_user_roles",
      "uc_workspace_operations",
      "entity_workspace_revision",
      "entity_workspace_change_batches",
      "entity_issues",
      "entity_workItems",
      "staff_identity_drift_report",
    ]));
  });

  test("does not mistake derived Contractor Rates for canonical truth", () => {
    const contractorRates = COLLECTION_ARCHITECTURE["master.contractorRates"];
    expect(contractorRates.decision).toBe("projection-view-candidate");
    expect(contractorRates.canonicalTruth).toBe("Contractor.work_capabilities");
  });

  test("keeps true state-machine and synchronization infrastructure separate", () => {
    for (const name of [
      "uc_upload_batches",
      "uc_upload_items",
      "uc_upload_events",
      "uc_user_roles",
      "uc_workspace_operations",
      "entity_workspace_revision",
      "entity_workspace_change_batches",
    ]) {
      expect(SPECIAL_DATABASE_OBJECT_ARCHITECTURE[name as keyof typeof SPECIAL_DATABASE_OBJECT_ARCHITECTURE].decision)
        .toBe("infrastructure-keep");
    }
  });

  test("records the completed Issue physical consolidation", () => {
    expect(COLLECTION_ARCHITECTURE.blocked.targetConcept).toBe("Issue compatibility view");
    expect(COLLECTION_ARCHITECTURE.risks.targetConcept).toBe("Issue compatibility view");
    expect(COLLECTION_ARCHITECTURE.blocked.decision).toBe("projection-view-candidate");
    expect(COLLECTION_ARCHITECTURE.risks.decision).toBe("projection-view-candidate");
    expect(COLLECTION_ARCHITECTURE.blocked.canonicalTruth).toBe("entity_issues");
    expect(COLLECTION_ARCHITECTURE.risks.canonicalTruth).toBe("entity_issues");
    expect(SPECIAL_DATABASE_OBJECT_ARCHITECTURE.entity_issues.canonicalTruth).toBe("Canonical Issue pilot storage");
  });

  test("keeps approval actions and recurring schedules out of the WorkItem merge", () => {
    expect(COLLECTION_ARCHITECTURE.tasks.targetConcept).toBe("WorkItem");
    expect(COLLECTION_ARCHITECTURE.followups.targetConcept).toBe("WorkItem");
    expect(COLLECTION_ARCHITECTURE.tasks.decision).toBe("merge-candidate");
    expect(COLLECTION_ARCHITECTURE.followups.decision).toBe("merge-candidate");
    expect(COLLECTION_ARCHITECTURE.actions.decision).toBe("keep-normalize-later");
    expect(COLLECTION_ARCHITECTURE.actions.canonicalTruth).toBe("Approval action");
    expect(COLLECTION_ARCHITECTURE.recurringTasks.decision).toBe("keep");
    expect(COLLECTION_ARCHITECTURE.recurringTasks.canonicalTruth).toBe("Recurring task definition");
  });

  test("registers WorkItem as shadow-only before Task/Follow-up cutover", () => {
    const workItems = SPECIAL_DATABASE_OBJECT_ARCHITECTURE.entity_workItems;
    expect(workItems.objectType).toBe("table");
    expect(workItems.domain).toBe("workflow");
    expect(workItems.decision).toBe("keep-normalize-later");
    expect(workItems.canonicalTruth).toBe("Canonical Task/Follow-up WorkItem shadow storage");
    expect(workItems.runtimeOwner).toContain("shadow");
    expect(COLLECTION_ARCHITECTURE.tasks.canonicalTruth).toBe("Task");
    expect(COLLECTION_ARCHITECTURE.followups.canonicalTruth).toBe("Follow-up");
  });
});
