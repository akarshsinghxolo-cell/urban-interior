"use client";
import { Command, Search } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
export function EnhancedSearch() {
    const setCommandPaletteOpen = useRDashStore((s) => s.setCommandPaletteOpen);
    return (<button type="button" onClick={() => setCommandPaletteOpen(true)} className="hidden h-9 w-72 items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-sm text-muted-foreground shadow-sm outline-none ring-ring transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 md:flex" title="Open command palette (Cmd+K)" aria-label="Search modules, customers, and workOrders">
      <Search className="h-4 w-4 shrink-0" aria-hidden/>
      <span className="min-w-0 flex-1 truncate">Search modules and actions</span>
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
        <Command className="h-2.5 w-2.5" aria-hidden/>
        K
      </span>
    </button>);
}
