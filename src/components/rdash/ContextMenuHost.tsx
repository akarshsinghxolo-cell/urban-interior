"use client";
import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger, } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
export interface ContextAction {
    label: string;
    icon?: React.ReactNode;
    onClick?: () => void;
    danger?: boolean;
    separatorBefore?: boolean;
    disabled?: boolean;
}
export function ContextRow({ children, actions, className, onSelect, onOpenContext, }: {
    children: React.ReactNode;
    actions?: ContextAction[];
    className?: string;
    onSelect?: () => void;
    onOpenContext?: (open: boolean) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const handleOpenChange = (v: boolean) => {
        setOpen(v);
        onOpenContext?.(v);
    };
    const safeActions = actions ?? [];
    const items = (<>
      {safeActions.map((a, i) => (<React.Fragment key={i}>
          {a.separatorBefore && <ContextMenuSeparator />}
          <ContextMenuItem disabled={a.disabled} onClick={a.onClick} className={cn("flex items-center gap-2 text-xs", a.danger && "text-destructive focus:text-destructive")}>
            {a.icon && <span className="text-muted-foreground">{a.icon}</span>}
            {a.label}
          </ContextMenuItem>
        </React.Fragment>))}
    </>);
    const dropItems = (<>
      {safeActions.map((a, i) => (<React.Fragment key={i}>
          {a.separatorBefore && <DropdownMenuSeparator />}
          <DropdownMenuItem disabled={a.disabled} onClick={a.onClick} className={cn("flex items-center gap-2 text-xs", a.danger && "text-destructive focus:text-destructive")}>
            {a.icon && <span className="text-muted-foreground">{a.icon}</span>}
            {a.label}
          </DropdownMenuItem>
        </React.Fragment>))}
    </>);
    return (<ContextMenu>
      <ContextMenuTrigger asChild>
        <div role="button" tabIndex={0} onClick={onSelect} onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.();
            }
        }} className={cn("contextEnabledRow group relative min-w-0 cursor-pointer outline-none", className)}>
          {children}
          <div className="absolute right-1.5 top-1.5 z-10 opacity-100 transition-opacity">
            <DropdownMenu open={open} onOpenChange={handleOpenChange}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full border border-border/70 bg-card text-muted-foreground shadow-sm hover:bg-background hover:text-foreground" aria-label="Record actions" onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="h-4 w-4"/>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {dropItems}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">{items}</ContextMenuContent>
    </ContextMenu>);
}
