"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { RDashDatabase } from "@/lib/rdash/types";
import { MetricCard, Avatar, StatusBadge, EmptyState } from "../primitives";
import { formatINR, formatDate, indiaBusinessDate, relativeDay, titleCase } from "@/lib/rdash/format";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, MapPin, CheckCircle2, DollarSign, ClipboardList, Truck, Plus, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
type EventType = "visit" | "task" | "payment" | "delivery";
interface CalEvent {
    id: string;
    type: EventType;
    title: string;
    subtitle?: string;
    date: string;
    time?: string;
    status?: string;
    statusClass?: string;
    amount?: number;
    detailKind: any;
    recordId: string;
}
function ymd(d: Date) {
    return d.toISOString().slice(0, 10);
}
function collectEvents(db: RDashDatabase): CalEvent[] {
    const events: CalEvent[] = [];
    db.visits.forEach((v) => {
        events.push({
            id: v.id, type: "visit", title: `${titleCase(v.visit_type)} · ${v.location_name}`, subtitle: v.staff_name,
            date: indiaBusinessDate(new Date(v.scheduled_at)), time: new Date(v.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            status: titleCase(v.status), statusClass: v.status === "completed" ? "bg-success/10 text-success border-success/20" : v.status === "missed" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-primary/10 text-primary border-primary/20",
            detailKind: "visit", recordId: v.id,
        });
    });
    db.tasks.forEach((t) => {
        events.push({
            id: t.id, type: "task", title: t.title, subtitle: t.assignee_name, date: t.due_date,
            status: titleCase(t.status), statusClass: t.status === "completed" ? "bg-success/10 text-success border-success/20" : t.status === "blocked" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-warning/10 text-warning border-warning/20",
            detailKind: "task", recordId: t.id,
        });
    });
    db.payments.forEach((p) => {
        events.push({
            id: p.id, type: "payment", title: `${(p.customer_name || "Customer")} · ${p.milestone_label || "Payment"}`, subtitle: p.mode,
            date: p.due_date, amount: p.amount, status: titleCase(p.status),
            statusClass: p.status === "received" ? "bg-success/10 text-success border-success/20" : p.status === "overdue" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-warning/10 text-warning border-warning/20",
            detailKind: "payment", recordId: p.id,
        });
    });
    db.purchaseOrders.forEach((po) => {
        events.push({
            id: po.id, type: "delivery", title: `${po.po_no} · ${po.vendor_name}`, subtitle: po.work_order_no,
            date: po.expected_delivery.slice(0, 10), status: titleCase(po.status),
            statusClass: po.status === "received" ? "bg-success/10 text-success border-success/20" : "bg-primary/10 text-primary border-primary/20",
            detailKind: "po", recordId: po.id,
        });
    });
    return events;
}
const TYPE_META: Record<EventType, {
    label: string;
    icon: React.ReactNode;
    dot: string;
    chip: string;
}> = {
    visit: { label: "Visit", icon: <MapPin className="h-3 w-3"/>, dot: "bg-primary", chip: "bg-primary/10 text-primary border-primary/20" },
    task: { label: "Task", icon: <ClipboardList className="h-3 w-3"/>, dot: "bg-warning", chip: "bg-warning/10 text-warning border-warning/20" },
    payment: { label: "Payment", icon: <DollarSign className="h-3 w-3"/>, dot: "bg-success", chip: "bg-success/10 text-success border-success/20" },
    delivery: { label: "Delivery", icon: <Truck className="h-3 w-3"/>, dot: "bg-chart-2", chip: "bg-chart-2/10 text-chart-2 border-chart-2/20" },
};
export function CalendarModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const allEvents = React.useMemo(() => collectEvents(db), [db]);
    const [cursor, setCursor] = React.useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
    const [selectedDate, setSelectedDate] = React.useState(ymd(new Date()));
    const [filter, setFilter] = React.useState<Set<EventType>>(new Set(["visit", "task", "payment", "delivery"]));
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const monthName = cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const eventsByDate = React.useMemo(() => {
        const m = new Map<string, CalEvent[]>();
        allEvents.forEach((e) => { if (!filter.has(e.type))
            return; const arr = m.get(e.date) || []; arr.push(e); m.set(e.date, arr); });
        return m;
    }, [allEvents, filter]);
    const selectedEvents = eventsByDate.get(selectedDate) || [];
    const today = ymd(new Date());
    const upcoming = React.useMemo(() => {
        const out: CalEvent[] = [];
        for (let i = 0; i < 14; i++) {
            const d = new Date();
            d.setDate(d.getDate() + i);
            const key = ymd(d);
            (eventsByDate.get(key) || []).forEach((e) => out.push(e));
        }
        return out.sort((a, b) => a.date.localeCompare(b.date));
    }, [eventsByDate]);
    const monthStats = React.useMemo(() => {
        const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
        const monthEvents = allEvents.filter((e) => e.date.startsWith(monthPrefix));
        return {
            total: monthEvents.length,
            visits: monthEvents.filter((e) => e.type === "visit").length,
            tasks: monthEvents.filter((e) => e.type === "task").length,
            payments: monthEvents.filter((e) => e.type === "payment").length,
            paymentValue: monthEvents.filter((e) => e.type === "payment").reduce((n, e) => n + (e.amount || 0), 0),
        };
    }, [allEvents, year, month]);
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++)
        cells.push(null);
    for (let d = 1; d <= daysInMonth; d++)
        cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0)
        cells.push(null);
    const toggleFilter = (t: EventType) => setFilter((s) => { const n = new Set(s); if (n.has(t)) {
        n.delete(t);
    }
    else {
        n.add(t);
    } return n; });
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarIcon className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Calendar</h2>
            <p className="text-xs text-muted-foreground">Visits, tasks, payments and deliveries in one view</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft className="h-4 w-4"/></Button>
          <span className="min-w-[140px] text-center text-sm font-semibold">{monthName}</span>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight className="h-4 w-4"/></Button>
          <Button size="sm" variant="ghost" onClick={() => { setCursor(new Date()); setSelectedDate(ymd(new Date())); }}>Today</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="This month" value={monthStats.total} tone="primary" icon={<CalendarIcon className="h-4 w-4"/>}/>
        <MetricCard label="Visits" value={monthStats.visits} tone="default" icon={<MapPin className="h-4 w-4"/>}/>
        <MetricCard label="Tasks due" value={monthStats.tasks} tone="warning" icon={<ClipboardList className="h-4 w-4"/>}/>
        <MetricCard label="Payment value" value={formatINR(monthStats.paymentValue)} tone="success" icon={<DollarSign className="h-4 w-4"/>}/>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-muted-foreground">Show:</span>
        {(Object.keys(TYPE_META) as EventType[]).map((t) => {
            const m = TYPE_META[t];
            const active = filter.has(t);
            return (<button key={t} type="button" onClick={() => toggleFilter(t)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", active ? cn(m.chip, "border") : "border-border bg-card text-muted-foreground hover:bg-accent/50")}>
              {m.icon} {m.label}
            </button>);
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
            if (!d)
                return <div key={i} className="aspect-square rounded-md bg-muted/20"/>;
            const key = ymd(d);
            const dayEvents = eventsByDate.get(key) || [];
            const isToday = key === today;
            const isSelected = key === selectedDate;
            return (<button key={i} type="button" onClick={() => setSelectedDate(key)} className={cn("relative flex aspect-square flex-col items-start gap-0.5 rounded-md border p-1 text-left transition-all hover:border-primary/40 hover:shadow-sm", isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-background", isToday && !isSelected && "border-primary/40 bg-primary/[0.03]")}>
                  <span className={cn("text-xs font-semibold", isToday ? "text-primary" : "text-foreground")}>{d.getDate()}</span>
                  <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                    {dayEvents.slice(0, 3).map((e) => {
                    const m = TYPE_META[e.type];
                    return <div key={e.id} className={cn("h-1.5 w-full rounded-full", m.dot)} title={e.title}/>;
                })}
                    {dayEvents.length > 3 && <span className="text-[8px] text-muted-foreground">+{dayEvents.length - 3}</span>}
                  </div>
                </button>);
        })}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{selectedDate === today ? "Today" : formatDate(selectedDate)}</h3>
              <span className="text-[11px] text-muted-foreground">{selectedEvents.length} events</span>
            </div>
            {selectedEvents.length === 0 ? (<p className="py-4 text-center text-xs text-muted-foreground">No events on this day.</p>) : (<div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto rd-scroll">
                {selectedEvents.map((e) => <EventRow key={`${e.type}-${e.id}`} event={e} onClick={() => openDetail(e.detailKind, e.recordId)}/>)}
              </div>)}
          </div>
          <div className="rounded-[var(--panel-radius)] border border-border bg-card p-3 shadow-card">
            <h3 className="mb-2 text-sm font-semibold">Next 14 days</h3>
            {upcoming.length === 0 ? (<p className="py-2 text-center text-xs text-muted-foreground">Nothing scheduled.</p>) : (<div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto rd-scroll">
                {upcoming.slice(0, 12).map((e) => <EventRow key={`up-${e.type}-${e.id}`} event={e} compact onClick={() => openDetail(e.detailKind, e.recordId)}/>)}
              </div>)}
          </div>
        </div>
      </div>
    </div>);
}
function EventRow({ event, compact, onClick }: {
    event: CalEvent;
    compact?: boolean;
    onClick?: () => void;
}) {
    const m = TYPE_META[event.type];
    return (<button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-start gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-left transition-colors hover:border-primary/30 hover:bg-accent/40 disabled:cursor-default">
      <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", m.chip, "border")}>{m.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{event.title}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          {event.time && <span>{event.time}</span>}
          {!compact && event.subtitle && <span className="truncate">{event.subtitle}</span>}
          {compact && <span>{relativeDay(event.date)}</span>}
          {event.amount != null && <span className="font-semibold text-foreground/80">{formatINR(event.amount)}</span>}
        </div>
      </div>
      {event.status && !compact && <StatusBadge label={event.status} className={event.statusClass || "bg-muted text-muted-foreground border-border"}/>}
    </button>);
}
