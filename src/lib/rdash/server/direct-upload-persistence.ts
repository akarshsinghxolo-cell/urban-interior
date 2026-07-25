import type { AuthenticatedUser } from "./auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { FileAttachmentEntityType } from "../types";
import { nowIso, WORKSPACE_ID } from "./direct-upload-storage";

function equalData(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function upsertEntityRow(table: string, id: string, data: unknown, user: AuthenticatedUser): Promise<void> {
  const admin = getSupabaseAdminClient();
  const { data: existing, error: readError } = await admin.from(table).select("revision,data").eq("id", id).maybeSingle();
  if (readError) throw new Error(`Could not inspect ${table}: ${readError.message}`);
  if (existing?.data && equalData(existing.data, data)) return;

  const revision = Number(existing?.revision || 0) + (existing ? 1 : 0);
  const { error } = await admin.from(table).upsert({
    id,
    workspace_id: WORKSPACE_ID,
    revision,
    updated_at: nowIso(),
    updated_by: user.name,
    data,
  }, { onConflict: "id" });
  if (error) throw new Error(`Could not persist ${table}: ${error.message}`);
}

const ENTITY_TABLES: Partial<Record<FileAttachmentEntityType, string>> = {
  customer: "entity_customers",
  site: "entity_sites",
  room: "entity_areas",
  workRequired: "entity_workRequired",
  quotation: "entity_quotations",
  workOrder: "entity_workOrders",
  purchase_order: "entity_purchaseOrders",
  grn: "entity_grns",
  vendor_bill: "entity_vendorBills",
  dispatch: "entity_dispatches",
  inventory: "entity_inventory",
  drawing: "entity_drawings",
  execution_log: "entity_executionLogs",
  visit: "entity_visits",
  task: "entity_tasks",
  followup: "entity_followups",
  payment: "entity_payments",
  invoice: "entity_invoices",
  vendor: "entity_master_vendors",
  vendor_rate: "entity_master_vendorRates",
  contractor: "entity_master_contractors",
  contractor_bid: "entity_contractorBids",
  contractor_settlement: "entity_contractorSettlements",
  blocked: "entity_blocked",
  communication: "entity_commSends",
};

export async function updateAttachmentField(
  user: AuthenticatedUser,
  entityType: FileAttachmentEntityType,
  entityId: string,
  field: string | undefined,
  mode: "set" | "append" | undefined,
  attachmentId: string,
): Promise<void> {
  if (!field) return;
  const table = ENTITY_TABLES[entityType];
  if (!table) throw new Error(`Attachment field updates are not configured for ${entityType}.`);

  const admin = getSupabaseAdminClient();
  const { data: row, error } = await admin.from(table).select("revision,data").eq("id", entityId).maybeSingle();
  if (error) throw new Error(`Could not read ${entityType} before attaching the file: ${error.message}`);
  if (!row?.data) throw new Error(`TARGET_NOT_READY:The related ${entityType} record is not synchronized yet.`);

  const current = row.data as Record<string, unknown>;
  const next = { ...current };
  if (mode === "append") {
    const values = Array.isArray(current[field]) ? current[field] as unknown[] : [];
    next[field] = Array.from(new Set([...values.map(String), attachmentId]));
  } else {
    next[field] = attachmentId;
  }
  if (equalData(current, next)) return;

  const expectedRevision = Number(row.revision || 0);
  const { data: updated, error: updateError } = await admin.from(table).update({
    data: next,
    revision: expectedRevision + 1,
    updated_at: nowIso(),
    updated_by: user.name,
  }).eq("id", entityId).eq("revision", expectedRevision).select("id").maybeSingle();
  if (updateError) throw new Error(`Could not attach the file to ${entityType}: ${updateError.message}`);
  if (!updated) throw new Error(`TARGET_NOT_READY:The ${entityType} record changed while the file was being attached. Retry finalization.`);
}

export async function bumpWorkspaceRevision(): Promise<void> {
  const { data, error } = await getSupabaseAdminClient().rpc("uc_bump_workspace_revision", {
    p_workspace_id: WORKSPACE_ID,
  });
  if (error) throw new Error(`Could not update the workspace revision: ${error.message}`);
  if (typeof data !== "number") throw new Error("The workspace revision function returned no revision.");
}