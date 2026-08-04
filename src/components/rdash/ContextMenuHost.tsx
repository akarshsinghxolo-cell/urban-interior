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
    const handleOpenChange = (value: boolean) => {
        setOpen(value);
        onOpenContext?.(value);
    };
    const safeActions = actions ?? [];
    const hasActions = safeActions.length > 0;

    const items = (<>
      {safeActions.map((action, index) => (<React.Fragment key={index}>
          {action.separatorBefore && <ContextMenuSeparator />}
          <ContextMenuItem disabled={action.disabled} onClick={action.onClick} className={cn("flex items-center gap-2 text-xs", action.danger && "text-destructive focus:text-destructive")}>
            {action.icon && <span className="text-muted-foreground">{action.icon}</span>}
            {action.label}
          </ContextMenuItem>
        </React.Fragment>))}
    </>);

    const dropItems = (<>
      {safeActions.map((action, index) => (<React.Fragment key={index}>
          {action.separatorBefore && <DropdownMenuSeparator />}
          <DropdownMenuItem disabled={action.disabled} onClick={action.onClick} className={cn("flex items-center gap-2 text-xs", action.danger && "text-destructive focus:text-destructive")}>
            {action.icon && <span className="text-muted-foreground">{action.icon}</span>}
            {action.label}
          </DropdownMenuItem>
        </React.Fragment>))}
    </>);

    const row = (
      <div
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : -1}
        onClick={onSelect}
        onKeyDown={(event) => {
            if (!onSelect) return;
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
            }
        }}
        className={cn(
          "contextEnabledRow group relative min-w-0 outline-none",
          onSelect && "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          className,
        )}
      >
        {children}
        {hasActions && (
          <div className="absolute right-2 top-2 z-10 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <DropdownMenu open={open} onOpenChange={handleOpenChange}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md border border-border/60 bg-card/90 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground sm:border-transparent sm:bg-transparent sm:shadow-none"
                  aria-label="Record actions"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {dropItems}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    );

    if (!hasActions) return row;

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">{items}</ContextMenuContent>
      </ContextMenu>
    );
}
