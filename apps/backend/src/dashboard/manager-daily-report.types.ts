export type ManagerDailyReportMetrics = {
  callsOutbound: number;
  callsInbound: number;
  visitsPlanned: number;
  visitsSuccess: number;
  visitsFailed: number;
  ordersCount: number;
  ordersAmountUsd: number;
  monthSalesUsd: number;
  paymentsUsd: number;
  leadsNew: number;
  leadsOpen: number;
};

export type ManagerDailyReportPerson = {
  fullName: string;
  metrics: ManagerDailyReportMetrics;
};
