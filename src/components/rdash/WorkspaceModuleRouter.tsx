"use client";
import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import { resolveRenderer } from "@/lib/rdash/modules";
import { PortalActivityProvider } from "@/components/ui/portal-activity";

const DailyWork = React.lazy(() => import("./modules/DailyWork").then((module) => ({ default: module.DailyWork })));
const CustomerDesk = React.lazy(() => import("./modules/CustomerDesk").then((module) => ({ default: module.CustomerDesk })));
const SiteExecutionModule = React.lazy(() => import("./modules/SiteExecutionModule").then((module) => ({ default: module.SiteExecutionModule })));
const DrawingsModule = React.lazy(() => import("./modules/DrawingsExecutionModules").then((module) => ({ default: module.DrawingsModule })));
const ExecutionLogsModule = React.lazy(() => import("./modules/DrawingsExecutionModules").then((module) => ({ default: module.ExecutionLogsModule })));
const TasksFollowups = React.lazy(() => import("./modules/TasksFollowups").then((module) => ({ default: module.TasksFollowups })));
const GenericModule = React.lazy(() => import("./modules/GenericModule").then((module) => ({ default: module.GenericModule })));
const BOQModule = React.lazy(() => import("./modules/BOQModule").then((module) => ({ default: module.BOQModule })));
const ProcurementModule = React.lazy(() => import("./modules/ProcurementModule").then((module) => ({ default: module.ProcurementModule })));
const GRNModule = React.lazy(() => import("./modules/GRNModule").then((module) => ({ default: module.GRNModule })));
const InventoryModule = React.lazy(() => import("./modules/InventoryModule").then((module) => ({ default: module.InventoryModule })));
const DispatchModule = React.lazy(() => import("./modules/DispatchModule").then((module) => ({ default: module.DispatchModule })));
const JobPnLModule = React.lazy(() => import("./modules/JobPnLModule").then((module) => ({ default: module.JobPnLModule })));
const SiteProfitabilityModule = React.lazy(() => import("./modules/SiteProfitabilityModule").then((module) => ({ default: module.SiteProfitabilityModule })));
const ProfitabilityWorkspaceModule = React.lazy(() => import("./modules/ProfitabilityWorkspaceModule").then((module) => ({ default: module.ProfitabilityWorkspaceModule })));
const StaffSalaryModule = React.lazy(() => import("./modules/StaffSalaryModule").then((module) => ({ default: module.StaffSalaryModule })));
const VendorPerformanceModule = React.lazy(() => import("./modules/VendorPerformanceModule").then((module) => ({ default: module.VendorPerformanceModule })));
const ContractorPerformanceModule = React.lazy(() => import("./modules/ContractorPerformanceModule").then((module) => ({ default: module.ContractorPerformanceModule })));
const ContractorWorkspaceModule = React.lazy(() => import("./modules/ContractorWorkspaceModule").then((module) => ({ default: module.ContractorWorkspaceModule })));
const WorkOrderTimelineModule = React.lazy(() => import("./modules/WorkOrderTimelineModule").then((module) => ({ default: module.WorkOrderTimelineModule })));
const VendorBillsModule = React.lazy(() => import("./modules/VendorBillsModule").then((module) => ({ default: module.VendorBillsModule })));
const ContractorPaymentsModule = React.lazy(() => import("./modules/ContractorPaymentsModule").then((module) => ({ default: module.ContractorPaymentsModule })));
const FinanceOverviewModule = React.lazy(() => import("./modules/FinanceOverviewModule").then((module) => ({ default: module.FinanceOverviewModule })));
const PaymentRecoveryModule = React.lazy(() => import("./modules/PaymentRecoveryModule").then((module) => ({ default: module.PaymentRecoveryModule })));
const ReportsModule = React.lazy(() => import("./modules/ReportsModule").then((module) => ({ default: module.ReportsModule })));
const ReportFamilyModule = React.lazy(() => import("./modules/ReportFamilyModule").then((module) => ({ default: module.ReportFamilyModule })));
const CalendarModule = React.lazy(() => import("./modules/CalendarModule").then((module) => ({ default: module.CalendarModule })));
const SiteMeasurementModule = React.lazy(() => import("./modules/SiteMeasurementModule").then((module) => ({ default: module.SiteMeasurementModule })));
const ApprovalPoliciesModule = React.lazy(() => import("./modules/ApprovalPoliciesModule").then((module) => ({ default: module.ApprovalPoliciesModule })));
const ControlBrainModule = React.lazy(() => import("./modules/ControlBrainModule").then((module) => ({ default: module.ControlBrainModule })));
const AuditLogModule = React.lazy(() => import("./modules/AuditLogModule").then((module) => ({ default: module.AuditLogModule })));
const DataImportModule = React.lazy(() => import("./modules/DataImportModule").then((module) => ({ default: module.DataImportModule })));
const DataExportModule = React.lazy(() => import("./modules/DataExportModule").then((module) => ({ default: module.DataExportModule })));
const RateFinderModule = React.lazy(() => import("./modules/RateFinderModule").then((module) => ({ default: module.RateFinderModule })));
const GpsTrackingModule = React.lazy(() => import("./modules/GpsTrackingModule").then((module) => ({ default: module.GpsTrackingModule })));
const VisitProofsModule = React.lazy(() => import("./modules/VisitProofsModule").then((module) => ({ default: module.VisitProofsModule })));
const AttendancePayrollModule = React.lazy(() => import("./modules/AttendancePayrollModule").then((module) => ({ default: module.AttendancePayrollModule })));
const FieldModeModule = React.lazy(() => import("./modules/FieldModeModule").then((module) => ({ default: module.FieldModeModule })));
const CommunicationCentreModule = React.lazy(() => import("./modules/CommunicationCentreModule").then((module) => ({ default: module.CommunicationCentreModule })));
const QuotationConfigModule = React.lazy(() => import("./modules/QuotationConfigModule").then((module) => ({ default: module.QuotationConfigModule })));
const StaffBoardModule = React.lazy(() => import("./modules/StaffBoardHistoryModule").then((module) => ({ default: module.StaffBoardModule })));
const GstReturnsModule = React.lazy(() => import("./modules/SalesExtraModules").then((module) => ({ default: module.GstReturnsModule })));
const MastersModule = React.lazy(() => import("./modules/MastersSalesOpsModule").then((module) => ({ default: module.MastersModule })));
const SalesOpsModule = React.lazy(() => import("./modules/MastersSalesOpsModule").then((module) => ({ default: module.SalesOpsModule })));
const ObstacleThreadsModule = React.lazy(() => import("./modules/MastersSalesOpsModule").then((module) => ({ default: module.ObstacleThreadsModule })));
const ApprovalsModule = React.lazy(() => import("./modules/RemainingModules").then((module) => ({ default: module.ApprovalsModule })));
const SiteVisitsModule = React.lazy(() => import("./modules/RemainingModules").then((module) => ({ default: module.SiteVisitsModule })));
const QuotationsModule = React.lazy(() => import("./modules/QuotationsModule").then((module) => ({ default: module.QuotationsModule })));
const WorkCategoryMasterModule = React.lazy(() => import("./modules/WorkCategoryMasterModule").then((module) => ({ default: module.WorkCategoryMasterModule })));
const VendorPriceMasterModule = React.lazy(() => import("./modules/VendorPriceMasterModule").then((module) => ({ default: module.VendorPriceMasterModule })));
const MediaLibraryModule = React.lazy(() => import("./modules/MediaLibraryModule").then((module) => ({ default: module.MediaLibraryModule })));
const GoogleDriveManagerModule = React.lazy(() => import("./modules/GoogleDriveManagerModule").then((module) => ({ default: module.GoogleDriveManagerModule })));
const UserApprovalsModule = React.lazy(() => import("./modules/UserApprovalsModule").then((module) => ({ default: module.UserApprovalsModule })));
const SalesPipelineModule = React.lazy(() => import("./modules/SalesPipelineModule").then((module) => ({ default: module.SalesPipelineModule })));
const CommissionsModule = React.lazy(() => import("./modules/CommissionsModule").then((module) => ({ default: module.CommissionsModule })));
const ThreadsModule = React.lazy(() => import("./modules/ThreadsModule").then((module) => ({ default: module.ThreadsModule })));
const UnifiedThreadInboxModule = React.lazy(() => import("./modules/UnifiedThreadInboxModule").then((module) => ({ default: module.UnifiedThreadInboxModule })));
const IntegrityModule = React.lazy(() => import("./modules/IntegrityModule").then((module) => ({ default: module.IntegrityModule })));
const ContractorDetailModule = React.lazy(() => import("./modules/ContractorDetailModule").then((module) => ({ default: module.ContractorDetailModule })));
const CustomerDeskExtrasModule = React.lazy(() => import("./modules/RemainingModules").then((module) => ({ default: module.CustomerDeskExtrasModule })));
const BlockedRisksCombined = React.lazy(() => import("./WorkdeskCombinedViews").then((module) => ({ default: module.BlockedRisksCombined })));
const CalendarRecurringCombined = React.lazy(() => import("./WorkdeskCombinedViews").then((module) => ({ default: module.CalendarRecurringCombined })));

export function ModuleLoadingFallback() {
    return <div className="rounded-[var(--panel-radius)] border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">Loading workspace module...</div>;
}

export function WorkspaceModuleRouter({ moduleId }: { moduleId: string }) {
    const activeModuleId = moduleId;
    const route = resolveRenderer(activeModuleId);
    switch (route.renderer) {
        case "daily-work": return <DailyWork />;
        case "customer-desk": return <CustomerDesk view={route.filter?.view === "timeline" ? "timeline" : "default"}/>;
        case "customer-extras": return <CustomerDeskExtrasModule submodule={route.filter?.sub || "requests"} filterPresets={route.filterPresets} />;
        case "site-execution": return <SiteExecutionModule initialTab={route.filter?.tab}/>;
        case "tasks": return <TasksFollowups moduleId={activeModuleId} submoduleFilter={route.filter} filterPresets={route.filterPresets} dataSource={route.dataSource}/>;
        case "quotations": return <QuotationsModule filterPresets={route.filterPresets} statusFilter={route.filter?.status} view={route.filter?.view}/>;
        case "boq": return <BOQModule />;
        case "drawings": return <DrawingsModule />;
        case "execution-logs": return <ExecutionLogsModule />;
        case "procurement": return <ProcurementModule />;
        case "grn": return <GRNModule />;
        case "inventory": return <InventoryModule />;
        case "dispatch": return <DispatchModule view={route.filter?.view}/>;
        case "workOrder-pnl": return <JobPnLModule />;
        case "site-profitability": return <SiteProfitabilityModule />;
        case "profitability": return <ProfitabilityWorkspaceModule />;
        case "staff-salary": return <StaffSalaryModule />;
        case "vendor-performance": return <VendorPerformanceModule />;
        case "contractor-performance": return <ContractorPerformanceModule />;
        case "contractor-workspace": return <ContractorWorkspaceModule />;
        case "wo-timeline": return <WorkOrderTimelineModule />;
        case "vendor-bills": return <VendorBillsModule />;
        case "contractor-payments": return <ContractorPaymentsModule />;
        case "contractor-detail": return <ContractorDetailModule />;
        case "finance-overview": return <FinanceOverviewModule />;
        case "payment-recovery": return <PaymentRecoveryModule />;
        case "reports-v2": return <ReportsModule reportId={activeModuleId}/>;
        case "report-family": return <ReportFamilyModule family={(route.filter?.family || "sales") as "sales" | "collections" | "operations" | "financial"}/>;
        case "calendar": return route.filter?.view === "recurring" ? <CalendarRecurringCombined /> : <CalendarModule />;
        case "site-measurement": return <SiteMeasurementModule />;
        case "approval-policies": return <ApprovalPoliciesModule />;
        case "control-brain": return <ControlBrainModule />;
        case "audit-log": return <AuditLogModule />;
        case "data-import": return <DataImportModule />;
        case "data-export": return <DataExportModule />;
        case "rate-finder": return <RateFinderModule />;
        case "gps-tracking": return <GpsTrackingModule moduleId={activeModuleId} viewFilter={route.filter?.view}/>;
        case "visit-proofs": return <VisitProofsModule />;
        case "attendance-payroll": return <AttendancePayrollModule />;
        case "field-mode": return <FieldModeModule />;
        case "communication-centre": return <CommunicationCentreModule channelFilter={route.filter?.channel}/>;
        case "quotation-config": return <QuotationConfigModule config={route.filter?.config}/>;
        case "staff-board": return <StaffBoardModule />;
        case "gst-returns": return <GstReturnsModule />;
        case "sales-pipeline": return <SalesPipelineModule />;
        case "commissions": return <CommissionsModule />;
        case "threads": return <ThreadsModule />;
        case "unified-thread-inbox": return <UnifiedThreadInboxModule />;
        case "masters": return <WorkCategoryMasterModule initialView="catalogue"/>;
        case "masters-v2": return activeModuleId === "vendorRates" ? <VendorPriceMasterModule /> : <MastersModule submodule={route.filter?.sub || activeModuleId}/>;
        case "sales-ops": return <SalesOpsModule submodule={route.filter?.sub || activeModuleId} filterPresets={route.filterPresets} statusFilter={route.filter?.status} expiringFilter={route.filter?.expiring}/>;
        case "obstacle-threads": return route.filter?.view === "combined" ? <BlockedRisksCombined /> : <ObstacleThreadsModule />;
        case "approvals-v2": return <ApprovalsModule />;
        case "site-visits": return <SiteVisitsModule />;
        case "media-library": return <MediaLibraryModule initialView={route.filter?.view}/>;
        case "drive-manager": return <GoogleDriveManagerModule />;
        case "auth-users": return <UserApprovalsModule />;
        case "integrity": return <IntegrityModule />;
        case "system": return <GenericModule renderer="system" dataSource={route.dataSource} filter={route.filter} filterPresets={route.filterPresets} moduleId={route.moduleId} label={route.label} description={route.description}/>;
        default: return renderUnreachableModule(route.renderer);
    }
}
function renderUnreachableModule(_renderer: never) {
    return <DailyWork />;
}

export function WorkspaceModulePanels() {
    const tabs = useRDashStore((state) => state.tabs);
    const activeModuleId = useRDashStore((state) => state.activeModuleId);
    const moduleIds = React.useMemo(() => Array.from(new Set([...tabs.map((tab) => tab.moduleId), activeModuleId])), [tabs, activeModuleId]);
    return <>
      {moduleIds.map((moduleId) => {
        const active = moduleId === activeModuleId;
        const tab = tabs.find((entry) => entry.moduleId === moduleId);
        return <section
          key={moduleId}
          id={`workspace-panel-${tab?.id || `tab-${moduleId}`}`}
          role="tabpanel"
          aria-labelledby={`workspace-tab-${tab?.id || `tab-${moduleId}`}`}
          aria-label={tab?.label || moduleId}
          hidden={!active}
          tabIndex={0}
          className="rd-module-enter mx-auto w-full max-w-[var(--content-max)] px-[var(--page-pad)] py-[var(--page-pad)]"
        >
          <PortalActivityProvider active={active}>
            <React.Suspense fallback={<ModuleLoadingFallback />}>
              <WorkspaceModuleRouter moduleId={moduleId} />
            </React.Suspense>
          </PortalActivityProvider>
        </section>;
      })}
    </>;
}
