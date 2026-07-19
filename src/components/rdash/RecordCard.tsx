"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "./primitives";
import { ContextRow, type ContextAction } from "./ContextMenuHost";
import { priorityStyle, relativeDay, isOverdue, formatINR, formatINRShort, } from "@/lib/rdash/format";
import type { Priority } from "@/lib/rdash/types";
import { StatusBadge } from "./primitives";
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
    return (<ContextRow actions={actions} onSelect={onClick} className={cn("rd-card-hover group relative rounded-[var(--panel-radius)] border border-border border-l-2 bg-card px-3.5 py-3 shadow-card transition-all hover:border-primary/30 hover:shadow-soft hover:-translate-y-0.5", toneBorder, compact && "py-2.5", className)}>
      <div className="flex items-start gap-3">
        {customerName && <Avatar name={customerName} size={compact ? 30 : 34}/>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {title}
              </p>
              {subtitle && (<p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {subtitle}
                </p>)}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {status && <StatusBadge label={status.label} className={status.className}/>}
              {pStyle && (<StatusBadge label={pStyle.label} className={pStyle.className}/>)}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {customerName && (<span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                {customerName}
              </span>)}
            {due && (<span className={cn("inline-flex items-center gap-1", overdue && "font-semibold text-destructive")}>
                {overdue ? "Overdue · " : ""}
                {relativeDay(due)}
              </span>)}
            {assignee && (<span className="inline-flex items-center gap-1">
                <span className="text-muted-foreground/70">@</span>
                {assignee}
              </span>)}
            {amount != null && amount > 0 && (<span className="font-semibold text-foreground/80">
                {formatINRShort(amount)}
              </span>)}
            {meta && <span className="truncate">{meta}</span>}
          </div>
        </div>
      </div>
    </ContextRow>);
}
export { formatINR };
