export type ManagerInboxTiles = {
  leadsWithoutTouch: number;
  neverContactedNewLeads: number;
  staleInProgressLeads: number;
  overdueFollowupContacts: number;
  newNoFirstContactContacts: number;
  overdueTasks: number;
  overduePayments: number;
  debtControlContacts: number;
};

export type ManagerInboxTask = {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  leadId: string | null;
  contactId: string | null;
  assigneeName: string | null;
};

export type ManagerInboxTasks = {
  overdue: ManagerInboxTask[];
  today: ManagerInboxTask[];
  tomorrow: ManagerInboxTask[];
};

export type ManagerPipelineCounts = {
  NEW: number;
  IN_PROGRESS: number;
  WON: number;
  LOST: number;
};

export type ManagerHotLead = {
  id: string;
  name: string;
  source: string | null;
  daysSinceActivity: number | null;
  hasOverdueTask: boolean;
};

export type ManagerInboxResponse = {
  tiles: ManagerInboxTiles;
  tasks: ManagerInboxTasks;
  pipelineCounts: ManagerPipelineCounts;
  hotLeads: ManagerHotLead[];
  totalInQueue: number;
  computedAt: string;
};

export type ManagerActivityMetrics = {
  callsInbound: number;
  callsOutbound: number;
  visits: number;
  ordersCount: number;
  ordersAmount: number;
  paymentsAmount: number;
};

export type ManagerOutcomeMetrics = {
  leadsCreated: number;
  leadsWon: number;
  leadsLost: number;
  wonShare: number;
  exactConversion: number | null;
  bookedRevenue: number;
  collectedPayments: number;
  avgCheck: number;
  activeClientsInQueue: number;
};

export type ManagerMonthCoverage = {
  shippedClients: number;
  clientBase: number;
  coveragePercent: number;
  unshippedClients: number;
  previousMonthFull: number;
  previousMonthPace: number;
};

export type ManagerMonthMoney = {
  bookedRevenue: number;
  collectedPayments: number;
  ordersCount: number;
  avgCheck: number;
  forecastBookedRevenue: number | null;
  previousMonthFull: {
    bookedRevenue: number;
    collectedPayments: number;
    ordersCount: number;
    avgCheck: number;
  };
  previousMonthPace: {
    bookedRevenue: number;
    collectedPayments: number;
    ordersCount: number;
    avgCheck: number;
  };
};

export type ManagerMonthPulse = {
  /** Calendar MTD in Europe/Kyiv. */
  period: { from: string; to: string };
  previousMonthFull: { from: string; to: string };
  previousMonthPace: { from: string; to: string };
  daysElapsed: number;
  daysInMonth: number;
  daysRemaining: number;
  coverage: ManagerMonthCoverage;
  money: ManagerMonthMoney;
  conversion: {
    exactConversion: number | null;
    wonShare: number;
    leadsCreated: number;
    leadsWon: number;
    previousMonthPace: {
      exactConversion: number | null;
      wonShare: number;
      leadsCreated: number;
      leadsWon: number;
    };
  };
};

export type ManagerGrowthLeverStatus = "good" | "watch" | "critical";

export type ManagerGrowthLever = {
  key: "coverage" | "conversion" | "avgCheck" | "collection" | "overdue" | string;
  status: ManagerGrowthLeverStatus;
  priority: number;
  currentValue: number;
  compareValue: number | null;
  unit: "count" | "percent" | "money" | "ratio";
  href: string;
};

export type ManagerTrendPoint = {
  date: string;
  bookedRevenue: number;
  collectedPayments: number;
  shippedClients: number;
};

export type ManagerTrend = {
  current: ManagerTrendPoint[];
  previousMonth: ManagerTrendPoint[];
};

export type ManagerPotential = {
  unshippedClients: number;
  overdueFollowupContacts: number;
  hotLeadsCount: number;
  openPipelineOrders: number;
  openPipelineAmount: number;
  pipelineByStage: { stage: string; count: number }[];
};

export type ManagerScorecardResponse = {
  currency: string;
  period: { from: string; to: string };
  comparePeriod?: { from: string; to: string };
  activity: {
    today: ManagerActivityMetrics;
    period: ManagerActivityMetrics;
    compare?: ManagerActivityMetrics;
  };
  outcomes: ManagerOutcomeMetrics & {
    compare?: Omit<ManagerOutcomeMetrics, "activeClientsInQueue" | "exactConversion">;
  };
  /** Always calendar-month diagnostics for the manager desk. */
  monthPulse: ManagerMonthPulse;
  growthLevers: ManagerGrowthLever[];
  trend: ManagerTrend;
  potential: ManagerPotential;
};
