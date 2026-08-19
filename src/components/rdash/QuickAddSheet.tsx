"use client";

import * as React from "react";
import { Building2, Hammer, HardHat, Plus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useRDashStore } from "@/lib/rdash/store";
import { workspaceReadTargetForModule } from "@/lib/rdash/workspace-read-scope";
import {
  useWorkspaceReadState,
  workspaceReadLoadStateForTarget,
} from "@/lib/rdash/workspace-read-state";

const CustomerSitesDialog = React.lazy(() =>
  import("./CustomerSitesDialog").then((module) => ({ default: module.CustomerSitesDialog })),
);
const EntityFormDialog = React.lazy(() =>
  import("./EntityFormDialog").then((module) => ({ default: module.EntityFormDialog })),
);

type FormAction = "customer" | "contractor" | "vendor";
type LauncherAction = FormAction | "siteExecution";

type LauncherOption = {
  id: LauncherAction;
  moduleId: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  shortcut: string;
};

const QUICK_OPTIONS: readonly LauncherOption[] = Object.freeze([
  {
    id: "customer",
    moduleId: "customerDesk",
    label: "Add Customer",
    desc: "Customer profile and sites",
    icon: UserPlus,
    tone: "bg-primary/10 text-primary",
    shortcut: "1",
  },
  {
    id: "contractor",
    moduleId: "contractorDetail",
    label: "Add Contractor",
    desc: "Canonical contractor profile",
    icon: HardHat,
    tone: "bg-warning/10 text-warning",
    shortcut: "2",
  },
  {
    id: "vendor",
    moduleId: "vendors",
    label: "Add Vendor",
    desc: "Canonical vendor profile",
    icon: Building2,
    tone: "bg-success/10 text-success",
    shortcut: "3",
  },
  {
    id: "siteExecution",
    moduleId: "siteExecution",
    label: "Sites & Execution",
    desc: "Open the site operating workspace",
    icon: Hammer,
    tone: "bg-destructive/10 text-destructive",
    shortcut: "4",
  },
]);

function isFormAction(action: LauncherAction): action is FormAction {
  return action === "customer" || action === "contractor" || action === "vendor";
}

export function QuickAddSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const activeModuleId = useRDashStore((state) => state.activeModuleId);
  const setActiveModule = useRDashStore((state) => state.setActiveModule);
  const readState = useWorkspaceReadState();
  const [pendingAction, setPendingAction] = React.useState<FormAction | null>(null);
  const [formAction, setFormAction] = React.useState<FormAction | null>(null);

  const pendingOption = pendingAction
    ? QUICK_OPTIONS.find((option) => option.id === pendingAction)
    : undefined;
  const pendingTarget = React.useMemo(
    () => pendingOption ? workspaceReadTargetForModule(pendingOption.moduleId) : null,
    [pendingOption],
  );
  const pendingLoadState = pendingTarget
    ? workspaceReadLoadStateForTarget(readState, pendingTarget)
    : null;

  React.useEffect(() => {
    if (!pendingAction || !pendingOption || !pendingTarget) return;
    if (activeModuleId !== pendingOption.moduleId) return;

    if (pendingLoadState?.status === "loaded") {
      setFormAction(pendingAction);
      setPendingAction(null);
      return;
    }

    if (pendingLoadState?.status === "error") {
      toast.error(`Could not prepare ${pendingOption.label}`, {
        description: pendingLoadState.error || "The required module data could not be loaded.",
      });
      setPendingAction(null);
    }
  }, [activeModuleId, pendingAction, pendingLoadState, pendingOption, pendingTarget]);

  const handleSelect = React.useCallback((action: LauncherAction) => {
    const option = QUICK_OPTIONS.find((entry) => entry.id === action);
    if (!option) return;

    onOpenChange(false);
    if (isFormAction(action)) setPendingAction(action);
    else setPendingAction(null);
    setActiveModule(option.moduleId);
  }, [onOpenChange, setActiveModule]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      )) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      const option = QUICK_OPTIONS.find((entry) => entry.shortcut === event.key);
      if (option) {
        event.preventDefault();
        handleSelect(option.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSelect, onOpenChange, open]);

  return <>
    {open ? <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Quick add">
      <button type="button" aria-label="Close quick add" className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-full max-w-sm animate-scale-in rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:rounded-2xl" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Plus className="h-4 w-4" /></span>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Add / open</h3>
              <p className="text-[10px] text-muted-foreground">Use existing business workflows · press 1–4 or Esc</p>
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={() => onOpenChange(false)} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {QUICK_OPTIONS.map((option) => {
            const Icon = option.icon;
            return <button key={option.id} type="button" onClick={() => handleSelect(option.id)} className="group relative flex flex-col items-start gap-1.5 rounded-xl border border-border bg-background p-3 text-left transition-all hover:border-primary/30 hover:bg-accent/30 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded border border-border bg-muted/60 text-[10px] font-bold text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100">{option.shortcut}</span>
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition-transform group-hover:scale-105 ${option.tone}`}><Icon className="h-4 w-4" /></span>
              <span className="text-sm font-semibold text-foreground">{option.label}</span>
              <span className="text-[10px] text-muted-foreground">{option.desc}</span>
            </button>;
          })}
        </div>
      </div>
    </div> : null}

    {formAction === "customer" ? <React.Suspense fallback={null}>
      <CustomerSitesDialog
        open
        onClose={() => setFormAction(null)}
        onSaved={() => setFormAction(null)}
      />
    </React.Suspense> : null}

    {formAction === "contractor" || formAction === "vendor" ? <React.Suspense fallback={null}>
      <EntityFormDialog
        type={formAction}
        open
        onClose={() => setFormAction(null)}
        onSaved={() => setFormAction(null)}
      />
    </React.Suspense> : null}
  </>;
}
