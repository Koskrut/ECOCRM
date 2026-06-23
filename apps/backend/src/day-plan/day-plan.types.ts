export type DayPlanProfile = "office" | "field";

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

export type DayPlanItemKind = "target" | "zero_target";

export type DayPlanTemplateItem = {
  key: DayPlanMetricKey;
  label: string;
  kind: DayPlanItemKind;
  /** Target value; for zero_target the plan is always 0. */
  target: number;
  weight: number;
  actionHref: string;
};

export type DayPlanTemplate = {
  profile: DayPlanProfile;
  items: DayPlanTemplateItem[];
};

export type DayPlanItemResult = {
  key: DayPlanMetricKey;
  label: string;
  kind: DayPlanItemKind;
  weight: number;
  plan: number;
  fact: number;
  percent: number;
  actionHref: string;
};

export type DayPlanStatus = "green" | "yellow" | "red";

export type DayPlanPayload = {
  date: string;
  userId: string;
  fullName: string;
  profile: DayPlanProfile;
  overallPercent: number;
  status: DayPlanStatus;
  items: DayPlanItemResult[];
};

export type DayPlanUserMetrics = {
  callsOutbound: number;
  ordersCreated: number;
  visitsDone: number;
  visitsFromPlanDone: number;
  visitsFromPlanTotal: number;
  fieldShiftStarted: boolean;
  tasksDueTodayTotal: number;
  tasksDueTodayDone: number;
  overdueTasks: number;
  leadsNewRemaining: number;
  leadsProcessedToday: number;
  workQueueTouches: number;
};
