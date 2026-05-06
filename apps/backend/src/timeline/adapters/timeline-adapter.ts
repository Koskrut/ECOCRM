import type { TimelineCursorPayload, TimelineEntityType, TimelineItem } from "../timeline.types";

/**
 * Each source adapter (activity, order_status, ttn, ...) exposes the same minimal
 * contract. Adapters fetch a strictly older slice (`< cursorAt`) and return at
 * most `limit` items in canonical descending order by `at`.
 */
export type TimelineFetchArgs = {
  entityType: TimelineEntityType;
  entityId: string;
  cursorAt: Date | null;
  limit: number;
};

export interface TimelineAdapter {
  /** Whether this adapter has any rows for the given entity type. */
  supports(entityType: TimelineEntityType): boolean;
  fetch(args: TimelineFetchArgs): Promise<TimelineItem[]>;
}

/**
 * Helper that turns a Prisma row into a TimelineCursorPayload tuple used for
 * stable ordering across adapters. Caller decides which rows to compare.
 */
export function toCursorPayload(item: TimelineItem): TimelineCursorPayload {
  return { at: item.at, source: item.source, id: item.id };
}
