import type { Prisma } from "@prisma/client";
import { resolvePresetPeriod } from "../analytics/utils/analytics-date.util";

export const LEAD_ATTENTION_PRESETS = [
  "without-touch",
  "never-contacted-new",
  "stale-in-progress",
] as const;

export type LeadAttentionPreset = (typeof LEAD_ATTENTION_PRESETS)[number];

export function isLeadAttentionPreset(value: string): value is LeadAttentionPreset {
  return (LEAD_ATTENTION_PRESETS as readonly string[]).includes(value);
}

/** Matches analytics / manager inbox attention counts (month period by default). */
export function buildLeadAttentionWhere(
  preset: LeadAttentionPreset,
  periodKey: "week" | "month" = "month",
): Prisma.LeadWhereInput {
  const period = resolvePresetPeriod(periodKey);
  const asOf = period.to;
  const cutoffNew = new Date(asOf);
  cutoffNew.setDate(cutoffNew.getDate() - 3);
  const cutoffIp = new Date(asOf);
  cutoffIp.setDate(cutoffIp.getDate() - 7);
  const newUpper = period.to < cutoffNew ? period.to : cutoffNew;
  const ipUpper = period.to < cutoffIp ? period.to : cutoffIp;

  switch (preset) {
    case "never-contacted-new":
      return {
        status: "NEW",
        activities: { none: {} },
        createdAt: { gte: period.from, lte: period.to },
      };
    case "stale-in-progress":
      return {
        status: "IN_PROGRESS",
        createdAt: { gte: period.from, lte: ipUpper },
        NOT: { activities: { some: { createdAt: { gte: cutoffIp } } } },
      };
    case "without-touch":
      return {
        OR: [
          {
            status: "NEW",
            createdAt: { gte: period.from, lte: newUpper },
            NOT: { activities: { some: { createdAt: { gte: cutoffNew } } } },
          },
          {
            status: "IN_PROGRESS",
            createdAt: { gte: period.from, lte: ipUpper },
            NOT: { activities: { some: { createdAt: { gte: cutoffIp } } } },
          },
        ],
      };
    default:
      return {};
  }
}
