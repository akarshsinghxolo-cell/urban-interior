import { canonicalLegacyModuleId } from "./module-aliases";

export type ModuleRenderer =
  | "daily-work"
  | "customer-desk"
  | "customer-extras"
  | "site-execution"
  | "tasks"
  | "quotations"
  | "boq"
  | "procurement"
  | "grn"
  | "inventory"
  | "dispatch"
  | "vendor-bills"
  | "contractor-payments"
  | "contractor-workspace"
  | "profitability"
  | "finance-overview"
  | "payment-recovery"
  | "reports-v2"
  | "report-family"
  | "calendar"
  | "site-measurement"
  | "approval-policies"
  | "control-brain"
  | "audit-log"
  | "data-import"
  | "data-export"
  | "rate-finder"
  | "gps-tracking"
  | "visit-proofs"
  | "field-mode"
  | "communication-centre"
  | "quotation-config"
  | "staff-board"
  | "attendance-payroll"
  | "gst-returns"
  | "masters"
  | "masters-v2"
  | "sales-ops"
  | "sales-pipeline"
  | "lost-closed-review"
  | "commissions"
  | "obstacle-threads"
  | "approvals-v2"
  | "site-visits"
  | "media-library"
  | "auth-users"
  | "system"
  | "drawings"
  | "execution-logs"
  | "staff-salary"
  | "vendor-performance"
  | "wo-timeline"
  | "unified-thread-inbox"
  | "integrity"
  | "drive-manager"
  | "article-variants";

export type DataSource =
  | "tasks"
  | "followups"
  | "visits"
  | "quotations"
  | "payments"
  | "invoices"
  | "workOrders"
  | "customers"
  | "approvals"
  | "risks"
  | "blocked"
  | "vendors"
  | "contractors"
  | "staff"
  | "master-units"
  | "master-categories"
  | "master-subcategories"
  | "master-articles"
  | "boqs"
  | "purchaseOrders"
  | "grns"
  | "inventory"
  | "dispatches"
  | "vendorBills"
  | "commissions"
  | "drawings"
  | "executionLogs"
  | "threads"
  | "attendance"
  | "sites"
  | "none";

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
        id: "customerDesk",
        label: "Customer Desk",
        description: "Customer portfolio: every customer’s sites, commercial context and history",
        icon: "🧭",
        renderer: "customer-desk",
        dataSource: "customers",
        activePredicate: (db) =>
          db.customers.length > 0 ||
          db.tasks.some(
            (task) => task.task_scope === "client" && task.status !== "completed",
          ) ||
          db.blocked.some((blocked) => !blocked.resolved),
        submodules: [
          {
            id: "customerTimeline",
            label: "Customer Timeline",
            renderer: "customer-desk",
            dataSource: "customers",
            filter: { view: "timeline" },
            hint: "Lifecycle timeline across every customer",
          },
          {
            id: "customerRequests",
            label: "Customer Requests",
            renderer: "customer-extras",
            dataSource: "customers",
            filter: { sub: "requests" },
            hint: "Requests, qualification review and pending customer actions",
          },
        ],
      },
      {
        id: "workdesk",
        label: "Workdesk Dashboard",
        description: "Cross-site action queue, approvals, follow-ups and operational health",
        icon: "🗂️",
        renderer: "daily-work",
        activePredicate: (db) =>
          db.tasks.some((task) =>
            task.status === "todo" ||
            task.status === "in_progress" ||
            task.status === "review",
          ) ||
          db.actions.some((action) => action.status === "pending") ||
          db.blocked.some((blocked) => !blocked.resolved) ||
          db.visits.some((visit) =>
            visit.status === "scheduled" || visit.status === "en_route",
          ) ||
          db.followups.some((followup) =>
            followup.status === "pending" || followup.status === "missed",
          ),
        submodules: [
          {
            id: "unifiedThreadInbox",
            label: "Conversation Inbox",
            renderer: "unified-thread-inbox",
            dataSource: "threads",
            hint: "Unified feed of every conversation across all entities",
          },
          {
            id: "tasks",
            label: "Tasks & Follow-ups",
            renderer: "tasks",
            dataSource: "tasks",
          },
          {
            id: "blockedRisks",
            label: "Obstacles & Risks",
            renderer: "obstacle-threads",
            dataSource: "blocked",
            filter: { view: "combined" },
          },
          {
            id: "approvals",
            label: "Business Approvals",
            renderer: "approvals-v2",
            dataSource: "approvals",
          },
          {
            id: "calendarRecurring",
            label: "Calendar",
            renderer: "calendar",
            dataSource: "tasks",
            filter: { view: "recurring" },
          },
        ],
      },
      {
        id: "salesPipeline",
        label: "Sales Pipeline",
        description: "Enquiries, sales stages, drag-and-drop kanban and conversion tracking",
        icon: "📈",
        renderer: "sales-pipeline",
        dataSource: "customers",
        submodules: [
          {
            id: "lostClosedReview",
            label: "Lost / Closed Review",
            renderer: "lost-closed-review",
            dataSource: "quotations",
            hint: "Post-mortem on lost quotations, lost requirements and cancelled work orders",
          },
        ],
      },
      {
        id: "siteExecution",
        label: "Sites & Execution",
        description:
          "Site-first operating workspace: areas, work required, quotation, contractor award, work order, BOQ and procurement",
        icon: "🏗️",
        renderer: "site-execution",
        activePredicate: (db) =>
          db.workOrders.some(
            (workOrder) =>
              workOrder.status === "in_progress" ||
              workOrder.status === "scheduled",
          ),
        dataSource: "workOrders",
        submodules: [
          {
            id: "drawings",
            label: "Drawings",
            renderer: "drawings",
            dataSource: "drawings",
          },
          {
            id: "executionLogs",
            label: "Execution Logs",
            renderer: "execution-logs",
            dataSource: "executionLogs",
          },
          {
            id: "woTimeline",
            label: "Work Order Timeline",
            renderer: "wo-timeline",
            dataSource: "workOrders",
          },
        ],
      },
      {
        id: "quotationDesk",
        label: "Quotation Desk",
        description: "Customer quotations, coverage, revisions and acceptance",
        icon: "🧾",
        renderer: "quotations",
        activePredicate: (db) =>
          db.quotations.some(
            (quotation) =>
              quotation.status === "draft" || quotation.status === "sent",
          ),
        dataSource: "quotations",
        submodules: [
          {
            id: "quotationConfig",
            label: "Terms & Settings",
            renderer: "quotation-config",
            dataSource: "none",
          },
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
        activePredicate: (db) =>
          db.visits.some(
            (visit) =>
              visit.status === "scheduled" ||
              visit.status === "en_route" ||
              visit.status === "checked_in",
          ),
        submodules: [
          {
            id: "siteMeasurement",
            label: "Measurements",
            renderer: "site-measurement",
            dataSource: "visits",
          },
          {
            id: "visitProofs",
            label: "Visit Proofs",
            renderer: "visit-proofs",
            dataSource: "visits",
          },
          {
            id: "fieldMode",
            label: "Mobile Field Mode",
            renderer: "field-mode",
            dataSource: "visits",
            hint: "Operator check-in, check-out, evidence and field reporting",
          },
          {
            id: "gpsTracking",
            label: "Team GPS Monitor",
            renderer: "gps-tracking",
            dataSource: "attendance",
            hint: "Supervisor map, routes, stops, speed and tracking points",
          },
        ],
      },
      {
        id: "procurementInventory",
        label: "Procurement & Inventory",
        description:
          "Vendor RFQ, bidding, purchase orders, BOQ control, GRN, stock issue and inventory",
        icon: "📦",
        renderer: "procurement",
        activePredicate: (db) =>
          db.purchaseOrders.some(
            (purchaseOrder) =>
              purchaseOrder.status === "draft" ||
              purchaseOrder.status === "pending_approval" ||
              purchaseOrder.status === "sent",
          ) ||
          db.grns.length > 0 ||
          db.inventory.length > 0 ||
          db.vendorBills.length > 0,
        dataSource: "purchaseOrders",
        submodules: [
          {
            id: "boqControlCentre",
            label: "BOQ Control Centre",
            renderer: "boq",
            dataSource: "boqs",
            hint: "Cross-work-order BOQ approval, rate control and RFQ generation",
          },
          {
            id: "grn",
            label: "Goods Received Note",
            renderer: "grn",
            dataSource: "grns",
          },
          {
            id: "inventory",
            label: "Inventory",
            renderer: "inventory",
            dataSource: "inventory",
          },
          {
            id: "dispatch",
            label: "Stock Issue / Dispatch",
            renderer: "dispatch",
            dataSource: "dispatches",
          },
        ],
      },
      {
        id: "contractorDetail",
        label: "Contractors",
        description:
          "Contractor 360, governance, capabilities, operational actions, rates, assignments, RA bills and performance",
        icon: "👷",
        renderer: "contractor-workspace",
        dataSource: "contractors",
        activePredicate: (db) => db.master.contractors.length > 0,
        submodules: [
          {
            id: "contractorRates",
            label: "Contractor Rates",
            renderer: "masters-v2",
            dataSource: "contractors",
            filter: { sub: "contractorRates" },
            hint: "Trade and rate agreements without duplicating contractor profiles",
          },
        ],
      },
      {
        id: "vendors",
        label: "Vendors",
        description:
          "Vendor 360, governance, price intelligence, performance and procurement history",
        icon: "🏢",
        renderer: "vendor-performance",
        dataSource: "vendors",
        activePredicate: (db) => db.master.vendors.length > 0,
        submodules: [
          {
            id: "vendorRates",
            label: "Vendor Price Matrix",
            renderer: "masters-v2",
            dataSource: "vendors",
          },
          {
            id: "rateFinder",
            label: "Rate Finder",
            renderer: "rate-finder",
            dataSource: "vendors",
          },
        ],
      },
      {
        id: "financeDesk",
        label: "Finance",
        description:
          "Customer collections, partner payables, unified profitability, commissions and GST",
        icon: "💳",
        renderer: "finance-overview",
        activePredicate: (db) =>
          db.quotations.some((quotation) => quotation.status === "accepted") ||
          db.commissions.some(
            (commission) =>
              commission.status === "accrued" ||
              commission.status === "payable",
          ) ||
          db.payments.some(
            (payment) =>
              payment.status === "pending" || payment.status === "overdue",
          ),
        dataSource: "payments",
        submodules: [
          {
            id: "payments",
            label: "Customer Collections",
            renderer: "payment-recovery",
            dataSource: "payments",
          },
          {
            id: "invoices",
            label: "Customer Invoices",
            renderer: "sales-ops",
            dataSource: "invoices",
            filter: { sub: "invoices" },
          },
          {
            id: "vendorBills",
            label: "Vendor Bills & Payments",
            renderer: "vendor-bills",
            dataSource: "vendorBills",
          },
          {
            id: "contractorPayments",
            label: "Contractor Bills & Payments",
            renderer: "contractor-payments",
            dataSource: "workOrders",
          },
          {
            id: "profitability",
            label: "Profitability",
            renderer: "profitability",
            dataSource: "sites",
            hint: "One workspace with Site and Work Order views",
          },
          {
            id: "commissions",
            label: "Commissions",
            renderer: "commissions",
            dataSource: "commissions",
            hint: "Commission records and source/referral partner analytics",
          },
          {
            id: "gstReturns",
            label: "GST Returns",
            renderer: "gst-returns",
            dataSource: "none",
          },
        ],
      },
      {
        id: "mediaCommunication",
        label: "Media & Communication",
        description:
          "Reference media, catalogues, outbound communication and Drive administration",
        icon: "🖼️",
        renderer: "media-library",
        dataSource: "none",
        submodules: [
          {
            id: "driveManager",
            label: "Drive Administration",
            renderer: "drive-manager",
            dataSource: "none",
            hint: "OAuth, Drive accounts, quota, folder routing and connection health",
          },
          {
            id: "communicationCentre",
            label: "Outbound Communication",
            renderer: "communication-centre",
            dataSource: "none",
            hint: "Compose and track WhatsApp, email, catalogue and reference-media sends",
          },
        ],
      },
      {
        id: "hrStaff",
        label: "HR & Staff",
        description:
          "Staff board, attendance policies, payroll rules and salary computation",
        icon: "🧑‍💼",
        renderer: "staff-board",
        dataSource: "staff",
        activePredicate: (db) =>
          db.master.staff.some((staff) => staff.status === "active"),
        submodules: [
          {
            id: "attendancePayroll",
            label: "Attendance & Payroll Rules",
            renderer: "attendance-payroll",
            dataSource: "attendance",
          },
          {
            id: "staffSalary",
            label: "Staff Salary",
            renderer: "staff-salary",
            dataSource: "staff",
          },
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
        description:
          "Work categories, articles, rates, units and catalogue configuration",
        icon: "🧱",
        renderer: "masters",
        activePredicate: (db) =>
          db.master.articles.length > 0 ||
          db.master.contractors.length > 0,
        dataSource: "master-categories",
        submodules: [
          {
            id: "articleVariants",
            label: "Article Variants",
            renderer: "article-variants",
            dataSource: "master-articles",
            hint: "Persisted brands, grades, finishes, sizes and variant-specific units",
          },
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
        description:
          "Grouped sales, collections, operations, profitability, exposure and tax reporting",
        icon: "📊",
        renderer: "reports-v2",
        activePredicate: (db) =>
          db.customers.length > 0 || db.workOrders.length > 0,
        dataSource: "none",
        submodules: [
          {
            id: "salesAnalytics",
            label: "Sales Analytics",
            renderer: "report-family",
            dataSource: "quotations",
            filter: { family: "sales" },
          },
          {
            id: "collectionAnalytics",
            label: "Collections Analytics",
            renderer: "report-family",
            dataSource: "payments",
            filter: { family: "collections" },
          },
          {
            id: "operationsAnalytics",
            label: "Operations & Staff Analytics",
            renderer: "report-family",
            dataSource: "staff",
            filter: { family: "operations" },
          },
          {
            id: "financialAnalytics",
            label: "Profitability, Exposure & Tax",
            renderer: "report-family",
            dataSource: "workOrders",
            filter: { family: "financial" },
          },
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
        description:
          "Users, roles, automation, approval policies, data tools and system controls",
        icon: "⚙️",
        renderer: "system",
        dataSource: "none",
        submodules: [
          {
            id: "userApprovals",
            label: "User Access Requests",
            renderer: "auth-users",
            dataSource: "none",
          },
          {
            id: "controlBrainWorkflows",
            label: "Control Brain",
            renderer: "control-brain",
            dataSource: "none",
          },
          {
            id: "approvalPolicies",
            label: "Approval Rules",
            renderer: "approval-policies",
            dataSource: "none",
          },
          {
            id: "auditLog",
            label: "Audit Log",
            renderer: "audit-log",
            dataSource: "none",
          },
          {
            id: "dataImport",
            label: "Data Import",
            renderer: "data-import",
            dataSource: "none",
          },
          {
            id: "dataExport",
            label: "Data Export",
            renderer: "data-export",
            dataSource: "none",
          },
          {
            id: "integrity",
            label: "Workspace Data Integrity",
            renderer: "integrity",
            dataSource: "none",
            hint: "Referential integrity, orphan detection, cascade-delete and repair",
          },
        ],
      },
    ],
  },
];

const MODULE_DISPLAY_ORDER = [
  "customerDesk",
  "workdesk",
  "salesPipeline",
  "fieldOperations",
  "siteExecution",
  "quotationDesk",
  "procurementInventory",
  "contractorDetail",
  "vendors",
  "masterSetup",
  "financeDesk",
  "mediaCommunication",
  "hrStaff",
  "reportsDesk",
  "systemSettings",
] as const;

const MODULE_DISPLAY_RANK = new Map<string, number>(
  MODULE_DISPLAY_ORDER.map((id, index) => [id, index]),
);

export const ALL_MODULES: ModuleDef[] = MODULE_GROUPS
  .flatMap((group) => group.modules)
  .sort(
    (left, right) =>
      (MODULE_DISPLAY_RANK.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (MODULE_DISPLAY_RANK.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );

export const ALL_SUBMODULES: Submodule[] = ALL_MODULES.flatMap(
  (module) => module.submodules,
);

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

  if (!routes.has("workdesk")) {
    throw new Error(
      "The module route registry must include the Workdesk Dashboard fallback route.",
    );
  }

  return routes;
}

export const MODULE_ROUTE_REGISTRY = buildModuleRouteRegistry();
export const REGISTERED_MODULE_IDS = new Set<string>(
  MODULE_ROUTE_REGISTRY.keys(),
);
export const DEFAULT_MODULE_ID = "workdesk";

export function findModule(id: string): ModuleDef | undefined {
  return ALL_MODULES.find((module) => module.id === id);
}

export function findSubmodule(
  id: string,
): { module?: ModuleDef; sub?: Submodule } {
  const route = MODULE_ROUTE_REGISTRY.get(id);
  if (!route?.isSubmodule) return {};

  const moduleDef = findModule(route.moduleId);
  const sub = moduleDef?.submodules.find(
    (candidate) => candidate.id === id,
  );
  return { module: moduleDef, sub };
}

export function getModuleRoute(id: string): ModuleRoute | undefined {
  return MODULE_ROUTE_REGISTRY.get(canonicalLegacyModuleId(id));
}

export function canonicalModuleId(id: string): string {
  const canonicalId = canonicalLegacyModuleId(id);
  return MODULE_ROUTE_REGISTRY.has(canonicalId)
    ? canonicalId
    : DEFAULT_MODULE_ID;
}

export function isRegisteredModuleId(id: string): boolean {
  return MODULE_ROUTE_REGISTRY.has(canonicalLegacyModuleId(id));
}

export function resolveRenderer(id: string): ModuleRoute {
  return MODULE_ROUTE_REGISTRY.get(canonicalModuleId(id))!;
}

function stableFilter(filter?: Record<string, string>) {
  if (!filter) return "";
  return Object.entries(filter)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
}

export function validateModuleRegistry(): string[] {
  const issues: string[] = [];

  for (const route of MODULE_ROUTE_REGISTRY.values()) {
    if (!route.id.trim()) issues.push("A module route has an empty id.");
    if (!route.label.trim()) {
      issues.push(`Module route ${route.id} has an empty label.`);
    }
    if (!route.renderer) {
      issues.push(`Module route ${route.id} has no screen renderer.`);
    }
    if (
      route.isSubmodule &&
      !MODULE_ROUTE_REGISTRY.has(route.moduleId)
    ) {
      issues.push(
        `Submodule ${route.id} points to missing module ${route.moduleId}.`,
      );
    }
  }

  const signatures = new Map<string, ModuleRoute>();
  for (const route of MODULE_ROUTE_REGISTRY.values()) {
    const signature = [
      route.renderer,
      route.dataSource || "",
      stableFilter(route.filter),
    ].join("::");
    const previous = signatures.get(signature);
    if (previous && previous.moduleId === route.moduleId) {
      issues.push(
        `Semantic duplicate routes ${previous.id} and ${route.id} use the same renderer, data source and filter inside ${route.moduleId}.`,
      );
    } else {
      signatures.set(signature, route);
    }
  }

  return issues;
}

export function groupSubmoduleCount(groupId: string): number {
  const group = MODULE_GROUPS.find((entry) => entry.id === groupId);
  return group
    ? group.modules.reduce(
        (count, moduleDef) => count + moduleDef.submodules.length,
        0,
      )
    : 0;
}

export function moduleSubmoduleCount(moduleId: string): number {
  const moduleDef = findModule(moduleId);
  return moduleDef ? moduleDef.submodules.length : 0;
}

export function groupActiveCount(
  groupId: string,
  db: import("./types").RDashDatabase,
): number {
  const group = MODULE_GROUPS.find((entry) => entry.id === groupId);
  if (!group) return 0;

  return group.modules.reduce(
    (count, moduleDef) =>
      count + (moduleDef.activePredicate?.(db) ? 1 : 0),
    0,
  );
}
