"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { Keyboard, Command, Search, MessageSquare, Plus, X, Moon, Sun } from "lucide-react";

/**
 * Keyboard Shortcuts Help Overlay — press `?` (or Shift+/) to toggle.
 *
 * Shows all available keyboard shortcuts in a centered modal overlay.
 * Closes on Escape, clicking the backdrop, or clicking the X button.
 */
export function KeyboardShortcutsHelp() {
    const open = useRDashStore((state) => state.keyboardShortcutsOpen);
    const setOpen = useRDashStore((state) => state.setKeyboardShortcutsOpen);

    React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            // Don't trigger when typing in inputs.
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
                return;
            }
            // Toggle on "?" (Shift+/) — but not when modifier keys are held.
            // Accept both "?" (real keyboard) and "/" with shiftKey (some
            // automation tools / keyboards produce this instead).
            const isHelpKey = event.key === "?" || (event.key === "/" && event.shiftKey);
            if (isHelpKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
                event.preventDefault();
                setOpen(!open);
            }
            // Close on Escape.
            if (event.key === "Escape" && open) {
                setOpen(false);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open]);

    if (!open) return null;

    const shortcuts: Array<{
        section: string;
        items: Array<{ keys: string[]; label: string; icon?: React.ReactNode }>;
    }> = [
        {
            section: "Navigation",
            items: [
                { keys: ["⌘", "K"], label: "Open command palette (search modules, customers, work orders)", icon: <Search className="h-3.5 w-3.5"/> },
            ],
        },
        {
            section: "Quick Jump (press G, then a key)",
            items: [
                { keys: ["G", "I"], label: "Jump to Thread Inbox", icon: <MessageSquare className="h-3.5 w-3.5"/> },
                { keys: ["G", "D"], label: "Jump to Daily Work", icon: <Command className="h-3.5 w-3.5"/> },
                { keys: ["G", "C"], label: "Jump to Customer Timeline" },
                { keys: ["G", "S"], label: "Jump to Sales Pipeline" },
                { keys: ["G", "F"], label: "Jump to Field Visits" },
                { keys: ["G", "P"], label: "Jump to Procurement (GRN)" },
            ],
        },
        {
            section: "Workspace",
            items: [
                { keys: ["?"], label: "Show this keyboard shortcuts help", icon: <Keyboard className="h-3.5 w-3.5"/> },
                { keys: ["Esc"], label: "Close dialogs / overlays / panels", icon: <X className="h-3.5 w-3.5"/> },
            ],
        },
        {
            section: "Thread Inbox & Messages",
            items: [
                { keys: ["Ctrl", "↵"], label: "Send reply (in thread composer)", icon: <MessageSquare className="h-3.5 w-3.5"/> },
                { keys: ["↑", "↓"], label: "Navigate mention autocomplete (when @[ popover is open)" },
                { keys: ["↵"], label: "Select mention from autocomplete" },
                { keys: ["Esc"], label: "Close mention autocomplete / cancel quick-reply" },
            ],
        },
        {
            section: "Quick Add",
            items: [
                { keys: ["⌘", "N"], label: "Quick add (customer, task, quotation, visit, follow-up)", icon: <Plus className="h-3.5 w-3.5"/> },
            ],
        },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center" onClick={() => setOpen(false)}>
            <div className="rd-module-enter w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/[0.06] to-transparent px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Keyboard className="h-5 w-5"/></span>
                        <div>
                            <h2 className="text-sm font-bold tracking-tight text-foreground">Keyboard Shortcuts</h2>
                            <p className="text-[11px] text-muted-foreground">Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">?</kbd> anytime to toggle this help</p>
                        </div>
                    </div>
                    <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Close">
                        <X className="h-4 w-4"/>
                    </button>
                </div>
                {/* Shortcut sections */}
                <div className="max-h-[60vh] overflow-y-auto rd-scroll px-5 py-4">
                    <div className="space-y-5">
                        {shortcuts.map((section) => (
                            <div key={section.section}>
                                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{section.section}</h3>
                                <div className="space-y-1.5">
                                    {section.items.map((item, i) => (
                                        <div key={i} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
                                            <span className="flex items-center gap-2 text-xs text-foreground/90">
                                                {item.icon && <span className="text-muted-foreground">{item.icon}</span>}
                                                {item.label}
                                            </span>
                                            <span className="flex shrink-0 items-center gap-1">
                                                {item.keys.map((key, j) => (
                                                    <React.Fragment key={j}>
                                                        {j > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
                                                        <kbd className={cn("inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-muted/60 px-1.5 font-mono text-[10px] font-semibold text-foreground shadow-sm")}>
                                                            {key}
                                                        </kbd>
                                                    </React.Fragment>
                                                ))}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Footer hint */}
                <div className="border-t border-border bg-muted/30 px-5 py-2.5 text-center text-[10px] text-muted-foreground">
                    Shortcuts work outside of text inputs. <kbd className="rounded bg-background px-1 py-0.5 font-mono text-[10px]">Esc</kbd> closes this overlay.
                </div>
            </div>
        </div>
    );
}
