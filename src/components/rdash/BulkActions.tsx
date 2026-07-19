"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, UserPlus, Trash2, X, ChevronDown, Check, Flag, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel, } from "@/components/ui/dropdown-menu";
export interface BulkAction {
    label: string;
    icon: React.ReactNode;
    onClick: (ids: string[]) => void;
    variant?: "default" | "outline" | "destructive";
}
export interface BulkAssignOption {
    label: string;
    sublabel?: string;
    onClick: (ids: string[]) => void;
}
export interface BulkPriorityOption {
    label: string;
    tone: "default" | "warning" | "destructive" | "primary";
    onClick: (ids: string[]) => void;
}
export function BulkActionBar({ selectedIds, totalCount, onClear, actions, assignOptions, priorityOptions, }: {
    selectedIds: string[];
    totalCount: number;
    onClear: () => void;
    actions: BulkAction[];
    assignOptions?: BulkAssignOption[];
    priorityOptions?: BulkPriorityOption[];
}) {
    if (selectedIds.length === 0)
        return null;
    return (<div className="sticky top-0 z-20 flex animate-fade-up items-center gap-2 rounded-[var(--panel-radius)] border border-primary/30 bg-primary/[0.06] px-3 py-2 shadow-soft backdrop-blur-md">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
          {selectedIds.length}
        </span>
        selected
        {totalCount > 0 && <span className="text-muted-foreground">of {totalCount}</span>}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {actions.map((a, i) => (<Button key={i} size="sm" variant={a.variant || "outline"} className="h-7 text-xs" onClick={() => a.onClick(selectedIds)}>
            {a.icon}
            <span className="ml-1">{a.label}</span>
          </Button>))}
        {assignOptions && assignOptions.length > 0 && (<BulkAssignButton selectedIds={selectedIds} options={assignOptions}/>)}
        {priorityOptions && priorityOptions.length > 0 && (<BulkPriorityButton selectedIds={selectedIds} options={priorityOptions}/>)}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClear} aria-label="Clear selection">
          <X className="h-3.5 w-3.5"/>
        </Button>
      </div>
    </div>);
}
function BulkAssignButton({ selectedIds, options, }: {
    selectedIds: string[];
    options: BulkAssignOption[];
}) {
    return (<DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
          <UserPlus className="h-3.5 w-3.5"/>
          <span className="ml-0.5">Assign</span>
          <ChevronDown className="h-3 w-3 opacity-60"/>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Assign {selectedIds.length} task{selectedIds.length > 1 ? "s" : ""} to
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((opt, i) => (<DropdownMenuItem key={i} onClick={() => opt.onClick(selectedIds)} className="flex items-center justify-between gap-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{opt.label}</p>
              {opt.sublabel && <p className="truncate text-[10px] text-muted-foreground">{opt.sublabel}</p>}
            </div>
          </DropdownMenuItem>))}
      </DropdownMenuContent>
    </DropdownMenu>);
}
const PRIORITY_TONE_CLASS: Record<BulkPriorityOption["tone"], string> = {
    default: "text-muted-foreground",
    primary: "text-primary",
    warning: "text-warning",
    destructive: "text-destructive",
};
function BulkPriorityButton({ selectedIds, options, }: {
    selectedIds: string[];
    options: BulkPriorityOption[];
}) {
    return (<DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
          <Flag className="h-3.5 w-3.5"/>
          <span className="ml-0.5">Priority</span>
          <ChevronDown className="h-3 w-3 opacity-60"/>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Set priority for {selectedIds.length} task{selectedIds.length > 1 ? "s" : ""}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((opt, i) => (<DropdownMenuItem key={i} onClick={() => opt.onClick(selectedIds)} className="flex items-center gap-2 py-1.5">
            <Flag className={cn("h-3.5 w-3.5", PRIORITY_TONE_CLASS[opt.tone])}/>
            <span className="text-xs font-medium">{opt.label}</span>
          </DropdownMenuItem>))}
      </DropdownMenuContent>
    </DropdownMenu>);
}
export function SelectCheckbox({ checked, onToggle, id, }: {
    checked: boolean;
    onToggle: (id: string) => void;
    id: string;
}) {
    return (<button type="button" onClick={(e) => { e.stopPropagation(); onToggle(id); }} className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all", checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50")} aria-label={checked ? "Deselect" : "Select"} aria-pressed={checked}>
      {checked && <CheckCircle2 className="h-3 w-3"/>}
    </button>);
}
