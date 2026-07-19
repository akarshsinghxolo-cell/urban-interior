"use client";
import * as React from "react";
import { Database, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * DemoModeBadge — surfaces when the app is running on in-memory seed data
 * (i.e. Supabase is not configured). Lets users / operators know that:
 *   - data is seeded from buildSeedDatabase() on every server start,
 *   - in-session edits are held in memory and lost on restart,
 *   - to enable persistence, Supabase credentials + schema must be applied.
 *
 * The flag is driven by NEXT_PUBLIC_DEMO_MODE so it is determined at build
 * time and stays purely client-side (no API / store changes required).
 */
export function DemoModeBadge() {
  const enabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const [open, setOpen] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  if (!enabled || dismissed) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Demo mode — running on in-memory seed data. Click for details."
                className={cn(
                  "group relative hidden shrink-0 items-center gap-1.5 rounded-full border border-warning/40 bg-warning/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-warning shadow-sm transition-all hover:bg-warning/[0.14] hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 xl:inline-flex",
                )}
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning/60 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
                </span>
                <Database className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Demo mode</span>
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Running on in-memory seed data — changes reset on restart
          </TooltipContent>
        </Tooltip>

        <PopoverContent align="end" sideOffset={8} className="rd-pop-in w-80 rounded-[var(--panel-radius)] border-border p-0 shadow-popover">
          <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-warning/[0.08] to-transparent px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <Database className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-bold">Demo mode</p>
                <p className="text-[10px] text-muted-foreground">In-memory seed data</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss demo mode banner"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-2.5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            <p className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>This workspace is loaded from <span className="font-mono text-foreground/80">buildSeedDatabase()</span> on every server start.</span>
            </p>
            <p className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>Edits you make during this session are held in memory and will be <span className="font-semibold text-foreground">lost when the server restarts</span>.</span>
            </p>
            <p className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>To enable persistence, configure Supabase credentials in <span className="font-mono text-foreground/80">.env</span> and apply the SQL schema in <span className="font-mono text-foreground/80">supabase/</span>.</span>
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">
            <span>Super-owner login is always available</span>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="font-medium text-primary hover:underline"
            >
              Got it
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
