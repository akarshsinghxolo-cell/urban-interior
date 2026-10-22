"use client";

import * as React from "react";
import { Paperclip, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ManagedFilePicker — styled, touch-friendly replacement for the raw native
 * `<input type="file">` widget. A real button opens the hidden native input so
 * focus stays on the visible control instead of scrolling long dialogs to the
 * visually-hidden input.
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

    const openPicker = () => {
        inputRef.current?.click();
    };

    return (
        <>
            <button
                type="button"
                disabled={disabled}
                onClick={openPicker}
                className={cn(
                    "flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors",
                    "hover:border-primary/40 hover:bg-accent/40 hover:text-foreground",
                    "focus-visible:border-primary/50 focus-visible:bg-accent/40 focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
            </button>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple={multiple}
                disabled={disabled}
                className={cn("hidden", inputClassName)}
                onChange={onPick}
                tabIndex={-1}
                aria-hidden="true"
                {...inputProps}
            />
        </>
    );
}
