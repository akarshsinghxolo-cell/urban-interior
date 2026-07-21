"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, X } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { ALL_MODULES, type ModuleDef, type Submodule } from "@/lib/rdash/modules";
import { canRole, permissionModuleForRoute, type StaffPermissionRecord } from "@/lib/rdash/staff-operations";

function moduleMatches(module: ModuleDef, query: string) {
    if (!query) return true;
    const q = query.toLowerCase();
    return (module.label.toLowerCase().includes(q) ||
        module.description.toLowerCase().includes(q) ||
        module.submodules.some((sm) => sm.label.toLowerCase().includes(q)));
}
function visibleSubmodules(module: ModuleDef, query: string) {
    if (!query) return module.submodules;
    const q = query.toLowerCase();
    const moduleHit = module.label.toLowerCase().includes(q) ||
        module.description.toLowerCase().includes(q);
    return moduleHit ? module.submodules : module.submodules.filter((sm) => sm.label.toLowerCase().includes(q));
}

function ModuleItem({ module, collapsed }: { module: ModuleDef; collapsed?: boolean }) {
    const activeModuleId = useRDashStore((s) => s.activeModuleId);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const moduleSearch = useRDashStore((s) => s.moduleSearch);
    const hasActiveSubmodule = module.submodules.some((sm) => sm.id === activeModuleId);
    const active = activeModuleId === module.id;
    const [expanded, setExpanded] = React.useState(() => active || hasActiveSubmodule || module.id === "workdesk");
    const [hovered, setHovered] = React.useState(false);
    const submodules = visibleSubmodules(module, moduleSearch.trim());
    React.useEffect(() => {
        if (moduleSearch.trim() || active || hasActiveSubmodule) setExpanded(true);
    }, [moduleSearch, active, hasActiveSubmodule]);

    // Collapsed mode: icon-only button with hover tooltip
    if (collapsed) {
        return (
            <CollapsedModuleItem
                module={module}
                active={active}
                activeModuleId={activeModuleId}
                setActiveModule={setActiveModule}
            />
        );
    }

    // Expanded mode: full sidebar with labels
    return (<div className="flex flex-col">
      <button type="button" onClick={() => setActiveModule(module.id)} className={cn("group relative flex min-h-[44px] items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-all duration-150", active
            ? "bg-primary text-primary-foreground shadow-sm before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-l-full before:bg-primary-foreground before:content-[''] before:shadow-[0_0_8px_rgba(var(--primary-rgb,10_37_92),0.4)]"
            : "hover:bg-accent hover:text-accent-foreground hover:translate-x-0.5")}>
        <span className="text-base leading-none" aria-hidden="true">{module.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium leading-tight">{module.label}</span>
          {module.description && (<span className={cn("mt-0.5 block text-[10px] leading-snug line-clamp-2", active ? "text-primary-foreground/70" : "text-muted-foreground/80")} title={module.description}>
              {module.description}
            </span>)}
        </span>
        {module.submodules.length > 0 && (<ChevronDown className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform", !expanded && "-rotate-90")} onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
            }} role="button" aria-label="Toggle submodules"/>)}
      </button>

      {expanded && submodules.length > 0 && (<div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
          {submodules.map((sm) => {
                const subActive = activeModuleId === sm.id;
                return (<button key={sm.id} type="button" onClick={() => setActiveModule(sm.id)} className={cn("rd-nav-active min-h-[40px] rounded-md px-2 py-2 text-left text-xs transition-all", subActive
                        ? "bg-accent font-semibold text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:translate-x-0.5")}>
                <span className="truncate">{sm.label}</span>
              </button>);
            })}
        </div>)}
    </div>);
}

/**
 * Collapsed sidebar module item — icon-only button with hover tooltip.
 * Uses a delayed-close pattern so the mouse can travel the gap between
 * the icon button and the floating tooltip without the tooltip disappearing.
 */
function CollapsedModuleItem({ module, active, activeModuleId, setActiveModule }: {
    module: ModuleDef;
    active: boolean;
    activeModuleId: string;
    setActiveModule: (id: string) => void;
}) {
    const [hovered, setHovered] = React.useState(false);
    const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const cancelClose = React.useCallback(() => {
        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    }, []);

    const handleEnter = React.useCallback(() => {
        cancelClose();
        setHovered(true);
    }, [cancelClose]);

    const handleLeave = React.useCallback(() => {
        cancelClose();
        // Delay closing by 200ms so the mouse can cross the gap
        // between the icon and the floating tooltip panel.
        closeTimer.current = setTimeout(() => setHovered(false), 200);
    }, [cancelClose]);

    React.useEffect(() => () => cancelClose(), [cancelClose]);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setActiveModule(module.id)}
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
                className={cn("flex h-10 w-10 items-center justify-center rounded-lg text-lg transition-all", active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-accent hover:text-accent-foreground")}
                title={module.label}
                aria-label={module.label}
            >
                <span aria-hidden="true">{module.icon}</span>
            </button>
            {active && <span className="absolute -left-1 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />}
            {/* Hover tooltip — separate onMouseEnter/Leave so it stays open
                when the mouse moves from the icon to the tooltip */}
            {hovered && (
                <div
                    className="fixed left-[52px] z-50 min-w-[200px] rounded-lg border border-border bg-card p-2 shadow-popover"
                    onMouseEnter={handleEnter}
                    onMouseLeave={handleLeave}
                >
                    <p className="px-2 py-1 text-sm font-bold">{module.label}</p>
                    {module.submodules.length > 0 && (
                        <div className="mt-1 flex flex-col gap-0.5">
                            {module.submodules.map((sm) => (
                                <button
                                    key={sm.id}
                                    type="button"
                                    onClick={() => { setActiveModule(sm.id); setHovered(false); }}
                                    className={cn("min-h-[36px] rounded-md px-2 py-1.5 text-left text-xs transition-colors", activeModuleId === sm.id
                                        ? "bg-accent font-semibold text-accent-foreground"
                                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}
                                >
                                    {sm.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SidebarContent({ collapsed }: { collapsed?: boolean }) {
    const moduleSearch = useRDashStore((s) => s.moduleSearch);
    const authUser = useRDashStore((s) => s.authUser);
    const db = useRDashStore((s) => s.db);
    const role = authUser?.role || "Owner";
    const permissions = ((db as unknown as { staffRolePermissions?: StaffPermissionRecord[] }).staffRolePermissions || []);
    const canSeeRoute = React.useCallback((route: ModuleDef | Submodule) => canRole(permissions, role, permissionModuleForRoute(route), "view"), [permissions, role]);
    const modules = React.useMemo(() => ALL_MODULES
        .map((module) => ({ ...module, submodules: module.submodules.filter((submodule) => canSeeRoute(submodule)) }))
        .filter((module) => canSeeRoute(module) || module.submodules.length > 0)
        .filter((module) => moduleMatches(module, moduleSearch.trim())), [canSeeRoute, moduleSearch]);
    const exceptionCount = React.useMemo(() => {
        const directPOs = (db.purchaseOrders || []).filter((po: any) => po.direct_award || po.award_basis === "direct").length;
        const directContractors = (db.workOrders || []).filter((wo: any) => wo.contractor_selection_method === "direct_award").length;
        const renegotiations = (db.quotations || []).filter((q: any) => q.revision_kind === "renegotiation" || q.revision_kind === "variation").length;
        const regularized = (db.attendance || []).filter((a: any) => a.auto_generated && a.attendance_mode === "manual_adjustment").length;
        return directPOs + directContractors + renegotiations + regularized;
    }, [db]);

    if (collapsed) {
        return (
            <div className="flex h-full w-[52px] flex-col bg-sidebar text-sidebar-foreground">
                <div className="flex h-[72px] items-center justify-center border-b border-sidebar-border">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20">
                        <span className="text-sm font-black">UC</span>
                    </div>
                </div>
                <div className="rd-scroll flex-1 overflow-y-auto p-2">
                    <div className="flex flex-col items-center gap-1">
                        {modules.map((module) => <ModuleItem key={module.id} module={module} collapsed />)}
                    </div>
                </div>
            </div>
        );
    }

    return (<div className="flex h-full w-[320px] flex-col bg-sidebar text-sidebar-foreground">
      <div className="rd-sidebar-header relative flex h-[72px] items-center gap-2 overflow-hidden border-b border-sidebar-border px-3">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-transparent"/>
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20">
          <span className="text-sm font-black">UC</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-none">Urban Castle</p>
          <p className="truncate text-[10px] text-muted-foreground">Business Workspace</p>
        </div>
        {exceptionCount > 0 && <span title={`${exceptionCount} audited exceptions — direct awards, renegotiations, regularized attendance`} className="relative inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-[10px] font-bold text-warning-foreground animate-pulse">{exceptionCount}</span>}
      </div>

      <div className="rd-scroll flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-1">
          {modules.map((module) => (<ModuleItem key={module.id} module={module}/>))}
          {modules.length === 0 && (<div className="rounded-md border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
              No matching module found.
            </div>)}
        </div>
      </div>
    </div>);
}

export function Sidebar() {
    const mobileNavOpen = useRDashStore((s) => s.mobileNavOpen);
    const setMobileNavOpen = useRDashStore((s) => s.setMobileNavOpen);
    const sidebarCollapsed = useRDashStore((s) => s.sidebarCollapsed);
    const touchStartX = React.useRef<number | null>(null);
    const touchCurrentX = React.useRef<number | null>(null);
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
        touchCurrentX.current = touchStartX.current;
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        touchCurrentX.current = e.touches[0]?.clientX ?? touchCurrentX.current;
    };
    const handleTouchEnd = () => {
        const start = touchStartX.current;
        const end = touchCurrentX.current;
        if (start != null && end != null && end - start < -60) {
            setMobileNavOpen(false);
        }
        touchStartX.current = null;
        touchCurrentX.current = null;
    };
    return (<>
      <aside className={cn("hidden shrink-0 border-r border-sidebar-border transition-all duration-200 lg:block", sidebarCollapsed ? "w-[52px]" : "w-[320px]")}>
        <SidebarContent collapsed={sidebarCollapsed} />
      </aside>

      {mobileNavOpen && (<div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)}/>
          <div className="absolute inset-y-0 left-0 w-[320px] max-w-[85vw] shadow-popover" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            <button type="button" className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground hover:bg-accent" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
              <X className="h-5 w-5"/>
            </button>
            <SidebarContent />
          </div>
        </div>)}
    </>);
}
