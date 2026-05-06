/** Canonical timeline contract shared between backend and web. */

export type TimelineEntityType = "contact" | "lead" | "company" | "order";

export type TimelineSource =
  | "activity"
  | "order_status"
  | "ttn"
  | "visit"
  | "call"
  | "system";

export type TimelineKind =
  | "comment"
  | "call"
  | "meeting"
  | "manual_call"
  | "status_change"
  | "shipment"
  | "visit"
  | "system_note";

export type TimelineActor = {
  id: string | null;
  name: string;
};

export type TimelineCallMeta = {
  direction?: string;
  status?: string;
  durationSec?: number;
  talkSec?: number;
  waitingSec?: number;
  recordingStatus?: string;
  recordingUrl?: string;
  startedAt?: string;
  from?: string;
  to?: string;
};

export type TimelineStatusMeta = {
  fromStage?: string | null;
  toStage?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
};

export type TimelineShipmentMeta = {
  documentNumber?: string;
  statusCode?: string | null;
  statusText?: string | null;
  carrier?: string | null;
  cost?: number | null;
};

export type TimelineMeta =
  | { kind: "call"; data: TimelineCallMeta }
  | { kind: "status"; data: TimelineStatusMeta }
  | { kind: "shipment"; data: TimelineShipmentMeta }
  | { kind: "raw"; data: Record<string, unknown> };

export type TimelineItem = {
  /** Stable unique id within the timeline (`activity:<id>`, `status:<id>`, `ttn:<id>`, ...). */
  id: string;
  source: TimelineSource;
  kind: TimelineKind;
  entity: { type: TimelineEntityType; id: string };
  /** Item title for the UI (already localized-neutral, not a translation key). */
  title: string;
  /** Optional descriptive body. */
  body: string;
  /** Primary timestamp the timeline sorts by (occurredAt for activity, createdAt for events). */
  at: string;
  /** Created-at timestamp (may equal `at`). */
  createdAt: string;
  /** Pin timestamp — currently only Activity supports pinning. */
  pinnedAt: string | null;
  actor: TimelineActor;
  /** Whether the item supports common UI actions; system-generated items are read-only. */
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  meta: TimelineMeta;
};

export type TimelinePage = {
  items: TimelineItem[];
  nextCursor: string | null;
};

/** Default page size for canonical timeline incremental loading. Backend max stays at 200. */
export declare const TIMELINE_PAGE_SIZE: number;
export declare const TIMELINE_MAX_LIMIT: number;
