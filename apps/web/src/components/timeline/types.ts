/**
 * Frontend re-exports of the canonical timeline contract. Backend (`apps/backend/src/timeline`)
 * and the shared `@crm/contracts` package are the source of truth — this barrel exists so
 * callers can `import type { TimelineItem } from "@/components/timeline/types"`.
 */
export type {
  TimelineActor,
  TimelineEntityType,
  TimelineItem,
  TimelineKind,
  TimelineMeta,
  TimelinePage,
  TimelineSource,
  TimelineCallMeta,
  TimelineStatusMeta,
  TimelineShipmentMeta,
} from "@crm/contracts/timeline";
