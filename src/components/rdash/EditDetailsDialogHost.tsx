"use client";
import { useRDashStore } from "@/lib/rdash/store";
import { EditDetailsDialog } from "./EditDetailsDialog";

export function EditDetailsDialogHost() {
  const editDialog = useRDashStore((s) => s.editDialog);
  const closeEditDialog = useRDashStore((s) => s.closeEditDialog);

  if (!editDialog) return null;

  return (
    <EditDetailsDialog
      type={editDialog.type}
      entityId={editDialog.entityId}
      open={!!editDialog}
      onClose={closeEditDialog}
    />
  );
}
