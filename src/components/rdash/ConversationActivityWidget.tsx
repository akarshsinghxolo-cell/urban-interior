"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { relativeDay } from "@/lib/rdash/format";
import { MessagesSquare, AtSign, CheckCircle2, Paperclip, Info, TrendingUp, ArrowUpRight } from "lucide-react";

/**
 * Conversation Activity widget — shows the Universal Conversation Graph
 * activity at a glance on the dashboard.
 *
 * Displays:
 * - A 7-day message activity bar chart (mini sparkline style)
 * - Counts by message kind (comments, decisions, mentions, proofs, system)
 * - The most recently active threads (top 3)
 * - A "view all" link to the Thread Inbox
 */
export function ConversationActivityWidget({ onOpenInbox }: { onOpenInbox?: () => void }) {
    const db = useRDashStore((s) => s.db);

    // Flatten all messages with their thread context.
    const allMessages = React.useMemo(() => {
        const out: Array<{ msg: import("@/lib/rdash/types").ThreadMessage; thread: import("@/lib/rdash/types").Thread }> = [];
        for (const thread of db.threads) {
            for (const msg of thread.messages) {
                out.push({ msg, thread });
            }
        }
        return out.sort((a, b) => b.msg.created_at.localeCompare(a.msg.created_at));
    }, [db.threads]);

    // 7-day activity: count messages per day for the last 7 days.
    const dailyActivity = React.useMemo(() => {
        const days: Array<{ label: string; date: string; count: number; isToday: boolean }> = [];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            const dateStr = d.toISOString().slice(0, 10);
            const next = new Date(d);
            next.setDate(next.getDate() + 1);
            const count = allMessages.filter(({ msg }) => {
                const ts = msg.created_at.slice(0, 10);
                return ts === dateStr;
            }).length;
            days.push({
                label: d.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 1),
                date: dateStr,
                count,
                isToday: i === 0,
            });
        }
        return days;
    }, [allMessages]);

    const maxCount = Math.max(...dailyActivity.map((d) => d.count), 1);

    // Kind breakdown.
    const kindCounts = React.useMemo(() => {
        const c = { comment: 0, decision: 0, alert: 0, proof: 0, system: 0 };
        for (const { msg } of allMessages) {
            if (msg.kind === "comment") c.comment++;
            else if (msg.kind === "decision") c.decision++;
            else if (msg.kind === "alert") c.alert++;
            else if (msg.kind === "proof") c.proof++;
            else if (msg.kind === "system") c.system++;
        }
        return c;
    }, [allMessages]);

    // Top 3 recently active threads.
    const recentThreads = React.useMemo(() => {
        return [...db.threads]
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(0, 3);
    }, [db.threads]);

    const kindIcons = [
        { key: "comment", label: "Chat", count: kindCounts.comment, icon: <MessagesSquare className="h-3 w-3"/>, tone: "text-primary" },
        { key: "decision", label: "Decisions", count: kindCounts.decision, icon: <CheckCircle2 className="h-3 w-3"/>, tone: "text-success" },
        { key: "alert", label: "Mentions", count: kindCounts.alert, icon: <AtSign className="h-3 w-3"/>, tone: "text-primary" },
        { key: "proof", label: "Proofs", count: kindCounts.proof, icon: <Paperclip className="h-3 w-3"/>, tone: "text-primary" },
    ] as const;

    return (
        <section aria-label="Conversation activity" className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-gradient-to-br from-card via-card to-primary/[0.03] shadow-card">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/[0.06] to-transparent px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><MessagesSquare className="h-4 w-4"/></span>
                    <div>
                        <h3 className="text-sm font-bold tracking-tight text-foreground">Conversation Activity</h3>
                        <p className="text-[10px] text-muted-foreground">{db.threads.length} threads · {allMessages.length} messages</p>
                    </div>
                </div>
                {onOpenInbox && (
                    <button type="button" onClick={onOpenInbox} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/20">
                        View inbox <ArrowUpRight className="h-3 w-3"/>
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                {/* 7-day activity chart */}
                <div>
                    <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <TrendingUp className="h-3 w-3"/> 7-day activity
                    </p>
                    <div className="flex h-20 items-end justify-between gap-1.5">
                        {dailyActivity.map((day) => (
                            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                                <div className="flex w-full flex-1 items-end">
                                    <div
                                        className={cn("w-full rounded-t-sm transition-all", day.isToday ? "bg-primary" : "bg-primary/30 hover:bg-primary/50")}
                                        style={{ height: `${Math.max((day.count / maxCount) * 100, 4)}%` }}
                                        title={`${day.count} messages on ${day.date}`}
                                    />
                                </div>
                                <span className={cn("text-[9px] font-medium", day.isToday ? "text-primary" : "text-muted-foreground")}>{day.label}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                        {dailyActivity.reduce((n, d) => n + d.count, 0)} messages this week
                    </p>
                </div>

                {/* Kind breakdown */}
                <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">By type</p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {kindIcons.map((k) => (
                            <div key={k.key} className="flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2 py-1.5">
                                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted/60", k.tone)}>{k.icon}</span>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold leading-none text-foreground">{k.count}</p>
                                    <p className="text-[9px] text-muted-foreground">{k.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Recent threads */}
            {recentThreads.length > 0 && (
                <div className="border-t border-border px-4 py-2.5">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recently active</p>
                    <div className="flex flex-col gap-1">
                        {recentThreads.map((t) => (
                            <div key={t.id} className="flex items-center gap-2 text-[11px]">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"/>
                                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{t.title}</span>
                                <span className="shrink-0 text-[9px] text-muted-foreground">{relativeDay(t.updated_at)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
