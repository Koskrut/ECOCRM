import { BadRequestException } from "@nestjs/common";
import {
  DEFAULT_FIELD_DAY_PLAN,
  DEFAULT_OFFICE_DAY_PLAN,
  DAY_PLAN_STATUS_THRESHOLDS,
} from "./day-plan.templates";
import type {
  DayPlanGlobalConfigStored,
  DayPlanMetricKey,
  DayPlanProfile,
  DayPlanTemplate,
  DayPlanTemplateItem,
  DayPlanThresholds,
  DayPlanUserOverrideStored,
} from "./day-plan.types";

const DYNAMIC_TARGET_KEYS = new Set<DayPlanMetricKey>([
  "leads_new_processed",
  "tasks_due_today_done",
  "visits_from_plan_done",
  "overdue_tasks_zero",
]);

export function isDynamicTarget(key: DayPlanMetricKey): boolean {
  return DYNAMIC_TARGET_KEYS.has(key);
}

export function defaultTemplateForProfile(profile: DayPlanProfile): DayPlanTemplate {
  return profile === "field"
    ? { profile: "field", items: DEFAULT_FIELD_DAY_PLAN.items.map((i) => ({ ...i, enabled: true })) }
    : { profile: "office", items: DEFAULT_OFFICE_DAY_PLAN.items.map((i) => ({ ...i, enabled: true })) };
}

export function defaultThresholds(): DayPlanThresholds {
  return { ...DAY_PLAN_STATUS_THRESHOLDS };
}

export function mergeTemplateItems(
  defaults: DayPlanTemplateItem[],
  overrides: unknown[] | undefined,
): DayPlanTemplateItem[] {
  const byKey = new Map(defaults.map((d) => [d.key, { ...d, enabled: d.enabled !== false }]));
  if (!overrides?.length) {
    return Array.from(byKey.values());
  }
  for (const raw of overrides) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Partial<DayPlanTemplateItem>;
    if (typeof o.key !== "string" || !byKey.has(o.key as DayPlanMetricKey)) continue;
    const base = byKey.get(o.key as DayPlanMetricKey)!;
    byKey.set(o.key as DayPlanMetricKey, {
      ...base,
      ...(typeof o.label === "string" ? { label: o.label } : {}),
      ...(typeof o.target === "number" ? { target: o.target } : {}),
      ...(typeof o.weight === "number" ? { weight: o.weight } : {}),
      ...(typeof o.actionHref === "string" ? { actionHref: o.actionHref } : {}),
      ...(typeof o.enabled === "boolean" ? { enabled: o.enabled } : {}),
    });
  }
  return Array.from(byKey.values());
}

export function filterEnabledItems(items: DayPlanTemplateItem[]): DayPlanTemplateItem[] {
  return items.filter((i) => i.enabled !== false);
}

export function resolveThresholds(
  global?: DayPlanThresholds | null,
  user?: DayPlanThresholds | null,
): DayPlanThresholds {
  const base = global ?? defaultThresholds();
  if (!user) return { ...base };
  return {
    green: user.green ?? base.green,
    yellow: user.yellow ?? base.yellow,
  };
}

export function resolveEffectiveTemplate(params: {
  profile: DayPlanProfile;
  globalConfig?: DayPlanGlobalConfigStored | null;
  userOverride?: DayPlanUserOverrideStored | null;
}): { template: DayPlanTemplate; thresholds: DayPlanThresholds } {
  const defaults = defaultTemplateForProfile(params.profile);
  const profileKey = params.profile;
  const globalItems = params.globalConfig?.[profileKey]?.items;
  let items = mergeTemplateItems(defaults.items, globalItems);
  if (params.userOverride?.items?.length) {
    items = mergeTemplateItems(items, params.userOverride.items);
  }
  items = filterEnabledItems(items);
  const globalThresholds = params.globalConfig?.thresholds ?? null;
  const userThresholds = params.userOverride?.thresholds ?? null;
  const thresholds = resolveThresholds(globalThresholds, userThresholds);
  return { template: { profile: params.profile, items }, thresholds };
}

export function validateTemplateItems(
  profile: DayPlanProfile,
  items: DayPlanTemplateItem[],
): void {
  const enabled = filterEnabledItems(items);
  if (enabled.length === 0) {
    throw new BadRequestException("At least one day plan item must be enabled");
  }
  const weightSum = enabled.reduce((s, i) => s + i.weight, 0);
  if (weightSum !== 100) {
    throw new BadRequestException(
      `Sum of weights for enabled items must be 100 (got ${weightSum})`,
    );
  }
  for (const item of enabled) {
    if (item.weight < 0 || item.weight > 100) {
      throw new BadRequestException(`Invalid weight for ${item.key}`);
    }
    if (!isDynamicTarget(item.key) && item.kind === "target" && item.target < 0) {
      throw new BadRequestException(`Invalid target for ${item.key}`);
    }
    if (!defaultsContainKey(profile, item.key)) {
      throw new BadRequestException(`Unknown metric key: ${item.key}`);
    }
  }
}

export function validateThresholds(thresholds: DayPlanThresholds): void {
  if (thresholds.green < 0 || thresholds.green > 100) {
    throw new BadRequestException("green threshold must be 0–100");
  }
  if (thresholds.yellow < 0 || thresholds.yellow > 100) {
    throw new BadRequestException("yellow threshold must be 0–100");
  }
  if (thresholds.green < thresholds.yellow) {
    throw new BadRequestException("green threshold must be >= yellow threshold");
  }
}

function defaultsContainKey(profile: DayPlanProfile, key: DayPlanMetricKey): boolean {
  const defaults = profile === "field" ? DEFAULT_FIELD_DAY_PLAN : DEFAULT_OFFICE_DAY_PLAN;
  return defaults.items.some((i) => i.key === key);
}

export function parseGlobalConfigStored(raw: unknown): DayPlanGlobalConfigStored | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as DayPlanGlobalConfigStored;
}

export function parseUserOverrideStored(raw: unknown): DayPlanUserOverrideStored | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as DayPlanUserOverrideStored;
  if (!Array.isArray(o.items)) return null;
  return o;
}
