import { threadParentExists } from "../business-rules";
import { isEntityContextType, resolveEntityContext } from "../entity-context";
import type { ForeignKeyRule, RDashDatabase, ThreadKind } from "../types";
import { resolveReferenceCollection, type ReferenceRow } from "./reference-access";

export const REFERENCE_RESOURCE_COLLECTIONS: Readonly<Record<string, string>> = {
  catalogue: "master.catalogues", pinterest_board: "master.pinterestBoards", reference_media: "master.referenceMedia",
};

const linkedCollections: Readonly<Record<string, string>> = {
  quotation: "quotations", po: "purchaseOrders", payment: "payments", contractor_payment: "contractorPayments", vendor_bill: "vendorBills",
};

/** Resolve live polymorphic parents; cost-source IDs are retained historical provenance. */
export function inspectPolymorphicReference(db: RDashDatabase, rule: ForeignKeyRule, row: ReferenceRow, id: string): {
  checked: boolean; targetCollection?: string; problem?: string;
} {
  if (rule.collection === "workOrderCostLines" && rule.field === "source_id") return { checked: false };
  if (rule.collection === "threads" && rule.field === "record_id") {
    const valid = threadParentExists(db, row.kind as ThreadKind, id);
    return { checked: true, problem: valid ? undefined : `Thread parent ${String(row.kind)} "${id}" is missing or uses a retired identity.` };
  }
  if ((rule.collection === "tasks" || rule.collection === "actions") && rule.field === "linked_record_id") {
    const targetCollection = linkedCollections[String(row.linked_record_type)];
    return { checked: true, targetCollection, problem: !targetCollection ? `Unsupported linked record type "${String(row.linked_record_type)}".`
      : resolveReferenceCollection(db, targetCollection).some((parent) => parent.id === id) ? undefined : `Linked ${targetCollection} "${id}" does not exist.` };
  }
  if (rule.collection === "entityReferenceAssignments" && rule.field === "resource_id") {
    const targetCollection = REFERENCE_RESOURCE_COLLECTIONS[String(row.resource_type)];
    return { checked: true, targetCollection, problem: !targetCollection ? `Unsupported reference resource type "${String(row.resource_type)}".`
      : resolveReferenceCollection(db, targetCollection).some((parent) => parent.id === id) ? undefined : `Reference resource ${targetCollection} "${id}" does not exist.` };
  }
  if ((rule.collection === "entityFileAttachments" || rule.collection === "entityReferenceAssignments") && rule.field === "entity_id") {
    if (!isEntityContextType(row.entity_type)) return { checked: true, problem: `Unsupported entity type "${String(row.entity_type)}".` };
    // General library files have a system context rather than a fabricated parent row.
    if (row.entity_type === "general") return { checked: false };
    try {
      resolveEntityContext(db, row.entity_type, id, rule.label);
      return { checked: true };
    } catch (error) {
      return { checked: true, problem: error instanceof Error ? error.message : "Entity parent does not exist." };
    }
  }
  return { checked: true, problem: `Unconfigured polymorphic reference ${rule.collection}.${rule.field}.` };
}
