"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface WorkspaceViewTab<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
  hint?: string;
}

export function WorkspaceViewTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: WorkspaceViewTab<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-1.5 rounded-[var(--panel-radius)] border border-border bg-card p-1.5 shadow-card"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            title={tab.hint}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all active:scale-[0.98]",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge != null && tab.badge > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  selected ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                )}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
