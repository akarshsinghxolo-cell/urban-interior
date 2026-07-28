import { getSupabaseAdminClient } from "../../supabase/server";

const workspaceId = process.env.UC_WORKSPACE_ID || "default";

/**
 * Clears historical batches before a destructive workspace reset and establishes
 * revision zero as the new synchronization baseline. The following seed commit
 * is then journaled normally as revision one by commit_workspace_operations.
 */
export async function resetWorkspaceChangeJournal(): Promise<void> {
  const admin = getSupabaseAdminClient();
  const { error: deleteError } = await admin
    .from("entity_workspace_change_batches")
    .delete()
    .eq("workspace_id", workspaceId);
  if (deleteError) {
    throw new Error(`Could not reset workspace change journal: ${deleteError.message}`);
  }

  const { error: insertError } = await admin
    .from("entity_workspace_change_batches")
    .insert({
      workspace_id: workspaceId,
      revision: 0,
      operations: [],
      row_versions: {},
      is_baseline: true,
      created_at: new Date().toISOString(),
    });
  if (insertError) {
    throw new Error(`Could not establish workspace change baseline: ${insertError.message}`);
  }
}
