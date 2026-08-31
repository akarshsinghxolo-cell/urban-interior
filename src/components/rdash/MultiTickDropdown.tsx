"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiTickGroup = { key: string; items: Array<{ id: string; name: string }> };

// Shared multi-tick dropdown (the subcategory/work-type picker format):
// trigger shows the first selection plus "+N", the panel keeps native
// tickboxes and stays open while ticking. Built on Radix Popover so
// outside-pointerdown and Escape close only the panel — never the host
// dialog (Radix's layer stack, not custom listeners). Multi-select
// counterpart of the single-select TickDropdown in CustomerDesk.
export function MultiTickDropdown({
    selected,
    groups,
    placeholder,
    disabled,
    ariaLabel,
    onToggle,
    footer,
}: {
    selected: string[];
    groups: MultiTickGroup[];
    placeholder: string;
    disabled?: boolean;
    ariaLabel: string;
    onToggle: (id: string) => void;
    footer?: (close: () => void) => React.ReactNode;
}) {
    const [open, setOpen] = React.useState(false);
    const close = React.useCallback(() => setOpen(false), []);
    const firstName = groups.flatMap((group) => group.items).find((item) => selected.includes(item.id))?.name;
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                type="button"
                disabled={disabled}
                aria-label={ariaLabel}
                className="flex h-9 w-full items-center gap-1 rounded-md border border-input bg-card px-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
                <span className={cn("min-w-0 flex-1 truncate", !firstName && "font-normal text-muted-foreground")}>
                    {firstName || placeholder}
                </span>
                {selected.length > 1 ? <span className="shrink-0 text-xs text-muted-foreground">+{selected.length - 1}</span> : null}
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent
                align="start"
                // Match the trigger width exactly (full-width form field panel).
                className="max-h-56 w-[calc(var(--radix-popover-trigger-width)+0px)] overflow-y-auto p-1 rd-scroll"
                onOpenAutoFocus={(event) => event.preventDefault()}
            >
                <div role="group" aria-label={ariaLabel}>
                    {groups.map((group, groupIndex) => (
                        <React.Fragment key={group.key}>
                            {groupIndex > 0 ? <div className="h-3" aria-hidden="true" /> : null}
                            {group.items.map((item) => {
                                const ticked = selected.includes(item.id);
                                return (
                                    <label key={item.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/40">
                                        <input type="checkbox" checked={ticked} onChange={() => onToggle(item.id)} />
                                        <span className="min-w-0 truncate" title={item.name}>{item.name}</span>
                                    </label>
                                );
                            })}
                        </React.Fragment>
                    ))}
                    {footer?.(close)}
                </div>
            </PopoverContent>
        </Popover>
    );
}
