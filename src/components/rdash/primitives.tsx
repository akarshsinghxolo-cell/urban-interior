"use client";
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { initials as toInitials } from "@/lib/rdash/format";

export function StatusBadge({ label, className, }: {
    label: string;
    className?: string;
}) {
    const display = label.replaceAll("_", " ");
    return (<Badge variant="outline" title={display} className={cn("max-w-full shrink-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", className)}>
      {display}
    </Badge>);
}

/** Click-to-copy affordance for phone/contact numbers — long-press selection is awkward on touch. */
export function CopyValueButton({ value, label = "Number", className }: {
    value: string;
    label?: string;
    className?: string;
}) {
    const [copied, setCopied] = React.useState(false);
    const copy = React.useCallback(async (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success(`${label} copied`, { description: value, duration: 2500 });
            setTimeout(() => setCopied(false), 1600);
        } catch {
            toast.error("Copy failed — long-press the number to copy manually.");
        }
    }, [value, label]);
    return (<button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()} ${value}`}
        title={`Copy ${label.toLowerCase()} ${value}`}
        className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            copied && "text-success",
            className,
        )}>
        {copied ? <Check className="h-3.5 w-3.5"/> : <Copy className="h-3.5 w-3.5"/>}
    </button>);
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
        default: "border-border/80",
        primary: "border-primary/20 bg-primary/[0.025]",
        warning: "border-warning/20 bg-warning/[0.03]",
        destructive: "border-destructive/20 bg-destructive/[0.025]",
        success: "border-success/20 bg-success/[0.025]",
    }[tone];
    const valueColor = {
        default: "text-foreground",
        primary: "text-primary",
        warning: "text-warning",
        destructive: "text-destructive",
        success: "text-success",
    }[tone];
    const accentBar = {
        default: "bg-muted-foreground/35",
        primary: "bg-primary",
        warning: "bg-warning",
        destructive: "bg-destructive",
        success: "bg-success",
    }[tone];
    const iconWrap = {
        default: "bg-muted/50 text-muted-foreground",
        primary: "bg-primary/10 text-primary",
        warning: "bg-warning/10 text-warning",
        destructive: "bg-destructive/10 text-destructive",
        success: "bg-success/10 text-success",
    }[tone];
    const cardClassName = cn(
        "group relative flex w-full min-w-0 flex-col gap-1.5 overflow-hidden rounded-[var(--panel-radius)] border bg-card p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        toneClass,
        onClick && "cursor-pointer transition-colors hover:border-primary/30 hover:bg-accent/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active && "ring-2 ring-ring/40",
    );
    const content = (<>
      <span className={cn("absolute inset-y-3 left-0 w-0.5 rounded-r-full opacity-70", accentBar)} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon && (<span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconWrap)}>
            {icon}
          </span>)}
      </div>
      <span className={cn("rd-tabular truncate text-2xl font-bold leading-none", valueColor)}>
        {value}
      </span>
      {subValue && (
        <span className="flex items-baseline gap-1 truncate text-xs text-muted-foreground">
          {subLabel && <span className="font-medium uppercase tracking-wide">{subLabel}:</span>}
          <span className="rd-tabular font-semibold text-foreground/80">{subValue}</span>
        </span>
      )}
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </>);
    if (onClick) {
        return <button type="button" onClick={onClick} className={cardClassName}>{content}</button>;
    }
    return <div className={cardClassName}>{content}</div>;
}

export function SectionHeader({ title, count, action, icon, }: {
    title: string;
    count?: number | string;
    action?: React.ReactNode;
    icon?: React.ReactNode;
}) {
    return (<div className="flex min-h-9 items-center justify-between gap-3 border-b border-border/50 pb-2">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
        {count != null && (<Badge variant="secondary" className="rd-tabular h-5 rounded-full bg-muted px-2 text-[10px] font-semibold text-muted-foreground">
            {count}
          </Badge>)}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>);
}

export function EmptyState({ title, description, icon, action, tone = "default", }: {
    title: string;
    description?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    tone?: "default" | "primary" | "success" | "warning" | "danger";
}) {
    const toneIcon = {
        default: "bg-background text-muted-foreground ring-border",
        primary: "bg-primary/10 text-primary ring-primary/20",
        success: "bg-success/10 text-success ring-success/20",
        warning: "bg-warning/10 text-warning ring-warning/20",
        danger: "bg-destructive/10 text-destructive ring-destructive/20",
    }[tone];
    return (<div className="rd-module-enter flex flex-col items-center justify-center gap-3 rounded-[var(--panel-radius)] border border-dashed border-border/80 bg-muted/[0.12] px-5 py-8 text-center">
      {icon && (<div className={cn("flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset", toneIcon)}>
          {icon}
        </div>)}
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (<p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p>)}
      </div>
      {action && <div>{action}</div>}
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
    return (<article className={cn("relative flex items-center gap-3 overflow-hidden rounded-[var(--panel-radius)] border px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]", ringCls)}>
      <span className={cn("absolute inset-y-0 left-0 w-1 bg-gradient-to-b opacity-60", accentLeft)} aria-hidden />
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold", indexCls)} aria-hidden>
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
      <span className={cn("grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold", idxCls)} aria-hidden>
        {index}
      </span>
      <span className="truncate">{label}</span>
    </span>);
}

export function WorkflowConnector({ active }: {
    active?: boolean;
}) {
    return (<span className={cn("h-px w-4 shrink-0 sm:w-6", active ? "bg-primary/40" : "bg-border")} aria-hidden />);
}
