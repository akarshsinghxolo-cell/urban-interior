"use client";

import * as React from "react";
import { ContractorFormDialog } from "./ContractorFormDialog";
import { VendorFormDialog } from "./VendorFormDialog";
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
    return retainPartnerFormStoreBridge("vendor", props.editId);
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
    <VendorFormDialog
      open={props.open}
      onClose={props.onClose}
      onSaved={props.onSaved}
      editId={props.editId}
    />
  );
}
