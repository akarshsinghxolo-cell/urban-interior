"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { SectionHeader, EmptyState } from "./primitives";
import { RecordCard } from "./RecordCard";
import type { ContextAction } from "./ContextMenuHost";
export interface QueueRecord {
    id: string;
    title: string;
    subtitle?: string;
    customerName?: string;
    status?: {
        label: string;
        className: string;
    };
    priority?: import("@/lib/rdash/types").Priority;
    due?: string;
    amount?: number;
    meta?: string;
    assignee?: string;
    tone?: "default" | "warning" | "danger";
    onClick?: () => void;
    actions: ContextAction[];
}
export function QueueSection({ title, icon, records, columns = 3, emptyTitle = "Nothing here right now", emptyDescription, collapsible = true, emptyTone = "default", emptyAction, defaultCollapsed = false, }: {
    title: string;
    icon?: React.ReactNode;
    records: QueueRecord[];
    columns?: 1 | 2 | 3 | 4;
    emptyTitle?: string;
    emptyDescription?: string;
    collapsible?: boolean;
    emptyTone?: "default" | "primary" | "success" | "warning" | "danger";
    emptyAction?: React.ReactNode;
    defaultCollapsed?: boolean;
}) {
    const [open, setOpen] = React.useState(!defaultCollapsed);
    const colClass = {
        1: "grid-cols-1",
        2: "sm:grid-cols-2",
        3: "sm:grid-cols-2 xl:grid-cols-3",
        4: "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
    }[columns];
    return (<section className="flex flex-col gap-3">
      <SectionHeader title={title} count={records.length} icon={icon} action={collapsible ? (<button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-muted-foreground hover:text-foreground">
              {open ? "Collapse" : "Expand"}
            </button>) : null}/>
      {open &&
            (records.length === 0 ? (<EmptyState title={emptyTitle} description={emptyDescription} icon={icon} tone={emptyTone} action={emptyAction}/>) : (<div className={cn("grid gap-3", colClass)}>
            {records.map((r) => (<RecordCard key={r.id} title={r.title} subtitle={r.subtitle} customerName={r.customerName} status={r.status} priority={r.priority} due={r.due} amount={r.amount} meta={r.meta} assignee={r.assignee} tone={r.tone} onClick={r.onClick} actions={r.actions}/>))}
          </div>))}
    </section>);
}
