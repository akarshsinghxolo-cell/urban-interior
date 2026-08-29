"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { MODULE_GROUPS } from "@/lib/rdash/modules";
import { commandMatchScore, compareCommandMatches } from "@/lib/rdash/command-palette-score";
import { relativeTime } from "@/lib/rdash/format";
import {
    Search, CornerDownLeft, Zap, UserPlus, ListPlus, FilePlus2, MapPinPlus, PhoneCall,
    FileText, Building2, ShoppingCart, Package, HardHat,
    MapPin, MessagesSquare, Users, X,
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
const COMMAND_HISTORY_KEY = "uc_cmd_history_v2";
const MAX_COMMAND_HISTORY = 10;

function readCommandHistory(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(COMMAND_HISTORY_KEY) ?? window.localStorage.getItem("uc_cmd_history") ?? "[]";
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length >= 2).slice(0, MAX_COMMAND_HISTORY)
            : [];
    } catch {
        return [];
    }
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
    const [history, setHistory] = React.useState<string[]>(readCommandHistory);
    const [activeIdx, setActiveIdx] = React.useState(0);
    const listRef = React.useRef<HTMLDivElement>(null);
    const dialogRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);
    const open = commandPaletteOpen;
    const setOpen = React.useCallback((value: boolean) => setCommandPaletteOpen(value), [setCommandPaletteOpen]);
    const addToHistory = React.useCallback((term: string) => {
        const normalized = term.trim().replace(/\s+/g, " ");
        if (normalized.length < 2) return;
        setHistory((previous) => {
            const next = [
                normalized,
                ...previous.filter((entry) => entry.toLocaleLowerCase() !== normalized.toLocaleLowerCase()),
            ].slice(0, MAX_COMMAND_HISTORY);
            try { window.localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(next)); } catch { /* non-fatal */ }
            return next;
        });
    }, []);
    React.useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key === COMMAND_HISTORY_KEY) setHistory(readCommandHistory());
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);
    React.useEffect(() => {
        if (open) {
            previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            window.requestAnimationFrame(() => inputRef.current?.focus());
            return;
        }
        previouslyFocusedRef.current?.focus();
        previouslyFocusedRef.current = null;
    }, [open]);
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
        const customerById = new Map<string, (typeof db.customers)[number]>(
            db.customers.map((customer) => [customer.id, customer]),
        );
        const sitesByCustomer = new Map<string, string[]>();
        for (const site of db.sites) {
            const keywords = [site.name, site.locality, site.city].filter(Boolean).join(" ");
            const current = sitesByCustomer.get(site.customer_id) || [];
            current.push(keywords);
            sitesByCustomer.set(site.customer_id, current);
        }
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
        db.customers.forEach((p) => {
            items.push({ id: `cust-${p.id}`, label: p.name, group: "Customers", groupPriority: GP.customers, iconNode: <UserPlus className="h-3.5 w-3.5 text-success"/>, action: () => { openDetail("customer", p.id); setOpen(false); }, keywords: `${p.phone} ${(sitesByCustomer.get(p.id) || []).join(" ")}` });
        });
        // G: Expanded search index — sites, quotations, vendors, contractors,
        // staff, invoices, POs, GRNs, threads, tasks. Each result deep-links
        // to its detail panel (or module if no detail exists).
        db.sites.forEach((s) => {
            const customer = customerById.get(s.customer_id);
            items.push({ id: `site-${s.id}`, label: s.name, group: "Sites", groupPriority: GP.sites, iconNode: <MapPin className="h-3.5 w-3.5 text-primary"/>, action: () => { openDetail("site", s.id); setOpen(false); }, keywords: `${s.address} ${s.locality} ${s.city} ${customer?.name || ""}`, meta: customer?.name });
        });
        db.quotations.forEach((q) => {
            const customer = customerById.get(q.customer_id);
            items.push({ id: `quo-${q.id}`, label: `${q.quotation_no} · ${q.title || q.status}`, group: "Quotations", groupPriority: GP.quotations, iconNode: <FileText className="h-3.5 w-3.5 text-warning"/>, action: () => { openDetail("quotation", q.id); setOpen(false); }, keywords: `${customer?.name || ""} ${q.status}`, meta: customer?.name });
        });
        db.master.vendors.forEach((v) => {
            items.push({ id: `ven-${v.id}`, label: v.name, group: "Vendors", groupPriority: GP.vendors, iconNode: <Package className="h-3.5 w-3.5 text-primary"/>, action: () => { openDetail("vendor", v.id); setOpen(false); }, keywords: `${v.city || ""} ${v.category || ""} ${v.phone || ""}`, meta: v.city });
        });
        db.master.contractors.forEach((c) => {
            items.push({ id: `con-${c.id}`, label: c.name, group: "Contractors", groupPriority: GP.contractors, iconNode: <HardHat className="h-3.5 w-3.5 text-warning"/>, action: () => { openDetail("contractor", c.id); setOpen(false); }, keywords: `${c.trade || ""} ${c.city || ""} ${c.phone || ""}`, meta: c.trade });
        });
        db.master.staff.forEach((s) => {
            items.push({ id: `staff-${s.id}`, label: s.name, group: "Staff", groupPriority: GP.staff, iconNode: <Users className="h-3.5 w-3.5 text-primary"/>, action: () => { openDetail("staff", s.id); setOpen(false); }, keywords: `${s.role} ${s.phone || ""}`, meta: s.role });
        });
        db.invoices.forEach((i) => {
            const customer = customerById.get(i.customer_id);
            items.push({ id: `inv-${i.id}`, label: `${i.invoice_no} · ${i.status}`, group: "Invoices", groupPriority: GP.invoices, iconNode: <FileText className="h-3.5 w-3.5 text-success"/>, action: () => { openDetail("invoice", i.id); setOpen(false); }, keywords: `${customer?.name || ""}`, meta: customer?.name });
        });
        db.purchaseOrders.forEach((p) => {
            items.push({ id: `po-${p.id}`, label: `${p.po_no} · ${p.vendor_name}`, group: "Purchase Orders", groupPriority: GP.purchaseOrders, iconNode: <ShoppingCart className="h-3.5 w-3.5 text-primary"/>, action: () => { openDetail("po", p.id); setOpen(false); }, keywords: `${p.work_order_no || ""} ${p.status}`, meta: p.status });
        });
        db.grns.forEach((g) => {
            items.push({ id: `grn-${g.id}`, label: `${g.grn_no} · ${g.vendor_name}`, group: "GRNs", groupPriority: GP.grns, iconNode: <Package className="h-3.5 w-3.5 text-success"/>, action: () => { openDetail("grn", g.id); setOpen(false); }, keywords: `${g.po_no} ${g.status}`, meta: g.status });
        });
        db.threads.forEach((t) => {
            const last = t.messages[t.messages.length - 1];
            items.push({ id: `thr-${t.id}`, label: t.title, group: "Threads", groupPriority: GP.threads, iconNode: <MessagesSquare className="h-3.5 w-3.5 text-muted-foreground"/>, action: () => {
                try { localStorage.setItem("uc-open-thread-id", t.id); } catch { /* non-fatal */ }
                setActiveModule("unifiedThreadInbox");
                window.dispatchEvent(new CustomEvent("uc:open-thread", { detail: { threadId: t.id } }));
                setOpen(false);
            }, keywords: `${t.kind} ${last?.body?.slice(0, 80) || ""}`, meta: t.kind });
        });
        db.tasks.forEach((t) => {
            const customer = t.customer_id ? customerById.get(t.customer_id) : undefined;
            items.push({ id: `task-${t.id}`, label: t.title, group: "Tasks", groupPriority: GP.tasks, iconNode: <ListPlus className="h-3.5 w-3.5 text-primary"/>, action: () => { openDetail("task", t.id); setOpen(false); }, keywords: `${customer?.name || ""} ${t.task_scope} ${t.status}`, meta: t.due_date });
        });
        db.workOrders.forEach((j) => {
            items.push({ id: `workOrder-${j.id}`, label: `${j.work_order_no} · ${j.title}`, group: "Work Orders", groupPriority: GP.workOrders, iconNode: <Building2 className="h-3.5 w-3.5 text-primary"/>, action: () => { openDetail("workOrder", j.id); setOpen(false); }, keywords: (j.customer_name || "Customer") });
        });
        return items;
    }, [setActiveModule, openDetail, closeDetail, db, recentCreated, setOpen]);
    const filtered = React.useMemo(() => {
        if (!q.trim()) {
            return commands
                .filter((c) => c.groupPriority < GP.module)
                .sort((a, b) => a.groupPriority - b.groupPriority || a.label.localeCompare(b.label))
                .slice(0, 50);
        }
        // Score matches by text quality (exact label > prefix > substring >
        // group > keywords) before falling back to group ordering, so typing
        // "Finance" selects the Finance module — not the first submodule whose
        // nav group happens to be named "Finance".
        return commands
            .map((c) => ({ item: c, matchScore: commandMatchScore(c, q) }))
            .filter((entry) => entry.matchScore >= 0)
            .sort((a, b) => compareCommandMatches(
                { matchScore: a.matchScore, groupPriority: a.item.groupPriority, label: a.item.label },
                { matchScore: b.matchScore, groupPriority: b.item.groupPriority, label: b.item.label },
            ))
            .map((entry) => entry.item)
            .slice(0, 100);
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
    const showingHistory = !q.trim() && history.length > 0;
    const executeCommand = React.useCallback((item: CommandItem | undefined) => {
        if (!item) return;
        addToHistory(q);
        item.action();
    }, [addToHistory, q]);
    const displayedOptionCount = showingHistory ? history.length : filtered.length;
    React.useEffect(() => {
        if (displayedOptionCount === 0) setActiveIdx(0);
        else setActiveIdx((index) => Math.min(index, displayedOptionCount - 1));
    }, [displayedOptionCount]);
    const onInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, Math.max(0, displayedOptionCount - 1)));
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
        }
        else if (e.key === "Home") {
            e.preventDefault();
            setActiveIdx(0);
        }
        else if (e.key === "End") {
            e.preventDefault();
            setActiveIdx(Math.max(0, displayedOptionCount - 1));
        }
        else if (e.key === "Enter") {
            e.preventDefault();
            if (showingHistory) {
                const term = history[activeIdx];
                if (term) {
                    setQ(term);
                    setActiveIdx(0);
                }
                return;
            }
            executeCommand(filtered[activeIdx]);
        }
    };
    React.useEffect(() => {
        if (!open || !listRef.current)
            return;
        const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement;
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIdx, open]);
    const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            return;
        }
        if (event.key !== "Tab" || !dialogRef.current) return;
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        )).filter((element) => !element.hasAttribute("hidden"));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };
    if (!open)
        return null;
    return (<div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm animate-fade-in" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="command-palette-title" aria-describedby="command-palette-description" onKeyDown={onDialogKeyDown} className="w-full max-w-xl overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-2xl animate-scale-in">
        <h2 id="command-palette-title" className="sr-only">Command palette</h2>
        <p id="command-palette-description" className="sr-only">Search every workspace record and module. Use the arrow keys to navigate results and Enter to open the selected result.</p>
        <div className="relative flex items-center gap-2.5 border-b border-border bg-gradient-to-r from-primary/[0.03] to-transparent px-4 py-3">
          <Search className="h-4 w-4 text-primary" aria-hidden="true"/>
          <input ref={inputRef} role="combobox" aria-haspopup="listbox" aria-autocomplete="list" aria-expanded="true" aria-controls="command-palette-results" aria-activedescendant={showingHistory && history[activeIdx] ? `command-history-option-${activeIdx}` : filtered[activeIdx] ? `command-option-${filtered[activeIdx].id}` : undefined} aria-label="Search the workspace" value={q} onChange={(e) => {
            setQ(e.target.value);
            setActiveIdx(0);
        }} onKeyDown={onInputKeyDown} placeholder="Search modules, customers, work orders, quotations, and more…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"/>
          <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close command palette"><X className="h-4 w-4"/></button>
        </div>
        <div id="command-palette-results" ref={listRef} role="listbox" aria-label="Search results" className="max-h-[50vh] overflow-y-auto rd-scroll p-1.5">
          {showingHistory ? (
              <div className="px-2.5 py-2">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Recent searches</p>
                <div className="flex flex-wrap gap-1.5">
                  {history.map((term, i) => {
                    const active = i === activeIdx;
                    return (
                      <button key={term.toLocaleLowerCase()} id={`command-history-option-${i}`} role="option" aria-selected={active} data-idx={i} tabIndex={-1} type="button" onMouseEnter={() => setActiveIdx(i)} onClick={() => { setQ(term); setActiveIdx(0); }} className={cn("rounded-md border px-2 py-1 text-[11px] transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground")}>
                        {term}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : filtered.length === 0 ? (<div className="flex flex-col items-center gap-2 py-10 text-center">
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
            return (<button key={c.id} id={`command-option-${c.id}`} role="option" aria-selected={active} data-idx={ai} tabIndex={-1} type="button" onMouseEnter={() => setActiveIdx(ai)} onClick={() => executeCommand(c)} className={cn("group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-all duration-100", active ? "bg-primary text-primary-foreground translate-x-0.5" : "hover:bg-accent")}>
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
          <span aria-live="polite">{showingHistory ? `${history.length} recent searches` : `${filtered.length} results`}</span>
        </div>
      </div>
    </div>);
}
