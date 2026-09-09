import type { Prisma } from "@prisma/client";

export const LEAD_ATTENTION_PRESETS = [
  "without-touch",
  "never-contacted-new",
  "stale-in-progress",
] as const;

export type LeadAttentionPreset = (typeof LEAD_ATTENTION_PRESETS)[number];

export function isLeadAttentionPreset(value: string): value is LeadAttentionPreset {
  return (LEAD_ATTENTION_PRESETS as readonly string[]).includes(value);
}

/**
 * Snapshot attention filters for the manager desk / leads list.
 * No rolling createdAt lower bound — an old stuck lead must stay visible.
 * Second arg kept for call-site compatibility (`week|month` ignored as lower bound).
 */
export function buildLeadAttentionWhere(
  preset: LeadAttentionPreset,
  periodKeyOrNow: "week" | "month" | Date = "month",
): Prisma.LeadWhereInput {
  const asOf = periodKeyOrNow instanceof Date ? periodKeyOrNow : new Date();
  const cutoffNew = new Date(asOf);
  cutoffNew.setDate(cutoffNew.getDate() - 3);
  const cutoffIp = new Date(asOf);
  cutoffIp.setDate(cutoffIp.getDate() - 7);

  switch (preset) {
    case "never-contacted-new":
      return {
        status: "NEW",
        activities: { none: {} },
      };
    case "stale-in-progress":
      return {
        status: "IN_PROGRESS",
        createdAt: { lte: cutoffIp },
        NOT: { activities: { some: { createdAt: { gte: cutoffIp } } } },
      };
    case "without-touch":
      return {
        OR: [
          {
            status: "NEW",
            createdAt: { lte: cutoffNew },
            NOT: { activities: { some: { createdAt: { gte: cutoffNew } } } },
          },
          {
            status: "IN_PROGRESS",
            createdAt: { lte: cutoffIp },
            NOT: { activities: { some: { createdAt: { gte: cutoffIp } } } },
          },
        ],
      };
    default:
      return {};
  }
}
