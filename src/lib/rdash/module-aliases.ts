export const LEGACY_MODULE_ALIASES = Object.freeze({
  boq: "boqControlCentre",
  vendorPerformance: "vendors",
  contractorPerformance: "contractorDetail",
  contractors: "contractorDetail",
  staff: "hrStaff",
  siteProfitability: "profitability",
  workOrderPnl: "profitability",
  salesReport: "salesAnalytics",
  quotationConversion: "salesAnalytics",
  leadSourceReport: "salesAnalytics",
  collectionReport: "collectionAnalytics",
  agingReportRep: "collectionAnalytics",
  staffProductivity: "operationsAnalytics",
  visitCompliance: "operationsAnalytics",
  taskThroughput: "operationsAnalytics",
  jobPnlReport: "financialAnalytics",
  vendorExposureReport: "financialAnalytics",
  taxReport: "financialAnalytics",
} as const);

type LegacyModuleId = keyof typeof LEGACY_MODULE_ALIASES;

export function canonicalLegacyModuleId(moduleId: string): string {
  return LEGACY_MODULE_ALIASES[moduleId as LegacyModuleId] || moduleId;
}
