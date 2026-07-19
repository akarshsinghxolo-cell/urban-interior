"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { MetricCard, EmptyState } from "../primitives";
import { Button } from "@/components/ui/button";
import { Download, FileText, Users, Briefcase, CheckCircle2, Wallet, MapPin, Package, Truck, Building2, HardHat, UserCheck, ClipboardList, Phone, Calendar, } from "lucide-react";
import { toast } from "sonner";
import { formatINR, formatDate } from "@/lib/rdash/format";
export function DataExportModule() {
    const db = useRDashStore((s) => s.db);
    interface ExportOption {
        id: string;
        label: string;
        description: string;
        icon: React.ElementType;
        count: number;
        headers: string[];
        rows: Array<Array<string | number | undefined>>;
    }
    const exportOptions: ExportOption[] = React.useMemo(() => {
        const customerName = (profileId?: string) => db.customers.find((p) => p.id === profileId)?.name || "";
        return [
            {
                id: "customers",
                label: "Customers",
                description: "All customer customers with contact + status",
                icon: Users,
                count: db.customers.length,
                headers: ["ID", "Name", "Phone", "Email", "Sites", "Status", "Source", "Created"],
                rows: db.customers.map((p) => [p.id, p.name, p.phone || "", p.email || "", db.sites.filter((site) => site.customer_id === p.id).map((site) => site.name).join(" · "), p.status, p.source_partner_name || "", p.created_at]),
            },
            {
                id: "quotations",
                label: "Quotations",
                description: "All quotations with value + status",
                icon: FileText,
                count: db.quotations.length,
                headers: ["Quotation No", "Customer", "Title", "Status", "Subtotal", "Tax", "Total", "Rev", "Valid Until", "Created"],
                rows: db.quotations.map((q) => [q.quotation_no, (q.customer_name || "Customer"), q.title, q.status, String(q.subtotal || 0), String(q.tax_amount || 0), String(q.total_amount), String(q.revision_no), q.valid_until, q.created_at]),
            },
            {
                id: "workOrders",
                label: "Work Orders",
                description: "All workOrders with progress + value",
                icon: Briefcase,
                count: db.workOrders.length,
                headers: ["WorkOrder No", "Customer", "Title", "Status", "Value", "Progress", "Contractor", "Start", "End"],
                rows: db.workOrders.map((j) => [j.work_order_no, (j.customer_name || "Customer"), j.title, j.status, String(j.value), `${j.progress}%`, j.contractor_name || "", j.start_date || "", j.actual_end || j.expected_end || ""]),
            },
            {
                id: "tasks",
                label: "Tasks",
                description: "All tasks with assignee + due date",
                icon: CheckCircle2,
                count: db.tasks.length,
                headers: ["Title", "Scope", "Status", "Priority", "Assignee", "Customer", "Due Date", "Created"],
                rows: db.tasks.map((t) => [t.title, t.task_scope, t.status, t.priority, t.assignee_name || "", customerName(t.customer_id), t.due_date, t.created_at]),
            },
            {
                id: "payments",
                label: "Payments",
                description: "All payment milestones + receipts",
                icon: Wallet,
                count: db.payments.length,
                headers: ["ID", "Customer", "Milestone", "Amount", "Mode", "Status", "Due Date", "Received Date"],
                rows: db.payments.map((p) => [p.id.slice(-6).toUpperCase(), (p.customer_name || "Customer"), p.milestone_label || "", String(p.amount), p.mode || "", p.status, p.due_date || "", p.received_date || ""]),
            },
            {
                id: "visits",
                label: "Visits",
                description: "All field visits with status",
                icon: MapPin,
                count: db.visits.length,
                headers: ["Type", "Customer", "Staff", "Location", "Status", "Scheduled", "Check-in", "Check-out"],
                rows: db.visits.map((v) => [v.visit_type, customerName(v.customer_id), v.staff_name || "", v.location_name, v.status, v.scheduled_at, v.check_in_at || "", v.check_out_at || ""]),
            },
            {
                id: "pos",
                label: "Purchase Orders",
                description: "All POs raised against vendors",
                icon: Package,
                count: db.purchaseOrders.length,
                headers: ["PO No", "Vendor", "Status", "Total", "WorkOrder", "Created"],
                rows: db.purchaseOrders.map((p) => [p.po_no, p.vendor_name, p.status, String(p.total_amount), p.work_order_no || "", p.created_at]),
            },
            {
                id: "grns",
                label: "GRNs",
                description: "All goods receipt notes",
                icon: Truck,
                count: db.grns.length,
                headers: ["GRN No", "Vendor", "PO No", "Status", "Items", "Received"],
                rows: db.grns.map((g) => [g.grn_no, g.vendor_name, g.po_no, g.status, String(g.items.length), g.received_at]),
            },
            {
                id: "vendors",
                label: "Vendors",
                description: "All vendor master records",
                icon: Building2,
                count: db.master.vendors.length,
                headers: ["Name", "Category", "City", "Phone", "Outstanding", "On-time %", "Reliability"],
                rows: db.master.vendors.map((v) => [v.name, v.category || "", v.city || "", v.phone || "", String(v.outstanding || 0), `${v.on_time_pct || 0}%`, String(v.reliability_score || 0)]),
            },
            {
                id: "contractors",
                label: "Contractors",
                description: "All contractor master records",
                icon: HardHat,
                count: db.master.contractors.length,
                headers: ["Name", "Trade", "City", "Phone", "Rating", "Active Work Orders", "Outstanding"],
                rows: db.master.contractors.map((c) => [c.name, c.trade || "", c.city || "", c.phone || "", String(c.rating || ""), String(c.active_jobs || 0), String(c.outstanding || 0)]),
            },
            {
                id: "staff",
                label: "Staff",
                description: "All staff members with roles",
                icon: UserCheck,
                count: db.master.staff.length,
                headers: ["Name", "Role", "Phone", "City", "Status", "Monthly Salary"],
                rows: db.master.staff.map((s) => [s.name, s.role, s.phone || "", s.city || "", s.status || "active", String(s.monthly_salary || 0)]),
            },
            {
                id: "followups",
                label: "Follow-ups",
                description: "All follow-ups with type + status",
                icon: Phone,
                count: db.followups.length,
                headers: ["Title", "Type", "Status", "Priority", "Assignee", "Customer", "Due Date"],
                rows: db.followups.map((f) => [f.title, f.followup_type, f.status, f.priority, f.assigned_to || "", customerName(f.customer_id), f.due_date || ""]),
            },
            {
                id: "workRequired",
                label: "WorkRequireds",
                description: "All customer workRequired (leads pipeline)",
                icon: ClipboardList,
                count: db.workRequired.length,
                headers: ["Customer", "Title", "Status", "Budget", "Created"],
                rows: db.workRequired.map((r) => [customerName(r.customer_id) || r.customer_id, r.title, r.status, String(r.budget || 0), r.created_at]),
            },
        ];
    }, [db]);
    const handleExport = (opt: ExportOption) => {
        const csv = [opt.headers, ...opt.rows]
            .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `rdash-${opt.id}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`${opt.label} exported as CSV (${opt.rows.length} rows)`);
    };
    const handleExportAll = () => {
        exportOptions.forEach((opt, i) => {
            if (opt.count > 0) {
                setTimeout(() => handleExport(opt), i * 300);
            }
        });
        toast.success(`Exporting ${exportOptions.filter((o) => o.count > 0).length} CSV files…`);
    };
    const totalExportable = exportOptions.reduce((n, o) => n + o.count, 0);
    const nonEmptyCount = exportOptions.filter((o) => o.count > 0).length;
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Download className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Data Export</h2>
            <p className="text-xs text-muted-foreground">Export any entity type as a CSV file for reporting or external use</p>
          </div>
        </div>
        <Button size="sm" onClick={handleExportAll} className="gap-1.5">
          <Download className="h-3.5 w-3.5"/> Export all ({nonEmptyCount} files)
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Exportable records" value={totalExportable} tone="primary" icon={<Download className="h-4 w-4"/>}/>
        <MetricCard label="Entity types" value={exportOptions.length} tone="default" icon={<FileText className="h-4 w-4"/>}/>
        <MetricCard label="Non-empty types" value={nonEmptyCount} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Format" value="CSV" tone="default" icon={<FileText className="h-4 w-4"/>}/>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {exportOptions.map((opt) => {
            const isEmpty = opt.count === 0;
            return (<div key={opt.id} className={cn("group flex flex-col rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card transition-all", !isEmpty && "hover:border-primary/30 hover:shadow-soft", isEmpty && "opacity-60")}>
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <opt.icon className="h-4 w-4"/>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground">{opt.count} record{opt.count !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <p className="mb-3 flex-1 text-xs text-muted-foreground">{opt.description}</p>
              <Button size="sm" variant="outline" onClick={() => handleExport(opt)} disabled={isEmpty} className="w-full gap-1.5">
                <Download className="h-3.5 w-3.5"/> {isEmpty ? "No data" : "Export CSV"}
              </Button>
            </div>);
        })}
      </div>
    </div>);
}
