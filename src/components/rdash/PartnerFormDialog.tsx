"use client";

import * as React from "react";
import { EntityFormDialog as UnifiedVendorForm } from "./UnifiedPartnerFormDialog";
import { ContractorFormDialog } from "./ContractorFormDialog";
import { retainPartnerFormStoreBridge } from "@/lib/rdash/partner-form-store-bridge";

export type EntityType = "vendor" | "contractor";

export function EntityFormDialog(props: {
  type: EntityType;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  editId?: string;
}) {
  React.useEffect(() => {
    if (!props.open || props.type !== "vendor") return;
    return retainPartnerFormStoreBridge(props.editId);
  }, [props.open, props.type, props.editId]);

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
    <UnifiedVendorForm
      type="vendor"
      open={props.open}
      onClose={props.onClose}
      onSaved={props.onSaved}
      editId={props.editId}
    />
  );
}
