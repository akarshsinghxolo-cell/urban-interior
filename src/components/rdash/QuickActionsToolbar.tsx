"use client";

import * as React from "react";
import {
  CalendarClock,
  Clock,
  FileText,
  History,
  PhoneCall,
  Plus,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { CreateDialogKind } from "@/lib/rdash/store/ui-types";
import { ThemeToggle } from "./ThemeToggle";

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

function RecentItemsDropdown() {
  const auditLog = useRDashStore((state) => state.db.auditLog);
  const openDetail = useRDashStore((state) => state.openDetail);
  const [open, setOpen] = React.useState(false);

  const recent = React.useMemo(() => (auditLog || []).slice(0, 6), [auditLog]);

  React.useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "r" ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      setOpen(true);
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const handleClick = (entry: any) => {
    if (!entry.entity_id || !entry.entity_type) return;

    const kind =
      entry.entity_type === "workOrder"
        ? "workOrder"
        : entry.entity_type === "quotation"
          ? "quotation"
          : entry.entity_type === "customer"
            ? "customer"
            : entry.entity_type === "site"
              ? "site"
              : entry.entity_type === "task"
                ? "task"
                : entry.entity_type === "visit"
                  ? "visit"
                  : undefined;

    if (!kind) return;
    openDetail(kind as any, entry.entity_id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Recent activity (Alt+R)"
          className="group flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground active:scale-95"
        >
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">Recent</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-72 p-0">
        <div className="border-b border-border bg-gradient-to-r from-primary/[0.05] to-transparent px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-bold">
            <History className="h-3.5 w-3.5 text-primary" /> Recent Activity
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto rd-scroll">
          {recent.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No recent activity yet
            </div>
          ) : (
            recent.map((entry: any) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => handleClick(entry)}
                className="flex w-full items-start gap-2 border-b border-border/40 px-3 py-2 text-left transition-colors last:border-0 hover:bg-accent/40"
              >
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/40 text-[10px]">
                  {entry.kind === "create"
                    ? "+"
                    : entry.kind === "update"
                      ? "~"
                      : entry.kind === "approve"
                        ? "v"
                        : entry.kind === "delete"
                          ? "x"
                          : "*"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {entry.entity_label || entry.action}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {entry.action}
                  </p>
                </div>
                <span className="shrink-0 text-[9px] text-muted-foreground/60">
                  {new Date(entry.timestamp).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
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

      <RecentItemsDropdown />
      <div className="mx-0.5 h-6 w-px bg-border/50" />
      <ThemeToggle className="h-8 w-8 rounded-lg border-0 bg-transparent hover:bg-accent" />
    </div>
  );
}
