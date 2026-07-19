export type ModuleRenderer = "daily-work" | "workdesk-dashboard" | "customer-desk" | "customer-extras" | "site-execution" | "tasks" | "quotations" | "boq" | "procurement" | "grn" | "inventory" | "dispatch" | "workOrder-pnl" | "vendor-bills" | "contractor-payments" | "contractor-detail" | "finance-overview" | "payment-recovery" | "reports-v2" | "calendar" | "site-measurement" | "approval-policies" | "control-brain" | "audit-log" | "data-import" | "data-export" | "rate-finder" | "gps-tracking" | "visit-proofs" | "field-mode" | "communication-centre" | "quotation-config" | "staff-board" | "attendance-payroll" | "gst-returns" | "masters" | "masters-v2" | "sales-ops" | "sales-pipeline" | "commissions" | "threads" | "obstacle-threads" | "approvals-v2" | "site-visits" | "media-library" | "auth-users" | "system" | "drawings" | "execution-logs" | "site-profitability" | "staff-salary" | "vendor-performance" | "contractor-performance" | "wo-timeline" | "unified-thread-inbox" | "integrity";
export type DataSource = "tasks" | "followups" | "visits" | "quotations" | "payments" | "invoices" | "workOrders" | "customers" | "approvals" | "risks" | "blocked" | "vendors" | "contractors" | "staff" | "master-units" | "master-categories" | "master-subcategories" | "master-articles" | "boqs" | "purchaseOrders" | "grns" | "inventory" | "dispatches" | "vendorBills" | "commissions" | "drawings" | "executionLogs" | "threads" | "attendance" | "sites" | "none";
export interface FilterPreset {
    id: string;
    label: string;
    filter: Record<string, string>;
}
export interface Submodule {
    id: string;
    label: string;
    renderer?: ModuleRenderer;
    dataSource?: DataSource;
    filter?: Record<string, string>;
    filterPresets?: FilterPreset[];
    hint?: string;
}
export interface ModuleDef {
    id: string;
    label: string;
    description: string;
    icon: string;
    renderer: ModuleRenderer;
    dataSource?: DataSource;
    filter?: Record<string, string>;
    submodules: Submodule[];
    /**
     * Optional predicate that returns true if this module has "active" items
     * (used by `groupActiveCount` to show active badges in the sidebar).
     * If omitted, the module is never counted as active.
     *
     * This replaces the old procedural `switch (m.id)` in `groupActiveCount`
     * — adding a new module with an active badge is now declarative: just
     * add an `activePredicate` to the module definition.
     */
    activePredicate?: (db: import("./types").RDashDatabase) => boolean;
}
export interface ModuleGroup {
    id: string;
    label: string;
    icon?: string;
    modules: ModuleDef[];
}
export const MODULE_GROUPS: ModuleGroup[] = [
    {
        id: "workspace",
        label: "Workspace",
        icon: "🧰",
        modules: [
            {
                id: "workdesk",
                label: "Workdesk Dashboard",
                description: "Cross-site action queue, approvals, follow-ups and operational health",
                icon: "🗂️",
                renderer: "workdesk-dashboard",
                activePredicate: (db) => db.tasks.some((t) => t.status === "todo" || t.status === "in_progress" || t.status === "review") || db.actions.some((a) => a.status === "pending") || db.blocked.some((b) => !b.resolved) || db.visits.some((v) => v.status === "scheduled" || v.status === "en_route") || db.followups.some((f) => f.status === "pending" || f.status === "missed"),
                submodules: [
                    { id: "today", label: "Daily Work", renderer: "daily-work", dataSource: "tasks" },
                    { id: "unifiedThreadInbox", label: "Thread Inbox", renderer: "unified-thread-inbox", dataSource: "threads", hint: "Unified feed of every conversation across all entities" },
                    { id: "tasks", label: "Tasks & Follow-ups", renderer: "tasks", dataSource: "tasks" },
                    { id: "blockedRisks", label: "Obstacles & Risks", renderer: "obstacle-threads", dataSource: "blocked", filter: { view: "combined" } },
                    { id: "approvals", label: "Approvals", renderer: "approvals-v2", dataSource: "approvals" },
                    { id: "calendarRecurring", label: "Calendar", renderer: "calendar", dataSource: "tasks", filter: { view: "recurring" } },
                ],
            },
            {
                id: "customerDesk",
                label: "Customer Desk",
                description: "Customer portfolio: every customer’s sites, commercial context and history",
                icon: "🧭",
                renderer: "customer-desk",
                dataSource: "customers",
                activePredicate: (db) => db.customers.length > 0 || db.tasks.some((t) => t.task_scope === "client" && t.status !== "completed") || db.blocked.some((b) => !b.resolved),
                submodules: [
                    { id: "customerTimeline", label: "Customer Timeline", renderer: "customer-desk", dataSource: "customers", filter: { view: "timeline" }, hint: "Lifecycle timeline across every customer" },
                    { id: "customerRequests", label: "Customer Requests", renderer: "customer-extras", dataSource: "customers", filter: { sub: "requests" }, hint: "Work-required review, pending actions and customer requests" },
                ],
            },
            {
                id: "salesPipeline",
                label: "Sales Pipeline",
                description: "Enquiries, sales stages, drag-and-drop kanban and conversion tracking",
                icon: "📈",
                renderer: "sales-pipeline",
                dataSource: "customers",
                submodules: [],
            },
            {
                id: "siteExecution",
                label: "Sites & Execution",
                description: "Site-first operating workspace: areas, work required, quotation, contractor award, work order, BOQ and procurement",
                icon: "🏗️",
                renderer: "site-execution",
                activePredicate: (db) => db.workOrders.some((j) => j.status === "in_progress" || j.status === "scheduled"),
                dataSource: "workOrders",
                submodules: [
                    { id: "boq", label: "BOQ / Material Plan", renderer: "boq", dataSource: "boqs" },
                    { id: "drawings", label: "Drawings", renderer: "drawings", dataSource: "drawings" },
                    { id: "executionLogs", label: "Execution Logs", renderer: "execution-logs", dataSource: "executionLogs" },
                    { id: "woTimeline", label: "WO Timeline", renderer: "wo-timeline", dataSource: "workOrders" },
                ],
            },
            {
                id: "quotationDesk",
                label: "Quotation Desk",
                description: "Customer quotations, coverage, revisions and acceptance",
                icon: "🧾",
                renderer: "quotations",
                activePredicate: (db) => db.quotations.some((q) => q.status === "draft" || q.status === "sent"),
                dataSource: "quotations",
                submodules: [
                    { id: "quotationConfig", label: "Terms & Settings", renderer: "quotation-config", dataSource: "none" },
                ],
            },
        ],
    },
    {
        id: "operations",
        label: "Operations",
        icon: "⚙️",
        modules: [
            {
                id: "fieldOperations",
                label: "Field Visits",
                description: "Measurement, inspection, GPS proof, site progress and field execution",
                icon: "📍",
                renderer: "site-visits",
                dataSource: "visits",
                activePredicate: (db) => db.visits.some((v) => v.status === "scheduled" || v.status === "en_route" || v.status === "checked_in"),
                submodules: [
                    { id: "siteMeasurement", label: "Measurements", renderer: "site-measurement", dataSource: "visits" },
                    { id: "visitProofs", label: "Visit Proofs", renderer: "visit-proofs", dataSource: "visits" },
                    { id: "fieldMode", label: "Field Mode", renderer: "field-mode", dataSource: "visits" },
                    { id: "gpsTracking", label: "GPS Tracking", renderer: "gps-tracking", dataSource: "attendance" },
                ],
            },
            {
                id: "procurementInventory",
                label: "Procurement & Inventory",
                description: "Vendor RFQ, bidding, purchase orders, GRN, stock issue and inventory",
                icon: "📦",
                renderer: "procurement",
                activePredicate: (db) => db.purchaseOrders.some((p) => p.status === "draft" || p.status === "pending_approval" || p.status === "sent") || db.grns.length > 0 || db.inventory.length > 0 || db.vendorBills.length > 0,
                dataSource: "purchaseOrders",
                submodules: [
                    { id: "grn", label: "Goods Received Note", renderer: "grn", dataSource: "grns" },
                    { id: "inventory", label: "Inventory", renderer: "inventory", dataSource: "inventory" },
                    { id: "dispatch", label: "Stock Issue / Dispatch", renderer: "dispatch", dataSource: "dispatches" },
                    { id: "vendorPerformance", label: "Vendor Performance", renderer: "vendor-performance", dataSource: "vendors" },
                ],
            },
            {
                id: "financeDesk",
                label: "Finance",
                description: "Customer collections, vendor bills, contractor bills, site profitability and commissions",
                icon: "💳",
                renderer: "finance-overview",
                activePredicate: (db) => db.quotations.some((q) => q.status === "accepted") || db.commissions.some((c) => c.status === "accrued" || c.status === "payable") || db.payments.some((p) => p.status === "pending" || p.status === "overdue"),
                dataSource: "payments",
                submodules: [
                    { id: "payments", label: "Customer Collections", renderer: "payment-recovery", dataSource: "payments" },
                    { id: "invoices", label: "Customer Invoices", renderer: "sales-ops", dataSource: "invoices", filter: { sub: "invoices" } },
                    { id: "vendorBills", label: "Vendor Bills & Payments", renderer: "vendor-bills", dataSource: "vendorBills" },
                    { id: "contractorPayments", label: "Contractor Bills & Payments", renderer: "contractor-payments", dataSource: "workOrders" },
                    { id: "siteProfitability", label: "Site Profitability", renderer: "site-profitability", dataSource: "sites" },
                    { id: "workOrderPnl", label: "Work Order P&L", renderer: "workOrder-pnl", dataSource: "workOrders" },
                    { id: "commissions", label: "Commissions", renderer: "commissions", dataSource: "commissions" },
                    { id: "gstReturns", label: "GST Returns", renderer: "gst-returns", dataSource: "none" },
                ],
            },
            {
                id: "mediaCommunication",
                label: "Media & Communication",
                description: "Reference media, catalogues, communication history and contextual files",
                icon: "🖼️",
                renderer: "media-library",
                dataSource: "none",
                submodules: [
                    { id: "communicationCentre", label: "Communication Centre", renderer: "communication-centre", dataSource: "none" },
                ],
            },
            {
                id: "contractorDetail",
                label: "Contractor Detail",
                description: "Contractor profiles, categories, capabilities, work assignments, RA bills and performance",
                icon: "👷",
                renderer: "contractor-detail",
                dataSource: "contractors",
                submodules: [
                    { id: "contractors", label: "Contractors", renderer: "masters-v2", dataSource: "contractors", hint: "Contractor master data: profiles, categories, capabilities and rate agreements" },
                    { id: "contractorPerformance", label: "Contractor Performance", renderer: "contractor-performance", dataSource: "contractors" },
                ],
            },
            {
                id: "hrStaff",
                label: "HR & Staff",
                description: "Staff board, attendance policies, payroll rules and salary computation",
                icon: "🧑‍💼",
                renderer: "staff-board",
                dataSource: "staff",
                activePredicate: (db) => db.master.staff.some((s) => s.status === "active"),
                submodules: [
                    { id: "staff", label: "Staff Board", renderer: "staff-board", dataSource: "staff" },
                    { id: "attendancePayroll", label: "Attendance & Payroll Rules", renderer: "attendance-payroll", dataSource: "attendance" },
                    { id: "staffSalary", label: "Staff Salary", renderer: "staff-salary", dataSource: "staff" },
                ],
            },
        ],
    },
    {
        id: "master-setup",
        label: "Master Setup",
        icon: "🧱",
        modules: [
            {
                id: "masterSetup",
                label: "Master Setup",
                description: "Work categories, articles, rates, vendors, units and configuration",
                icon: "🧱",
                renderer: "masters",
                activePredicate: (db) => db.master.articles.length > 0 || db.master.vendors.length > 0 || db.master.contractors.length > 0,
                dataSource: "master-categories",
                submodules: [
                    { id: "vendorRates", label: "Vendor Price Matrix", renderer: "masters-v2", dataSource: "vendors" },
                    { id: "rateFinder", label: "Rate Finder", renderer: "rate-finder", dataSource: "none" },
                    { id: "vendors", label: "Vendors", renderer: "masters-v2", dataSource: "vendors" },
                ],
            },
        ],
    },
    {
        id: "reports",
        label: "Reports",
        icon: "📊",
        modules: [
            {
                id: "reportsDesk",
                label: "Reports",
                description: "Customer, site, area, quotation, work order, procurement and finance reporting",
                icon: "📊",
                renderer: "reports-v2",
                activePredicate: (db) => db.customers.length > 0 || db.workOrders.length > 0,
                dataSource: "none",
                submodules: [
                    { id: "salesReport", label: "Quotation & Sales", renderer: "reports-v2", dataSource: "quotations" },
                    { id: "collectionReport", label: "Collections", renderer: "reports-v2", dataSource: "payments" },
                    { id: "jobPnlReport", label: "Site P&L Report", renderer: "reports-v2", dataSource: "workOrders" },
                    { id: "vendorExposureReport", label: "Vendor Exposure", renderer: "reports-v2", dataSource: "vendors" },
                    { id: "taxReport", label: "Tax / GST", renderer: "reports-v2", dataSource: "none" },
                    { id: "staffProductivity", label: "Staff Productivity", renderer: "reports-v2", dataSource: "staff" },
                    { id: "quotationConversion", label: "Quotation Conversion", renderer: "reports-v2", dataSource: "quotations" },
                    { id: "leadSourceReport", label: "Lead Source", renderer: "reports-v2", dataSource: "customers" },
                    { id: "agingReportRep", label: "Receivables Aging", renderer: "reports-v2", dataSource: "payments" },
                    { id: "visitCompliance", label: "Visit Compliance", renderer: "reports-v2", dataSource: "visits" },
                    { id: "taskThroughput", label: "Task Throughput", renderer: "reports-v2", dataSource: "tasks" },
                ],
            },
        ],
    },
    {
        id: "system",
        label: "System",
        icon: "⚙️",
        modules: [
            {
                id: "systemSettings",
                label: "System Settings",
                description: "Users, roles, automation, approval policies, data tools and system controls",
                icon: "⚙️",
                renderer: "system",
                dataSource: "none",
                submodules: [
                    { id: "userApprovals", label: "User Approvals", renderer: "auth-users", dataSource: "none" },
                    { id: "controlBrainWorkflows", label: "Control Brain", renderer: "control-brain", dataSource: "none" },
                    { id: "approvalPolicies", label: "Approval Policies", renderer: "approval-policies", dataSource: "none" },
                    { id: "auditLog", label: "Audit Log", renderer: "audit-log", dataSource: "none" },
                    { id: "dataImport", label: "Data Import", renderer: "data-import", dataSource: "none" },
                    { id: "dataExport", label: "Data Export", renderer: "data-export", dataSource: "none" },
                    { id: "integrity", label: "Data Integrity", renderer: "integrity", dataSource: "none", hint: "Referential integrity, orphan detection, cascade-delete and repair" },
                ],
            },
        ],
    },
];
export const ALL_MODULES: ModuleDef[] = MODULE_GROUPS.flatMap((group) => group.modules);
export const ALL_SUBMODULES: Submodule[] = ALL_MODULES.flatMap((module) => module.submodules);
export interface ModuleRoute {
    id: string;
    groupId: string;
    moduleId: string;
    label: string;
    icon: string;
    description: string;
    renderer: ModuleRenderer;
    dataSource?: DataSource;
    filter?: Record<string, string>;
    filterPresets?: FilterPreset[];
    isSubmodule: boolean;
}
function buildModuleRouteRegistry(): ReadonlyMap<string, ModuleRoute> {
    const routes = new Map<string, ModuleRoute>();
    const register = (route: ModuleRoute) => {
        if (routes.has(route.id)) {
            throw new Error(`Duplicate module route id: ${route.id}`);
        }
        routes.set(route.id, Object.freeze({ ...route }));
    };
    for (const group of MODULE_GROUPS) {
        for (const moduleDef of group.modules) {
            register({
                id: moduleDef.id,
                groupId: group.id,
                moduleId: moduleDef.id,
                label: moduleDef.label,
                icon: moduleDef.icon,
                description: moduleDef.description,
                renderer: moduleDef.renderer,
                dataSource: moduleDef.dataSource,
                filter: moduleDef.filter,
                isSubmodule: false,
            });
            for (const submodule of moduleDef.submodules) {
                register({
                    id: submodule.id,
                    groupId: group.id,
                    moduleId: moduleDef.id,
                    label: submodule.label,
                    icon: moduleDef.icon,
                    description: submodule.hint || moduleDef.description,
                    renderer: submodule.renderer || moduleDef.renderer,
                    dataSource: submodule.dataSource || moduleDef.dataSource,
                    filter: submodule.filter,
                    filterPresets: submodule.filterPresets,
                    isSubmodule: true,
                });
            }
        }
    }
    if (!routes.has("today")) {
        throw new Error("The module route registry must include the Daily Work fallback route.");
    }
    return routes;
}
export const MODULE_ROUTE_REGISTRY = buildModuleRouteRegistry();
export const REGISTERED_MODULE_IDS = new Set<string>(MODULE_ROUTE_REGISTRY.keys());
export const DEFAULT_MODULE_ID = "today";
export function findModule(id: string): ModuleDef | undefined {
    return ALL_MODULES.find((module) => module.id === id);
}
export function findSubmodule(id: string): {
    module?: ModuleDef;
    sub?: Submodule;
} {
    const route = MODULE_ROUTE_REGISTRY.get(id);
    if (!route?.isSubmodule)
        return {};
    const moduleDef = findModule(route.moduleId);
    const sub = moduleDef?.submodules.find((candidate) => candidate.id === id);
    return { module: moduleDef, sub };
}
export function getModuleRoute(id: string): ModuleRoute | undefined {
    return MODULE_ROUTE_REGISTRY.get(id);
}
export function canonicalModuleId(id: string): string {
    return MODULE_ROUTE_REGISTRY.has(id) ? id : DEFAULT_MODULE_ID;
}
export function isRegisteredModuleId(id: string): boolean {
    return MODULE_ROUTE_REGISTRY.has(id);
}
export function resolveRenderer(id: string): ModuleRoute {
    return MODULE_ROUTE_REGISTRY.get(canonicalModuleId(id))!;
}
export function validateModuleRegistry(): string[] {
    const issues: string[] = [];
    for (const route of MODULE_ROUTE_REGISTRY.values()) {
        if (!route.id.trim())
            issues.push("A module route has an empty id.");
        if (!route.label.trim())
            issues.push(`Module route ${route.id} has an empty label.`);
        if (!route.renderer)
            issues.push(`Module route ${route.id} has no screen renderer.`);
        if (route.isSubmodule && !MODULE_ROUTE_REGISTRY.has(route.moduleId)) {
            issues.push(`Submodule ${route.id} points to missing module ${route.moduleId}.`);
        }
    }
    return issues;
}
export function groupSubmoduleCount(groupId: string): number {
    const g = MODULE_GROUPS.find((x) => x.id === groupId);
    return g ? g.modules.reduce((n, m) => n + m.submodules.length, 0) : 0;
}
export function moduleSubmoduleCount(moduleId: string): number {
    const m = findModule(moduleId);
    return m ? m.submodules.length : 0;
}
export function groupActiveCount(groupId: string, db: import("./types").RDashDatabase): number {
    const g = MODULE_GROUPS.find((x) => x.id === groupId);
    if (!g)
        return 0;
    // Declarative: each module's `activePredicate` (if present) determines
    // whether it counts as "active". No procedural switch needed — adding a
    // new module with an active badge is just adding an `activePredicate` to
    // the module definition in MODULE_GROUPS.
    return g.modules.reduce((count, m) => count + (m.activePredicate?.(db) ? 1 : 0), 0);
}
