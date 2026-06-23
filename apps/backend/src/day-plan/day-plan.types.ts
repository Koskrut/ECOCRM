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

export type DayPlanThresholds = {
  green: number;
  yellow: number;
};

export type DayPlanTemplateItem = {
  key: DayPlanMetricKey;
  label: string;
  kind: DayPlanItemKind;
  /** Target value; for zero_target the plan is always 0. */
  target: number;
  weight: number;
  actionHref: string;
  /** Default true. Disabled items are excluded from scoring. */
  enabled?: boolean;
};

export type DayPlanGlobalConfigStored = {
  thresholds?: DayPlanThresholds;
  office?: { items?: Partial<DayPlanTemplateItem>[] };
  field?: { items?: Partial<DayPlanTemplateItem>[] };
};

export type DayPlanUserOverrideStored = {
  items: Partial<DayPlanTemplateItem>[];
  thresholds?: DayPlanThresholds;
};

export type DayPlanSettingsProfilePayload = {
  profile: DayPlanProfile;
  /** All items after merge (including disabled) for editor. */
  items: DayPlanTemplateItem[];
  /** Enabled items used in scoring. */
  effective: DayPlanTemplateItem[];
  overrides: Partial<DayPlanTemplateItem>[];
};

export type DayPlanGlobalSettingsPayload = {
  thresholds: DayPlanThresholds;
  office: DayPlanSettingsProfilePayload;
  field: DayPlanSettingsProfilePayload;
};

export type DayPlanUserSettingsPayload = {
  userId: string;
  fullName: string;
  profile: DayPlanProfile;
  hasCustomOverride: boolean;
  thresholds: DayPlanThresholds;
  globalBase: DayPlanTemplateItem[];
  items: DayPlanTemplateItem[];
  effective: DayPlanTemplateItem[];
  overrides: Partial<DayPlanTemplateItem>[];
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
