import { apiHttp } from "../client";
import type { DayPlanMetricKey, DayPlanProfile, DayPlanTemplateItem, DayPlanThresholds } from "./day-plan";

export type DayPlanSettingsProfilePayload = {
  profile: DayPlanProfile;
  items: DayPlanTemplateItem[];
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

export const dayPlanSettingsApi = {
  getGlobal: async (): Promise<DayPlanGlobalSettingsPayload> => {
    const res = await apiHttp.get<DayPlanGlobalSettingsPayload>("/settings/day-plan");
    return res.data;
  },

  setGlobal: async (body: {
    thresholds?: DayPlanThresholds;
    office?: { items?: Partial<DayPlanTemplateItem>[] };
    field?: { items?: Partial<DayPlanTemplateItem>[] };
    resetOffice?: boolean;
    resetField?: boolean;
  }): Promise<DayPlanGlobalSettingsPayload> => {
    const res = await apiHttp.patch<DayPlanGlobalSettingsPayload>("/settings/day-plan", body);
    return res.data;
  },

  listUsersWithOverrides: async (): Promise<{ userIds: string[] }> => {
    const res = await apiHttp.get<{ userIds: string[] }>("/settings/day-plan/users-with-overrides");
    return res.data;
  },

  getUser: async (userId: string): Promise<DayPlanUserSettingsPayload> => {
    const res = await apiHttp.get<DayPlanUserSettingsPayload>(`/settings/day-plan/users/${userId}`);
    return res.data;
  },

  setUser: async (
    userId: string,
    body: { items?: Partial<DayPlanTemplateItem>[]; thresholds?: DayPlanThresholds | null },
  ): Promise<DayPlanUserSettingsPayload> => {
    const res = await apiHttp.patch<DayPlanUserSettingsPayload>(
      `/settings/day-plan/users/${userId}`,
      body,
    );
    return res.data;
  },

  deleteUser: async (userId: string): Promise<DayPlanUserSettingsPayload> => {
    const res = await apiHttp.delete<DayPlanUserSettingsPayload>(
      `/settings/day-plan/users/${userId}`,
    );
    return res.data;
  },
};

export const DYNAMIC_DAY_PLAN_KEYS = new Set<DayPlanMetricKey>([
  "leads_new_processed",
  "tasks_due_today_done",
  "visits_from_plan_done",
  "overdue_tasks_zero",
]);

export function isDynamicDayPlanKey(key: DayPlanMetricKey): boolean {
  return DYNAMIC_DAY_PLAN_KEYS.has(key);
}

export function enabledWeightSum(items: DayPlanTemplateItem[]): number {
  return items.filter((i) => i.enabled !== false).reduce((s, i) => s + i.weight, 0);
}
