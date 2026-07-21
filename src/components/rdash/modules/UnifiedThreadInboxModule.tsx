"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { Thread, ThreadMessage, ThreadKind } from "@/lib/rdash/types";
import type { DetailPanelKind } from "@/lib/rdash/store/ui-types";
import { Avatar, SectionHeader, EmptyState } from "../primitives";
import { relativeDay, formatDate, titleCase } from "@/lib/rdash/format";
import { renderMentions } from "@/lib/rdash/mentions";
import { Search, MessagesSquare, AtSign, Info, CheckCircle2, Paperclip, ArrowUpRight, Clock, Filter, Inbox, Send, Pin, PinOff, CheckCheck, Circle, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Unified Thread Inbox — a single feed of every message across every thread
 * in the workspace. This is the "inbox" view of the Universal Conversation
 * Graph: comments, decisions, system events, mention backlinks, and proofs
 * from all entities (customers, sites, work orders, quotations, POs, etc.)
 * appear in one chronological stream.
 *
 * Users can:
 * - Search all messages by text
 * - Filter by message kind (All, Chat, Decisions, System, Mentions, Proofs)
 * - Click any message to open the parent entity's detail panel
 * - See which entity/thread each message belongs to via the context badge
 */
export function UnifiedThreadInboxModule({ entityTypeFilter, statusFilter }: { entityTypeFilter?: string; statusFilter?: "open" | "closed" } = {}) {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [search, setSearch] = React.useState("");
    const [filter, setFilter] = React.useState<"all" | "comment" | "decision" | "system" | "alert" | "proof">("all");
    const [entityType, setEntityType] = React.useState<string>(entityTypeFilter || "all");
    const [status, setStatus] = React.useState<"all" | "open" | "closed">(statusFilter || "all");
    const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(null);
    // Pinned threads — persisted to localStorage so users can bookmark
    // important conversations for quick access.
    const [pinnedThreadIds, setPinnedThreadIds] = React.useState<Set<string>>(() => {
        try {
            const stored = localStorage.getItem("uc-pinned-threads");
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch {
            return new Set();
        }
    });
    const togglePin = React.useCallback((threadId: string, threadTitle: string) => {
        setPinnedThreadIds((prev) => {
            const next = new Set(prev);
            if (next.has(threadId)) {
                next.delete(threadId);
                toast.success(`Unpinned "${threadTitle}"`);
            } else {
                next.add(threadId);
                toast.success(`Pinned "${threadTitle}"`);
            }
            try {
                localStorage.setItem("uc-pinned-threads", JSON.stringify([...next]));
            } catch {
                // localStorage may be unavailable (private mode) — non-fatal.
            }
            return next;
        });
    }, []);
    // Pinned threads (most recent message first).
    const pinnedThreads = React.useMemo(() => {
        return db.threads
            .filter((t) => pinnedThreadIds.has(t.id))
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }, [db.threads, pinnedThreadIds]);

    // Unread state — tracks the last-viewed timestamp per thread. A thread is
    // "unread" if it has messages newer than the last-viewed timestamp.
    // Persisted to localStorage so unread state survives reloads.
    const [lastViewedMap, setLastViewedMap] = React.useState<Record<string, string>>(() => {
        try {
            const stored = localStorage.getItem("uc-thread-last-viewed");
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    });
    const isThreadUnread = React.useCallback((thread: Thread): boolean => {
        const lastViewed = lastViewedMap[thread.id];
        if (!lastViewed) return true; // never viewed → unread
        // A thread is unread if its latest message is newer than last viewed.
        return thread.updated_at > lastViewed;
    }, [lastViewedMap]);
    const markThreadRead = React.useCallback((threadId: string, threadUpdatedAt?: string) => {
        setLastViewedMap((prev) => {
            // Use the max of (now, thread's updated_at) so future-dated seed
            // messages don't keep the thread permanently unread.
            const now = new Date().toISOString();
            const ts = threadUpdatedAt && threadUpdatedAt > now ? threadUpdatedAt : now;
            const next = { ...prev, [threadId]: ts };
            try {
                localStorage.setItem("uc-thread-last-viewed", JSON.stringify(next));
            } catch {
                // non-fatal
            }
            return next;
        });
    }, []);
    const unreadThreadCount = React.useMemo(() => {
        return db.threads.filter((t) => isThreadUnread(t)).length;
    }, [db.threads, isThreadUnread]);
    const markAllRead = React.useCallback(() => {
        setLastViewedMap((prev) => {
            const next = { ...prev };
            const now = new Date().toISOString();
            for (const t of db.threads) {
                // Use max(now, thread.updated_at) so future-dated seeds are covered.
                next[t.id] = t.updated_at > now ? t.updated_at : now;
            }
            try {
                localStorage.setItem("uc-thread-last-viewed", JSON.stringify(next));
            } catch {
                // non-fatal
            }
            return next;
        });
        toast.success(`Marked all ${db.threads.length} threads as read`);
    }, [db.threads]);
    const toggleUnread = React.useCallback((thread: Thread) => {
        setLastViewedMap((prev) => {
            const next = { ...prev };
            const isCurrentlyUnread = !next[thread.id] || thread.updated_at > next[thread.id];
            if (isCurrentlyUnread) {
                // Mark as read: use max(now, updated_at) so future-dated seeds work.
                const now = new Date().toISOString();
                next[thread.id] = thread.updated_at > now ? thread.updated_at : now;
                toast.success(`Marked "${thread.title}" as read`);
            } else {
                // Mark as unread: remove the last-viewed entry.
                delete next[thread.id];
                toast.success(`Marked "${thread.title}" as unread`);
            }
            try {
                localStorage.setItem("uc-thread-last-viewed", JSON.stringify(next));
            } catch {
                // non-fatal
            }
            return next;
        });
    }, []);

    // Recently viewed threads — tracks the order in which threads were opened.
    // Stored as an array of thread IDs (most recent first). Complements
    // pinning: pinned = bookmarked, recent = history.
    const [recentThreadIds, setRecentThreadIds] = React.useState<string[]>(() => {
        try {
            const stored = localStorage.getItem("uc-recent-threads");
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });
    const trackRecentThread = React.useCallback((threadId: string) => {
        setRecentThreadIds((prev) => {
            const next = [threadId, ...prev.filter((id) => id !== threadId)].slice(0, 5);
            try {
                localStorage.setItem("uc-recent-threads", JSON.stringify(next));
            } catch {
                // non-fatal
            }
            return next;
        });
    }, []);
    const recentThreads = React.useMemo(() => {
        return recentThreadIds
            .map((id) => db.threads.find((t) => t.id === id))
            .filter((t): t is Thread => Boolean(t));
    }, [recentThreadIds, db.threads]);

    // Flatten all messages from all threads into a single feed.
    type FeedItem = {
        message: ThreadMessage;
        thread: Thread;
    };
    const allFeed: FeedItem[] = React.useMemo(() => {
        const out: FeedItem[] = [];
        for (const thread of db.threads) {
            for (const message of thread.messages) {
                out.push({ message, thread });
            }
        }
        // Sort newest first.
        out.sort((a, b) => b.message.created_at.localeCompare(a.message.created_at));
        return out;
    }, [db.threads]);

    // Apply search + filter.
    const filteredFeed = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        return allFeed.filter(({ message: m, thread }) => {
            // Kind filter.
            if (filter !== "all") {
                if (filter === "comment" && m.kind !== "comment") return false;
                if (filter === "decision" && m.kind !== "decision") return false;
                if (filter === "system" && m.kind !== "system") return false;
                if (filter === "alert" && m.kind !== "alert") return false;
                if (filter === "proof" && m.kind !== "proof") return false;
            }
            // Entity-type filter (ThreadKind).
            if (entityType !== "all" && thread.kind !== entityType) return false;
            // Status filter.
            if (status === "open" && !thread.open) return false;
            if (status === "closed" && thread.open) return false;
            // Text search — matches body, author, or thread title.
            if (q) {
                const hay = `${m.body} ${m.author_name} ${thread.title}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [allFeed, search, filter, entityType, status]);

    // Count by kind for the filter pills.
    const counts = React.useMemo(() => {
        const c = { all: 0, comment: 0, decision: 0, system: 0, alert: 0, proof: 0 };
        for (const { message: m } of allFeed) {
            c.all++;
            if (m.kind === "comment") c.comment++;
            else if (m.kind === "decision") c.decision++;
            else if (m.kind === "system") c.system++;
            else if (m.kind === "alert") c.alert++;
            else if (m.kind === "proof") c.proof++;
        }
        return c;
    }, [allFeed]);

    const filterTabs: Array<{ id: typeof filter; label: string; count: number; icon: React.ReactNode }> = [
        { id: "all", label: "All", count: counts.all, icon: <Inbox className="h-3 w-3"/> },
        { id: "comment", label: "Chat", count: counts.comment, icon: <MessagesSquare className="h-3 w-3"/> },
        { id: "decision", label: "Decisions", count: counts.decision, icon: <CheckCircle2 className="h-3 w-3"/> },
        { id: "system", label: "System", count: counts.system, icon: <Info className="h-3 w-3"/> },
        { id: "alert", label: "Mentions", count: counts.alert, icon: <AtSign className="h-3 w-3"/> },
        { id: "proof", label: "Proofs", count: counts.proof, icon: <Paperclip className="h-3 w-3"/> },
    ];

    // Recently active threads (updated in the last 24 hours) — shown as a
    // live indicator in the header so users can see how much is happening.
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const recentThreadCount = db.threads.filter((t) => {
        const updated = new Date(t.updated_at).getTime();
        return !Number.isNaN(updated) && updated > dayAgo;
    }).length;
    const recentMessageCount = allFeed.filter(({ message: m }) => {
        const ts = new Date(m.created_at).getTime();
        return !Number.isNaN(ts) && ts > dayAgo;
    }).length;

    // Group filtered feed by day for display.
    const grouped = React.useMemo(() => {
        const map = new Map<string, FeedItem[]>();
        for (const item of filteredFeed) {
            const day = item.message.created_at.slice(0, 10);
            if (!map.has(day)) map.set(day, []);
            map.get(day)!.push(item);
        }
        return Array.from(map.entries());
    }, [filteredFeed]);

    const openThread = (thread: Thread) => {
        const kind = threadKindToDetailKind(thread.kind);
        if (kind) {
            openDetail(kind, thread.record_id, "unifiedThreadInbox");
        }
        setSelectedThreadId(thread.id);
        markThreadRead(thread.id, thread.updated_at);
        trackRecentThread(thread.id);
    };

    return (<div className="flex h-full flex-col gap-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-card/50 px-4 pb-3 pt-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Inbox className="h-5 w-5"/></span>
                    <div>
                        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground">
                            Thread Inbox
                            {unreadThreadCount > 0 && (
                                <span className="inline-flex items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground" title={`${unreadThreadCount} unread thread${unreadThreadCount !== 1 ? "s" : ""}`}>
                                    {unreadThreadCount}
                                </span>
                            )}
                        </h2>
                        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            {db.threads.length} threads · {allFeed.length} messages
                            {recentMessageCount > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success"/>
                                    {recentMessageCount} new · {recentThreadCount} active
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {unreadThreadCount > 0 && (
                        <button type="button" onClick={markAllRead} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-[11px] font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary hover:shadow-sm" title={`Mark all ${unreadThreadCount} unread threads as read`}>
                            <CheckCheck className="h-3.5 w-3.5"/>
                            <span className="hidden sm:inline">Mark all read</span>
                        </button>
                    )}
                    <div className="relative w-32 shrink-0 sm:w-52">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"/>
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages…" className="h-9 rounded-lg bg-muted/40 pl-8 pr-2 text-xs"/>
                    </div>
                </div>
            </div>
            {/* Filter pills */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {filterTabs.map((tab) => (
                    <button key={tab.id} type="button" onClick={() => setFilter(tab.id)} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all", filter === tab.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground")}>
                        {tab.icon}{tab.label}<span className={cn("rounded-full px-1 text-[10px]", filter === tab.id ? "bg-primary-foreground/20" : "bg-background/70")}>{tab.count}</span>
                    </button>
                ))}
                {/* F. Entity-type + status filters — consolidates the old ThreadsModule
                    "browse by ThreadKind" use case into the unified inbox. */}
                <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="ml-auto h-7 rounded-full border border-border bg-card px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground" aria-label="Filter by entity type">
                    <option value="all">All entities</option>
                    <option value="quotation">Quotations</option>
                    <option value="workOrder">Work Orders</option>
                    <option value="task">Tasks</option>
                    <option value="followup">Follow-ups</option>
                    <option value="visit">Visits</option>
                    <option value="po">POs</option>
                    <option value="grn">GRNs</option>
                    <option value="dispatch">Dispatches</option>
                    <option value="payment">Payments</option>
                    <option value="invoice">Invoices</option>
                    <option value="vendor_bill">Vendor Bills</option>
                    <option value="blocked">Obstacles</option>
                    <option value="commission">Commissions</option>
                    <option value="site">Sites</option>
                    <option value="drawing">Drawings</option>
                    <option value="execution_log">Execution Logs</option>
                    <option value="generic">General</option>
                </select>
                <select value={status} onChange={(e) => setStatus(e.target.value as "all" | "open" | "closed")} className="h-7 rounded-full border border-border bg-card px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground" aria-label="Filter by status">
                    <option value="all">All status</option>
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                </select>
            </div>
        </div>

        {/* Pinned + Recent threads bar — shows bookmarked and recently-viewed
            conversations for quick access. Only on All filter with no search. */}
        {(pinnedThreads.length > 0 || recentThreads.length > 0) && !search && filter === "all" && (
            <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-2">
                <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
                    {pinnedThreads.length > 0 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto rd-scroll">
                            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                <Pin className="h-3 w-3"/> Pinned
                            </span>
                            {pinnedThreads.map((t) => {
                                const label = threadEntityLabel(t, db);
                                const tone = threadKindTone(t.kind);
                                const lastMsg = t.messages[t.messages.length - 1];
                                return (
                                    <button key={t.id} type="button" onClick={() => openThread(t)} className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium shadow-sm transition-all hover:border-primary/30 hover:shadow-md" title={t.title}>
                                        <span className={cn("h-1.5 w-1.5 rounded-full", tone.includes("warning") ? "bg-warning" : tone.includes("success") ? "bg-success" : tone.includes("destructive") ? "bg-destructive" : "bg-primary")}/>
                                        <span className="max-w-[10rem] truncate text-foreground">{t.title}</span>
                                        <span className="text-[10px] text-muted-foreground">{label}</span>
                                        {lastMsg && <span className="text-[10px] text-muted-foreground/70">· {relativeDay(lastMsg.created_at)}</span>}
                                        <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); togglePin(t.id, t.title); }} className="ml-0.5 opacity-0 transition-opacity group-hover:opacity-100" title="Unpin">
                                            <PinOff className="h-3 w-3 text-muted-foreground hover:text-destructive"/>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {recentThreads.length > 0 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto rd-scroll">
                            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                <Clock className="h-3 w-3"/> Recent
                            </span>
                            {recentThreads.map((t) => {
                                const label = threadEntityLabel(t, db);
                                const unread = isThreadUnread(t);
                                return (
                                    <button key={t.id} type="button" onClick={() => openThread(t)} className={cn("group inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all hover:shadow-md", unread ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10" : "border-border bg-card text-foreground hover:border-primary/20")} title={t.title}>
                                        {unread && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"/>}
                                        <span className="max-w-[10rem] truncate">{t.title}</span>
                                        <span className="text-[10px] text-muted-foreground">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Feed */}
        <div className="flex-1 overflow-y-auto rd-scroll">
            {filteredFeed.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-muted-foreground">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40"><Inbox className="h-8 w-8 opacity-50"/></div>
                    <div>
                        <p className="text-sm font-medium text-foreground">{search ? "No messages found" : "No messages in this filter"}</p>
                        <p className="mt-0.5 text-[11px]">{search ? `Try a different search term` : `Switch to "All" to see every message`}</p>
                    </div>
                </div>
            ) : (
                <div className="mx-auto max-w-3xl px-4 py-4">
                    {grouped.map(([day, items]) => (
                        <div key={day} className="mb-4">
                            {/* Day header */}
                            <div className="sticky top-0 z-10 -mx-1 mb-2 flex items-center gap-2 bg-card/95 px-1 py-1.5 backdrop-blur-sm">
                                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                    {relativeDay(day)}
                                </span>
                                <span className="text-[10px] text-muted-foreground/70">· {new Date(day).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground">{items.length} message{items.length !== 1 ? "s" : ""}</span>
                            </div>
                            {/* Messages for this day */}
                            <div className="space-y-1.5">
                                {items.map(({ message: m, thread }) => (
                                    <InboxMessageCard
                                        key={m.id}
                                        message={m}
                                        thread={thread}
                                        onOpen={() => openThread(thread)}
                                        isPinned={pinnedThreadIds.has(thread.id)}
                                        onTogglePin={() => togglePin(thread.id, thread.title)}
                                        isUnread={isThreadUnread(thread)}
                                        onToggleUnread={() => toggleUnread(thread)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>);
}

/** A single message card in the inbox feed. */
function InboxMessageCard({ message: m, thread, onOpen, isPinned, onTogglePin, isUnread, onToggleUnread }: {
    message: ThreadMessage;
    thread: Thread;
    onOpen: () => void;
    isPinned: boolean;
    onTogglePin: () => void;
    isUnread: boolean;
    onToggleUnread: () => void;
}) {
    const addReply = useRDashStore((s) => s.addThreadReply);
    const currentUser = useRDashStore((s) => s.currentUser);
    const [showReply, setShowReply] = React.useState(false);
    const [replyText, setReplyText] = React.useState("");
    const isSystem = m.kind === "system";
    const isAlert = m.kind === "alert";
    const isDecision = m.kind === "decision";
    const isProof = m.kind === "proof";
    const isComment = m.kind === "comment";
    const kindIcon = isSystem ? <Info className="h-3 w-3"/> : isAlert ? <AtSign className="h-3 w-3"/> : isDecision ? <CheckCircle2 className="h-3 w-3"/> : isProof ? <Paperclip className="h-3 w-3"/> : null;
    const kindTone = isSystem ? "bg-muted/60 text-muted-foreground" : isAlert ? "bg-primary/10 text-primary" : isDecision ? "bg-success/10 text-success" : isProof ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground";
    const entityLabel = threadEntityLabel(thread, useRDashStore((s) => s.db));
    const entityTone = threadKindTone(thread.kind);
    const kindBadgeLabel = isSystem ? "System" : isAlert ? "Mention" : isDecision ? "Decision" : isProof ? "Proof" : isComment ? "Comment" : "";

    const sendQuickReply = () => {
        const user = currentUser();
        if (!replyText.trim()) return;
        addReply(thread.id, {
            author: user.name,
            role: user.role,
            body: replyText.trim(),
            kind: "comment",
            parent_message_id: m.id,
        });
        setReplyText("");
        setShowReply(false);
        toast.success("Reply posted", { description: `Replied to ${m.author_name} in ${thread.title}` });
    };

    return (
        <div className={cn("group relative rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-lg", isUnread ? "border-primary/30 bg-primary/[0.02]" : "border-border", isDecision && "border-success/20 bg-success/[0.03]", isAlert && "border-primary/20 bg-primary/[0.02]")}>
            {/* Unread left accent bar */}
            {isUnread && <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-primary" aria-hidden/>}
            {/* Top row: author + timestamp + kind badge + entity context */}
            <div className="flex items-center gap-2">
                {isSystem || isAlert ? (
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", kindTone)}>{kindIcon}</span>
                ) : (
                    <Avatar name={m.author_name} size={24}/>
                )}
                <span className="text-xs font-semibold text-foreground">{m.author_name || "System"}</span>
                {m.author_role && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{m.author_role}</span>}
                {/* Kind badge */}
                {kindBadgeLabel && (
                    <span className={cn("rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider", kindTone)}>{kindBadgeLabel}</span>
                )}
                <span title={formatDate(m.created_at)} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70"><Clock className="h-2.5 w-2.5 opacity-50"/>{relativeDay(m.created_at)}</span>
                {/* Entity context badge — colored by entity type */}
                <button type="button" onClick={onOpen} className={cn("ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors", entityTone)} title={`Open ${entityLabel}: ${thread.title}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60"/>
                    {entityLabel}
                    <ArrowUpRight className="h-2.5 w-2.5"/>
                </button>
            </div>
            {/* Body */}
            <div className="mt-1.5 pl-8">
                <MessageBody body={m.body}/>
                {/* Thread title link + actions */}
                <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-primary">
                        <MessagesSquare className="h-3 w-3"/>
                        <span className="max-w-md truncate">{thread.title}</span>
                    </button>
                    {/* Pin/unpin button — always visible if pinned, hover-only otherwise */}
                    <button type="button" onClick={onTogglePin} className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium transition-all hover:underline", isPinned ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100")} title={isPinned ? "Unpin thread" : "Pin thread for quick access"}>
                        {isPinned ? <Pin className="h-3 w-3 fill-primary"/> : <Pin className="h-3 w-3"/>}
                        {isPinned ? "Pinned" : "Pin"}
                    </button>
                    {/* Mark as unread / read toggle */}
                    <button type="button" onClick={onToggleUnread} className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium transition-all hover:underline", isUnread ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100")} title={isUnread ? "Mark as read" : "Mark as unread"}>
                        {isUnread ? <CheckCheck className="h-3 w-3"/> : <Circle className="h-3 w-3"/>}
                        {isUnread ? "Read" : "Unread"}
                    </button>
                    {/* Copy message to clipboard */}
                    <button type="button" onClick={() => {
                        const text = `${m.author_name}: ${m.body}`;
                        navigator.clipboard?.writeText(text).then(
                            () => toast.success("Message copied to clipboard"),
                            () => toast.error("Could not copy to clipboard"),
                        );
                    }} className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity hover:underline group-hover:opacity-100" title="Copy message to clipboard">
                        <Copy className="h-3 w-3"/>Copy
                    </button>
                    {/* Quick reply toggle — only for comment/decision/proof (not system/alert) */}
                    {!isSystem && !isAlert && (
                        <button type="button" onClick={() => setShowReply((v) => !v)} className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary opacity-0 transition-opacity hover:underline group-hover:opacity-100" title="Quick reply">
                            <Send className="h-3 w-3"/>Reply
                        </button>
                    )}
                </div>
                {/* Quick reply input */}
                {showReply && (
                    <div className="mt-2 flex items-end gap-1.5 rounded-lg border border-border bg-muted/30 p-2">
                        <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Quick reply…"
                            className="min-h-[36px] flex-1 resize-none bg-card px-2 py-1 text-xs outline-none rounded-md border border-border focus:border-primary/40"
                            rows={1}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendQuickReply(); }
                                if (e.key === "Escape") { setShowReply(false); setReplyText(""); }
                            }}
                            autoFocus
                        />
                        <button type="button" onClick={sendQuickReply} disabled={!replyText.trim()} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity disabled:opacity-40 hover:opacity-90" title="Send reply (Ctrl+Enter)">
                            <Send className="h-3.5 w-3.5"/>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/** Render message body with @mention pills. */
function MessageBody({ body }: { body: string }) {
    const openDetail = useRDashStore((s) => s.openDetail);
    const segments = renderMentions(body);
    if (!body) return <p className="text-xs italic text-muted-foreground/60">(empty message)</p>;
    return (<p className="whitespace-pre-wrap text-sm text-foreground/90">
        {segments.map((seg, i) => seg.type === "text" ? (<span key={i}>{seg.text}</span>) : (
            <button key={i} type="button" onClick={() => {
                const kind = mentionEntityTypeToDetailKind(seg.mention.entity_type);
                if (kind) openDetail(kind, seg.mention.entity_id);
            }} className="mx-0.5 inline-flex items-center rounded bg-primary/10 px-1 py-0.5 text-[12px] font-medium text-primary align-baseline hover:bg-primary/20 hover:underline" title={`Open ${seg.mention.entity_type}`}>
                <AtSign className="mr-0.5 h-3 w-3"/>{seg.mention.label}
            </button>
        ))}
    </p>);
}

/** Map a ThreadKind to a DetailPanelKind so clicking a message opens the right entity. */
function threadKindToDetailKind(kind: ThreadKind): DetailPanelKind | null {
    const map: Partial<Record<ThreadKind, DetailPanelKind>> = {
        quotation: "quotation",
        workOrder: "workOrder",
        task: "task",
        followup: "followup",
        visit: "visit",
        payment: "payment",
        invoice: "invoice",
        po: "po",
        grn: "grn",
        dispatch: "dispatch",
        blocked: "blocked",
        commission: "commission",
        site: "site",
        drawing: null,
        execution_log: null,
        workRequired: "workRequired",
        inventory: "inventory",
        vendor_bill: "vendorBill",
        bid: null,
        settlement: null,
        approval: null,
        generic: null,
    };
    return map[kind] ?? null;
}

/** Human-readable label for a ThreadKind, shown in the entity context badge. */
function threadKindLabel(kind: ThreadKind): string {
    const map: Record<ThreadKind, string> = {
        quotation: "Quotation",
        workOrder: "Work Order",
        task: "Task",
        followup: "Follow-up",
        visit: "Visit",
        payment: "Payment",
        invoice: "Invoice",
        vendor_bill: "Vendor Bill",
        inventory: "Inventory",
        po: "PO",
        grn: "GRN",
        dispatch: "Dispatch",
        blocked: "Obstacle",
        approval: "Approval",
        commission: "Commission",
        bid: "Bid",
        settlement: "Settlement",
        site: "Site",
        drawing: "Drawing",
        execution_log: "Execution Log",
        workRequired: "Work Required",
        generic: "Entity",
    };
    return map[kind] || "Entity";
}

/**
 * Resolve a specific entity label for a thread, even for "generic" threads.
 * For generic threads (used by customers, staff, vendors, contractors, etc.),
 * look up the record_id in the db to determine the actual entity type and
 * return a specific label (Customer, Staff, Vendor, Contractor) instead of
 * the vague "Entity".
 */
function threadEntityLabel(thread: Thread, db: import("@/lib/rdash/types").RDashDatabase): string {
    if (thread.kind !== "generic") return threadKindLabel(thread.kind);
    const id = thread.record_id;
    // Check customer-conversation: prefix (legacy format).
    if (id.startsWith("customer-conversation:")) return "Customer";
    // Check each collection to determine the entity type.
    if (db.customers.some((c) => c.id === id)) return "Customer";
    if (db.master?.staff?.some((s) => s.id === id)) return "Staff";
    if (db.master?.vendors?.some((v) => v.id === id)) return "Vendor";
    if (db.master?.contractors?.some((c) => c.id === id)) return "Contractor";
    if (db.areas.some((a) => a.id === id)) return "Area";
    if (db.boqs.some((b) => b.id === id)) return "BOQ";
    if (db.variationRequests.some((v) => v.id === id)) return "Variation";
    if (db.attendance.some((a) => a.id === id)) return "Attendance";
    if (db.master?.vendorRates?.some((r) => r.id === id)) return "Vendor Rate";
    return "Entity";
}

/** Tailwind classes for the entity context badge, colored by ThreadKind.
 *  Gives each entity type a distinct, recognizable color at a glance. */
function threadKindTone(kind: ThreadKind): string {
    const map: Record<ThreadKind, string> = {
        quotation: "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15",
        workOrder: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
        task: "border-primary/25 bg-primary/5 text-primary/80 hover:bg-primary/10",
        followup: "border-primary/25 bg-primary/5 text-primary/80 hover:bg-primary/10",
        visit: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
        payment: "border-success/30 bg-success/10 text-success hover:bg-success/15",
        invoice: "border-success/30 bg-success/10 text-success hover:bg-success/15",
        vendor_bill: "border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15",
        inventory: "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15",
        po: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
        grn: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
        dispatch: "border-primary/25 bg-primary/5 text-primary/80 hover:bg-primary/10",
        blocked: "border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15",
        approval: "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15",
        commission: "border-success/30 bg-success/10 text-success hover:bg-success/15",
        bid: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
        settlement: "border-success/30 bg-success/10 text-success hover:bg-success/15",
        site: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
        drawing: "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15",
        execution_log: "border-primary/25 bg-primary/5 text-primary/80 hover:bg-primary/10",
        workRequired: "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15",
        generic: "border-border bg-muted/60 text-foreground/80 hover:bg-muted",
    };
    return map[kind] || "border-border bg-muted/60 text-foreground/80 hover:bg-muted";
}

/** Map mention entity_type strings to DetailPanelKind for clickable mention pills. */
function mentionEntityTypeToDetailKind(entityType: string): DetailPanelKind | null {
    const map: Record<string, DetailPanelKind> = {
        customer: "customer",
        site: "site",
        workOrder: "workOrder",
        quotation: "quotation",
        po: "po",
        grn: "grn",
        task: "task",
        visit: "visit",
        payment: "payment",
        invoice: "invoice",
        vendorBill: "vendorBill",
        vendor: "vendor",
        contractor: "contractor",
        staff: "staff",
    };
    return map[entityType] || null;
}
