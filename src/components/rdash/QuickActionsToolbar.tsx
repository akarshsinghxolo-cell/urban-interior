"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Plus, Users, FileText, CalendarClock, PhoneCall,
  Wrench, type LucideIcon,
} from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import type { CreateDialogKind } from "@/lib/rdash/store/ui-types";

/**
 * QuickActionsToolbar — a floating, keyboard-accessible toolbar with the most
 * common "create" actions. Sits below the workspace header for instant access.
 *
 * Features:
 * - 6 quick-action buttons with Lucide icons + keyboard shortcuts (1-6)
 * - Hover expansion (icon → icon + label)
 * - Active scale animation on press
 * - Keyboard shortcuts: Alt+1=Customer, Alt+2=Quotation, Alt+3=Visit,
 *   Alt+4=Follow-up, Alt+5=Task, Alt+6=Work Order
 * - Tooltip with shortcut hint
 * - Responsive: collapses to icon-only on mobile
 */

interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut: string;
  kind?: CreateDialogKind;
  navigate?: string;
  tone: "primary" | "success" | "warning" | "default";
}

const ACTIONS: QuickAction[] = [
  { id: "customer", label: "Customer", icon: Users, shortcut: "1", navigate: "customerTimeline", tone: "primary" },
  { id: "quotation", label: "Quotation", icon: FileText, shortcut: "2", kind: "quotation", tone: "success" },
  { id: "visit", label: "Visit", icon: CalendarClock, shortcut: "3", kind: "visit", tone: "warning" },
  { id: "followup", label: "Follow-up", icon: PhoneCall, shortcut: "4", kind: "followup", tone: "default" },
  { id: "task", label: "Task", icon: Plus, shortcut: "5", kind: "task", tone: "default" },
  { id: "workorder", label: "Work Order", icon: Wrench, shortcut: "6", navigate: "siteExecution", tone: "primary" },
];

const toneStyles = {
  primary: "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 hover:border-primary/40",
  success: "bg-success/10 text-success border-success/20 hover:bg-success/20 hover:border-success/40",
  warning: "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20 hover:border-warning/40",
  default: "bg-muted/40 text-foreground border-border/50 hover:bg-muted/60 hover:border-border",
};

export function QuickActionsToolbar() {
  const openCreateDialog = useRDashStore((s) => s.openCreateDialog);
  const setActiveModule = useRDashStore((s) => s.setActiveModule);

  // Keyboard shortcuts: Alt+1 through Alt+6
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const idx = ["1", "2", "3", "4", "5", "6"].indexOf(e.key);
      if (idx === -1) return;
      e.preventDefault();
      const action = ACTIONS[idx];
      if (action.kind) {
        openCreateDialog({ kind: action.kind });
      } else if (action.navigate) {
        setActiveModule(action.navigate);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCreateDialog, setActiveModule]);

  const handleClick = (action: QuickAction) => {
    if (action.kind) {
      openCreateDialog({ kind: action.kind });
    } else if (action.navigate) {
      setActiveModule(action.navigate);
    }
  };

  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/80 p-1.5 shadow-sm backdrop-blur-sm">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => handleClick(action)}
            title={`${action.label} (Alt+${action.shortcut})`}
            className={cn(
              "group flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all active:scale-95",
              toneStyles[action.tone]
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{action.label}</span>
            {/* Keyboard shortcut badge */}
            <kbd className="hidden ml-0.5 rounded border border-current/20 bg-current/5 px-1 text-[9px] font-mono opacity-50 group-hover:opacity-100 transition-opacity sm:inline">
              {action.shortcut}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}
