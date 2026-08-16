"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { relativeDay, titleCase, formatINR } from "@/lib/rdash/format";
import { Bell, AlertTriangle, CheckCircle2, Clock, X, Wallet, ShieldCheck, Ban, MapPin, CheckCheck, Filter, BellOff } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel, } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
type NotifCategory = "overdue" | "approval" | "blocked" | "risk" | "visit";
const NOTIFICATION_SOURCE_COLLECTION: Record<NotifCategory, string> = {
    overdue: "payments",
    approval: "actions",
    blocked: "blocked",
    risk: "risks",
    visit: "visits",
};
const NOTIFICATION_SOURCE_COLLECTIONS = Object.freeze(Object.values(NOTIFICATION_SOURCE_COLLECTION));
interface NotifItem {
    id: string;
    kind: "alert" | "reminder" | "info";
    category: NotifCategory;
    title: string;
    body?: string;
    time: string;
    action?: () => void;
    actionLabel?: string;
    read?: boolean;
}
const CATEGORY_META: Record<NotifCategory, {
    label: string;
    icon: React.ElementType;
    color: string;
    dotColor: string;
}> = {
    overdue: { label: "Overdue", icon: Wallet, color: "bg-destructive/10 text-destructive border-destructive/20", dotColor: "bg-destructive" },
    approval: { label: "Approvals", icon: ShieldCheck, color: "bg-warning/10 text-warning border-warning/20", dotColor: "bg-warning" },
    blocked: { label: "Blocked", icon: Ban, color: "bg-destructive/10 text-destructive border-destructive/20", dotColor: "bg-destructive" },
    risk: { label: "Risk", icon: AlertTriangle, color: "bg-destructive/10 text-destructive border-destructive/20", dotColor: "bg-destructive" },
    visit: { label: "Visits", icon: MapPin, color: "bg-primary/10 text-primary border-primary/20", dotColor: "bg-primary" },
};
interface NotificationPreferenceState {
    version: 1;
    read: string[];
    dismissed: string[];
    snoozed: Record<string, number>;
}


function notificationPreferenceKey(email: string | undefined): string {
    return `uc_notification_preferences_v1:${email?.trim().toLowerCase() || "anonymous"}`;
}

function readNotificationPreferences(key: string): NotificationPreferenceState {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(key) || "null") as Partial<NotificationPreferenceState> | null;
        return {
            version: 1,
            read: Array.isArray(parsed?.read) ? parsed.read.filter((id): id is string => typeof id === "string").slice(-500) : [],
            dismissed: Array.isArray(parsed?.dismissed) ? parsed.dismissed.filter((id): id is string => typeof id === "string").slice(-500) : [],
            snoozed: parsed?.snoozed && typeof parsed.snoozed === "object" ? Object.fromEntries(
                Object.entries(parsed.snoozed).filter(([id, wakeAt]) => typeof id === "string" && typeof wakeAt === "number" && Number.isFinite(wakeAt)),
            ) : {},
        };
    } catch {
        return { version: 1, read: [], dismissed: [], snoozed: {} };
    }
}

export function NotificationCenter() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const authEmail = useRDashStore((s) => s.authUser?.email);
    const preferenceKey = React.useMemo(() => notificationPreferenceKey(authEmail), [authEmail]);
    const [open, setOpen] = React.useState(false);
    const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set());
    const [readItems, setReadItems] = React.useState<Set<string>>(() => new Set());
    const [snoozed, setSnoozed] = React.useState<Record<string, number>>({});
    const [filter, setFilter] = React.useState<NotifCategory | "all">("all");
    const [loadedPreferenceKey, setLoadedPreferenceKey] = React.useState<string | null>(null);
    const notificationReadCoverage = React.useMemo(() => {
        const metadata = db as unknown as { _workspace_read_collections?: unknown; _workspace_read_strategy?: unknown };
        const raw = metadata._workspace_read_collections;
        const collections = new Set(Array.isArray(raw)
            ? raw.map((value) => String(value || "").trim()).filter(Boolean)
            : []);
        const strategy = String(metadata._workspace_read_strategy || "unknown");
        const authoritative = strategy !== "row" && strategy !== "bootstrap" && strategy !== "unknown";
        return { collections, authoritative };
    }, [db]);
    const notificationCoverageComplete = notificationReadCoverage.authoritative
        && NOTIFICATION_SOURCE_COLLECTIONS.every((collection) => notificationReadCoverage.collections.has(collection));
    const filterCoverageComplete = filter === "all"
        ? notificationCoverageComplete
        : notificationReadCoverage.authoritative
            && notificationReadCoverage.collections.has(NOTIFICATION_SOURCE_COLLECTION[filter]);
    React.useEffect(() => {
        setLoadedPreferenceKey(null);
        const applyStored = () => {
            const stored = readNotificationPreferences(preferenceKey);
            setReadItems(new Set(stored.read));
            setDismissed(new Set(stored.dismissed));
            setSnoozed(stored.snoozed);
            setLoadedPreferenceKey(preferenceKey);
        };
        applyStored();
        const onStorage = (event: StorageEvent) => {
            if (event.key === preferenceKey) applyStored();
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, [preferenceKey]);
    React.useEffect(() => {
        if (loadedPreferenceKey !== preferenceKey) return;
        const now = Date.now();
        const payload: NotificationPreferenceState = {
            version: 1,
            read: Array.from(readItems).slice(-500),
            dismissed: Array.from(dismissed).slice(-500),
            snoozed: Object.fromEntries(Object.entries(snoozed).filter(([, wakeAt]) => wakeAt > now)),
        };
        try {
            window.localStorage.setItem(preferenceKey, JSON.stringify(payload));
        } catch { /* non-fatal */ }
    }, [dismissed, loadedPreferenceKey, preferenceKey, readItems, snoozed]);
    const notifs: NotifItem[] = React.useMemo(() => {
        const items: NotifItem[] = [];
        db.payments.filter((p) => p.status === "overdue").forEach((p) => {
            items.push({
                id: `pay-${p.id}`, kind: "alert", category: "overdue", title: `Payment overdue: ${formatINR(p.amount)}`,
                body: `${(p.customer_name || "Customer")} · ${p.milestone_label || "Payment"} due ${relativeDay(p.due_date)}`,
                time: p.due_date, actionLabel: "Open", action: () => { openDetail("payment", p.id); setOpen(false); },
            });
        });
        db.actions.filter((a) => a.status === "pending").forEach((a) => {
            items.push({
                id: `appr-${a.id}`, kind: "reminder", category: "approval", title: `Approval needed: ${a.title}`,
                body: (a.customer_name || "Customer") ? `${(a.customer_name || "Customer")}${a.amount ? ` · ${formatINR(a.amount)}` : ""}` : undefined,
                time: a.created_at, actionLabel: "Review", action: () => { setActiveModule("approvals"); setOpen(false); },
            });
        });
        db.blocked.filter((b) => !b.resolved).forEach((b) => {
            items.push({
                id: `blk-${b.id}`, kind: "alert", category: "blocked", title: `Blocked: ${b.title}`,
                body: b.reason, time: b.created_at, actionLabel: "Open", action: () => { openDetail("blocked", b.id); setOpen(false); },
            });
        });
        db.risks.forEach((r) => {
            items.push({
                id: `risk-${r.id}`, kind: "alert", category: "risk", title: `Risk: ${r.title}`,
                body: r.reason, time: r.created_at, actionLabel: "Review", action: () => { setActiveModule("blockedRisks"); setOpen(false); },
            });
        });
        db.visits.filter((v) => v.status === "scheduled" && relativeDay(v.scheduled_at) === "Today").slice(0, 3).forEach((v) => {
            items.push({
                id: `visit-${v.id}`, kind: "info", category: "visit", title: `Visit today: ${titleCase(v.visit_type)} · ${v.location_name}`,
                body: `${v.staff_name} · scheduled ${relativeDay(v.scheduled_at)}`, time: v.scheduled_at,
                actionLabel: "Open", action: () => { openDetail("visit", v.id); setOpen(false); },
            });
        });
        return items.sort((a, b) => b.time.localeCompare(a.time) || a.id.localeCompare(b.id));
    }, [db, openDetail, setActiveModule]);
    const activeSnoozed = React.useMemo(() => {
        const now = Date.now();
        const active: Record<string, number> = {};
        Object.entries(snoozed).forEach(([id, wakeTs]) => {
            if (wakeTs > now)
                active[id] = wakeTs;
        });
        return active;
    }, [snoozed]);
    React.useEffect(() => {
        const now = Date.now();
        const wakeTimes = Object.values(snoozed).filter((wakeAt) => wakeAt > now);
        if (wakeTimes.length === 0) return;
        const nextWakeAt = Math.min(...wakeTimes);
        const timer = window.setTimeout(() => {
            const currentTime = Date.now();
            setSnoozed((current) => Object.fromEntries(
                Object.entries(current).filter(([, wakeAt]) => wakeAt > currentTime),
            ));
        }, Math.max(0, nextWakeAt - now) + 50);
        return () => window.clearTimeout(timer);
    }, [snoozed]);
    const visible = notifs.filter((n) => !dismissed.has(n.id) && !(n.id in activeSnoozed));
    const unread = visible.filter((n) => !n.read && !readItems.has(n.id));
    const alertCount = unread.filter((n) => n.kind === "alert").length;
    const snoozeNotification = (id: string, hours: number) => {
        const wakeTs = Date.now() + hours * 3600000;
        setSnoozed((prev) => ({ ...prev, [id]: wakeTs }));
        toast.success(`Snoozed for ${hours}h`);
    };
    const categoryCounts = React.useMemo(() => {
        const counts: Record<NotifCategory, number> = { overdue: 0, approval: 0, blocked: 0, risk: 0, visit: 0 };
        visible.forEach((n) => { if (!n.read && !readItems.has(n.id))
            counts[n.category]++; });
        return counts;
    }, [visible, readItems]);
    const filtered = filter === "all" ? visible : visible.filter((n) => n.category === filter);
    const markAllRead = () => {
        setReadItems((current) => new Set([...current, ...visible.map((notification) => notification.id)]));
        toast.success("All notifications marked as read");
    };
    const markCategoryRead = (cat: NotifCategory) => {
        const catIds = visible.filter((n) => n.category === cat).map((n) => n.id);
        if (catIds.length === 0)
            return;
        setReadItems((prev) => new Set([...prev, ...catIds]));
        const meta = CATEGORY_META[cat];
        toast.success(`${meta.label} marked as read`);
    };
    const dismissAll = () => {
        setDismissed((current) => new Set([...current, ...notifs.map((notification) => notification.id)]));
        toast.success("All notifications dismissed");
    };
    const notificationAriaLabel = notificationCoverageComplete
        ? `Notifications (${unread.length} unread)`
        : "Notifications (partial alert data; open to view loaded alerts)";
    return (<div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-all hover:bg-accent hover:text-foreground" aria-label={notificationAriaLabel}>
        <Bell className="h-4 w-4"/>
        {notificationCoverageComplete && unread.length > 0 ? (<span className={cn("absolute -right-1 -top-1 flex h-4 min-w-[16px] animate-pulse-ring items-center justify-center rounded-full px-1 text-[10px] font-bold text-white", alertCount > 0 ? "bg-destructive" : "bg-primary")}>
            {unread.length > 9 ? "9+" : unread.length}
          </span>) : !notificationCoverageComplete ? (<span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-muted-foreground/50" aria-hidden="true" title="Alert coverage is partial"/>) : null}
      </button>

      {open && (<>
          <div className="fixed inset-0 z-40" role="button" tabIndex={0} aria-label="Close notifications" onClick={() => setOpen(false)} onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") setOpen(false); }}/>  {/* STAGE-4-FIX: a11y */}
          <div className="absolute right-0 top-11 z-50 flex max-h-[32rem] w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-popover animate-scale-in">
            <div className="relative border-b border-border bg-gradient-to-r from-primary/[0.06] to-transparent">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-primary/30"/>
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary"/>
                  <h3 className="text-sm font-semibold">Notifications</h3>
                  {notificationCoverageComplete && unread.length > 0 && (<span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{unread.length} new</span>)}
                  {!notificationCoverageComplete && (<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Partial</span>)}
                </div>
                <div className="flex items-center gap-1">
                  {filter !== "all" && filterCoverageComplete && filtered.some((n) => !n.read && !readItems.has(n.id)) && (<button type="button" onClick={() => markCategoryRead(filter)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10" title={`Mark all ${CATEGORY_META[filter as NotifCategory].label} as read`}>
                      <CheckCheck className="h-3 w-3"/> Mark these read
                    </button>)}
                  {notificationCoverageComplete && unread.length > 0 && (<button type="button" onClick={markAllRead} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="Mark all as read">
                      <CheckCheck className="h-3 w-3"/> Mark all read
                    </button>)}
                  <button type="button" onClick={dismissAll} className="rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={notificationCoverageComplete ? "Dismiss all" : "Dismiss loaded alerts"}>
                    {notificationCoverageComplete ? "Clear" : "Clear loaded"}
                  </button>
                </div>
              </div>
            </div>
            {visible.length > 0 && (<div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/20 px-2 py-1.5 rd-scroll">
                <Filter className="h-3 w-3 shrink-0 text-muted-foreground"/>
                <button type="button" onClick={() => setFilter("all")} className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors", filter === "all" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent")}>
                  All {visible.length}
                </button>
                {(Object.keys(CATEGORY_META) as NotifCategory[]).map((cat) => {
                    const count = categoryCounts[cat];
                    if (count === 0 && filter !== cat)
                        return null;
                    const meta = CATEGORY_META[cat];
                    return (<button key={cat} type="button" onClick={() => setFilter(cat)} className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors", filter === cat ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotColor)}/>
                      {meta.label} {count}
                    </button>);
                })}
              </div>)}
            <div className="flex-1 overflow-y-auto rd-scroll">
              {filtered.length === 0 ? (<div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                  {filterCoverageComplete ? <CheckCircle2 className="h-8 w-8 text-success"/> : <Clock className="h-8 w-8 text-primary"/>}
                  <p className="text-xs">{visible.length === 0
                    ? filterCoverageComplete
                        ? "All caught up! No pending alerts."
                        : filter === "all"
                            ? "Notification data will fill in as relevant modules load."
                            : `${CATEGORY_META[filter].label} data has not loaded yet.`
                    : "No notifications in this category."}</p>
                </div>) : (filtered.map((n) => {
                const meta = CATEGORY_META[n.category];
                const isRead = n.read === true || readItems.has(n.id);
                const ItemIcon = meta.icon;
                return (<div key={n.id} className={cn("group flex items-start gap-2.5 border-b border-border px-3 py-2.5 last:border-0 transition-colors hover:bg-accent/30", !isRead && "bg-primary/[0.02]")}>
                      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", meta.color)}>
                        <ItemIcon className="h-3.5 w-3.5"/>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1.5">
                          <p className={cn("text-xs font-semibold", isRead ? "text-foreground/70" : "text-foreground")}>{n.title}</p>
                          {!isRead && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread"/>}
                        </div>
                        {n.body && <p className="mt-0.5 text-[11px] text-muted-foreground">{n.body}</p>}
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{relativeDay(n.time)}</span>
                          <span className={cn("rounded px-1 py-0.5 text-[8px] font-bold uppercase", meta.color)}>{meta.label}</span>
                          {n.action && (<button type="button" onClick={() => { setReadItems((r) => new Set([...r, n.id])); n.action!(); }} className="text-[10px] font-semibold text-primary hover:underline">
                              {n.actionLabel || "Open"} →
                            </button>)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="rounded p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100" aria-label="Snooze" title="Snooze notification">
                              <BellOff className="h-3 w-3"/>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Snooze for</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {([
                        { label: "1 hour", hours: 1 },
                        { label: "4 hours", hours: 4 },
                        { label: "Until tomorrow", hours: 24 },
                    ]).map((opt) => (<DropdownMenuItem key={opt.hours} onClick={() => snoozeNotification(n.id, opt.hours)} className="text-xs">
                                <Clock className="mr-2 h-3 w-3"/> {opt.label}
                              </DropdownMenuItem>))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button type="button" onClick={() => setDismissed((d) => new Set([...d, n.id]))} className="rounded p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100" aria-label="Dismiss">
                          <X className="h-3 w-3"/>
                        </button>
                      </div>
                    </div>);
            }))}
            </div>
            {visible.length > 0 && (<div className="border-t border-border bg-muted/20 px-3 py-1.5">
                <p className="text-center text-[10px] text-muted-foreground">
                  {notificationCoverageComplete
                    ? `${unread.length} unread · ${visible.length} total`
                    : `Showing ${visible.length} loaded alert${visible.length === 1 ? "" : "s"} · partial`}{Object.keys(activeSnoozed).length > 0 && ` · ${Object.keys(activeSnoozed).length} snoozed`}
                </p>
              </div>)}
          </div>
        </>)}
    </div>);
}
