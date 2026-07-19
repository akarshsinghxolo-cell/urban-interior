"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { AuditLogEntry } from "@/lib/rdash/types";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { formatDateTime, relativeDay, titleCase } from "@/lib/rdash/format";
import { History, Search, FileText, Building2, Package, Truck, Wrench, DollarSign, CheckCircle2, AlertTriangle, Bell, Activity, Download, FileJson, BarChart3, X, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

const KIND_META: Record<AuditLogEntry["kind"], {
    label: string;
    color: string;
    icon: React.ReactNode;
}> = {
    create: { label: "Created", color: "bg-success/10 text-success border-success/20", icon: <CheckCircle2 className="h-3 w-3"/> },
    update: { label: "Updated", color: "bg-primary/10 text-primary border-primary/20", icon: <Activity className="h-3 w-3"/> },
    approve: { label: "Approved", color: "bg-success/10 text-success border-success/20", icon: <CheckCircle2 className="h-3 w-3"/> },
    send: { label: "Sent", color: "bg-primary/10 text-primary border-primary/20", icon: <FileText className="h-3 w-3"/> },
    receive: { label: "Received", color: "bg-primary/10 text-primary border-primary/20", icon: <Truck className="h-3 w-3"/> },
    comment: { label: "Comment", color: "bg-muted text-muted-foreground border-border", icon: <FileText className="h-3 w-3"/> },
    decision: { label: "Decision", color: "bg-warning/10 text-warning border-warning/20", icon: <CheckCircle2 className="h-3 w-3"/> },
    alert: { label: "Alert", color: "bg-destructive/10 text-destructive border-destructive/20", icon: <AlertTriangle className="h-3 w-3"/> },
    system: { label: "System", color: "bg-primary/15 text-primary border-primary/25", icon: <Activity className="h-3 w-3"/> },
    delete: { label: "Deleted", color: "bg-destructive/10 text-destructive border-destructive/20", icon: <AlertTriangle className="h-3 w-3"/> },
};
const ENTITY_ICONS: Record<string, React.ReactNode> = {
    quotation: <FileText className="h-3.5 w-3.5"/>,
    workOrder: <Building2 className="h-3.5 w-3.5"/>,
    boq: <FileText className="h-3.5 w-3.5"/>,
    po: <Package className="h-3.5 w-3.5"/>,
    grn: <Truck className="h-3.5 w-3.5"/>,
    dispatch: <Wrench className="h-3.5 w-3.5"/>,
    payment: <DollarSign className="h-3.5 w-3.5"/>,
    blocked: <AlertTriangle className="h-3.5 w-3.5"/>,
};

/** CSV-escape a single value (RFC 4180 minimal). */
function csvEscape(value: unknown): string {
    if (value === null || value === undefined) return "";
    const s = typeof value === "string" ? value : JSON.stringify(value);
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

/** Trigger a browser download of `content` as `filename` with `mime`. */
function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AuditLogModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [q, setQ] = React.useState("");
    const [kindFilter, setKindFilter] = React.useState<string>("all");
    const [entityTypeFilter, setEntityTypeFilter] = React.useState<string>("all");
    const [actorFilter, setActorFilter] = React.useState<string>("all");
    const [dateRange, setDateRange] = React.useState<{ from?: Date; to?: Date }>({});
    const [showStats, setShowStats] = React.useState(false);

    // Build filter option lists from the data.
    const entityTypes = React.useMemo(() => {
        const set = new Set<string>();
        db.auditLog.forEach((e) => set.add(e.entity_type));
        return Array.from(set).sort();
    }, [db.auditLog]);
    const actors = React.useMemo(() => {
        const set = new Set<string>();
        db.auditLog.forEach((e) => set.add(e.actor));
        return Array.from(set).sort();
    }, [db.auditLog]);

    const entries = React.useMemo(() => {
        let list = [...db.auditLog].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        if (kindFilter !== "all")
            list = list.filter((e) => e.kind === kindFilter);
        if (entityTypeFilter !== "all")
            list = list.filter((e) => e.entity_type === entityTypeFilter);
        if (actorFilter !== "all")
            list = list.filter((e) => e.actor === actorFilter);
        if (dateRange.from) {
            const fromStr = dateRange.from.toISOString().slice(0, 10);
            list = list.filter((e) => e.timestamp.slice(0, 10) >= fromStr);
        }
        if (dateRange.to) {
            const toStr = dateRange.to.toISOString().slice(0, 10);
            list = list.filter((e) => e.timestamp.slice(0, 10) <= toStr);
        }
        if (q.trim()) {
            const ql = q.toLowerCase();
            list = list.filter((e) => e.action.toLowerCase().includes(ql) || e.actor.toLowerCase().includes(ql) || (e.entity_label || "").toLowerCase().includes(ql));
        }
        return list;
    }, [db.auditLog, q, kindFilter, entityTypeFilter, actorFilter, dateRange]);

    const systemCount = db.auditLog.filter((e) => e.kind === "system").length;
    const alertCount = db.auditLog.filter((e) => e.kind === "alert").length;
    const todayCount = db.auditLog.filter((e) => relativeDay(e.timestamp) === "Today").length;
    const grouped = React.useMemo(() => {
        const m = new Map<string, AuditLogEntry[]>();
        entries.forEach((e) => {
            const day = relativeDay(e.timestamp);
            const arr = m.get(day) || [];
            arr.push(e);
            m.set(day, arr);
        });
        return Array.from(m.entries());
    }, [entries]);

    /** Real CSV export — generates a CSV from the filtered entries and triggers a download. */
    const exportCsv = () => {
        if (entries.length === 0) {
            toast.error("No entries to export");
            return;
        }
        const headers = ["timestamp", "actor", "role", "action", "entity_type", "entity_id", "entity_label", "kind", "source_module", "reason"];
        const rows = entries.map((e) => [
            e.timestamp,
            e.actor,
            e.actor_role || "",
            e.action,
            e.entity_type,
            e.entity_id || "",
            e.entity_label || "",
            e.kind,
            e.source_module || "",
            e.reason || "",
        ].map(csvEscape).join(","));
        const csv = [headers.join(","), ...rows].join("\n");
        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        downloadFile(csv, `audit-log-${ts}.csv`, "text/csv;charset=utf-8");
        toast.success(`Exported ${entries.length} entries to CSV`);
    };

    /** Real JSON export — same filters, JSON format with full fidelity (includes before/after/changes). */
    const exportJson = () => {
        if (entries.length === 0) {
            toast.error("No entries to export");
            return;
        }
        const payload = {
            exported_at: new Date().toISOString(),
            filter: { q, kind: kindFilter, entity_type: entityTypeFilter, actor: actorFilter, from: dateRange.from?.toISOString(), to: dateRange.to?.toISOString() },
            count: entries.length,
            entries,
        };
        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        downloadFile(JSON.stringify(payload, null, 2), `audit-log-${ts}.json`, "application/json");
        toast.success(`Exported ${entries.length} entries to JSON`);
    };

    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><History className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Audit Log</h2>
            <p className="text-xs text-muted-foreground">Every action, decision and system event — fully traceable, exportable, filterable</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowStats((v) => !v)}>
            <BarChart3 className="mr-1.5 h-3.5 w-3.5"/> {showStats ? "Hide stats" : "Stats"}
          </Button>
          <Button size="sm" variant="outline" onClick={exportJson}>
            <FileJson className="mr-1.5 h-3.5 w-3.5"/> Export JSON
          </Button>
          <Button size="sm" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5"/> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total events" value={db.auditLog.length} tone="primary" icon={<History className="h-4 w-4"/>}/>
        <MetricCard label="Today" value={todayCount} tone="success" icon={<Activity className="h-4 w-4"/>}/>
        <MetricCard label="System events" value={systemCount} tone="primary" icon={<Activity className="h-4 w-4"/>}/>
        <MetricCard label="Alerts" value={alertCount} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
      </div>

      {showStats && <AuditStats entries={db.auditLog} />}

      {/* Filters: search + kind + entity_type + actor + date range */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64 max-w-full">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, actors, entities…" className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2"/>
        </div>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-xs">
          <option value="all">All kinds</option>
          {Object.keys(KIND_META).map((k) => <option key={k} value={k}>{KIND_META[k as AuditLogEntry["kind"]].label}</option>)}
        </select>
        <select value={entityTypeFilter} onChange={(e) => setEntityTypeFilter(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-xs">
          <option value="all">All entity types</option>
          {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-xs">
          <option value="all">All actors</option>
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        {(kindFilter !== "all" || entityTypeFilter !== "all" || actorFilter !== "all" || dateRange.from || dateRange.to || q) && (
          <button type="button" onClick={() => { setKindFilter("all"); setEntityTypeFilter("all"); setActorFilter("all"); setDateRange({}); setQ(""); }} className="text-[11px] font-medium text-primary hover:underline">
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{entries.length} of {db.auditLog.length}</span>
      </div>

      {/* Quick kind chips (kept from previous version) */}
      <div className="flex flex-wrap items-center gap-1">
        {["all", "create", "approve", "system", "alert", "decision", "receive"].map((k) => (<button key={k} type="button" onClick={() => setKindFilter(k)} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", kindFilter === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
            {k === "all" ? "All" : titleCase(k)}
          </button>))}
      </div>

      <div className="space-y-4">
        {grouped.map(([day, dayEntries]) => (<div key={day}>
            <div className="sticky top-0 z-10 mb-2 bg-background/80 py-1 backdrop-blur-sm">
              <span className="text-xs font-semibold text-muted-foreground">{day} · {dayEntries.length} events</span>
            </div>
            <div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
              {dayEntries.map((e, i) => {
                const meta = KIND_META[e.kind];
                return (<button key={e.id} type="button" onClick={() => openDetail("audit" as any, e.id)} className={cn("flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-accent/30", i < dayEntries.length - 1 && "border-b border-border")}>
                    <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", meta.color)}>{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-foreground">{e.action}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(e.timestamp)}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        {e.actor !== "System" && <Avatar name={e.actor} size={16}/>}
                        <span className="font-medium">{e.actor}</span>
                        {e.actor_role && <span>· {e.actor_role}</span>}
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">{ENTITY_ICONS[e.entity_type] || <FileText className="h-3 w-3"/>}{e.entity_label || titleCase(e.entity_type)}</span>
                      </div>
                    </div>
                    <StatusBadge label={meta.label} className={meta.color}/>
                  </button>);
            })}
            </div>
          </div>))}
      </div>

      {entries.length === 0 && (<EmptyState title="No events found" description="Try a different search or filter." icon={<History className="h-8 w-8"/>}/>)}
    </div>);
}

/**
 * DateRangePicker — a popover-wrapped calendar that lets the user pick a
 * "from" and "to" date for filtering. Uses shadcn Popover + Calendar.
 */
function DateRangePicker({ value, onChange }: {
    value: { from?: Date; to?: Date };
    onChange: (v: { from?: Date; to?: Date }) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const label = value.from || value.to
        ? `${value.from ? value.from.toLocaleDateString("en-IN") : "…"} → ${value.to ? value.to.toLocaleDateString("en-IN") : "…"}`
        : "Date range";
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <Bell className="h-3.5 w-3.5"/> {label}
                    {(value.from || value.to) && <X className="h-3 w-3 ml-1 hover:text-destructive" onClick={(e) => { e.stopPropagation(); onChange({}); }} />}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <div className="border-b border-border p-2 text-[10px] font-semibold uppercase text-muted-foreground">
                    {value.to ? "Pick from date" : "Pick to date"}
                </div>
                <Calendar
                    mode="single"
                    selected={value.to || value.from}
                    onSelect={(d) => {
                        if (!d) return;
                        if (!value.from) onChange({ from: d });
                        else if (!value.to && d >= value.from) onChange({ ...value, to: d });
                        else onChange({ from: d });
                    }}
                    className="rounded-md border-0"
                />
                <div className="flex items-center justify-between border-t border-border p-2 text-[10px]">
                    <span className="text-muted-foreground">{value.from ? `From ${value.from.toLocaleDateString("en-IN")}` : "—"} {value.to ? `to ${value.to.toLocaleDateString("en-IN")}` : "—"}</span>
                    <button type="button" onClick={() => { onChange({}); setOpen(false); }} className="text-primary hover:underline">Clear</button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

/**
 * AuditStats — a small analytics panel with three charts:
 *  - Top actors (horizontal bar)
 *  - Top entity types (horizontal bar)
 *  - Events per day (last 14 days, vertical bar)
 */
function AuditStats({ entries }: { entries: AuditLogEntry[] }) {
    const topActors = React.useMemo(() => {
        const m = new Map<string, number>();
        entries.forEach((e) => m.set(e.actor, (m.get(e.actor) || 0) + 1));
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    }, [entries]);
    const topEntityTypes = React.useMemo(() => {
        const m = new Map<string, number>();
        entries.forEach((e) => m.set(e.entity_type, (m.get(e.entity_type) || 0) + 1));
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    }, [entries]);
    const eventsPerDay = React.useMemo(() => {
        const days: { day: string; label: string; count: number }[] = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const ds = d.toISOString().slice(0, 10);
            const count = entries.filter((e) => e.timestamp.slice(0, 10) === ds).length;
            days.push({ day: ds, label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), count });
        }
        return days;
    }, [entries]);

    return (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* Top actors */}
            <div className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Top actors</h3>
                {topActors.length === 0 ? <p className="mt-2 text-[11px] text-muted-foreground">No data</p> : (
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={topActors.map(([name, count]) => ({ name, count }))} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.3 }} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 11 }} />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18} fill="var(--primary)" />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
            {/* Top entity types */}
            <div className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Top entity types</h3>
                {topEntityTypes.length === 0 ? <p className="mt-2 text-[11px] text-muted-foreground">No data</p> : (
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={topEntityTypes.map(([name, count]) => ({ name, count }))} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.3 }} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 11 }} />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18} fill="var(--success)" />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
            {/* Events per day (last 14 days) */}
            <div className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Events per day (14d)</h3>
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={eventsPerDay} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval={1} />
                        <YAxis hide domain={[0, "auto"]} />
                        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.3 }} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 11 }} />
                        <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={18}>
                            {eventsPerDay.map((entry, idx) => (
                                <Cell key={idx} fill={idx === eventsPerDay.length - 1 ? "var(--primary)" : "var(--warning)"} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </section>
    );
}
