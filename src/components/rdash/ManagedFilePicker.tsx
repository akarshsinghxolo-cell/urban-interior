"use client";

import * as React from "react";
import { Paperclip, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ManagedFilePicker — styled, touch-friendly replacement for the raw native
 * `<input type="file">` widget. Keeps the real input in the DOM (hidden) so
 * form autofill/AT behaviour is unchanged, and renders a consistent dashed
 * dropzone-style button that reports the number of queued files.
 */
export function ManagedFilePicker({
    label = "Choose files",
    accept,
    multiple = false,
    disabled = false,
    fileCount = 0,
    className,
    inputClassName,
    onPick,
    ...inputProps
}: Omit<React.ComponentPropsWithoutRef<"input">, "className" | "type" | "onChange"> & {
    label?: string;
    fileCount?: number;
    className?: string;
    inputClassName?: string;
    onPick?: React.ChangeEventHandler<HTMLInputElement>;
}) {
    const inputRef = React.useRef<HTMLInputElement>(null);

    return (
        <label
            className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors",
                "hover:border-primary/40 hover:bg-accent/40 hover:text-foreground",
                "focus-within:border-primary/50 focus-within:bg-accent/40 focus-within:text-foreground",
                "disabled:pointer-events-none disabled:opacity-50",
                "min-h-9 py-2",
                className,
            )}
        >
            <UploadCloud className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">
                {fileCount > 0
                    ? `${fileCount} file${fileCount === 1 ? "" : "s"} selected — tap to change`
                    : label}
            </span>
            {fileCount > 0 ? <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple={multiple}
                disabled={disabled}
                className={cn("sr-only", inputClassName)}
                onChange={onPick}
                {...inputProps}
            />
        </label>
    );
}
