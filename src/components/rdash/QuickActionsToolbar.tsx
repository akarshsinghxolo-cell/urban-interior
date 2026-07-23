"use client";

import * as React from "react";
import {
  CalendarClock,
  FileText,
  PhoneCall,
  Plus,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { CreateDialogKind } from "@/lib/rdash/store/ui-types";

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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function QuickActionsToolbar() {
  const openCreateDialog = useRDashStore((state) => state.openCreateDialog);
  const setActiveModule = useRDashStore((state) => state.setActiveModule);

  React.useEffect(() => {
    const timeoutIds = new Set<number>();
    const schedule = (callback: () => void, delay: number) => {
      const id = window.setTimeout(() => {
        timeoutIds.delete(id);
        callback();
      }, delay);
      timeoutIds.add(id);
    };

    const openNotificationSettings = () => {
      setActiveModule("workdesk");
      let attempts = 0;

      const findAndOpen = () => {
        const details = Array.from(document.querySelectorAll<HTMLDetailsElement>("details")).find(
          (element) => {
            const summary = element.firstElementChild;
            return (
              summary?.tagName === "SUMMARY" &&
              summary.textContent?.trim().startsWith("Notification Settings")
            );
          },
        );

        if (details) {
          details.open = true;
          details.scrollIntoView({ behavior: "smooth", block: "center" });
          const summary = details.firstElementChild;
          if (summary instanceof HTMLElement) summary.focus();
          return;
        }

        attempts += 1;
        if (attempts < 20) schedule(findAndOpen, 50);
      };

      schedule(findAndOpen, 0);
    };

    const handleShortcut = (event: KeyboardEvent) => {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        openNotificationSettings();
        return;
      }

      const index = ["1", "2", "3", "4", "5", "6"].indexOf(key);
      if (index === -1) return;

      event.preventDefault();
      const action = ACTIONS[index];
      if (action.kind) {
        openCreateDialog({ kind: action.kind });
      } else if (action.navigate) {
        setActiveModule(action.navigate);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      timeoutIds.forEach((id) => window.clearTimeout(id));
    };
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
              toneStyles[action.tone],
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{action.label}</span>
            <kbd className="ml-0.5 hidden rounded border border-current/20 bg-current/5 px-1 font-mono text-[9px] opacity-50 transition-opacity group-hover:opacity-100 sm:inline">
              {action.shortcut}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}
