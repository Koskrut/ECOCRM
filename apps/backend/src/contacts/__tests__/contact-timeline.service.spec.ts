import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import { ContactsService } from "../contacts.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ContactAccessService } from "../contact-access.service";

describe("ContactsService.getTimeline", () => {
  it("returns unified contact timeline with activities, tasks and audit", async () => {
    const taskWhereCalls: unknown[] = [];
    const prisma = {
      contact: {
        findUnique: async () => ({ id: "contact-1", ownerId: "mgr-1" }),
      },
      activity: {
        findMany: async () => [
          {
            id: "a-1",
            type: "COMMENT",
            title: "Коментар",
            body: "Передзвонити завтра",
            occurredAt: new Date("2026-03-24T10:00:00.000Z"),
            createdAt: new Date("2026-03-24T10:00:00.000Z"),
            pinnedAt: null,
            createdBy: "mgr-1",
            call: null,
          },
        ],
      },
      task: {
        findMany: async (args: { where: unknown }) => {
          taskWhereCalls.push(args.where);
          return [
            {
              id: "t-1",
              assigneeId: "mgr-1",
              assignee: { id: "mgr-1", fullName: "Manager One" },
              createdById: "mgr-1",
              title: "Закрити питання по оплаті",
              body: "Нагадати про оплату",
              dueAt: new Date("2026-03-25T09:00:00.000Z"),
              completedAt: null,
              status: "OPEN",
              createdAt: new Date("2026-03-24T09:00:00.000Z"),
              updatedAt: new Date("2026-03-24T11:00:00.000Z"),
            },
          ];
        },
      },
      contactChangeHistory: {
        findMany: async () => [
          {
            id: "h-1",
            contactId: "contact-1",
            changedBy: "admin-1",
            action: "OWNER_CHANGED",
            payload: [{ field: "ownerId", oldValue: "Old", newValue: "New" }],
            createdAt: new Date("2026-03-24T12:00:00.000Z"),
          },
        ],
      },
      user: {
        findMany: async () => [
          { id: "mgr-1", fullName: "Manager One" },
          { id: "admin-1", fullName: "Admin User" },
        ],
      },
    } as unknown as PrismaService;

    const contactAccess = {
      assertCanViewContact: async () => undefined,
      getTeamUserIds: async () => ["lead-1", "mgr-1"],
    } as unknown as ContactAccessService;

    const svc = new ContactsService(prisma, contactAccess);
    const out = await svc.getTimeline("contact-1", {
      id: "mgr-1",
      email: "[email protected]",
      fullName: "Manager One",
      role: UserRole.MANAGER,
    });

    assert.deepStrictEqual(taskWhereCalls[0], {
      contactId: "contact-1",
      OR: [{ assigneeId: "mgr-1" }, { createdById: "mgr-1" }],
    });
    assert.strictEqual(out.items.length, 3);
    assert.deepStrictEqual(
      out.items.map((item) => [item.source, item.id]),
      [
        ["AUDIT", "h-1"],
        ["TASK", "t-1"],
        ["ACTIVITY", "a-1"],
      ],
    );
    assert.deepStrictEqual(out.items[0].audit, {
      action: "OWNER_CHANGED",
      payload: [{ field: "ownerId", oldValue: "Old", newValue: "New" }],
    });
    assert.deepStrictEqual(out.items[1].task, {
      status: "OPEN",
      dueAt: "2026-03-25T09:00:00.000Z",
      completedAt: null,
      assigneeId: "mgr-1",
      assigneeName: "Manager One",
    });
  });
});
