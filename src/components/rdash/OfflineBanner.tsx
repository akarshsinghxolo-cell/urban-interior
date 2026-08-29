"use client";

import * as React from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceOutbox } from "@/lib/uploads/use-workspace-outbox";

/**
 * Slim connectivity banner pinned under the workspace header.
 *
 * Field teams work through connectivity drops: while offline the workspace
 * outbox keeps every edit queued on-device, but nothing told the user that
 * their edits were safe — or that the device was even offline (the header
 * sync pill only distinguishes queue/saving/saved states). The banner fills
 * that gap: it appears while `navigator.onLine` is false, reports how many
 * edits are waiting, and confirms the reconnect with a one-shot toast so the
 * queued set visibly drains.
 */
export function OfflineBanner() {
    const outbox = useWorkspaceOutbox();
    const [online, setOnline] = React.useState(true);
    const wasOfflineRef = React.useRef(false);

    React.useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        update();
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);

    // One-shot "back online" toast per offline episode, so the user sees the
    // moment their queued edits start draining.
    React.useEffect(() => {
        if (!online) {
            wasOfflineRef.current = true;
            return;
        }
        if (!wasOfflineRef.current) return;
        wasOfflineRef.current = false;
        const pending = outbox.items.length;
        toast.success("Back online", {
            description: pending > 0
                ? `Syncing ${pending} queued edit${pending === 1 ? "" : "s"}…`
                : "Connection restored.",
            duration: 4000,
        });
    }, [online, outbox.items.length]);

    if (online) return null;

    const pendingCount = outbox.items.length;

    return (
        <div
            role="status"
            aria-live="polite"
            data-testid="offline-banner"
            className="flex items-center justify-center gap-2 border-b border-warning/25 bg-warning/10 px-3 py-1.5 text-warning"
        >
            <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <p className="truncate text-[11px] font-semibold">
                You&apos;re offline
                <span className="font-medium text-warning/90">
                    {pendingCount > 0
                        ? ` — ${pendingCount} edit${pendingCount === 1 ? "" : "s"} saved on this device, syncing when you reconnect`
                        : " — changes are saved on this device and sync automatically"}
                </span>
            </p>
            <RefreshCw className="h-3 w-3 shrink-0 animate-none opacity-70" aria-hidden />
        </div>
    );
}
