"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { MODULE_GROUPS } from "@/lib/rdash/modules";
import { relativeTime } from "@/lib/rdash/format";
import {
    Search, CornerDownLeft, Zap, UserPlus, ListPlus, FilePlus2, MapPinPlus, PhoneCall,
    FileText, Building2, ShoppingCart, Package, Truck, HardHat, Briefcase, Wrench,
    MapPin, ClipboardList, MessagesSquare, FileCheck2, Users, DollarSign,
} from "lucide-react";
interface CommandItem {
    id: string;
    label: string;
    group: string;
    groupPriority: number;
    icon?: string;
    iconNode?: React.ReactNode;
    action: () => void;
    keywords?: string;
    hint?: string;
    meta?: string;
}
const GP = {
    recentCreated: 1,
    actions: 4,
    customers: 5,
    sites: 6,
    workOrders: 7,
    quotations: 8,
    vendors: 9,
    contractors: 10,
    staff: 11,
    invoices: 12,
    purchaseOrders: 13,
    grns: 14,
    threads: 15,
    tasks: 16,
    module: 99,
} as const;
export function CommandPalette() {
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const openDetail = useRDashStore((s) => s.openDetail);
    const db = useRDashStore((s) => s.db);
    const closeDetail = useRDashStore((s) => s.closeDetail);
    const recentCreated = useRDashStore((s) => s.recentCreated);
    const commandPaletteOpen = useRDashStore((s) => s.commandPaletteOpen);
    const setCommandPaletteOpen = useRDashStore((s) => s.setCommandPaletteOpen);
    const [q, setQ] = React.useState("");
    const [activeIdx, setActiveIdx] = React.useState(0);
    const listRef = React.useRef<HTMLDivElement>(null);
    const open = commandPaletteOpen;
    const setOpen = (v: boolean) => setCommandPaletteOpen(v);
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setCommandPaletteOpen(!commandPaletteOpen);
            }
            else if (e.key === "Escape" && commandPaletteOpen) {
                setCommandPaletteOpen(false);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [commandPaletteOpen, setCommandPaletteOpen]);
    React.useEffect(() => {
        if (open)
            return;
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) {
                setQ("");
                setActiveIdx(0);
            }
        });
        return () => { cancelled = true; };
    }, [open]);
    const commands: CommandItem[] = React.useMemo(() => {
        const items: CommandItem[] = [];
        const createdKindIcon: Record<string, React.ReactNode> = {
            customer: <UserPlus className="h-3.5 w-3.5 text-success"/>,
            task: <ListPlus className="h-3.5 w-3.5 text-primary"/>,
            quotation: <FilePlus2 className="h-3.5 w-3.5 text-warning"/>,
            visit: <MapPinPlus className="h-3.5 w-3.5 text-primary"/>,
            followup: <PhoneCall className="h-3.5 w-3.5 text-muted-foreground"/>,
        };
        const createdKindDetail: Record<string, "customer" | "task" | "quotation" | "visit" | "followup"> = {
            customer: "customer",
            task: "task",
            quotation: "quotation",
            visit: "visit",
            followup: "followup",
        };
        recentCreated.slice(0, 5).forEach((rc) => {
            items.push({
                id: `rcreated-${rc.kind}-${rc.id}`,
                label: rc.label,
                group: "Recently created",
                groupPriority: GP.recentCreated,
                iconNode: createdKindIcon[rc.kind] || <Zap className="h-3.5 w-3.5"/>,
                action: () => {
                    const detailKind = createdKindDetail[rc.kind];
                    if (detailKind) {
                        openDetail(detailKind, rc.id);
                        setOpen(false);
                    }
                },
                keywords: `created ${rc.kind} new`,
                meta: relativeTime(rc.ts),
            });
        });
        items.push({ id: "act-close-detail", label: "Close detail panel", group: "Actions", groupPriority: GP.actions, iconNode: <Zap className="h-3.5 w-3.5 opacity-60"/>, action: () => { closeDetail(); setOpen(false); } });
        MODULE_GROUPS.forEach((g) => {
            g.modules.forEach((m) => {
                items.push({ id: `mod-${m.id}`, label: m.label, group: "Modules", groupPriority: GP.module, icon: m.icon, action: () => { setActiveModule(m.id); setOpen(false); }, keywords: m.description });
                m.submodules.forEach((s) => {
                    items.push({ id: `sub-${s.id}`, label: s.label, group: m.label, groupPriority: GP.module, icon: m.icon, action: () => { setActiveModule(s.id); setOpen(false); } });
                });
            });
        });
        db.customers.slice(0, 8).forEach((p) => {
            items.push({ id: `cust-${p.id}`, label: p.name, group: "Customers", groupPriority: GP.customers, iconNode: <UserPlus className="h-3.5 w-3.5 text-success"/>, action: () => { openDetail("customer", p.id); setOpen(false); }, keywords: `${p.phone} ${(db.sites.filter((site) => site.customer_id === p.id).map((site) => [site.name, site.locality, site.city].filter(Boolean).join(" ")).join(" "))}` });
        });
        // G: Expanded search index — sites, quotations, vendors, contractors,
        // staff, invoices, POs, GRNs, threads, tasks. Each result deep-links
        // to its detail panel (or module if no detail exists).
        db.sites.slice(0, 12).forEach((s) => {
            const customer = db.customers.find((c) => c.id === s.customer_id);
            items.push({ id: `site-${s.id}`, label: s.name, group: "Sites", groupPriority: GP.sites, iconNode: <MapPin className="h-3.5 w-3.5 text-primary"/>, action: () => { openDetail("site", s.id); setOpen(false); }, keywords: `${s.address} ${s.locality} ${s.city} ${customer?.name || ""}`, meta: customer?.name });
        });
        db.quotations.slice(0, 10).forEach((q) => {
            const customer = db.customers.find((c) => c.id === q.customer_id);
            items.push({ id: `quo-${q.id}`, label: `${q.quotation_no} · ${q.subject || q.status}`, group: "Quotations", groupPriority: GP.quotations, iconNode: <FileText className="h-3.5 w-3.5 text-warning"/>, action: () => { openDetail("quotation", q.id); setOpen(false); }, keywords: `${customer?.name || ""} ${q.status}`, meta: customer?.name });
        });
        db.master.vendors.slice(0, 10).forEach((v) => {
            items.push({ id: `ven-${v.id}`, label: v.name, group: "Vendors", groupPriority: GP.vendors, iconNode: <Package className="h-3.5 w-3.5 text-primary"/>, action: () => { openDetail("vendor", v.id); setOpen(false); }, keywords: `${v.city || ""} ${v.category || ""} ${v.phone || ""}`, meta: v.city });
        });
        db.master.contractors.slice(0, 10).forEach((c) => {
            items.push({ id: `con-${c.id}`, label: c.name, group: "Contractors", groupPriority: GP.contractors, iconNode: <HardHat className="h-3.5 w-3.5 text-warning"/>, action: () => { openDetail("contractor", c.id); setOpen(false); }, keywords: `${c.trade || ""} ${c.city || ""} ${c.phone || ""}`, meta: c.trade });
        });
        db.master.staff.slice(0, 10).forEach((s) => {
            items.push({ id: `staff-${s.id}`, label: s.name, group: "Staff", groupPriority: GP.staff, iconNode: <Users className="h-3.5 w-3.5 text-primary"/>, action: () => { openDetail("staff", s.id); setOpen(false); }, keywords: `${s.role} ${s.phone || ""}`, meta: s.role });
        });
        db.invoices.slice(0, 10).forEach((i) => {
            const customer = db.customers.find((c) => c.id === i.customer_id);
            items.push({ id: `inv-${i.id}`, label: `${i.invoice_no} · ${i.status}`, group: "Invoices", groupPriority: GP.invoices, iconNode: <FileText className="h-3.5 w-3.5 text-success"/>, action: () => { openDetail("invoice", i.id); setOpen(false); }, keywords: `${customer?.name || ""}`, meta: customer?.name });
        });
        db.purchaseOrders.slice(0, 10).forEach((p) => {
            items.push({ id: `po-${p.id}`, label: `${p.po_no} · ${p.vendor_name}`, group: "Purchase Orders", groupPriority: GP.purchaseOrders, iconNode: <ShoppingCart className="h-3.5 w-3.5 text-primary"/>, action: () => { openDetail("po", p.id); setOpen(false); }, keywords: `${p.work_order_no || ""} ${p.status}`, meta: p.status });
        });
        db.grns.slice(0, 10).forEach((g) => {
            items.push({ id: `grn-${g.id}`, label: `${g.grn_no} · ${g.vendor_name}`, group: "GRNs", groupPriority: GP.grns, iconNode: <Package className="h-3.5 w-3.5 text-success"/>, action: () => { openDetail("grn", g.id); setOpen(false); }, keywords: `${g.po_no} ${g.status}`, meta: g.status });
        });
        db.threads.slice(0, 12).forEach((t) => {
            const last = t.messages[t.messages.length - 1];
            items.push({ id: `thr-${t.id}`, label: t.title, group: "Threads", groupPriority: GP.threads, iconNode: <MessagesSquare className="h-3.5 w-3.5 text-muted-foreground"/>, action: () => { setActiveModule("unifiedThreadInbox"); setOpen(false); }, keywords: `${t.kind} ${last?.body?.slice(0, 80) || ""}`, meta: t.kind });
        });
        db.tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").slice(0, 12).forEach((t) => {
            const customer = db.customers.find((c) => c.id === t.customer_id);
            items.push({ id: `task-${t.id}`, label: t.title, group: "Tasks", groupPriority: GP.tasks, iconNode: <ListPlus className="h-3.5 w-3.5 text-primary"/>, action: () => { openDetail("task", t.id); setOpen(false); }, keywords: `${customer?.name || ""} ${t.task_scope} ${t.status}`, meta: t.due_date });
        });
        db.workOrders.slice(0, 8).forEach((j) => {
            items.push({ id: `workOrder-${j.id}`, label: `${j.work_order_no} · ${j.title}`, group: "Work Orders", groupPriority: GP.workOrders, iconNode: <Building2 className="h-3.5 w-3.5 text-primary"/>, action: () => { openDetail("workOrder", j.id); setOpen(false); }, keywords: (j.customer_name || "Customer") });
        });
        return items;
    }, [setActiveModule, openDetail, closeDetail, db, recentCreated]);
    const filtered = React.useMemo(() => {
        if (!q.trim()) {
            return commands
                .filter((c) => c.groupPriority < GP.module)
                .sort((a, b) => a.groupPriority - b.groupPriority)
                .slice(0, 50);
        }
        const ql = q.toLowerCase();
        return commands
            .filter((c) => c.label.toLowerCase().includes(ql) || c.group.toLowerCase().includes(ql) || (c.keywords || "").toLowerCase().includes(ql))
            .sort((a, b) => a.groupPriority - b.groupPriority)
            .slice(0, 50);
    }, [commands, q]);
    const grouped = React.useMemo(() => {
        const map = new Map<string, CommandItem[]>();
        filtered.forEach((c) => {
            if (!map.has(c.group))
                map.set(c.group, []);
            map.get(c.group)!.push(c);
        });
        return Array.from(map.entries());
    }, [filtered]);
    const flatWithGroupHeaders = React.useMemo(() => {
        const arr: ({
            type: "header";
            label: string;
        } | {
            type: "item";
            item: CommandItem;
            flatIdx: number;
        })[] = [];
        let idx = 0;
        grouped.forEach(([label, items]) => {
            arr.push({ type: "header", label });
            items.forEach((item) => {
                arr.push({ type: "item", item, flatIdx: idx });
                idx++;
            });
        });
        return arr;
    }, [grouped]);
    const onInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
        }
        else if (e.key === "Enter") {
            e.preventDefault();
            filtered[activeIdx]?.action();
        }
    };
    React.useEffect(() => {
        if (!open || !listRef.current)
            return;
        const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement;
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIdx, open]);
    if (!open)
        return null;
    return (<div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-label="Command palette" onClick={() => setOpen(false)}>  {/* STAGE-4-FIX: a11y */}
      <div className="w-full max-w-xl overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-center gap-2.5 border-b border-border bg-gradient-to-r from-primary/[0.03] to-transparent px-4 py-3">
          <Search className="h-4 w-4 text-primary"/>
          <input autoFocus value={q} onChange={(e) => {
            setQ(e.target.value);
            setActiveIdx(0);
        }} onKeyDown={onInputKeyDown} placeholder="Search modules, customers, or workOrders..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"/>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto rd-scroll p-1.5">
          {filtered.length === 0 ? (<div className="flex flex-col items-center gap-2 py-10 text-center">
              <Search className="h-8 w-8 text-muted-foreground/40"/>
              <p className="text-xs text-muted-foreground">No results for "{q}"</p>
              <p className="text-[10px] text-muted-foreground/70">Try searching for a module, customer name, or workOrder number</p>
            </div>) : (flatWithGroupHeaders.map((entry, i) => {
            if (entry.type === "header") {
                return (<div key={`hdr-${entry.label}-${i}`} className="rd-module-enter sticky top-0 z-10 border-b border-border/50 bg-gradient-to-b from-card to-card/95 px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 backdrop-blur-sm">
                    {entry.label}
                  </div>);
            }
            const c = entry.item;
            const ai = entry.flatIdx;
            const active = ai === activeIdx;
            return (<button key={c.id} data-idx={ai} type="button" onMouseEnter={() => setActiveIdx(ai)} onClick={() => c.action()} className={cn("group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-all duration-100", active ? "bg-primary text-primary-foreground translate-x-0.5" : "hover:bg-accent")}>
                  {c.iconNode ? (<span className={cn("flex h-5 w-5 shrink-0 items-center justify-center", active ? "text-primary-foreground" : "text-muted-foreground")}>{c.iconNode}</span>) : c.icon ? (<span className="text-sm">{c.icon}</span>) : (<Zap className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary-foreground/70" : "opacity-60")}/>)}
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-xs font-medium", active ? "text-primary-foreground" : "text-foreground")}>{c.label}</p>
                  </div>
                  {c.hint && (<kbd className={cn("rounded border px-1 py-0.5 font-mono text-[10px] font-semibold", active ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground/80" : "border-border bg-muted text-muted-foreground")}>{c.hint}</kbd>)}
                  {c.meta && !c.hint && (<span className={cn("shrink-0 text-[10px] font-medium", active ? "text-primary-foreground/60" : "text-muted-foreground/70")}>{c.meta}</span>)}
                  {active && !c.hint && !c.meta && <CornerDownLeft className="h-3 w-3 shrink-0 text-primary-foreground/70"/>}
                </button>);
        }))}
        </div>
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-border bg-card px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-border bg-card px-1 py-0.5 font-mono">↵</kbd> select</span>
          </div>
          <span>{filtered.length} results</span>
        </div>
      </div>
    </div>);
}
