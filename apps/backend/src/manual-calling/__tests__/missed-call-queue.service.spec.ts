import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { CallQueueItemStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { MissedCallQueueService } from "../missed-call-queue.service";

type QueueRow = {
  id: string;
  callId: string | null;
  assigneeId: string;
  contactId: string | null;
  leadId: string | null;
  companyId: string | null;
  status: CallQueueItemStatus;
  sortOrder: number;
};

function makeTx(store: QueueRow[]) {
  let idSeq = 1;
  const tx = {
    callQueueItem: {
      findFirst: async (args: { where: Prisma.CallQueueItemWhereInput }) => {
        const w = args.where;
        return (
          store.find((row) => {
            if (w.assigneeId && row.assigneeId !== w.assigneeId) return false;
            if (w.contactId && row.contactId !== w.contactId) return false;
            if (w.leadId && row.leadId !== w.leadId) return false;
            if (w.callId === null && row.callId !== null) return false;
            if (typeof w.callId === "object" && w.callId?.not === null && row.callId === null) {
              return false;
            }
            const statuses = (w.status as { in?: CallQueueItemStatus[] })?.in;
            if (statuses && !statuses.includes(row.status)) return false;
            return true;
          }) ?? null
        );
      },
      upsert: async (args: {
        where: { callId: string };
        create: Omit<QueueRow, "id">;
        update: Partial<QueueRow>;
      }) => {
        const idx = store.findIndex((r) => r.callId === args.where.callId);
        if (idx >= 0) {
          store[idx] = { ...store[idx], ...args.update };
          return store[idx];
        }
        const row: QueueRow = {
          id: `q${idSeq++}`,
          ...args.create,
        };
        store.push(row);
        return row;
      },
      updateMany: async (args: {
        where: Prisma.CallQueueItemWhereInput;
        data: { status: CallQueueItemStatus };
      }) => {
        const w = args.where;
        const or = (w.OR ?? []) as Prisma.CallQueueItemWhereInput[];
        let count = 0;
        for (const row of store) {
          const statuses = (w.status as { in?: CallQueueItemStatus[] })?.in;
          if (statuses && !statuses.includes(row.status)) continue;
          if (
            typeof w.callId === "object" &&
            w.callId?.not === null &&
            row.callId === null
          ) {
            continue;
          }
          const matchesOr =
            or.length === 0 ||
            or.some((clause) => {
              if (clause.contactId && row.contactId === clause.contactId) return true;
              if (clause.leadId && row.leadId === clause.leadId) return true;
              return false;
            });
          if (!matchesOr) continue;
          row.status = args.data.status;
          count++;
        }
        return { count };
      },
    },
  };
  return tx as unknown as Prisma.TransactionClient;
}

describe("MissedCallQueueService", () => {
  let store: QueueRow[];
  let service: MissedCallQueueService;

  beforeEach(() => {
    store = [];
    service = new MissedCallQueueService();
  });

  it("creates PENDING queue item for inbound missed call", async () => {
    const tx = makeTx(store);
    await service.enqueueFromMissedCall(tx, {
      callId: "call_1",
      assigneeId: "mgr_1",
      contactId: "c1",
      leadId: null,
      companyId: null,
    });
    assert.equal(store.length, 1);
    assert.equal(store[0]!.status, CallQueueItemStatus.PENDING);
    assert.equal(store[0]!.callId, "call_1");
    assert.equal(store[0]!.sortOrder, 0);
  });

  it("re-ingest upserts by callId without duplicate rows", async () => {
    const tx = makeTx(store);
    const params = {
      callId: "call_1",
      assigneeId: "mgr_1",
      contactId: "c1",
      leadId: null,
      companyId: null,
    };
    await service.enqueueFromMissedCall(tx, params);
    await service.enqueueFromMissedCall(tx, params);
    assert.equal(store.length, 1);
  });

  it("does not enqueue second missed call for same contact while one is active", async () => {
    const tx = makeTx(store);
    await service.enqueueFromMissedCall(tx, {
      callId: "call_1",
      assigneeId: "mgr_1",
      contactId: "c1",
      leadId: null,
      companyId: null,
    });
    await service.enqueueFromMissedCall(tx, {
      callId: "call_2",
      assigneeId: "mgr_1",
      contactId: "c1",
      leadId: null,
      companyId: null,
    });
    assert.equal(store.length, 1);
    assert.equal(store[0]!.callId, "call_1");
  });

  it("cancels missed-queue item on answered conversation", async () => {
    const tx = makeTx(store);
    await service.enqueueFromMissedCall(tx, {
      callId: "call_1",
      assigneeId: "mgr_1",
      contactId: "c1",
      leadId: null,
      companyId: null,
    });
    await service.resolveOnConversation(tx, { contactId: "c1", leadId: null });
    assert.equal(store[0]!.status, CallQueueItemStatus.CANCELLED);
  });

  it("does not cancel manual queue items without callId", async () => {
    store.push({
      id: "manual_1",
      callId: null,
      assigneeId: "mgr_1",
      contactId: "c1",
      leadId: null,
      companyId: null,
      status: CallQueueItemStatus.PENDING,
      sortOrder: 5,
    });
    const tx = makeTx(store);
    await service.resolveOnConversation(tx, { contactId: "c1", leadId: null });
    const manual = store.find((r) => r.id === "manual_1");
    assert.equal(manual?.status, CallQueueItemStatus.PENDING);
  });

  it("skips enqueue when MISSED_CALL_QUEUE_DISABLED", async () => {
    const prev = process.env.MISSED_CALL_QUEUE_DISABLED;
    process.env.MISSED_CALL_QUEUE_DISABLED = "true";
    try {
      const tx = makeTx(store);
      await service.enqueueFromMissedCall(tx, {
        callId: "call_1",
        assigneeId: "mgr_1",
        contactId: "c1",
        leadId: null,
        companyId: null,
      });
      assert.equal(store.length, 0);
    } finally {
      if (prev === undefined) delete process.env.MISSED_CALL_QUEUE_DISABLED;
      else process.env.MISSED_CALL_QUEUE_DISABLED = prev;
    }
  });
});
