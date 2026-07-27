import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { FinalizeUploadRequest, FinalizedUploadResult } from "@/lib/uploads/upload-types";
import type { AuthenticatedUser } from "./auth";
import { finalizeDirectUpload as finalizeDirectUploadCore } from "./direct-upload-finalize-core";
import { withDriveFolderRouting } from "./drive-folder-routing-context";

export {
  cancelDirectUpload,
  listPendingDirectUploads,
  reportDirectUploadProgress,
  retryDirectUpload,
} from "./direct-upload-finalize-core";

export async function finalizeDirectUpload(
  user: AuthenticatedUser,
  input: FinalizeUploadRequest,
): Promise<FinalizedUploadResult> {
  const { data, error } = await getSupabaseAdminClient()
    .from("uc_upload_items")
    .select("source_flow,attachment_field,attachment_field_mode,role,kind,caption")
    .eq("id", input.uploadItemId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return withDriveFolderRouting({
    sourceFlow: data?.source_flow ? String(data.source_flow) : undefined,
    attachmentField: data?.attachment_field ? String(data.attachment_field) : undefined,
    attachmentFieldMode: data?.attachment_field_mode ? String(data.attachment_field_mode) : undefined,
    role: data?.role ? String(data.role) : undefined,
    kind: data?.kind ? String(data.kind) : undefined,
    caption: data?.caption ? String(data.caption) : undefined,
  }, () => finalizeDirectUploadCore(user, input));
}
