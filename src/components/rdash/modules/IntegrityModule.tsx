// ============================================================================
// IntegrityModule — Data Integrity dashboard
// ============================================================================
// Surfaces the integrity layer (FK registry + checker + cascade-delete +
// repair) to managers. Renders:
//   1. Header with a circular health-score gauge (RadialBarChart) + KPIs
//   2. Action bar — Run check now / Auto-repair (with confirm) / Export CSV
//   3. Issues table — filterable by severity + collection, expandable rows
//   4. Duplicate IDs panel
//   5. Cascade-delete preview — pick a collection + record, see a dry-run,
//      then confirm to execute the real cascade delete
//   6. FK registry browser — collapsible tree of every FK in the data model
//
// All mutations go through the store actions (runIntegrityCheck /
// repairIntegrityNow / cascadeDeleteRecord), which wrap in
// runWorkspaceTransaction so they roll back if validateBusinessData throws.
// ============================================================================

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { IntegrityIssue, CascadeResult, ForeignKeyRule } from "@/lib/rdash/types";
import { FOREIGN_KEYS, parentCollections, childCollections } from "@/lib/rdash/integrity/fk-registry";
import { cascadeDelete } from "@/lib/rdash/integrity/cascade";
import { MetricCard, EmptyState } from "../primitives";
import { confirmDialog } from "../ConfirmDialog";
import { toast } from "sonner";
import {
    ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, Wrench, Trash2, Link2,
    RefreshCw, Download, ChevronRight, ChevronDown, Search, Ban, CheckCircle2,
    Database, Layers, FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from "recharts";

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

const SEVERITY_META: Record<IntegrityIssue["severity"], {
    label: string;
    badge: string;
    icon: React.ReactNode;
}> = {
    critical: {
        label: "Critical",
        badge: "bg-destructive/10 text-destructive border-destructive/20",
        icon: <ShieldX className="h-3 w-3" />,
    },
    warning: {
        label: "Warning",
        badge: "bg-warning/10 text-warning border-warning/20",
        icon: <ShieldAlert className="h-3 w-3" />,
    },
    info: {
        label: "Info",
        badge: "bg-primary/10 text-primary border-primary/20",
        icon: <ShieldCheck className="h-3 w-3" />,
    },
};

const POLICY_META: Record<ForeignKeyRule["onDelete"], { label: string; badge: string }> = {
    cascade: { label: "Cascade", badge: "bg-destructive/10 text-destructive border-destructive/20" },
    restrict: { label: "Restrict", badge: "bg-warning/10 text-warning border-warning/20" },
    nullify: { label: "Nullify", badge: "bg-primary/10 text-primary border-primary/20" },
    ignore: { label: "Ignore", badge: "bg-muted text-muted-foreground border-border" },
};

/** Map a collection name to the module id that owns it (for deep-linking
 *  from the issues table to the source record). Returns null if no module
 *  directly owns the collection. */
const COLLECTION_TO_MODULE: Record<string, string> = {
    customers: "customerDesk",
    sites: "siteExecution",
    areas: "siteExecution",
    workRequired: "siteExecution",
    quotations: "quotationDesk",
    acceptedScopes: "siteExecution",
    workOrders: "siteExecution",
    boqs: "boq",
    vendorRfqs: "procurement",
    vendorBids: "procurement",
    purchaseOrders: "procurement",
    grns: "grn",
    inventory: "inventory",
    stockMovements: "inventory",
    dispatches: "dispatch",
    vendorBills: "vendorBills",
    vendorPayments: "vendorBills",
    contractorBills: "contractorPayments",
    contractorPayments: "contractorPayments",
    commissions: "commissions",
    drawings: "drawings",
    executionLogs: "executionLogs",
    variationRequests: "siteExecution",
    visits: "siteMeasurement",
    tasks: "tasks",
    followups: "tasks",
    actions: "approvals",
    payments: "payments",
    invoices: "invoices",
    customerReceipts: "payments",
    blocked: "blockedRisks",
    risks: "blockedRisks",
    commSends: "communicationCentre",
    attendance: "attendancePayroll",
    staffLocationPings: "gpsTracking",
    leaveRequests: "staffSalary",
    payrollPeriods: "attendancePayroll",
    payrollLines: "attendancePayroll",
    salaryAdjustments: "staffSalary",
    staffDocuments: "staff",
    "master.vendors": "vendors",
    "master.contractors": "contractors",
    "master.staff": "staff",
};

function collectionToModule(collection: string): string | null {
    return COLLECTION_TO_MODULE[collection] || null;
}

/** Resolve the rows of a collection by name (top-level or master.*). */
function resolveCollectionRows(db: import("@/lib/rdash/types").RDashDatabase, name: string): Array<{ id: string } & Record<string, unknown>> {
    if (name.startsWith("master.")) {
        const key = name.slice("master.".length) as keyof import("@/lib/rdash/types").Master;
        const arr = db.master?.[key];
        return Array.isArray(arr) ? (arr as unknown as Array<{ id: string } & Record<string, unknown>>) : [];
    }
    const key = name as keyof import("@/lib/rdash/types").RDashDatabase;
    const arr = db[key];
    return Array.isArray(arr) ? (arr as unknown as Array<{ id: string } & Record<string, unknown>>) : [];
}

function csvEscape(value: unknown): string {
    if (value === null || value === undefined) return "";
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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

function formatDateTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    } catch {
        return iso;
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
    const color = score < 60 ? "var(--destructive)" : score < 80 ? "var(--warning)" : "var(--success)";
    const data = [{ name: "health", value: score, fill: color }];
    return (
        <div className="relative h-32 w-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                    innerRadius="70%"
                    outerRadius="100%"
                    data={data}
                    startAngle={90}
                    endAngle={90 + (360 * score) / 100}
                >
                    <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                    <RadialBar background={{ fill: "var(--muted)" }} dataKey="value" cornerRadius={8} angleAxisId={0} />
                </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="rd-tabular text-2xl font-bold leading-none" style={{ color }}>{score}</span>
                <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Health</span>
            </div>
        </div>
    );
}

function SeverityBadge({ severity }: { severity: IntegrityIssue["severity"] }) {
    const meta = SEVERITY_META[severity];
    return (
        <Badge variant="outline" className={cn("shrink-0 gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", meta.badge)}>
            {meta.icon}
            {meta.label}
        </Badge>
    );
}

function PolicyBadge({ policy }: { policy: ForeignKeyRule["onDelete"] }) {
    const meta = POLICY_META[policy];
    return (
        <Badge variant="outline" className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", meta.badge)}>
            {meta.label}
        </Badge>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────

export function IntegrityModule() {
    const db = useRDashStore((s) => s.db);
    const report = useRDashStore((s) => s.integrityReport);
    const runIntegrityCheck = useRDashStore((s) => s.runIntegrityCheck);
    const repairIntegrityNow = useRDashStore((s) => s.repairIntegrityNow);
    const cascadeDeleteRecord = useRDashStore((s) => s.cascadeDeleteRecord);
    const setActiveModule = useRDashStore((s) => s.setActiveModule);
    const openDetail = useRDashStore((s) => s.openDetail);

    // Run the first check on mount if no report is present.
    React.useEffect(() => {
        if (!useRDashStore.getState().integrityReport) {
            try {
                runIntegrityCheck();
            } catch (error) {
                toast.error("Integrity check failed", {
                    description: error instanceof Error ? error.message : undefined,
                });
            }
        }
    }, [runIntegrityCheck]);

    const [severityFilter, setSeverityFilter] = React.useState<string>("all");
    const [collectionFilter, setCollectionFilter] = React.useState<string>("all");
    const [q, setQ] = React.useState("");
    const [expandedIssue, setExpandedIssue] = React.useState<string | null>(null);

    // Cascade-delete preview state
    const [cascadeCollection, setCascadeCollection] = React.useState<string>("customers");
    const [cascadeRecordId, setCascadeRecordId] = React.useState<string>("");
    const [cascadeSoftDelete, setCascadeSoftDelete] = React.useState(false);
    const [cascadePreview, setCascadePreview] = React.useState<CascadeResult | null>(null);
    const [cascadeRunning, setCascadeRunning] = React.useState(false);

    // FK registry browser state
    const [fkSearch, setFkSearch] = React.useState("");

    // Derived data
    const collectionNames = React.useMemo(() => {
        const set = new Set<string>();
        for (const rule of FOREIGN_KEYS) {
            set.add(rule.collection);
            if (rule.targetCollection !== "polymorphic") {
                set.add(rule.targetCollection);
            }
        }
        return Array.from(set).sort();
    }, []);

    const filteredIssues = React.useMemo(() => {
        if (!report) return [];
        let list = report.issues;
        if (severityFilter !== "all") {
            list = list.filter((i) => i.severity === severityFilter);
        }
        if (collectionFilter !== "all") {
            list = list.filter((i) => i.collection === collectionFilter);
        }
        if (q.trim()) {
            const ql = q.toLowerCase();
            list = list.filter((i) =>
                i.message.toLowerCase().includes(ql) ||
                i.recordId.toLowerCase().includes(ql) ||
                i.targetId.toLowerCase().includes(ql) ||
                i.collection.toLowerCase().includes(ql) ||
                i.targetCollection.toLowerCase().includes(ql)
            );
        }
        return list;
    }, [report, severityFilter, collectionFilter, q]);

    const filteredFks = React.useMemo(() => {
        if (!fkSearch.trim()) return FOREIGN_KEYS;
        const ql = fkSearch.toLowerCase();
        return FOREIGN_KEYS.filter((r) =>
            r.collection.toLowerCase().includes(ql) ||
            r.field.toLowerCase().includes(ql) ||
            r.targetCollection.toLowerCase().includes(ql) ||
            r.label.toLowerCase().includes(ql)
        );
    }, [fkSearch]);

    // Cascade-delete preview records for the selected collection
    const cascadeRecords = React.useMemo(() => {
        return resolveCollectionRows(db, cascadeCollection).slice(0, 200).map((row) => ({
            id: String(row.id),
            label: (typeof row.name === "string" && row.name) ||
                (typeof row.title === "string" && row.title) ||
                (typeof row.quotation_no === "string" && row.quotation_no) ||
                (typeof row.work_order_no === "string" && row.work_order_no) ||
                (typeof row.po_no === "string" && row.po_no) ||
                (typeof row.bill_no === "string" && row.bill_no) ||
                String(row.id),
        }));
    }, [db, cascadeCollection]);

    const handleRunCheck = () => {
        try {
            const r = runIntegrityCheck();
            toast.success("Integrity check complete", {
                description: `${r.issues.length} issues found · health ${r.healthScore}`,
            });
        } catch (error) {
            toast.error("Integrity check failed", {
                description: error instanceof Error ? error.message : undefined,
            });
        }
    };

    const handleRepair = async () => {
        if (!report) {
            handleRunCheck();
            return;
        }
        const autoFixable = report.issues.filter((i) => i.autoFixable);
        if (autoFixable.length === 0 && report.duplicateIds.length === 0) {
            toast.info("Nothing to auto-repair", {
                description: "No auto-fixable issues detected. Resolve restrict-policy issues manually.",
            });
            return;
        }
        const detail = autoFixable.slice(0, 5).map((i) => `${i.collection}.${i.field}`).join(", ");
        const ok = await confirmDialog({
            title: "Run integrity auto-repair?",
            description:
                `This will fix ${autoFixable.length} auto-fixable issue(s) ` +
                `(${report.duplicateIds.length} duplicate-ID conflict(s)) by applying the ` +
                `cascade/nullify policies from the FK registry. ` +
                `Restrict-policy issues will be skipped. ` +
                (detail ? `Examples: ${detail}.` : "") +
                ` The workspace transaction will roll back if the repair would violate business rules.`,
            confirmLabel: "Run repair",
            danger: true,
        });
        if (!ok) return;
        try {
            const result = repairIntegrityNow();
            toast.success("Auto-repair complete", {
                description: `${result.repaired} fixed, ${result.skipped} skipped`,
                duration: 5000,
            });
        } catch (error) {
            toast.error("Auto-repair failed", {
                description: error instanceof Error ? error.message : undefined,
                duration: 8000,
            });
        }
    };

    const handleExportCsv = () => {
        if (!report) {
            toast.error("Run the check first");
            return;
        }
        const headers = ["severity", "collection", "record_id", "field", "target_collection", "target_id", "auto_fixable", "policy", "message"];
        const rows = report.issues.map((i) => [
            i.severity, i.collection, i.recordId, i.field, i.targetCollection, i.targetId,
            i.autoFixable ? "yes" : "no", i.rule.onDelete, i.message,
        ].map(csvEscape).join(","));
        const csv = [
            `# Urban Castle Integrity Report — generated ${report.generatedAt}`,
            `# healthScore=${report.healthScore} totalRecords=${report.totalRecords} totalReferences=${report.totalReferences}`,
            `# bySeverity: critical=${report.bySeverity.critical} warning=${report.bySeverity.warning} info=${report.bySeverity.info}`,
            `# duplicateIds: ${report.duplicateIds.length} conflict(s)`,
            headers.join(","),
            ...rows,
        ].join("\n");
        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        downloadFile(csv, `integrity-report-${ts}.csv`, "text/csv;charset=utf-8");
        toast.success(`Exported ${report.issues.length} issues to CSV`);
    };

    const handleCascadePreview = () => {
        if (!cascadeRecordId) {
            toast.error("Pick a record first");
            return;
        }
        try {
            const result = cascadeDelete(db, cascadeCollection, cascadeRecordId, {
                softDelete: cascadeSoftDelete,
            }).result;
            setCascadePreview(result);
        } catch (error) {
            toast.error("Cascade preview failed", {
                description: error instanceof Error ? error.message : undefined,
            });
        }
    };

    const handleCascadeExecute = async () => {
        if (!cascadeRecordId) return;
        const ok = await confirmDialog({
            title: `Cascade-delete ${cascadeCollection} "${cascadeRecordId}"?`,
            description:
                cascadePreview
                    ? `This will delete ${cascadePreview.deleted.length} record(s), nullify ${cascadePreview.nullified.length} reference(s)${cascadeSoftDelete ? " (soft-delete mode)" : ""}. The transaction rolls back if any restrict rule blocks it or if the result fails business-rule validation.`
                    : "Run a dry-run preview first to see what would be deleted.",
            confirmLabel: cascadeSoftDelete ? "Soft-delete" : "Delete",
            danger: !cascadeSoftDelete,
        });
        if (!ok) return;
        setCascadeRunning(true);
        try {
            const result = cascadeDeleteRecord(cascadeCollection, cascadeRecordId, { softDelete: cascadeSoftDelete });
            if (!result.success) {
                const blockedCount = result.blocked.length;
                toast.error("Cascade-delete blocked", {
                    description: `${blockedCount} restrict-policy reference(s) prevent deletion. First record: ${result.blocked[0]?.reason || "unknown"}`,
                    duration: 8000,
                });
            } else {
                toast.success("Cascade-delete complete", {
                    description: `${result.deleted.length} deleted, ${result.nullified.length} nullified${result.softDeleted.length ? `, ${result.softDeleted.length} soft-deleted` : ""}`,
                    duration: 5000,
                });
                setCascadePreview(null);
                setCascadeRecordId("");
            }
        } catch (error) {
            toast.error("Cascade-delete failed", {
                description: error instanceof Error ? error.message : undefined,
                duration: 8000,
            });
        } finally {
            setCascadeRunning(false);
        }
    };

    const handleIssueClick = (issue: IntegrityIssue) => {
        // Deep-link to the source record's module if possible.
        const moduleId = collectionToModule(issue.collection);
        if (moduleId) {
            setActiveModule(moduleId);
            // Try to open the detail panel for the record (works for some
            // kinds only — DetailPanelKind covers ~24 types).
            const kindMap: Record<string, import("@/lib/rdash/store/ui-types").DetailPanelKind> = {
                customers: "customer",
                sites: "site",
                areas: "area",
                workRequired: "workRequired",
                quotations: "quotation",
                workOrders: "workOrder",
                boqs: "boq",
                purchaseOrders: "po",
                grns: "grn",
                dispatches: "dispatch",
                vendorBills: "vendorBill",
                inventory: "inventory",
                tasks: "task",
                followups: "followup",
                visits: "visit",
                payments: "payment",
                invoices: "invoice",
                blocked: "blocked",
                commissions: "commission",
                "master.vendors": "vendor",
                "master.contractors": "contractor",
                "master.staff": "staff",
            };
            const kind = kindMap[issue.collection];
            if (kind) {
                try {
                    openDetail(kind, issue.recordId, "integrity");
                } catch {
                    // Detail panel may not support this kind/record combo — silent fail.
                }
            }
        }
    };

    // ── Render ─────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-5">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <ShieldCheck className="h-5 w-5" />
                    </span>
                    <div>
                        <h2 className="text-lg font-bold tracking-tight">Data Integrity</h2>
                        <p className="text-xs text-muted-foreground">
                            Referential integrity, orphan detection, cascade-delete & repair across 56 collections
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={handleRunCheck}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Run check
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleRepair}>
                        <Wrench className="mr-1.5 h-3.5 w-3.5" /> Auto-repair
                    </Button>
                    <Button size="sm" onClick={handleExportCsv}>
                        <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
                    </Button>
                </div>
            </div>

            {/* Top section: health gauge + KPIs (responsive grid) */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Health gauge card */}
                <Card className="lg:col-span-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <ShieldCheck className="h-4 w-4 text-primary" /> Workspace health
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center gap-4 pt-0">
                        {report ? (
                            <>
                                <HealthGauge score={report.healthScore} />
                                <div className="flex min-w-0 flex-col gap-1.5 text-xs">
                                    <p className="text-[11px] text-muted-foreground">
                                        {report.healthScore >= 80 ? "All clear — no critical issues." :
                                            report.healthScore >= 60 ? "Some warnings — review below." :
                                            "Critical issues found — repair needed."}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        Last check: {formatDateTime(report.generatedAt)}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        References: {report.totalReferences.toLocaleString("en-IN")} · Records: {report.totalRecords.toLocaleString("en-IN")}
                                    </p>
                                </div>
                            </>
                        ) : (
                            <div className="flex h-32 w-full items-center justify-center text-xs text-muted-foreground">
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Running first check…
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* KPI cards */}
                <div className="grid grid-cols-2 gap-3 lg:col-span-2 sm:grid-cols-4">
                    <MetricCard
                        label="Critical"
                        value={report?.bySeverity.critical ?? 0}
                        tone={report && report.bySeverity.critical > 0 ? "destructive" : "success"}
                        icon={<ShieldX className="h-4 w-4" />}
                        hint="Broken required references"
                    />
                    <MetricCard
                        label="Warnings"
                        value={report?.bySeverity.warning ?? 0}
                        tone={report && report.bySeverity.warning > 0 ? "warning" : "default"}
                        icon={<ShieldAlert className="h-4 w-4" />}
                        hint="Missing optional references"
                    />
                    <MetricCard
                        label="Auto-fixable"
                        value={report ? report.issues.filter((i) => i.autoFixable).length : 0}
                        tone="primary"
                        icon={<Wrench className="h-4 w-4" />}
                        hint="Cascade + nullify issues"
                    />
                    <MetricCard
                        label="Dup IDs"
                        value={report ? report.duplicateIds.length : 0}
                        tone={report && report.duplicateIds.length > 0 ? "destructive" : "success"}
                        icon={<FileWarning className="h-4 w-4" />}
                        hint="Duplicate ID conflicts"
                    />
                </div>
            </div>

            {/* Issues table */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <AlertTriangle className="h-4 w-4 text-warning" /> Integrity issues
                            {report && (
                                <Badge variant="secondary" className="rounded-full text-[10px] font-semibold">
                                    {report.issues.length}
                                </Badge>
                            )}
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Search issues…"
                                    className="h-8 w-44 pl-7 text-xs"
                                />
                            </div>
                            <Select value={severityFilter} onValueChange={setSeverityFilter}>
                                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All severities</SelectItem>
                                    <SelectItem value="critical">Critical</SelectItem>
                                    <SelectItem value="warning">Warning</SelectItem>
                                    <SelectItem value="info">Info</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={collectionFilter} onValueChange={setCollectionFilter}>
                                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="max-h-72">
                                    <SelectItem value="all">All collections</SelectItem>
                                    {collectionNames.map((c) => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    {!report ? (
                        <EmptyState
                            title="No report yet"
                            description="Click 'Run check' to scan the workspace."
                            icon={<RefreshCw className="h-6 w-6" />}
                        />
                    ) : filteredIssues.length === 0 ? (
                        <EmptyState
                            title={report.issues.length === 0 ? "Workspace is clean" : "No issues match your filters"}
                            description={report.issues.length === 0
                                ? "No referential integrity problems detected. Every foreign key resolves to a valid parent record."
                                : "Try adjusting the severity or collection filter."}
                            icon={<CheckCircle2 className="h-6 w-6" />}
                            tone="success"
                        />
                    ) : (
                        <div className="max-h-[28rem] overflow-y-auto rd-scroll">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8" />
                                        <TableHead className="w-24">Severity</TableHead>
                                        <TableHead className="w-44">Collection</TableHead>
                                        <TableHead className="w-32">Record</TableHead>
                                        <TableHead className="w-36">Field</TableHead>
                                        <TableHead className="w-40">Target</TableHead>
                                        <TableHead>Message</TableHead>
                                        <TableHead className="w-20">Fixable</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredIssues.map((issue) => {
                                        const expanded = expandedIssue === issue.id;
                                        return (
                                            <React.Fragment key={issue.id}>
                                                <TableRow
                                                    className="cursor-pointer"
                                                    onClick={() => setExpandedIssue(expanded ? null : issue.id)}
                                                >
                                                    <TableCell className="p-2">
                                                        {expanded
                                                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                                    </TableCell>
                                                    <TableCell className="p-2"><SeverityBadge severity={issue.severity} /></TableCell>
                                                    <TableCell className="p-2 font-mono text-[11px]">{issue.collection}</TableCell>
                                                    <TableCell className="p-2 font-mono text-[11px]">{issue.recordId}</TableCell>
                                                    <TableCell className="p-2 font-mono text-[11px]">{issue.field}</TableCell>
                                                    <TableCell className="p-2 font-mono text-[11px]">{issue.targetCollection}</TableCell>
                                                    <TableCell className="p-2 text-[11px] text-muted-foreground">{issue.message}</TableCell>
                                                    <TableCell className="p-2">
                                                        {issue.autoFixable
                                                            ? <Wrench className="h-3.5 w-3.5 text-success" />
                                                            : <Ban className="h-3.5 w-3.5 text-muted-foreground" />}
                                                    </TableCell>
                                                </TableRow>
                                                {expanded && (
                                                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                                                        <TableCell colSpan={8} className="p-3">
                                                            <div className="flex flex-wrap items-center gap-3 text-[11px]">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-muted-foreground">Policy:</span>
                                                                    <PolicyBadge policy={issue.rule.onDelete} />
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-muted-foreground">Nullable:</span>
                                                                    <span className="font-mono">{String(issue.rule.nullable)}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-muted-foreground">Array:</span>
                                                                    <span className="font-mono">{String(Boolean(issue.rule.isArray))}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-muted-foreground">Label:</span>
                                                                    <span>{issue.rule.label}</span>
                                                                </div>
                                                                {issue.rule.note && (
                                                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                                                        <span>Note:</span>
                                                                        <span className="italic">{issue.rule.note}</span>
                                                                    </div>
                                                                )}
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="ml-auto h-7 text-[11px]"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleIssueClick(issue);
                                                                    }}
                                                                >
                                                                    <Link2 className="mr-1 h-3 w-3" /> Open record
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Duplicate IDs + Cascade-delete preview — 2-col grid on desktop */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Duplicate IDs panel */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <FileWarning className="h-4 w-4 text-warning" /> Duplicate ID conflicts
                            {report && report.duplicateIds.length > 0 && (
                                <Badge variant="secondary" className="rounded-full text-[10px] font-semibold">
                                    {report.duplicateIds.length}
                                </Badge>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {!report || report.duplicateIds.length === 0 ? (
                            <EmptyState
                                title="No duplicates"
                                description="Every record ID is unique within its collection."
                                icon={<CheckCircle2 className="h-6 w-6" />}
                                tone="success"
                            />
                        ) : (
                            <div className="max-h-64 overflow-y-auto rd-scroll space-y-2">
                                {report.duplicateIds.map((dup) => (
                                    <div key={`${dup.collection}-${dup.ids.join(",")}`} className="rounded-md border border-border bg-card p-2.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-mono text-[11px] font-semibold">{dup.collection}</span>
                                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                                                {dup.ids.length} IDs
                                            </Badge>
                                        </div>
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            {dup.ids.map((id) => (
                                                <span key={id} className="font-mono text-[10px] text-muted-foreground">{id}</span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                <p className="pt-2 text-[10px] text-muted-foreground">
                                    Auto-repair will rename duplicates with a <code className="font-mono">-dup-N</code> suffix.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Cascade-delete preview */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <Trash2 className="h-4 w-4 text-destructive" /> Cascade-delete preview
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Collection
                                </label>
                                <Select value={cascadeCollection} onValueChange={(v) => { setCascadeCollection(v); setCascadePreview(null); }}>
                                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent className="max-h-72">
                                        {collectionNames.map((c) => (
                                            <SelectItem key={c} value={c}>{c}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Record
                                </label>
                                <Select value={cascadeRecordId} onValueChange={(v) => { setCascadeRecordId(v); setCascadePreview(null); }}>
                                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick a record…" /></SelectTrigger>
                                    <SelectContent className="max-h-72">
                                        {cascadeRecords.map((r) => (
                                            <SelectItem key={r.id} value={r.id}>
                                                <span className="font-mono text-[10px]">{r.id}</span>
                                                <span className="ml-1 truncate text-[11px]">{r.label}</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={cascadeSoftDelete}
                                onChange={(e) => { setCascadeSoftDelete(e.target.checked); setCascadePreview(null); }}
                                className="h-3.5 w-3.5 rounded border-border"
                            />
                            Soft-delete (set <code className="font-mono">is_archived</code> instead of removing — only for sites/areas/customers)
                        </label>
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={handleCascadePreview} disabled={!cascadeRecordId}>
                                <Search className="mr-1.5 h-3.5 w-3.5" /> Dry-run preview
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={handleCascadeExecute}
                                disabled={!cascadeRecordId || cascadeRunning}
                            >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {cascadeSoftDelete ? "Soft-delete" : "Delete"}
                            </Button>
                        </div>
                        {cascadePreview && (
                            <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px]">
                                {cascadePreview.success ? (
                                    <p className="flex items-center gap-1.5 text-success">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Operation would succeed.
                                    </p>
                                ) : (
                                    <p className="flex items-center gap-1.5 text-destructive">
                                        <Ban className="h-3.5 w-3.5" /> Blocked by {cascadePreview.blocked.length} restrict reference(s).
                                    </p>
                                )}
                                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    <div className="rounded bg-card p-1.5">
                                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Delete</p>
                                        <p className="rd-tabular text-base font-bold text-destructive">{cascadePreview.deleted.length}</p>
                                    </div>
                                    <div className="rounded bg-card p-1.5">
                                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Nullify</p>
                                        <p className="rd-tabular text-base font-bold text-primary">{cascadePreview.nullified.length}</p>
                                    </div>
                                    <div className="rounded bg-card p-1.5">
                                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Blocked</p>
                                        <p className="rd-tabular text-base font-bold text-warning">{cascadePreview.blocked.length}</p>
                                    </div>
                                    <div className="rounded bg-card p-1.5">
                                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Soft</p>
                                        <p className="rd-tabular text-base font-bold text-muted-foreground">{cascadePreview.softDeleted.length}</p>
                                    </div>
                                </div>
                                {cascadePreview.blocked.length > 0 && (
                                    <div className="mt-2 max-h-32 overflow-y-auto rd-scroll rounded border border-border bg-card p-2">
                                        <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Block reasons:</p>
                                        {cascadePreview.blocked.slice(0, 8).map((b, i) => (
                                            <p key={i} className="text-[10px] text-muted-foreground">{b.reason}</p>
                                        ))}
                                        {cascadePreview.blocked.length > 8 && (
                                            <p className="mt-1 text-[10px] italic text-muted-foreground">
                                                +{cascadePreview.blocked.length - 8} more…
                                            </p>
                                        )}
                                    </div>
                                )}
                                {cascadePreview.deleted.length > 0 && (
                                    <div className="mt-2 max-h-32 overflow-y-auto rd-scroll rounded border border-border bg-card p-2">
                                        <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Would delete:</p>
                                        {cascadePreview.deleted.slice(0, 8).map((d, i) => (
                                            <p key={i} className="font-mono text-[10px] text-muted-foreground">
                                                {d.collection}:{d.id}{d.label ? ` (${d.label})` : ""}
                                            </p>
                                        ))}
                                        {cascadePreview.deleted.length > 8 && (
                                            <p className="mt-1 text-[10px] italic text-muted-foreground">
                                                +{cascadePreview.deleted.length - 8} more…
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* FK registry browser */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <Database className="h-4 w-4 text-primary" /> FK registry
                            <Badge variant="secondary" className="rounded-full text-[10px] font-semibold">
                                {FOREIGN_KEYS.length} rules
                            </Badge>
                        </CardTitle>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {parentCollections().length} parent collections</span>
                            <span className="flex items-center gap-1"><Link2 className="h-3 w-3" /> {childCollections().length} child collections</span>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={fkSearch}
                                    onChange={(e) => setFkSearch(e.target.value)}
                                    placeholder="Search FKs…"
                                    className="h-8 w-44 pl-7 text-xs"
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="max-h-96 overflow-y-auto rd-scroll">
                        <Accordion type="multiple" className="w-full">
                            {collectionNames.map((collection) => {
                                const rules = filteredFks.filter((r) => r.collection === collection);
                                if (rules.length === 0) return null;
                                return (
                                    <AccordionItem key={collection} value={collection}>
                                        <AccordionTrigger className="text-xs">
                                            <span className="flex items-center gap-2">
                                                <span className="font-mono font-semibold">{collection}</span>
                                                <Badge variant="secondary" className="rounded-full text-[10px]">{rules.length} FKs</Badge>
                                            </span>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead className="w-32 text-[10px]">Field</TableHead>
                                                        <TableHead className="w-40 text-[10px]">Target</TableHead>
                                                        <TableHead className="w-24 text-[10px]">Policy</TableHead>
                                                        <TableHead className="w-20 text-[10px]">Nullable</TableHead>
                                                        <TableHead className="text-[10px]">Label</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {rules.map((rule) => (
                                                        <TableRow key={`${rule.collection}.${rule.field}`}>
                                                            <TableCell className="p-2 font-mono text-[11px]">{rule.field}{rule.isArray ? "[]" : ""}</TableCell>
                                                            <TableCell className="p-2 font-mono text-[11px]">{rule.targetCollection}</TableCell>
                                                            <TableCell className="p-2"><PolicyBadge policy={rule.onDelete} /></TableCell>
                                                            <TableCell className="p-2 font-mono text-[11px]">{String(rule.nullable)}</TableCell>
                                                            <TableCell className="p-2 text-[11px] text-muted-foreground">{rule.label}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                            {filteredFks.length === 0 && (
                                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                                    No FK rules match "{fkSearch}".
                                </p>
                            )}
                        </Accordion>
                    </div>
                </CardContent>
            </Card>

            {/* Footer explainer */}
            <Collapsible>
                <Card>
                    <CollapsibleTrigger asChild>
                        <button type="button" className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
                            <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                <ShieldCheck className="h-4 w-4 text-primary" /> How this works (policies, scope, relationship to validateBusinessData)
                            </span>
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
                            <p>
                                <strong className="text-foreground">Scope.</strong> The checker scans every collection in the FK registry (56 top-level + 25 master) and verifies each FK reference resolves to a real parent record. Polymorphic references (tasks/followups/actions <code>linked_record_id</code>, threads <code>record_id</code>, entity-file-attachments <code>entity_id</code>) are skipped here — <code>validateBusinessData</code> covers them via dedicated <code>assert*</code> functions.
                            </p>
                            <p className="mt-2">
                                <strong className="text-foreground">Policies.</strong> <code>cascade</code> = child is deleted with parent. <code>restrict</code> = parent cannot be deleted while children exist (the cascade-delete aborts). <code>nullify</code> = child survives; the FK field is cleared. <code>ignore</code> = polymorphic; not enforced by this layer.
                            </p>
                            <p className="mt-2">
                                <strong className="text-foreground">Severity.</strong> <span className="text-destructive">Critical</span> = a non-nullable FK references a missing parent (data is broken). <span className="text-warning">Warning</span> = a nullable FK references a missing parent (degraded but usable). <span className="text-primary">Info</span> = informational.
                            </p>
                            <p className="mt-2">
                                <strong className="text-foreground">Health score.</strong> <code>(1 − critical/totalReferences) × 100</code>. Warnings cap at 95. Duplicate IDs cap at 50 (critical data corruption).
                            </p>
                            <p className="mt-2">
                                <strong className="text-foreground">Auto-repair.</strong> Applies the cascade/nullify policies to fix orphans, renames duplicate IDs with a <code>-dup-N</code> suffix, and runs <code>repairOperationalWorkspace</code> (article variants, vendor rates, inventory, work costs, quotation totals). Restrict-policy issues are skipped — resolve them manually. Every commit runs <code>validateBusinessData</code>; if the repair would violate business rules, the transaction rolls back.
                            </p>
                            <p className="mt-2">
                                <strong className="text-foreground">Relationship to validateBusinessData.</strong> The checker <em>complements</em> the existing business-rules engine — it does not replace it. <code>validateBusinessData</code> still runs on every commit (store.ts:524, 561). This layer adds: orphan detection beyond validateBusinessData (audit log, stock movements, commSends → followups), an integrity dashboard, a cascade-delete planner, and on-demand repair.
                            </p>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        </div>
    );
}
