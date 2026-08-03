"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, PanelLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRDashStore } from "@/lib/rdash/store";
import { ALL_MODULES, type ModuleDef, type Submodule } from "@/lib/rdash/modules";
import { fieldStaffCanViewRoute } from "@/lib/rdash/field-staff-presentation";
import { canRole, normalizeStaffPermissions, permissionModuleForRoute, type StaffPermissionRecord } from "@/lib/rdash/staff-operations";

const EMPTY_PERMISSIONS: StaffPermissionRecord[] = [];

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
    const setMobileNavOpen = useRDashStore((s) => s.setMobileNavOpen);
    const moduleSearch = useRDashStore((s) => s.moduleSearch);
    const hasActiveSubmodule = module.submodules.some((sm) => sm.id === activeModuleId);
    const active = activeModuleId === module.id;
    const selected = active || hasActiveSubmodule;
    const [expanded, setExpanded] = React.useState(() => selected || module.id === "workdesk");
    const submodules = visibleSubmodules(module, moduleSearch.trim());

    React.useEffect(() => {
        if (moduleSearch.trim() || selected) setExpanded(true);
    }, [moduleSearch, selected]);

    const navigate = React.useCallback((id: string) => {
        setActiveModule(id);
        setMobileNavOpen(false);
    }, [setActiveModule, setMobileNavOpen]);

    if (collapsed) {
        return (
            <CollapsedModuleItem
                module={module}
                active={selected}
                activeModuleId={activeModuleId}
                setActiveModule={setActiveModule}
            />
        );
    }

    const submoduleRegionId = `sidebar-submodules-${module.id}`;
    return (
      <div className="flex flex-col">
        <div className={cn(
          "group relative flex min-h-10 items-stretch rounded-lg text-sm transition-colors",
          selected
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
        )}>
          {selected && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-sidebar-primary" aria-hidden />}
          <button
            type="button"
            onClick={() => navigate(module.id)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-l-lg px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
            aria-current={active ? "page" : undefined}
            title={module.description || module.label}
          >
            <span className="w-5 shrink-0 text-center text-[15px] leading-none" aria-hidden="true">{module.icon}</span>
            <span className={cn("min-w-0 flex-1 truncate", selected ? "font-semibold" : "font-medium")}>{module.label}</span>
          </button>
          {module.submodules.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="flex w-9 shrink-0 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${module.label} submodules`}
              aria-expanded={expanded}
              aria-controls={submoduleRegionId}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !expanded && "-rotate-90")} />
            </button>
          )}
        </div>

        {expanded && submodules.length > 0 && (
          <div id={submoduleRegionId} className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-sidebar-border/80 pl-2">
            {submodules.map((sm) => {
                const subActive = activeModuleId === sm.id;
                return (
                  <button
                    key={sm.id}
                    type="button"
                    onClick={() => navigate(sm.id)}
                    className={cn(
                      "min-h-8 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
                      subActive
                        ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                    aria-current={subActive ? "page" : undefined}
                  >
                    <span className="block truncate">{sm.label}</span>
                  </button>
                );
            })}
          </div>
        )}
      </div>
    );
}

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
                onFocus={handleEnter}
                onBlur={handleLeave}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                title={module.label}
                aria-label={module.label}
            >
                <span aria-hidden="true">{module.icon}</span>
            </button>
            {active && <span className="absolute -left-1 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-sidebar-primary" aria-hidden />}
            {hovered && (
                <div
                    className="fixed left-[52px] z-50 min-w-[210px] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-popover"
                    onMouseEnter={handleEnter}
                    onMouseLeave={handleLeave}
                >
                    <p className="px-2 py-1 text-sm font-semibold">{module.label}</p>
                    {module.description && <p className="px-2 pb-1 text-[11px] leading-4 text-muted-foreground">{module.description}</p>}
                    {module.submodules.length > 0 && (
                        <div className="mt-1 flex flex-col gap-0.5 border-t border-border/60 pt-1">
                            {module.submodules.map((sm) => (
                                <button
                                    key={sm.id}
                                    type="button"
                                    onClick={() => { setActiveModule(sm.id); setHovered(false); }}
                                    className={cn(
                                      "min-h-8 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                                      activeModuleId === sm.id
                                        ? "bg-accent font-semibold text-accent-foreground"
                                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                                    )}
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
    const toggleSidebar = useRDashStore((s) => s.toggleSidebar);
    const role = authUser?.role || "Owner";
    const isFieldStaff = role.trim().toLowerCase() === "field staff";
    const rawPermissions = (db as unknown as { staffRolePermissions?: StaffPermissionRecord[] }).staffRolePermissions || EMPTY_PERMISSIONS;
    const permissions = React.useMemo(
        () => normalizeStaffPermissions(rawPermissions),
        [rawPermissions],
    );
    const canSeeRoute = React.useCallback((route: ModuleDef | Submodule) => {
        const permissionModule = permissionModuleForRoute(route);
        if (isFieldStaff && !fieldStaffCanViewRoute(route.id, permissionModule)) return false;
        return canRole(permissions, role, permissionModule, "view");
    }, [isFieldStaff, permissions, role]);
    const modules = React.useMemo(() => ALL_MODULES
        .map((module) => ({ ...module, submodules: module.submodules.filter((submodule) => canSeeRoute(submodule)) }))
        .filter((module) => canSeeRoute(module) || module.submodules.length > 0)
        .filter((module) => moduleMatches(module, moduleSearch.trim())), [canSeeRoute, moduleSearch]);
    const exceptionCount = React.useMemo(() => {
        if (isFieldStaff) return 0;
        const directPOs = (db.purchaseOrders || []).filter((po: any) => po.direct_award || po.award_basis === "direct").length;
        const directContractors = (db.workOrders || []).filter((wo: any) => wo.contractor_selection_method === "direct_award").length;
        const renegotiations = (db.quotations || []).filter((q: any) => q.revision_kind === "renegotiation" || q.revision_kind === "variation").length;
        const regularized = (db.attendance || []).filter((a: any) => a.auto_generated && a.attendance_mode === "manual_adjustment").length;
        return directPOs + directContractors + renegotiations + regularized;
    }, [db, isFieldStaff]);

    if (collapsed) {
        return (
            <div className="flex h-full w-[52px] flex-col bg-sidebar text-sidebar-foreground">
                <div className="flex h-16 flex-col items-center justify-center gap-0.5 border-b border-sidebar-border">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                        <span className="text-xs font-black">UC</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-8 text-muted-foreground hover:text-foreground" onClick={toggleSidebar} aria-label="Expand sidebar" title="Expand sidebar">
                        <PanelLeft className="h-3.5 w-3.5 rotate-180" />
                    </Button>
                </div>
                <div className="rd-scroll flex-1 overflow-y-auto p-1.5">
                    <div className="flex flex-col items-center gap-1">
                        {modules.map((module) => <ModuleItem key={module.id} module={module} collapsed />)}
                    </div>
                </div>
            </div>
        );
    }

    return (
      <div className="flex h-full w-[288px] flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <span className="text-xs font-black">UC</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-none">Urban Castle</p>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">Business Workspace</p>
          </div>
          {exceptionCount > 0 && (
            <span title={`${exceptionCount} audited exceptions — direct awards, renegotiations, regularized attendance`} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/15 px-1.5 text-[10px] font-bold text-warning">
              {exceptionCount}
            </span>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={toggleSidebar} aria-label="Collapse sidebar" title="Collapse sidebar">
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="rd-scroll flex-1 overflow-y-auto p-2.5">
          <div className="flex flex-col gap-1">
            {modules.map((module) => <ModuleItem key={module.id} module={module} />)}
            {modules.length === 0 && (
              <div className="rounded-lg border border-dashed border-sidebar-border px-3 py-5 text-center text-xs text-muted-foreground">
                No matching module found.
              </div>
            )}
          </div>
        </div>
      </div>
    );
}

export function Sidebar() {
    const mobileNavOpen = useRDashStore((s) => s.mobileNavOpen);
    const setMobileNavOpen = useRDashStore((s) => s.setMobileNavOpen);
    const sidebarCollapsed = useRDashStore((s) => s.sidebarCollapsed);
    const touchStartX = React.useRef<number | null>(null);
    const touchCurrentX = React.useRef<number | null>(null);

    const handleTouchStart = (event: React.TouchEvent) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
        touchCurrentX.current = touchStartX.current;
    };
    const handleTouchMove = (event: React.TouchEvent) => {
        touchCurrentX.current = event.touches[0]?.clientX ?? touchCurrentX.current;
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
      <aside className={cn("hidden shrink-0 border-r border-sidebar-border transition-[width] duration-200 lg:block", sidebarCollapsed ? "w-[52px]" : "w-[288px]")}>
        <SidebarContent collapsed={sidebarCollapsed} />
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/35 backdrop-blur-sm"
            role="button"
            tabIndex={0}
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Enter") setMobileNavOpen(false); }}
          />
          <div className="absolute inset-y-0 left-0 w-[288px] max-w-[88vw] shadow-popover" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            <button type="button" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
              <X className="h-4 w-4" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}
    </>);
}
