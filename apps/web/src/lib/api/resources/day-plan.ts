import { apiHttp } from "../client";

export type DayPlanMetricKey =
  | "calls_outbound"
  | "leads_new_processed"
  | "tasks_due_today_done"
  | "overdue_tasks_zero"
  | "work_queue_touches"
  | "orders_created"
  | "visits_from_plan_done"
  | "visits_total_done"
  | "field_shift_started";

export type DayPlanStatus = "green" | "yellow" | "red";

export type DayPlanProfile = "office" | "field";

export type DayPlanThresholds = {
  green: number;
  yellow: number;
};

export type DayPlanTemplateItem = {
  key: DayPlanMetricKey;
  label: string;
  kind: "target" | "zero_target";
  target: number;
  weight: number;
  actionHref: string;
  enabled?: boolean;
};

export type DayPlanItem = {
  key: DayPlanMetricKey;
  label: string;
  kind: "target" | "zero_target";
  weight: number;
  plan: number;
  fact: number;
  percent: number;
  actionHref: string;
};

export type DayPlanPayload = {
  date: string;
  userId: string;
  fullName: string;
  profile: "office" | "field";
  overallPercent: number;
  status: DayPlanStatus;
  items: DayPlanItem[];
};

export const dayPlanApi = {
  get: async (params?: { date?: string; userId?: string }): Promise<DayPlanPayload> => {
    const res = await apiHttp.get<DayPlanPayload>("/work/day-plan", { params });
    return res.data;
  },
};
