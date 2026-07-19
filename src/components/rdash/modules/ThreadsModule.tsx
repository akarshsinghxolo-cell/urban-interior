"use client";
import * as React from "react";
import { MessagesSquare } from "lucide-react";
import { UnifiedThreadInboxModule } from "./UnifiedThreadInboxModule";

/**
 * ThreadsModule — a thin wrapper around UnifiedThreadInboxModule.
 *
 * Previously this was a full chat-style layout (grouped-by-ThreadKind list +
 * single-thread view). It was ~275 lines that duplicated the unified inbox's
 * filtering / search / quick-reply features. Task 2-C (work item F) merges
 * the two: the navigation entry "Threads" still exists, but renders the
 * unified inbox with a slight framing tweak so users who navigate here
 * explicitly see the inbox in its default (all-entities) state.
 *
 * The grouped-by-ThreadKind browsing use case is now served by the
 * entity-type filter dropdown inside the unified inbox.
 */
export function ThreadsModule() {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5 px-1">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MessagesSquare className="h-4 w-4"/>
                </span>
                <div>
                    <h2 className="text-lg font-bold tracking-tight">Conversations / Threads</h2>
                    <p className="text-xs text-muted-foreground">
                        Unified thread inbox — every action opens a thread; staff reply with proof, owner sees full history. Use the entity-type filter to browse by record type.
                    </p>
                </div>
            </div>
            <div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card overflow-hidden">
                <UnifiedThreadInboxModule />
            </div>
        </div>
    );
}
