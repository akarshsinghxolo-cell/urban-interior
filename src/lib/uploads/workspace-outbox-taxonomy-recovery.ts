import { preferredWorkTypeReplacement, workTypesForSubcategory } from "@/lib/rdash/work-types";
import type { RDashDatabase, WorkSubcategory } from "@/lib/rdash/types";
import type { WorkspaceCommitOutboxRecord } from "./workspace-outbox-types";

const LEGACY_REPLACEMENT_ERROR = "Choose a replacement work type before deleting.";

/** Upgrade deletes queued by the older client, which omitted the automatic replacement marker. */
export function recoverQueuedWorkTypeDeletionRecord(
  record: WorkspaceCommitOutboxRecord,
  input: { base?: Pick<RDashDatabase, "master"> | null; online: boolean },
): { changed: boolean; record: WorkspaceCommitOutboxRecord } {
  if (record.status !== "failed_permanent" || !record.lastErrorMessage?.includes(LEGACY_REPLACEMENT_ERROR) || !input.base) {
    return { changed: false, record };
  }

  const originals = new Map(input.base.master.workSubcategories.map((work) => [work.id, work]));
  let changed = false;
  const operations = record.operations.map((operation) => {
    if (operation.collection !== "master.workSubcategories" || !operation.upsert?.length) return operation;
    const upsert = operation.upsert.map((row) => {
      const original = originals.get(String(row.id || ""));
      const candidate = row as unknown as WorkSubcategory;
      if (!original || candidate.work_type_replacements) return row;
      const retained = new Set(workTypesForSubcategory(candidate).map((type) => type.id));
      const replacements = Object.fromEntries(workTypesForSubcategory(original)
        .filter((source) => !retained.has(source.id))
        .flatMap((source) => {
          const replacement = preferredWorkTypeReplacement(candidate, source.id);
          return replacement ? [[source.id, replacement.id]] : [];
        }));
      if (!Object.keys(replacements).length) return row;
      changed = true;
      return { ...row, work_type_replacements: replacements };
    });
    return changed ? { ...operation, upsert } : operation;
  });

  if (!changed) return { changed: false, record };
  return {
    changed: true,
    record: {
      ...record,
      operations,
      status: input.online ? "pending" : "waiting_for_network",
      retryCount: 0,
      retryAt: undefined,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      updatedAt: new Date().toISOString(),
    },
  };
}
