import type { DayPlanPayload, DayPlanStatus } from "../day-plan/day-plan.types";
import type { DailyAgendaPayload } from "../daily-agenda/daily-agenda.types";
import type { OverviewPayload } from "../analytics/services/analytics-overview.service";
import type { ManagerRow } from "../analytics/services/analytics-managers.service";
import type { DailyTeamActivityRow } from "./dashboard.service";

export type DashboardV2Period = "week" | "month";

export type DashboardV2TaskSummary = {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
};

export type DashboardV2TeamPulseRow = DailyTeamActivityRow & {
  overdueTasks: number;
  visitsWithoutNote: number;
};

export type DashboardV2ManagerRow = ManagerRow & {
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
  calls: {
    inbound: number;
    outbound: number;
  };
};

export type DashboardV2Sales = {
  kpi: OverviewPayload["kpi"];
  compare?: { kpi: OverviewPayload["kpi"] };
  charts: OverviewPayload["charts"] & {
    leadsByStatus: { status: string; count: number }[];
    leadsBySource: { source: string; count: number }[];
  };
};

export type DashboardV2MyWork = {
  dayPlan: DayPlanPayload | null;
  agenda: DailyAgendaPayload | null;
  upcomingTasks: DashboardV2TaskSummary[];
};

export type DashboardV2Response = {
  role: "MANAGER" | "LEAD" | "ADMIN";
  currency: string;
  period: { from: string; to: string };
  activityDate: string;
  sales: DashboardV2Sales;
  attention: OverviewPayload["attention"];
  teamPulse: {
    date: string;
    currency: string;
    rows: DashboardV2TeamPulseRow[];
  };
  myWork: DashboardV2MyWork;
  managers?: DashboardV2ManagerRow[];
  quality: DashboardV2Quality;
  showTeamView: boolean;
};
