"use client";

import { ContractorFormDialog } from "./ContractorFormDialog";
import { VendorFormDialog } from "./VendorFormDialog";

export type EntityType = "vendor" | "contractor";

export function EntityFormDialog(props: {
  type: EntityType;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  editId?: string;
}) {
  if (props.type === "contractor") {
    return (
      <ContractorFormDialog
        open={props.open}
        onClose={props.onClose}
        onSaved={props.onSaved}
        editId={props.editId}
      />
    );
  }

  return (
    <VendorFormDialog
      open={props.open}
      onClose={props.onClose}
      onSaved={props.onSaved}
      editId={props.editId}
    />
  );
}
