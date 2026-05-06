/**
 * Backend mirror of the canonical timeline contract from `@crm/contracts`.
 * Kept structurally identical so the controller can return the canonical shape
 * without ad-hoc transforms in the proxy/UI layers.
 */
import type {
  TimelineActor,
  TimelineEntityType,
  TimelineItem as ContractTimelineItem,
  TimelineKind,
  TimelineMeta,
  TimelinePage as ContractTimelinePage,
  TimelineSource,
} from "@crm/contracts/timeline";

export type {
  TimelineActor,
  TimelineEntityType,
  TimelineKind,
  TimelineMeta,
  TimelineSource,
};

export type TimelineItem = ContractTimelineItem;
export type TimelinePage = ContractTimelinePage;

/**
 * Composite cursor encoded as base64url-JSON. Stable across mixed sources by
 * combining the primary timestamp, the source bucket and the item id.
 */
export type TimelineCursorPayload = {
  at: string;
  source: TimelineSource;
  id: string;
};
