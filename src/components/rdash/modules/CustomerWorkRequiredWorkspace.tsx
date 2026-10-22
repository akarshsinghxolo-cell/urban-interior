"use client";

import type { FilterPreset } from "@/lib/rdash/modules";
import { CustomerWorkRequiredModule } from "./RemainingModules";

export function CustomerWorkRequiredWorkspace({ filterPresets }: { filterPresets?: FilterPreset[] }) {
  return <CustomerWorkRequiredModule filterPresets={filterPresets} />;
}
