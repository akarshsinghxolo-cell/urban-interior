"use client";

import * as React from "react";
import { CreateMenu as CoreCreateMenu } from "./CreateMenuCore";
import { CustomerQuotationDialog } from "./customer/CustomerQuotationDialog";
import { useRDashStore } from "@/lib/rdash/store";

type CreateMenuProps = {
  showTrigger?: boolean;
  enableHotkeys?: boolean;
};

/**
 * Global create host. Quotation creation is intentionally owned by the
 * Customer workflow so Customer Desk, Quotation Desk and Site Execution all
 * enter the same component, validation and save path.
 */
export function CreateMenu(props: CreateMenuProps = {}) {
  const createDialog = useRDashStore((state) => state.createDialog);
  const closeCreateDialog = useRDashStore((state) => state.closeCreateDialog);

  if (createDialog?.kind === "quotation") {
    return <CustomerQuotationDialog request={createDialog} onClose={closeCreateDialog} />;
  }

  return <CoreCreateMenu {...props} />;
}
