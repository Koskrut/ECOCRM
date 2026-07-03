import { apiGet } from "../client";
import type { DailyAgendaPayload } from "./daily-agenda";
import type { DayPlanPayload, DayPlanStatus } from "./day-plan";

export type DashboardV2Role = "MANAGER" | "LEAD" | "ADMIN";

export type DashboardV2TaskSummary = {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
};

export type DashboardV2TeamPulseRow = {
  userId: string;
  fullName: string;
  callsInbound: number;
  callsOutbound: number;
  visits: number;
  ordersCount: number;
  ordersAmount: number;
  paymentsAmount: number;
  dayPlanPercent: number;
  dayPlanStatus: DayPlanStatus;
  overdueTasks: number;
  visitsWithoutNote: number;
};

export type DashboardV2ManagerRow = {
  id: string;
  name: string;
  bookedRevenue: number;
  collectedPayments: number;
  ordersCount: number;
  avgCheck: number;
  overdueTasks: number;
  callsOutbound: number;
  visitsDone: number;
  visitsWithoutNote: number;
  dayPlanPercent: number;
  dayPlanStatus: DayPlanStatus;
};

export type DashboardV2Quality = {
  visits: {
    totalDone: number;
    byOutcome: { outcome: string; count: number }[];
    withoutResultNote: number;
    withFollowUp: number;
    gpsVerifiedStart: number;
    gpsVerifiedComplete: number;
  };
  dayPlanTrend: { date: string; percent: number; status: DayPlanStatus }[];
  overdueFollowUps: number;
  calls: { inbound: number; outbound: number };
};

export type DashboardV2SalesKpi = {
  bookedRevenue: number;
  collectedPayments: number;
  ordersCount: number;
  avgCheck: number;
  debtTotal: number;
  overdueDebt: number;
  leadConversionProxy: number;
  leadsCreatedCount: number;
};

export type DashboardV2Response = {
  role: DashboardV2Role;
  currency: string;
  period: { from: string; to: string };
  activityDate: string;
  sales: {
    kpi: DashboardV2SalesKpi;
    compare?: { kpi: DashboardV2SalesKpi };
    charts: {
      bookedRevenueByDay: { date: string; amount: number; ordersCount: number }[];
      collectedPaymentsByDay: { date: string; amount: number; paymentCount: number }[];
      ordersByStage: { stage: string; count: number }[];
      leadsByStatus: { status: string; count: number }[];
      leadsBySource: { source: string; count: number }[];
    };
  };
  attention: {
    crm: {
      overdueTasksCount: number;
      stuckOrdersCount: number;
      leadsWithoutTouchCount: number;
    };
    finance: { overdueOrdersCount: number; overdueDebtAmount: number };
  };
  teamPulse: {
    date: string;
    currency: string;
    rows: DashboardV2TeamPulseRow[];
  };
  myWork: {
    dayPlan: DayPlanPayload | null;
    agenda: DailyAgendaPayload | null;
    upcomingTasks: DashboardV2TaskSummary[];
  };
  managers?: DashboardV2ManagerRow[];
  quality: DashboardV2Quality;
  showTeamView: boolean;
};

export type DashboardV2Query = {
  period?: "week" | "month";
  activityDate?: string;
  compare?: boolean;
  managerId?: string;
};

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

export type ManagerScorecardResponse = {
  currency: string;
  period: { from: string; to: string };
  comparePeriod?: { from: string; to: string };
  activity: {
    today: ManagerActivityMetrics;
    period: ManagerActivityMetrics;
    compare?: ManagerActivityMetrics;
  };
  outcomes: {
    leadsCreated: number;
    leadsWon: number;
    leadsLost: number;
    wonShare: number;
    exactConversion: number | null;
    bookedRevenue: number;
    collectedPayments: number;
    avgCheck: number;
    activeClientsInQueue: number;
    compare?: {
      leadsCreated: number;
      leadsWon: number;
      leadsLost: number;
      wonShare: number;
      bookedRevenue: number;
      collectedPayments: number;
      avgCheck: number;
    };
  };
};

export const dashboardApi = {
  getV2(query: DashboardV2Query = {}) {
    const params: Record<string, string> = {};
    if (query.period) params.period = query.period;
    if (query.activityDate) params.activityDate = query.activityDate;
    if (query.compare) params.compare = "true";
    if (query.managerId) params.managerId = query.managerId;
    return apiGet<DashboardV2Response>("/dashboard/v2", params);
  },
  getManagerInbox(query: { period?: "week" | "month" } = {}) {
    const params: Record<string, string> = {};
    if (query.period) params.period = query.period;
    return apiGet<ManagerInboxResponse>("/dashboard/manager-inbox", params);
  },
  getManagerScorecard(query: { period?: "week" | "month"; compare?: boolean } = {}) {
    const params: Record<string, string> = {};
    if (query.period) params.period = query.period;
    if (query.compare) params.compare = "true";
    return apiGet<ManagerScorecardResponse>("/dashboard/manager-scorecard", params);
  },
};
