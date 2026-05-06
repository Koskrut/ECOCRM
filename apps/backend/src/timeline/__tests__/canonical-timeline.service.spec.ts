import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalTimelineService } from "../canonical-timeline.service";
import type { TimelineItem } from "../timeline.types";

type FetchArgs = { entityType: "contact" | "lead" | "company" | "order"; entityId: string; cursorAt: Date | null; limit: number };

function makeItem(id: string, at: string, source: TimelineItem["source"]): TimelineItem {
  return {
    id,
    source,
    kind: "comment",
    entity: { type: "contact", id: "ct-1" },
    title: id,
    body: "",
    at,
    createdAt: at,
    pinnedAt: null,
    actor: { id: null, name: "system" },
    canEdit: false,
    canDelete: false,
    canPin: false,
    meta: { kind: "raw", data: {} },
  };
}

test("canonical timeline merges sources and paginates by composite cursor", async () => {
  const accessCalls: Array<{ entityType: string; entityId: string }> = [];
  const access = {
    assertAccess: async (entityType: string, entityId: string) => {
      accessCalls.push({ entityType, entityId });
    },
  };

  const batchA = [
    makeItem("activity:a3", "2026-05-06T10:00:00.000Z", "activity"),
    makeItem("activity:a2", "2026-05-05T10:00:00.000Z", "activity"),
  ];
  const batchB = [
    makeItem("status:s3", "2026-05-06T09:00:00.000Z", "order_status"),
    makeItem("status:s2", "2026-05-04T10:00:00.000Z", "order_status"),
  ];

  const mkAdapter = (items: TimelineItem[]) => ({ supports: () => true, fetch: async (_: FetchArgs) => items });

  const service = new CanonicalTimelineService(access as never, mkAdapter(batchA) as never, mkAdapter(batchB) as never, mkAdapter([]) as never);

  const page1 = await service.list({ entityType: "contact", entityId: "ct-1", limit: 2 });
  assert.equal(accessCalls.length, 1);
  assert.deepEqual(
    page1.items.map((x) => x.id),
    ["activity:a3", "status:s3"],
  );
  assert.ok(page1.nextCursor);

  const page2 = await service.list({ entityType: "contact", entityId: "ct-1", limit: 2, cursor: page1.nextCursor ?? undefined });
  assert.deepEqual(
    page2.items.map((x) => x.id),
    ["activity:a2", "status:s2"],
  );
});
