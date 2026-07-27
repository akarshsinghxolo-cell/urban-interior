import type { RDashDatabase, Staff, Task, Visit, AttendanceRecord } from "./types";
import { createDefaultAttendancePolicy } from "./attendance-policy";

export const STAFF_ROLE_KEYS = [
  "OWNER",
  "OPERATIONS_MANAGER",
  "FIELD_STAFF",
  "SALES_TELECALLER",
  "PROCUREMENT_STAFF",
  "FINANCE",
  "ACCOUNTS_ADMIN",
] as const;

export type StaffRoleKey = typeof STAFF_ROLE_KEYS[number];

export const STAFF_ROLE_LABELS: Record<StaffRoleKey, string> = {
  OWNER: "Owner",
  OPERATIONS_MANAGER: "Operations Manager",
  FIELD_STAFF: "Field Staff",
  SALES_TELECALLER: "Sales / Telecaller",
  PROCUREMENT_STAFF: "Procurement Staff",
  FINANCE: "Finance",
  ACCOUNTS_ADMIN: "Accounts / Admin",
};

export const STAFF_ROLE_BY_LABEL: Record<string, StaffRoleKey> = Object.fromEntries(
  Object.entries(STAFF_ROLE_LABELS).flatMap(([key, label]) => [
    [label.toLowerCase(), key],
    [key.toLowerCase(), key],
  ]),
) as Record<string, StaffRoleKey>;

export type StaffPermissionAction = "view" | "create" | "update" | "approve" | "delete";
export interface StaffPermissionRecord {
  id: string;
  role_key: StaffRoleKey;
  module_key: string;
  module_label: string;
  can_view: boolean;
  can_create: boolean;
  can_update: boolean;
  can_approve: boolean;
  can_delete: boolean;
  updated_at: string;
}

export interface PayrollPeriodRecord {
  id: string;
  month: number;
  year: number;
  status: "draft" | "generated" | "approved" | "paid" | "cancelled";
  generated_at: string;
  approved_by_staff_id?: string;
}

export interface PayrollLineRecord {
  id: string;
  payroll_period_id: string;
  staff_id: string;
  base_salary: number;
  present_days: number;
  absent_days: number;
  paid_leave_days: number;
  overtime_amount: number;
  advance_deduction: number;
  other_deductions: number;
  gross_pay: number;
  net_payable: number;
  payment_status: "pending" | "approved" | "paid" | "held";
  deduction_explanation?: string;
  calendar_reason_map?: Array<{ date: string; reason: string; amount: number }>;
}

export interface SalaryAdjustmentRecord {
  id: string;
  staff_id: string;
  payroll_period_id?: string;
  adjustment_date: string;
  type: "overtime" | "advance" | "deduction" | "bonus" | "hold";
  amount: number;
  reason: string;
  status: "draft" | "approved" | "rejected";
  approved_by_staff_id?: string;
}

export interface LeaveRequestRecord {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  leave_type: "paid" | "unpaid" | "sick" | "casual";
  status: "requested" | "approved" | "rejected" | "cancelled";
  reason?: string;
  approved_by_staff_id?: string;
}

export interface StaffDocumentRecord {
  id: string;
  staff_id: string;
  document_type: "photo" | "aadhaar" | "pan" | "id_proof" | "address_proof" | "bank" | "other";
  document_no?: string;
  file_asset_id?: string;
  status: "pending" | "verified" | "expired" | "rejected";
  created_at: string;
}

export const STAFF_MODULES = [
  ["workspace", "Workspace"],
  ["customers", "Customers"],
  ["sites", "Sites & Execution"],
  ["work", "Work Required"],
  ["quotations", "Quotations"],
  ["workOrders", "Work Orders"],
  ["boqs", "BOQ"],
  ["tasks", "Tasks"],
  ["visits", "Visits"],
  ["attendance", "Attendance"],
  ["gps", "GPS Tracking"],
  ["vendors", "Vendors & Vendor Rates"],
  ["contractors", "Contractors"],
  ["procurement", "Procurement"],
  ["purchaseOrders", "Purchase Orders"],
  ["grns", "GRN / Receipts"],
  ["inventory", "Inventory"],
  ["finance", "Finance"],
  ["payroll", "Payroll"],
  ["staff", "Staff Master"],
  ["masters", "Master Setup"],
  ["media", "Files & Media"],
  ["approvals", "Approvals & Control"],
  ["reports", "Reports"],
  ["system", "System"],
] as const;

function permission(role: StaffRoleKey, module: string, label: string, actions: Partial<Record<StaffPermissionAction, boolean>>): StaffPermissionRecord {
  const updated_at = new Date().toISOString();
  return {
    id: `perm-${role.toLowerCase()}-${module}`,
    role_key: role,
    module_key: module,
    module_label: label,
    can_view: Boolean(actions.view),
    can_create: Boolean(actions.create),
    can_update: Boolean(actions.update),
    can_approve: Boolean(actions.approve),
    can_delete: Boolean(actions.delete),
    updated_at,
  };
}

export function normalizeRoleKey(role: string | undefined): StaffRoleKey {
  const key = STAFF_ROLE_BY_LABEL[String(role || "").trim().toLowerCase()];
  return key || "FIELD_STAFF";
}

export function roleLabel(roleKey: string | undefined): string {
  return STAFF_ROLE_LABELS[(roleKey || "") as StaffRoleKey] || roleKey || "Field Staff";
}

export function createDefaultStaffPermissions(): StaffPermissionRecord[] {
  const rows: StaffPermissionRecord[] = [];
  for (const [module, label] of STAFF_MODULES) {
    rows.push(permission("OWNER", module, label, { view: true, create: true, update: true, approve: true, delete: true }));
  }
  const matrix: Record<StaffRoleKey, Record<string, Partial<Record<StaffPermissionAction, boolean>>>> = {
    OWNER: {},
    OPERATIONS_MANAGER: {
      workspace: { view: true },
      customers: { view: true, create: true, update: true },
      sites: { view: true, create: true, update: true, approve: true },
      work: { view: true, create: true, update: true, approve: true },
      quotations: { view: true, create: true, update: true, approve: true },
      workOrders: { view: true, create: true, update: true, approve: true },
      boqs: { view: true, create: true, update: true, approve: true },
      tasks: { view: true, create: true, update: true, approve: true },
      visits: { view: true, create: true, update: true, approve: true },
      attendance: { view: true, update: true, approve: true },
      gps: { view: true },
      vendors: { view: true, create: true, update: true, approve: true },
      contractors: { view: true, create: true, update: true, approve: true },
      procurement: { view: true, create: true, update: true, approve: true },
      purchaseOrders: { view: true, create: true, update: true, approve: true },
      grns: { view: true, create: true, update: true, approve: true },
      inventory: { view: true, create: true, update: true },
      finance: { view: true },
      payroll: { view: true },
      staff: { view: true, create: true, update: true, approve: true },
      masters: { view: true, update: true },
      media: { view: true, create: true, update: true },
      approvals: { view: true, update: true, approve: true },
      reports: { view: true },
      system: { view: true },
    },
    FIELD_STAFF: {
      workspace: { view: true },
      sites: { view: true },
      work: { view: true },
      tasks: { view: true, update: true },
      visits: { view: true, create: true, update: true },
      attendance: { view: true, create: true, update: true },
      gps: { view: true, create: true },
      procurement: { view: true, create: true },
      grns: { view: true, create: true },
      inventory: { view: true },
      media: { view: true, create: true },
    },
    SALES_TELECALLER: {
      workspace: { view: true },
      customers: { view: true, create: true, update: true },
      sites: { view: true, create: true, update: true },
      work: { view: true, create: true, update: true },
      quotations: { view: true, create: true, update: true },
      tasks: { view: true, create: true, update: true },
      visits: { view: true, create: true },
      media: { view: true, create: true },
      reports: { view: true },
    },
    PROCUREMENT_STAFF: {
      workspace: { view: true },
      vendors: { view: true, create: true, update: true },
      procurement: { view: true, create: true, update: true },
      purchaseOrders: { view: true, create: true, update: true },
      grns: { view: true, create: true, update: true },
      inventory: { view: true, create: true, update: true },
      masters: { view: true },
      media: { view: true, create: true },
      reports: { view: true },
    },
    FINANCE: {
      workspace: { view: true },
      quotations: { view: true },
      procurement: { view: true },
      purchaseOrders: { view: true },
      grns: { view: true },
      inventory: { view: true },
      finance: { view: true, create: true, update: true, approve: true },
      payroll: { view: true, create: true, update: true, approve: true },
      staff: { view: true },
      reports: { view: true },
    },
    ACCOUNTS_ADMIN: {
      workspace: { view: true },
      procurement: { view: true },
      inventory: { view: true },
      finance: { view: true, create: true, update: true },
      payroll: { view: true, create: true, update: true },
      reports: { view: true },
    },
  };
  for (const role of STAFF_ROLE_KEYS.filter((role) => role !== "OWNER")) {
    const config = matrix[role] || {};
    for (const [module, label] of STAFF_MODULES) {
      rows.push(permission(role, module, label, config[module] || {}));
    }
  }
  return rows;
}

export function canRole(permissions: StaffPermissionRecord[], role: string, moduleKey: string, action: StaffPermissionAction): boolean {
  const roleKey = normalizeRoleKey(role);
  const row = permissions.find((entry) => entry.role_key === roleKey && entry.module_key === moduleKey);
  if (!row) return roleKey === "OWNER";
  return Boolean(row[`can_${action}` as keyof StaffPermissionRecord]);
}


export function normalizeStaffPermissions(input: unknown[] | undefined): StaffPermissionRecord[] {
  if (!Array.isArray(input) || !input.length) return createDefaultStaffPermissions();
  const labels = new Map(STAFF_MODULES.map(([module, label]) => [module, label]));
  const rows = new Map(
    createDefaultStaffPermissions().map((row) => [`${row.role_key}:${row.module_key}`, row]),
  );
  for (const raw of input as Array<Partial<StaffPermissionRecord> & Record<string, unknown>>) {
    const role_key = normalizeRoleKey(String(raw.role_key || raw.roleId || raw.role || ""));
    const module_key = String(raw.module_key || raw.moduleKey || "").trim();
    if (!module_key) continue;
    const key = `${role_key}:${module_key}`;
    const module_label = String(raw.module_label || raw.moduleLabel || labels.get(module_key as typeof STAFF_MODULES[number][0]) || module_key);
    rows.set(key, {
      id: String(raw.id || `perm-${role_key.toLowerCase()}-${module_key}`),
      role_key,
      module_key,
      module_label,
      can_view: Boolean(raw.can_view ?? raw.canView),
      can_create: Boolean(raw.can_create ?? raw.canCreate),
      can_update: Boolean(raw.can_update ?? raw.canUpdate),
      can_approve: Boolean(raw.can_approve ?? raw.canApprove),
      can_delete: Boolean(raw.can_delete ?? raw.canDelete),
      updated_at: String(raw.updated_at || raw.updatedAt || new Date().toISOString()),
    });
  }
  return [...rows.values()];
}

const ROUTE_PERMISSION_BY_ID: Record<string, string> = {
  workdesk: "workspace", today: "workspace", calendarRecurring: "tasks", tasks: "tasks", blockedRisks: "approvals", approvals: "approvals",
  customerDesk: "customers", customerTimeline: "customers",
  siteExecution: "sites", siteAreas: "sites", siteWorkRequired: "work", siteContractorBids: "workOrders", siteWorkOrders: "workOrders", boq: "boqs",
  quotationDesk: "quotations", quotationDrafts: "quotations", quotationSent: "quotations", quotationAccepted: "quotations", quotationConfig: "quotations",
  fieldOperations: "visits", siteMeasurement: "visits", visitProofs: "visits", fieldMode: "visits", gpsTracking: "gps",
  procurementInventory: "procurement", procurement: "procurement", grn: "grns", inventory: "inventory", dispatch: "inventory", vendorBills: "finance",
  financeDesk: "finance", payments: "finance", invoices: "finance", contractorPayments: "finance", workOrderPnl: "finance", gstReturns: "finance",
  mediaCommunication: "media", mediaCatalogues: "media", communicationCentre: "media",
  masterSetup: "masters", workCategoryMaster: "masters", vendorRates: "vendors", rateFinder: "vendors", vendors: "vendors", contractors: "contractors",
  reportsDesk: "reports", salesReport: "reports", collectionReport: "reports", jobPnlReport: "reports", vendorExposureReport: "reports", taxReport: "reports", staffProductivity: "reports", quotationConversion: "reports", leadSourceReport: "reports", agingReportRep: "reports", visitCompliance: "reports", taskThroughput: "reports",
  systemSettings: "system", usersRoles: "staff", staff: "staff", attendancePayroll: "payroll", staffSalary: "payroll", hrStaff: "staff", controlBrainWorkflows: "approvals", approvalPolicies: "approvals", auditLog: "system", dataImport: "system", dataExport: "system",
};

const DATA_SOURCE_PERMISSION: Record<string, string> = {
  tasks: "tasks", followups: "tasks", visits: "visits", quotations: "quotations", payments: "finance", invoices: "finance", workOrders: "workOrders", customers: "customers", approvals: "approvals", risks: "approvals", blocked: "approvals", vendors: "vendors", contractors: "contractors", staff: "staff", boqs: "boqs", purchaseOrders: "purchaseOrders", grns: "grns", inventory: "inventory", dispatches: "inventory", vendorBills: "finance", commissions: "finance", drawings: "sites", executionLogs: "sites", threads: "media", attendance: "attendance",
};

export function permissionModuleForRoute(route: { id?: string; dataSource?: string; renderer?: string } | undefined): string {
  if (!route) return "workspace";
  if (route.id && ROUTE_PERMISSION_BY_ID[route.id]) return ROUTE_PERMISSION_BY_ID[route.id];
  if (route.dataSource && DATA_SOURCE_PERMISSION[route.dataSource]) return DATA_SOURCE_PERMISSION[route.dataSource];
  switch (route.renderer) {
    case "quotations": return "quotations";
    case "procurement": return "procurement";
    case "grn": return "grns";
    case "inventory": return "inventory";
    case "media-library": return "media";
    case "staff-board": return "staff";
    case "attendance-payroll": return "payroll";
    case "staff-salary": return "payroll";
    case "reports-v2": return "reports";
    case "system": return "system";
    default: return "workspace";
  }
}

export function moduleForCollection(collection: string): string {
  if (collection.startsWith("master.")) {
    const key = collection.slice("master.".length);
    if (["staff"].includes(key)) return "staff";
    if (["vendors", "vendorRates", "vendorRateHistories"].includes(key)) return "vendors";
    if (key === "contractors") return "contractors";
    if (["fileAssets", "catalogues", "catalogueArticleVendorLinks", "pinterestBoards", "referenceMedia", "storageAccounts", "storageFolderTemplates", "storageFolderInstances"].includes(key)) return "media";
    return "masters";
  }
  const map: Record<string, string> = {
    customers: "customers",
    sites: "sites",
    areas: "sites",
    workRequired: "work",
    measurementRevisions: "work",
    quotations: "quotations",
    acceptedScopes: "quotations",
    workOrders: "workOrders",
    boqs: "boqs",
    purchaseOrders: "purchaseOrders",
    vendorRfqs: "procurement",
    vendorBids: "procurement",
    grns: "grns",
    inventory: "inventory",
    stockMovements: "inventory",
    vendorBills: "finance",
    vendorPayments: "finance",
    contractorBills: "finance",
    contractorPayments: "finance",
    commissions: "finance",
    payments: "finance",
    invoices: "finance",
    customerReceipts: "finance",
    workOrderCostLines: "finance",
    visits: "visits",
    tasks: "tasks",
    attendance: "attendance",
    staffLocationPings: "gps",
    staffRolePermissions: "staff",
    staffAuthUsers: "staff",
    leaveRequests: "payroll",
    payrollPeriods: "payroll",
    payrollLines: "payroll",
    salaryAdjustments: "payroll",
    staffDocuments: "staff",
    approvalPolicies: "approvals",
    automationRules: "approvals",
    recurringTasks: "tasks",
    actions: "approvals",
    blocked: "approvals",
    risks: "approvals",
    threads: "workspace",
    followups: "tasks",
    commSends: "customers",
    entityFileAttachments: "media",
    entityReferenceAssignments: "media",
    dispatches: "procurement",
    drawings: "media",
    executionLogs: "sites",
    variationRequests: "work",
    reports: "reports",
  };
  return map[collection] || "workspace";
}

export function enrichStaffProfiles(staff: Staff[]): Staff[] {
  return staff.map((member, index) => {
    const role_key = normalizeRoleKey((member as Staff & { role_key?: string }).role_key || member.role);
    const policy = member.attendance_policy || createDefaultAttendancePolicy();
    return {
      ...member,
      code: (member as Staff & { code?: string }).code || `STF-${String(index + 1).padStart(3, "0")}`,
      role_key,
      role: roleLabel(role_key),
      department: (member as Staff & { department?: string }).department || departmentForRole(role_key),
      designation: (member as Staff & { designation?: string }).designation || roleLabel(role_key),
      status: member.status || "active",
      salary_type: (member as Staff & { salary_type?: string }).salary_type || "monthly",
      monthly_salary: member.monthly_salary || defaultSalaryForRole(role_key),
      daily_wage: (member as Staff & { daily_wage?: number }).daily_wage || Math.round(defaultSalaryForRole(role_key) / 30),
      gps_tracking_enabled: member.gps_tracking_enabled !== false,
      attendance_policy: policy,
    } as Staff;
  });
}

function departmentForRole(role: StaffRoleKey) {
  switch (role) {
    case "OWNER": return "Management";
    case "OPERATIONS_MANAGER": return "Operations";
    case "FIELD_STAFF": return "Field Execution";
    case "SALES_TELECALLER": return "Sales";
    case "PROCUREMENT_STAFF": return "Procurement";
    case "FINANCE":
    case "ACCOUNTS_ADMIN": return "Finance";
  }
}

function defaultSalaryForRole(role: StaffRoleKey) {
  switch (role) {
    case "OWNER": return 0;
    case "OPERATIONS_MANAGER": return 45000;
    case "FIELD_STAFF": return 24000;
    case "SALES_TELECALLER": return 22000;
    case "PROCUREMENT_STAFF": return 26000;
    case "FINANCE": return 32000;
    case "ACCOUNTS_ADMIN": return 28000;
  }
}

export function createSeedStaffProfiles(): Staff[] {
  return enrichStaffProfiles([
    { id: "staff-owner", name: "Owner", phone: "+91 9000003000", role: "Owner", status: "active", city: "Gorakhpur", attendance_policy: createDefaultAttendancePolicy(), monthly_salary: 0 } as Staff,
    { id: "staff-ops", name: "Anita Rao", phone: "+91 9000003001", role: "Operations Manager", status: "active", city: "Gorakhpur", attendance_policy: createDefaultAttendancePolicy(), monthly_salary: 45000 } as Staff,
    { id: "staff-field", name: "Ravi Kumar", phone: "+91 9000003002", role: "Field Staff", status: "active", city: "Gorakhpur", attendance_policy: createDefaultAttendancePolicy(), monthly_salary: 24000 } as Staff,
    { id: "staff-finance", name: "Meera Nair", phone: "+91 9000003003", role: "Finance", status: "active", city: "Gorakhpur", attendance_policy: createDefaultAttendancePolicy(), monthly_salary: 32000 } as Staff,
    { id: "staff-sales", name: "Pooja Singh", phone: "+91 9000003004", role: "Sales / Telecaller", status: "active", city: "Gorakhpur", attendance_policy: createDefaultAttendancePolicy(), monthly_salary: 22000 } as Staff,
    { id: "staff-procurement", name: "Vikas Tiwari", phone: "+91 9000003005", role: "Procurement Staff", status: "active", city: "Gorakhpur", attendance_policy: createDefaultAttendancePolicy(), monthly_salary: 26000 } as Staff,
  ]);
}

export function createSeedAttendanceRecords(staff: Staff[]): AttendanceRecord[] {
  const today = new Date().toISOString().slice(0, 10);
  return enrichStaffProfiles(staff).map((member, index) => {
    const absent = member.id === "staff-sales";
    const half = member.id === "staff-procurement";
    return {
      id: `att-${today}-${member.id}`,
      staff_id: member.id,
      staff_name: member.name,
      date: today,
      attendance_mode: "office",
      check_in: absent ? undefined : `${today}T${String(9 + Math.min(index, 1)).padStart(2, "0")}:${index === 2 ? "55" : "28"}:00.000+05:30`,
      check_out: absent || half ? undefined : `${today}T18:05:00.000+05:30`,
      check_in_latitude: 26.7398,
      check_in_longitude: 83.3712,
      check_in_accuracy_m: 18,
      check_in_verification: "verified",
      check_in_source: "gps",
      late_minutes: index === 2 ? 25 : 0,
      late: index === 2,
      status: absent ? "absent" : half ? "half_day" : "present",
      work_minutes: absent ? 0 : half ? 230 : 510,
      location: "Urban Interior Office",
      review_required: index === 2,
      review_note: index === 2 ? "Late by 25 minutes; visible in payroll calendar." : undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as AttendanceRecord;
  });
}

export function createSeedVisits(): Visit[] {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  return [
    {
      id: "visit-das-measurement-today",
      customer_id: "cust-das",
      site_id: "site-das-apartment",
      work_required_id: "work-das-ceiling",
      staff_id: "staff-field",
      staff_name: "Ravi Kumar",
      visit_type: "measurement",
      status: "checked_in",
      location_name: "Das Residence — Master Bedroom",
      scheduled_at: `${today}T11:00:00.000+05:30`,
      check_in_at: `${today}T11:08:00.000+05:30`,
      check_in_latitude: 26.7398,
      check_in_longitude: 83.3712,
      check_in_accuracy_m: 21,
      check_in_verification: "verified",
      proof_attachment_ids: [],
      notes: "Measurement and material verification visit.",
      created_at: now,
      updated_at: now,
    } as unknown as Visit,
    {
      id: "visit-aarav-followup-today",
      customer_id: "cust-aarav",
      site_id: "site-aarav-home",
      work_required_id: "work-aarav-kitchen",
      staff_id: "staff-sales",
      staff_name: "Pooja Singh",
      visit_type: "followup",
      status: "scheduled",
      location_name: "Mehta Residence — Kitchen discussion",
      scheduled_at: `${today}T16:30:00.000+05:30`,
      proof_attachment_ids: [],
      notes: "Quotation follow-up and material selection.",
      created_at: now,
      updated_at: now,
    } as unknown as Visit,
  ];
}

export function createSeedTasks(): Task[] {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  return [
    { id: "task-field-progress-photo", title: "Upload ceiling progress photos", description: "Attach before/after and material placement proof before checkout.", status: "todo", priority: "high", assignee_id: "staff-field", assignee_name: "Ravi Kumar", assigned_role: "Field Staff", due_date: today, task_scope: "site", task_type: "site_progress", site_id: "site-das-apartment", work_required_id: "work-das-ceiling", comments: [], checklist: [], proofs: [], created_at: now, updated_at: now },
    { id: "task-ops-approve-attendance", title: "Review Ravi late attendance", description: "Late check-in should be reviewed before payroll generation.", status: "review", priority: "medium", assignee_id: "staff-ops", assignee_name: "Anita Rao", assigned_role: "Operations Manager", due_date: today, task_scope: "office", task_type: "attendance_review", comments: [], checklist: [], proofs: [], created_at: now, updated_at: now },
    { id: "task-procurement-rate-check", title: "Confirm Build Mart invoice rate", description: "Vendor bill rate can update active vendor rate after approval.", status: "todo", priority: "medium", assignee_id: "staff-procurement", assignee_name: "Vikas Tiwari", assigned_role: "Procurement Staff", due_date: today, task_scope: "office", task_type: "vendor_rate_review", comments: [], checklist: [], proofs: [], created_at: now, updated_at: now },
    { id: "task-finance-payroll-draft", title: "Prepare monthly payroll draft", description: "Use attendance calendar reasons before releasing salary.", status: "todo", priority: "high", assignee_id: "staff-finance", assignee_name: "Meera Nair", assigned_role: "Finance", due_date: today, task_scope: "office", task_type: "payroll", comments: [], checklist: [], proofs: [], created_at: now, updated_at: now },
  ];
}

export function createSeedLocationPings(staff: Staff[]) {
  const now = new Date();
  return enrichStaffProfiles(staff).flatMap((member, index) => {
    if (member.id === "staff-owner") return [];
    return [0, 1, 2].map((step) => ({
      id: `ping-${member.id}-${step}`,
      staff_id: member.id,
      latitude: 26.7398 + index * 0.002 + step * 0.0004,
      longitude: 83.3712 + index * 0.002 + step * 0.0004,
      accuracy_m: 15 + step * 2,
      speed: step === 0 ? 0 : 12 + step,
      battery: 82 - step * 3,
      captured_at: new Date(now.getTime() - (2 - step) * 15 * 60_000).toISOString(),
      source: "device",
    }));
  });
}

export function createSeedPayroll(staff: Staff[]) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const period: PayrollPeriodRecord = {
    id: `payroll-${year}-${String(month).padStart(2, "0")}`,
    month,
    year,
    status: "generated",
    generated_at: now.toISOString(),
    approved_by_staff_id: "staff-owner",
  };
  const lines: PayrollLineRecord[] = enrichStaffProfiles(staff).filter((member) => member.id !== "staff-owner").map((member) => {
    const absentDays = member.id === "staff-sales" ? 1 : 0;
    const halfDays = member.id === "staff-procurement" ? 0.5 : 0;
    const lateDeduction = member.id === "staff-field" ? 250 : 0;
    const attendanceDeduction = Math.round(((member.monthly_salary || 0) / 30) * (absentDays + halfDays * 0.5));
    const otherDeductions = attendanceDeduction + lateDeduction;
    return {
      id: `payline-${period.id}-${member.id}`,
      payroll_period_id: period.id,
      staff_id: member.id,
      base_salary: member.monthly_salary || 0,
      present_days: 26 - absentDays - halfDays,
      absent_days: absentDays,
      paid_leave_days: 1,
      overtime_amount: member.id === "staff-field" ? 600 : 0,
      advance_deduction: 0,
      other_deductions: otherDeductions,
      gross_pay: (member.monthly_salary || 0) + (member.id === "staff-field" ? 600 : 0),
      net_payable: (member.monthly_salary || 0) + (member.id === "staff-field" ? 600 : 0) - otherDeductions,
      payment_status: "pending",
      deduction_explanation: otherDeductions ? "Attendance calendar contains late/absent deduction reasons." : "No deduction in this period.",
      calendar_reason_map: otherDeductions ? [{ date: now.toISOString().slice(0, 10), reason: member.id === "staff-field" ? "Late check-in beyond grace period" : member.id === "staff-sales" ? "Absent without approved leave" : "Half-day due to early exit", amount: otherDeductions }] : [],
    };
  });
  const adjustments: SalaryAdjustmentRecord[] = [
    { id: "adj-field-late-july", staff_id: "staff-field", payroll_period_id: period.id, adjustment_date: now.toISOString().slice(0, 10), type: "deduction", amount: 250, reason: "Late check-in beyond 20-minute grace; visible in staff salary calendar.", status: "approved", approved_by_staff_id: "staff-ops" },
  ];
  const leaves: LeaveRequestRecord[] = [
    { id: "leave-finance-casual", staff_id: "staff-finance", start_date: now.toISOString().slice(0, 10), end_date: now.toISOString().slice(0, 10), leave_type: "casual", status: "approved", reason: "Half-day bank documentation", approved_by_staff_id: "staff-owner" },
  ];
  const documents: StaffDocumentRecord[] = enrichStaffProfiles(staff).map((member) => ({ id: `doc-photo-${member.id}`, staff_id: member.id, document_type: "photo", file_asset_id: `staff-file-photo-${member.id}`, status: member.id === "staff-owner" || member.id === "staff-ops" ? "verified" : "pending", created_at: now.toISOString() }));
  return { period, lines, adjustments, leaves, documents };
}

export function assertStaffOperationAllowed(data: RDashDatabase, rolePermissions: StaffPermissionRecord[], role: string, staffId: string | undefined, collection: string, record: unknown) {
  const roleKey = normalizeRoleKey(role);
  if (roleKey === "OWNER" || roleKey === "OPERATIONS_MANAGER") return;
  const recordObj = record as Record<string, unknown> | undefined;
  const recordStaffId = recordObj?.staff_id || recordObj?.assigned_to_staff_id || recordObj?.assignee_id;
  const staffModule = moduleForCollection(collection);
  if (!canRole(rolePermissions, role, staffModule, "update") && !canRole(rolePermissions, role, staffModule, "create")) {
    throw new Error(`FORBIDDEN:${collection}`);
  }
  if (roleKey === "FIELD_STAFF") {
    // Field Staff must have a staff identity bound to their session.
    if (!staffId) {
      throw new Error(`FORBIDDEN:No staff identity for this account. Contact the owner to link your staff profile.`);
    }
    // If the record specifies a different staff_id, reject.
    if (recordStaffId && recordStaffId !== staffId) {
      throw new Error(`FORBIDDEN:Field Staff can change only their own ${collection}.`);
    }
    // Force-bind staff_id to the session's identity (don't trust the client).
    // This closes the bypass where a Field Staff omits staff_id to create
    // unowned records that pollute attendance/payroll/GPS views.
    if (recordObj) {
      recordObj.staff_id = staffId;
    }
  }
  const staff = staffId ? data.master.staff.find((member) => member.id === staffId) : undefined;
  if (staff && staff.status !== "active") {
    throw new Error(`FORBIDDEN:Inactive staff cannot create ${collection}.`);
  }
}
