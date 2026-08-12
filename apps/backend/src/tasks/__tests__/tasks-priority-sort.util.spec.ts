import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import { CRM_TIME_ZONE } from "../../crm-timezone";
import {
  compareTasksByPriority,
  sortTasksByPriority,
  taskUrgencyBucket,
} from "../tasks-priority-sort.util";

function kyivDate(y: number, m: number, d: number, h = 12): Date {
  return DateTime.fromObject({ year: y, month: m, day: d, hour: h }, { zone: CRM_TIME_ZONE }).toJSDate();
}

describe("tasks-priority-sort.util", () => {
  const now = kyivDate(2026, 8, 12, 10);

  it("classifies urgency buckets", () => {
    assert.equal(
      taskUrgencyBucket({ status: "OPEN", dueAt: kyivDate(2026, 8, 11) }, now),
      "overdue",
    );
    assert.equal(
      taskUrgencyBucket({ status: "IN_PROGRESS", dueAt: kyivDate(2026, 8, 12, 18) }, now),
      "today",
    );
    assert.equal(
      taskUrgencyBucket({ status: "OPEN", dueAt: kyivDate(2026, 8, 15) }, now),
      "upcoming",
    );
    assert.equal(taskUrgencyBucket({ status: "OPEN", dueAt: null }, now), "no_due");
    assert.equal(taskUrgencyBucket({ status: "DONE", dueAt: kyivDate(2026, 8, 11) }, now), "closed");
  });

  it("sorts overdue before today before upcoming", () => {
    const rows = [
      { id: "upcoming", dueAt: kyivDate(2026, 8, 20), status: "OPEN" as const, createdAt: now },
      { id: "overdue", dueAt: kyivDate(2026, 8, 10), status: "OPEN" as const, createdAt: now },
      { id: "today", dueAt: kyivDate(2026, 8, 12, 15), status: "OPEN" as const, createdAt: now },
    ];
    const sorted = sortTasksByPriority(rows, now);
    assert.deepEqual(sorted.map((r) => r.id), ["overdue", "today", "upcoming"]);
  });

  it("sorts OPEN before IN_PROGRESS within same bucket", () => {
    const a = { id: "a", dueAt: kyivDate(2026, 8, 12, 14), status: "IN_PROGRESS" as const, createdAt: now };
    const b = { id: "b", dueAt: kyivDate(2026, 8, 12, 16), status: "OPEN" as const, createdAt: now };
    assert.ok(compareTasksByPriority(b, a, now) < 0);
  });
});
