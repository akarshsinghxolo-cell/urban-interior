"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { initials as toInitials } from "@/lib/rdash/format";
export function StatusBadge({ label, className, }: {
    label: string;
    className?: string;
}) {
    // Normalize snake_case → human-readable, e.g. "in_progress" → "In progress"
    const display = label.replaceAll("_", " ");
    return (<Badge variant="outline" className={cn("shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", className)}>
      {display}
    </Badge>);
}
const AVATAR_COLORS = [
    "bg-primary/15 text-primary",
    "bg-success/15 text-success",
    "bg-warning/15 text-warning",
    "bg-destructive/15 text-destructive",
    "bg-chart-5/15 text-chart-5",
    "bg-chart-2/15 text-chart-2",
];
export function Avatar({ name, size = 36, className, }: {
    name: string;
    size?: number;
    className?: string;
}) {
    const colorIdx = React.useMemo(() => {
        let h = 0;
        for (let i = 0; i < name.length; i++)
            h = (h * 31 + name.charCodeAt(i)) >>> 0;
        return h % AVATAR_COLORS.length;
    }, [name]);
    return (<span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", AVATAR_COLORS[colorIdx], className)} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
      {toInitials(name)}
    </span>);
}
export function MetricCard({ label, value, hint, subValue, subLabel, tone = "default", icon, onClick, active, }: {
    label: string;
    value: React.ReactNode;
    hint?: string;
    subValue?: React.ReactNode;
    subLabel?: string;
    tone?: "default" | "primary" | "warning" | "destructive" | "success";
    icon?: React.ReactNode;
    onClick?: () => void;
    active?: boolean;
}) {
    const toneClass = {
        default: "border-border",
        primary: "border-primary/25 bg-primary/[0.04]",
        warning: "border-warning/25 bg-warning/[0.05]",
        destructive: "border-destructive/25 bg-destructive/[0.04]",
        success: "border-success/25 bg-success/[0.04]",
    }[tone];
    const valueColor = {
        default: "text-foreground",
        primary: "text-primary",
        warning: "text-warning",
        destructive: "text-destructive",
        success: "text-success",
    }[tone];
    const accentBar = {
        default: "from-muted-foreground/40 to-transparent",
        primary: "from-primary to-primary/30",
        warning: "from-warning to-warning/30",
        destructive: "from-destructive to-destructive/30",
        success: "from-success to-success/30",
    }[tone];
    const iconWrap = {
        default: "bg-muted/50 text-muted-foreground group-hover:bg-muted group-hover:text-foreground",
        primary: "bg-primary/10 text-primary group-hover:bg-primary/20",
        warning: "bg-warning/10 text-warning group-hover:bg-warning/20",
        destructive: "bg-destructive/10 text-destructive group-hover:bg-destructive/20",
        success: "bg-success/10 text-success group-hover:bg-success/20",
    }[tone];
    return (<button type="button" onClick={onClick} className={cn("rd-card-hover group relative flex w-full min-w-0 flex-col gap-1.5 overflow-hidden rounded-[var(--panel-radius)] border bg-card p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", toneClass, active && "ring-2 ring-ring/40")}>
      <span className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r opacity-70 transition-opacity duration-200 group-hover:opacity-100", accentBar)} aria-hidden/>
      <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-20" style={{ background: "var(--primary)" }} aria-hidden/>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon && (<span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-200", iconWrap)}>
            {icon}
          </span>)}
      </div>
      <span className={cn("rd-tabular truncate text-2xl font-bold leading-none transition-transform duration-200 group-hover:scale-[1.04]", valueColor)}>
        {value}
      </span>
      {subValue && (
        <span className="flex items-baseline gap-1 truncate text-xs text-muted-foreground">
          {subLabel && <span className="font-medium uppercase tracking-wide">{subLabel}:</span>}
          <span className="rd-tabular font-semibold text-foreground/80">{subValue}</span>
        </span>
      )}
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </button>);
}
export function SectionHeader({ title, count, action, icon, }: {
    title: string;
    count?: number | string;
    action?: React.ReactNode;
    icon?: React.ReactNode;
}) {
    return (<div className="flex items-center justify-between gap-3 rounded-lg bg-gradient-to-r from-muted/40 to-transparent px-2 py-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {count != null && (<Badge variant="secondary" className="rd-tabular rounded-full bg-muted px-2 py-0 text-[11px] font-medium text-muted-foreground">
            {count}
          </Badge>)}
      </div>
      {action}
    </div>);
}
export function EmptyState({ title, description, icon, action, tone = "default", }: {
    title: string;
    description?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    tone?: "default" | "primary" | "success" | "warning" | "danger";
}) {
    const toneGradient = {
        default: "from-muted/40 via-muted/10 to-transparent",
        primary: "from-primary/10 via-primary/5 to-transparent",
        success: "from-success/10 via-success/5 to-transparent",
        warning: "from-warning/10 via-warning/5 to-transparent",
        danger: "from-destructive/10 via-destructive/5 to-transparent",
    }[tone];
    const toneIcon = {
        default: "bg-card text-muted-foreground ring-border",
        primary: "bg-primary/10 text-primary ring-primary/20",
        success: "bg-success/10 text-success ring-success/20",
        warning: "bg-warning/10 text-warning ring-warning/20",
        danger: "bg-destructive/10 text-destructive ring-destructive/20",
    }[tone];
    return (<div className="rd-module-enter group relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-[var(--panel-radius)] border border-dashed border-border bg-gradient-to-b px-6 py-12 text-center transition-colors hover:border-border/80 hover:shadow-soft">
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-b opacity-90", toneGradient)} aria-hidden/>
      {icon && (<div className={cn("relative flex h-14 w-14 animate-scale-in items-center justify-center rounded-2xl shadow-card ring-1 ring-inset transition-transform duration-300 group-hover:scale-105", toneIcon)}>
          {icon}
        </div>)}
      <div className="relative">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (<p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-foreground/70">{description}</p>)}
      </div>
      {action && (<div className="relative">{action}</div>)}
    </div>);
}
export function WorkflowStep({ label, state = "default", }: {
    label: string;
    state?: "default" | "active" | "done" | "pending";
}) {
    const cls = {
        default: "bg-muted text-muted-foreground border-border",
        active: "bg-primary text-primary-foreground border-primary",
        done: "bg-success/15 text-success border-success/25",
        pending: "bg-warning/10 text-warning border-warning/25",
    }[state];
    return (<span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold", cls)}>
      {label}
    </span>);
}
export function WorkflowStepRich({ index, title, description, meta, state = "default", }: {
    index: string;
    title: string;
    description?: string;
    meta?: string;
    state?: "default" | "active" | "done" | "pending";
}) {
    const ringCls = {
        default: "border-border bg-card",
        active: "border-primary/40 bg-primary/[0.04] ring-2 ring-primary/20",
        done: "border-success/30 bg-success/[0.06]",
        pending: "border-warning/30 bg-warning/[0.05]",
    }[state];
    const indexCls = {
        default: "bg-muted text-muted-foreground",
        active: "bg-primary text-primary-foreground",
        done: "bg-success text-success-foreground",
        pending: "bg-warning text-warning-foreground",
    }[state];
    const accentLeft = {
        default: "from-muted-foreground/30 to-transparent",
        active: "from-primary to-primary/20",
        done: "from-success to-success/20",
        pending: "from-warning to-warning/20",
    }[state];
    return (<article className={cn("group relative flex items-center gap-3 overflow-hidden rounded-[var(--panel-radius)] border px-3.5 py-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft", ringCls)}>
      <span className={cn("absolute inset-y-0 left-0 w-1 bg-gradient-to-b opacity-60", accentLeft)} aria-hidden/>
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-transform duration-200 group-hover:scale-110", indexCls)} aria-hidden>
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-semibold text-foreground">{title}</strong>
        {description && (<small className="block truncate text-[11px] text-muted-foreground">
            {description}
          </small>)}
      </div>
      {meta && (<em className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold not-italic text-foreground/80">
          {meta}
        </em>)}
    </article>);
}
export function WorkflowChip({ index, label, state = "default", }: {
    index: number;
    label: string;
    state?: "default" | "active" | "done" | "pending";
}) {
    const chipCls = {
        default: "border-border bg-card text-muted-foreground",
        active: "border-primary bg-primary text-primary-foreground shadow-soft",
        done: "border-success/40 bg-success/10 text-success",
        pending: "border-warning/40 bg-warning/10 text-warning",
    }[state];
    const idxCls = {
        default: "bg-muted text-muted-foreground",
        active: "bg-primary-foreground/25 text-primary-foreground",
        done: "bg-success text-success-foreground",
        pending: "bg-warning text-warning-foreground",
    }[state];
    return (<span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors", chipCls)}>
      <span className={cn("grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold", idxCls)} aria-hidden>
        {index}
      </span>
      <span className="truncate">{label}</span>
    </span>);
}
export function WorkflowConnector({ active }: {
    active?: boolean;
}) {
    return (<span className={cn("h-px w-4 shrink-0 sm:w-6", active ? "bg-primary/40" : "bg-border")} aria-hidden/>);
}
