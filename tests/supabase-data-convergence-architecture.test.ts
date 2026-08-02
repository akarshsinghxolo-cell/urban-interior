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

  test("marks the first pilot consolidation family explicitly", () => {
    expect(COLLECTION_ARCHITECTURE.blocked.targetConcept).toBe("Issue");
    expect(COLLECTION_ARCHITECTURE.risks.targetConcept).toBe("Issue");
    expect(COLLECTION_ARCHITECTURE.blocked.decision).toBe("merge-candidate");
    expect(COLLECTION_ARCHITECTURE.risks.decision).toBe("merge-candidate");
  });
});
