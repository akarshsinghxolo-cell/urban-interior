"use client";

import * as React from "react";
import {
  EntityFormDialog as PartnerForm,
  type EntityType,
} from "./UnifiedPartnerFormDialog";
import { retainPartnerFormStoreBridge } from "@/lib/rdash/partner-form-store-bridge";

export type { EntityType };

export function EntityFormDialog(props: {
  type: EntityType;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  editId?: string;
}) {
  React.useEffect(() => {
    if (!props.open) return;
    return retainPartnerFormStoreBridge();
  }, [props.open]);

  return <PartnerForm {...props} />;
}
