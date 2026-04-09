/**
 * Single source of truth for the default leads pipeline (pre-DB / fallback / tests / migration parity).
 * Stepper chip titles (Новий / В роботі / Оброблено) are not stored in DB — see STEPPER_LABEL_BY_UI_STEP_KEY.
 */

import type { LeadStatus, LeadUiStepKey } from "@prisma/client";

export const ALL_LEAD_STATUSES: LeadStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "WON",
  "NOT_TARGET",
  "LOST",
  "SPAM",
];

/** Matches StatusBadge LEAD_STATUS_MAP labels (list/cards). */
export const DEFAULT_STAGE_LABELS: Record<LeadStatus, string> = {
  NEW: "Не обработан",
  IN_PROGRESS: "В работе",
  WON: "Успешный",
  NOT_TARGET: "Нецелевой",
  LOST: "Проваленный",
  SPAM: "Спам",
};

/** Maps each LeadStatus to aggregated stepper lane (legacy LeadStepper semantics). */
export const DEFAULT_UI_STEP_KEY: Record<LeadStatus, LeadUiStepKey> = {
  NEW: "NEW",
  IN_PROGRESS: "IN_PROGRESS",
  WON: "PROCESSED",
  NOT_TARGET: "PROCESSED",
  LOST: "PROCESSED",
  SPAM: "PROCESSED",
};

/** Fixed stepper chip labels by ui step (API/web; not in DB). */
export const STEPPER_LABEL_BY_UI_STEP_KEY: Record<LeadUiStepKey, string> = {
  NEW: "Новий",
  IN_PROGRESS: "В роботі",
  PROCESSED: "Оброблено",
};

export const STEPPER_COLOR_BY_UI_STEP_KEY: Record<LeadUiStepKey, "sky" | "amber" | "emerald"> = {
  NEW: "sky",
  IN_PROGRESS: "amber",
  PROCESSED: "emerald",
};

/** UI step order in the horizontal stepper (fixed; not derived from sortOrder). */
export const STEPPER_UI_KEY_ORDER: LeadUiStepKey[] = ["NEW", "IN_PROGRESS", "PROCESSED"];

/** Pre-pipeline behavior: any status may move to any status (domain rules still apply in code). */
export function buildFullAllowedTransitions(): Record<LeadStatus, LeadStatus[]> {
  const all = [...ALL_LEAD_STATUSES];
  const out = {} as Record<LeadStatus, LeadStatus[]>;
  for (const s of all) {
    out[s] = [...all];
  }
  return out;
}

export type DefaultLeadPipelineRow = {
  status: LeadStatus;
  sortOrder: number;
  label: string;
  color: string | null;
  visible: boolean;
  uiStepKey: LeadUiStepKey;
  allowedNext: LeadStatus[];
};

export function buildDefaultPipelineRows(): DefaultLeadPipelineRow[] {
  const allowedNext = buildFullAllowedTransitions();
  return ALL_LEAD_STATUSES.map((status, sortOrder) => ({
    status,
    sortOrder,
    label: DEFAULT_STAGE_LABELS[status],
    color: null,
    visible: true,
    uiStepKey: DEFAULT_UI_STEP_KEY[status],
    allowedNext: allowedNext[status],
  }));
}

export function assertDefaultLeadPipelineCoversAllStatuses(): void {
  const fromKeys = new Set(Object.keys(buildFullAllowedTransitions()) as LeadStatus[]);
  if (fromKeys.size !== ALL_LEAD_STATUSES.length) {
    throw new Error("Lead pipeline defaults must include every LeadStatus exactly once");
  }
  for (const s of ALL_LEAD_STATUSES) {
    if (!fromKeys.has(s)) throw new Error(`Missing lead status in defaults: ${s}`);
  }
}
