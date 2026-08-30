"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Avatar, StatusBadge } from "./primitives";
import { ContextRow, type ContextAction } from "./ContextMenuHost";
import { priorityStyle, relativeDay, isOverdue, formatINRShort, } from "@/lib/rdash/format";
import type { Priority } from "@/lib/rdash/types";

interface RecordCardProps {
    title: string;
    subtitle?: string;
    customerName?: string;
    status?: {
        label: string;
        className: string;
    };
    priority?: Priority;
    due?: string;
    amount?: number;
    meta?: string;
    assignee?: string;
    onClick?: () => void;
    actions: ContextAction[];
    className?: string;
    compact?: boolean;
    tone?: "default" | "warning" | "danger";
}

export function RecordCard({ title, subtitle, customerName, status, priority, due, amount, meta, assignee, onClick, actions, className, compact, tone = "default", }: RecordCardProps) {
    const overdue = due ? isOverdue(due) : false;
    const pStyle = priority ? priorityStyle(priority) : undefined;
    const toneBorder = tone === "danger"
        ? "border-l-destructive"
        : tone === "warning"
            ? "border-l-warning"
            : priority === "urgent"
                ? "border-l-destructive"
                : priority === "high"
                    ? "border-l-warning"
                    : priority === "medium"
                        ? "border-l-primary"
                        : "border-l-transparent";

    return (
      <ContextRow
        actions={actions}
        onSelect={onClick}
        className={cn(
          "group relative rounded-[var(--panel-radius)] border border-border/80 border-l-2 bg-card px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-border hover:bg-accent/[0.18] focus-visible:bg-accent/[0.18]",
          toneBorder,
          compact && "py-2.5",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          {customerName && <Avatar name={customerName} size={compact ? 30 : 34} />}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2 pr-8">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
                  {title}
                </p>
                {subtitle && (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
              {(status || pStyle) && (
                <div className="flex max-w-[48%] shrink-0 flex-wrap items-center justify-end gap-1">
                  {status && <StatusBadge label={status.label} className={status.className} />}
                  {pStyle && <StatusBadge label={pStyle.label} className={pStyle.className} />}
                </div>
              )}
            </div>

            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] leading-4 text-muted-foreground">
              {customerName && (
                <span className="max-w-40 truncate font-medium text-foreground/80">
                  {customerName}
                </span>
              )}
              {due && (
                <span className={cn("whitespace-nowrap", overdue && "font-semibold text-destructive")}>
                  {overdue ? "Overdue · " : ""}{relativeDay(due)}
                </span>
              )}
              {assignee && (
                <span className="max-w-36 truncate">
                  <span className="text-muted-foreground/60">@</span>{assignee}
                </span>
              )}
              {amount != null && amount > 0 && (
                <span className="whitespace-nowrap font-semibold tabular-nums text-foreground/80">
                  {formatINRShort(amount)}
                </span>
              )}
              {meta && <span className="min-w-0 max-w-full truncate">{meta}</span>}
            </div>
          </div>
        </div>
      </ContextRow>
    );
}
