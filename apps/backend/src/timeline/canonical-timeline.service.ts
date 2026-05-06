/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest DI tokens must be value imports */
import { Injectable } from "@nestjs/common";
import { TIMELINE_PAGE_SIZE } from "@crm/contracts/timeline";
import type { AuthUser } from "../auth/auth.types";
import { ActivityTimelineAdapter } from "./adapters/activity-timeline.adapter";
import { OrderStatusTimelineAdapter } from "./adapters/order-status-timeline.adapter";
import type { TimelineAdapter } from "./adapters/timeline-adapter";
import { TtnTimelineAdapter } from "./adapters/ttn-timeline.adapter";
import { decodeTimelineCursor, encodeTimelineCursor } from "./timeline.cursor";
import { TimelineAccessService } from "./timeline-access.service";
import type {
  TimelineEntityType,
  TimelineItem,
  TimelineKind,
  TimelinePage,
  TimelineSource,
} from "./timeline.types";

export type ListCanonicalArgs = {
  entityType: TimelineEntityType;
  entityId: string;
  limit?: number;
  cursor?: string;
  sources?: TimelineSource[];
  kinds?: TimelineKind[];
};

@Injectable()
export class CanonicalTimelineService {
  private readonly adapters: TimelineAdapter[];

  constructor(
    private readonly access: TimelineAccessService,
    private readonly activity: ActivityTimelineAdapter,
    private readonly orderStatus: OrderStatusTimelineAdapter,
    private readonly ttn: TtnTimelineAdapter,
  ) {
    this.adapters = [this.activity, this.orderStatus, this.ttn];
  }

  async list(args: ListCanonicalArgs, actor?: AuthUser): Promise<TimelinePage> {
    await this.access.assertAccess(args.entityType, args.entityId, actor);

    const limit = clampLimit(args.limit);
    const cursor = decodeTimelineCursor(args.cursor ?? null);
    const cursorAt = cursor ? new Date(cursor.at) : null;
    const sources = args.sources && args.sources.length > 0 ? new Set(args.sources) : null;
    const kinds = args.kinds && args.kinds.length > 0 ? new Set(args.kinds) : null;

    const adapters = this.adapters.filter(
      (a) => a.supports(args.entityType) && (!sources || isSelectedSource(a, sources)),
    );

    const adapterFetchLimit = limit + 1;

    const buckets = await Promise.all(
      adapters.map((adapter) =>
        adapter.fetch({
          entityType: args.entityType,
          entityId: args.entityId,
          cursorAt,
          limit: adapterFetchLimit,
        }),
      ),
    );

    let merged = buckets.flat();

    if (cursor) {
      merged = merged.filter((it) => isStrictlyOlder(it, cursor));
    }
    if (sources) merged = merged.filter((it) => sources.has(it.source));
    if (kinds) merged = merged.filter((it) => kinds.has(it.kind));

    merged.sort(canonicalCompare);

    const window = merged.slice(0, limit);
    const hasMore = merged.length > limit;
    const last = window[window.length - 1];
    const nextCursor = hasMore && last
      ? encodeTimelineCursor({ at: last.at, source: last.source, id: last.id })
      : null;

    return { items: window, nextCursor };
  }
}

function clampLimit(raw?: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return TIMELINE_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(raw), 1), 200);
}

function canonicalCompare(a: TimelineItem, b: TimelineItem): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  if (a.source !== b.source) return a.source < b.source ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function isStrictlyOlder(item: TimelineItem, cursor: { at: string; source: string; id: string }): boolean {
  if (item.at !== cursor.at) return item.at < cursor.at;
  if (item.source !== cursor.source) return item.source > cursor.source;
  return item.id > cursor.id;
}

function isSelectedSource(adapter: TimelineAdapter, sources: Set<TimelineSource>): boolean {
  if (adapter instanceof ActivityTimelineAdapter) return sources.has("activity");
  if (adapter instanceof OrderStatusTimelineAdapter) return sources.has("order_status");
  if (adapter instanceof TtnTimelineAdapter) return sources.has("ttn");
  return true;
}
