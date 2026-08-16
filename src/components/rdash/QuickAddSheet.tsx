"use client";
import * as React from "react";
import { FilePlus2, ListPlus, MapPinPlus, PhoneCall, Plus, X } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import type { CreateDialogKind } from "@/lib/rdash/store/ui-types";
import { workspaceGlobalCreateReadiness } from "@/lib/rdash/workspace-create-readiness";

const QUICK_OPTIONS: { kind: CreateDialogKind; label: string; desc: string; icon: React.ComponentType<{ className?: string }>; tone: string; shortcut: string; }[] = [
    { kind: "task", label: "New task", desc: "Actionable to-do", icon: ListPlus, tone: "bg-primary/10 text-primary", shortcut: "1" },
    { kind: "visit", label: "Schedule visit", desc: "Site visit / measurement", icon: MapPinPlus, tone: "bg-success/10 text-success", shortcut: "2" },
    { kind: "followup", label: "New follow-up", desc: "Call / payment reminder", icon: PhoneCall, tone: "bg-warning/10 text-warning", shortcut: "3" },
    { kind: "quotation", label: "New quotation", desc: "Draft for a customer", icon: FilePlus2, tone: "bg-destructive/10 text-destructive", shortcut: "4" },
];

export function QuickAddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const openCreateDialog = useRDashStore((s) => s.openCreateDialog);
    const db = useRDashStore((s) => s.db);
    const handleSelect = React.useCallback((kind: CreateDialogKind) => {
        const readiness = workspaceGlobalCreateReadiness(db, kind);
        if (!readiness.ready) return;
        openCreateDialog({ kind });
        onOpenChange(false);
    }, [db, openCreateDialog, onOpenChange]);
    React.useEffect(() => {
        if (!open)
            return;
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable))
                return;
            if (event.key === "Escape") {
                event.preventDefault();
                onOpenChange(false);
                return;
            }
            const idx = ["1", "2", "3", "4"].indexOf(event.key);
            if (idx >= 0 && QUICK_OPTIONS[idx]) {
                event.preventDefault();
                handleSelect(QUICK_OPTIONS[idx].kind);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onOpenChange, handleSelect]);
    if (!open)
        return null;
    return (<div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Quick add">
      <button type="button" aria-label="Close quick add" className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={() => onOpenChange(false)}/>
      <div className="relative z-10 w-full max-w-sm animate-scale-in rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:rounded-2xl" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Plus className="h-4 w-4"/></span>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Quick add</h3>
              <p className="text-[10px] text-muted-foreground">Create a record in one tap · press 1–4 or Esc</p>
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={() => onOpenChange(false)} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
            <X className="h-4 w-4"/>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {QUICK_OPTIONS.map((opt) => {
            const readiness = workspaceGlobalCreateReadiness(db, opt.kind);
            return <button key={opt.kind} type="button" onClick={() => handleSelect(opt.kind)} disabled={!readiness.ready} title={readiness.ready ? opt.desc : readiness.reason} className="group relative flex flex-col items-start gap-1.5 rounded-xl border border-border bg-background p-3 text-left transition-all hover:border-primary/30 hover:bg-accent/30 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border disabled:hover:bg-background disabled:hover:shadow-none">
              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded border border-border bg-muted/60 text-[10px] font-bold text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100">{opt.shortcut}</span>
              <span className={"flex h-9 w-9 items-center justify-center rounded-lg transition-transform group-hover:scale-105 " + opt.tone}><opt.icon className="h-4 w-4"/></span>
              <span className="text-sm font-semibold text-foreground">{opt.label}</span>
              <span className="text-[10px] text-muted-foreground">{readiness.ready ? opt.desc : "Load the required module data first"}</span>
            </button>;
          })}
        </div>
      </div>
    </div>);
}

