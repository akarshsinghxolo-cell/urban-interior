"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
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
    const isEmpty = records.length === 0;
    const regionId = React.useId();

    return (
      <section className={cn("flex flex-col gap-2.5", isEmpty && "hidden md:flex")}>
        <SectionHeader
          title={title}
          count={records.length}
          icon={icon}
          action={collapsible ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
              aria-expanded={open}
              aria-controls={regionId}
              title={open ? "Collapse section" : "Expand section"}
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
            </button>
          ) : null}
        />
        {open && (
          <div id={regionId}>
            {records.length === 0 ? (
              <EmptyState title={emptyTitle} description={emptyDescription} icon={icon} tone={emptyTone} action={emptyAction} />
            ) : (
              <div className={cn("grid gap-2.5", colClass)}>
                {records.map((record) => (
                  <RecordCard
                    key={record.id}
                    title={record.title}
                    subtitle={record.subtitle}
                    customerName={record.customerName}
                    status={record.status}
                    priority={record.priority}
                    due={record.due}
                    amount={record.amount}
                    meta={record.meta}
                    assignee={record.assignee}
                    tone={record.tone}
                    onClick={record.onClick}
                    actions={record.actions}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    );
}
