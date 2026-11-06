import assert from "node:assert/strict";
import test from "node:test";
import { MessageDirection, MessageStatus } from "@prisma/client";
import { ConversationsService } from "../conversations.service";

type AnyFn = (...args: any[]) => any;

function mockFn(impl?: AnyFn) {
  const fn = ((...args: any[]) => {
    fn.calls.push(args);
    if (impl) return impl(...args);
    return undefined;
  }) as AnyFn & { calls: any[][] };
  fn.calls = [];
  return fn;
}

test("addInternalNote persists INTERNAL message and does not call Telegram API", async () => {
  const sendMessageToChat = mockFn(async () => ({ messageId: 1 }));
  const messageCreate = mockFn(async (args: any) => ({
    id: "m1",
    ...args.data,
    author: { id: "u1", fullName: "Mgr", email: "m@x" },
  }));
  const conversationUpdate = mockFn(async () => ({}));

  const prisma = {
    conversation: {
      findUnique: mockFn(async () => ({ id: "c1", assignedToUserId: null })),
      update: conversationUpdate,
    },
    message: { create: messageCreate },
  };

  const service = new ConversationsService(
    prisma as any,
    { sendMessageToChat } as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const result = await service.addInternalNote("c1", "  handoff note  ", {
    id: "u1",
    role: "MANAGER",
  } as any);

  assert.equal(sendMessageToChat.calls.length, 0);
  assert.equal(messageCreate.calls.length, 1);
  assert.equal(messageCreate.calls[0][0].data.direction, MessageDirection.INTERNAL);
  assert.equal(messageCreate.calls[0][0].data.text, "handoff note");
  assert.equal(messageCreate.calls[0][0].data.status, MessageStatus.SENT);
  assert.equal(conversationUpdate.calls.length, 0);
  assert.ok(result);
});

test("autoAssignByRegion assigns from contact.ownerId", async () => {
  const updates: any[] = [];
  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({
          id: "c1",
          assignedToUserId: null,
          contactId: "ct1",
          leadId: null,
          contact: { id: "ct1", ownerId: "mgr-kyiv", region: "Київська" },
          lead: null,
        })),
        updateMany: mockFn(async (args: any) => {
          updates.push(args);
          return { count: 1 };
        }),
      },
      user: {
        findFirst: mockFn(async () => ({ id: "mgr-kyiv" })),
      },
      contact: { update: mockFn(async () => ({})) },
      lead: { update: mockFn(async () => ({})) },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const assigned = await service.autoAssignByRegion("c1");
  assert.equal(assigned, "mgr-kyiv");
  assert.equal(updates[0]?.data?.assignedToUserId, "mgr-kyiv");
});

test("autoAssignByRegion resolves manager from org-chart region", async () => {
  const updates: any[] = [];
  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({
          id: "c1",
          assignedToUserId: null,
          contactId: "ct1",
          leadId: null,
          contact: { id: "ct1", ownerId: null, region: "Київська" },
          lead: null,
        })),
        updateMany: mockFn(async (args: any) => {
          updates.push(args);
          return { count: 1 };
        }),
      },
      user: {
        findFirst: mockFn(async (args: any) =>
          args?.where?.id === "mgr-kyiv" ? { id: "mgr-kyiv" } : null,
        ),
      },
      contact: {
        update: mockFn(async () => ({})),
      },
      lead: { update: mockFn(async () => ({})) },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {
      getOrgChartStructure: async () => ({
        assignments: { "m1-1": "mgr-kyiv" },
        extraSlots: [],
        regions: { "m1-1": ["Київська"] },
      }),
    } as any,
  );

  const assigned = await service.autoAssignByRegion("c1");
  assert.equal(assigned, "mgr-kyiv");
  assert.equal(updates[0]?.data?.assignedToUserId, "mgr-kyiv");
});

test("autoAssignByRegion is a no-op when already assigned", async () => {
  const update = mockFn(async () => ({}));
  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({
          id: "c1",
          assignedToUserId: "already",
          contactId: null,
          leadId: null,
          contact: null,
          lead: null,
        })),
        update,
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  assert.equal(await service.autoAssignByRegion("c1"), "already");
  assert.equal(update.calls.length, 0);
});

test("getMessages page 1 returns the newest window, not the oldest", async () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({
    id: `m${i + 1}`,
    conversationId: "c1",
    direction: MessageDirection.OUTBOUND,
    text: `msg-${i + 1}`,
    tgMessageId: null,
    authorUserId: "u1",
    author: { id: "u1", fullName: "Mgr", email: "m@x" },
    sentAt: new Date(1_700_000_000_000 + i * 1000),
    createdAt: new Date(1_700_000_000_000 + i * 1000),
    mediaType: null,
    fileId: null,
    fileUrl: null,
    status: MessageStatus.SENT,
  }));

  const findMany = mockFn(async (args: any) => {
    const sorted = [...rows].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
    return sorted.slice(args.skip, args.skip + args.take);
  });
  const count = mockFn(async () => rows.length);

  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({ id: "c1", assignedToUserId: null })),
      },
      message: { findMany, count },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const res = await service.getMessages("c1", { page: 1, pageSize: 50 }, {
    id: "u1",
    role: "ADMIN",
  } as any);

  assert.equal(findMany.calls[0][0].skip, 10);
  assert.equal(findMany.calls[0][0].take, 50);
  assert.equal(res.items[0]?.text, "msg-11");
  assert.equal(res.items[res.items.length - 1]?.text, "msg-60");
  assert.ok(res.items.some((m: any) => m.text === "msg-60"), "latest CRM reply is visible");
});

test("assign transfers to another manager and drops them from collaborators", async () => {
  const deleteMany = mockFn(async () => ({ count: 1 }));
  const update = mockFn(async () => ({
    id: "c1",
    assignedToUserId: "mgr-2",
    contact: null,
    lead: null,
    assignedTo: { id: "mgr-2", fullName: "Богдан", email: "b@x" },
    collaborators: [],
  }));
  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({
          id: "c1",
          assignedToUserId: "mgr-1",
          collaborators: [{ userId: "mgr-1" }],
        })),
        update,
      },
      user: {
        findFirst: mockFn(async () => ({ id: "mgr-2" })),
      },
      conversationCollaborator: { deleteMany },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const res = await service.assign("c1", "mgr-2", { id: "mgr-1", role: "MANAGER" } as any);
  assert.equal(deleteMany.calls[0][0].where.userId, "mgr-2");
  assert.equal(update.calls[0][0].data.assignedToUserId, "mgr-2");
  assert.equal(res.assignedTo?.id, "mgr-2");
});

test("assign rejects collaborator who tries to transfer someone else's chat", async () => {
  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({
          id: "c1",
          assignedToUserId: "mgr-1",
          collaborators: [{ userId: "mgr-collab" }],
        })),
        update: mockFn(async () => ({})),
      },
      user: { findFirst: mockFn(async () => ({ id: "mgr-2" })) },
      conversationCollaborator: { deleteMany: mockFn(async () => ({ count: 0 })) },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () => service.assign("c1", "mgr-2", { id: "mgr-collab", role: "MANAGER" } as any),
    (err: any) =>
      (typeof err?.getStatus === "function" && err.getStatus() === 403) ||
      /відповідальний/i.test(String(err?.message ?? err)),
  );
});

test("unassign clears all collaborators so the thread is a true open pool", async () => {
  const deleteMany = mockFn(async () => ({ count: 2 }));
  const update = mockFn(async () => ({
    id: "c1",
    assignedToUserId: null,
    contact: null,
    lead: null,
    assignedTo: null,
    collaborators: [],
  }));
  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({
          id: "c1",
          assignedToUserId: "mgr-1",
          collaborators: [{ userId: "mgr-1" }],
        })),
        update,
      },
      conversationCollaborator: { deleteMany },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  await service.assign("c1", null, { id: "mgr-1", role: "MANAGER" } as any);
  assert.deepEqual(deleteMany.calls[0][0].where, { conversationId: "c1" });
  assert.equal(update.calls[0][0].data.assignedToUserId, null);
});

test("addCollaborator invites a peer for joint work", async () => {
  const upsert = mockFn(async () => ({}));
  const findMany = mockFn(async () => [
    { user: { id: "mgr-2", fullName: "Богдан", email: "b@x" } },
  ]);
  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({
          id: "c1",
          assignedToUserId: "mgr-1",
          collaborators: [{ userId: "mgr-1" }],
        })),
      },
      user: {
        findFirst: mockFn(async () => ({
          id: "mgr-2",
          fullName: "Богдан",
          email: "b@x",
        })),
      },
      conversationCollaborator: { upsert, findMany },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const res = await service.addCollaborator("c1", "mgr-2", {
    id: "mgr-1",
    role: "MANAGER",
  } as any);
  assert.equal(upsert.calls.length, 1);
  assert.equal(res.collaborators[0]?.id, "mgr-2");
});

test("addCollaborator rejects a non-assignee collaborator inviting peers", async () => {
  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({
          id: "c1",
          assignedToUserId: "mgr-1",
          collaborators: [{ userId: "mgr-collab" }],
        })),
      },
      user: {
        findFirst: mockFn(async () => ({
          id: "mgr-3",
          fullName: "Ігор",
          email: "i@x",
        })),
      },
      conversationCollaborator: {
        upsert: mockFn(async () => ({})),
        findMany: mockFn(async () => []),
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () =>
      service.addCollaborator("c1", "mgr-3", {
        id: "mgr-collab",
        role: "MANAGER",
      } as any),
    (err: any) =>
      (typeof err?.getStatus === "function" && err.getStatus() === 403) ||
      /співавтора|відповідальний/i.test(String(err?.message ?? err)),
  );
});

test("setPinned toggles pinnedAt", async () => {
  const update = mockFn(async (args: any) => ({
    id: "c1",
    pinnedAt: args.data.pinnedAt,
    status: "OPEN",
    lastMessageAt: null,
  }));
  const prisma = {
    conversation: {
      findUnique: mockFn(async () => ({ id: "c1", assignedToUserId: null })),
      update,
    },
  };
  const service = new ConversationsService(prisma as any, {} as any, {} as any, {} as any, {} as any);

  const pinned = await service.setPinned("c1", true, { id: "u1", role: "ADMIN" } as any);
  assert.ok(pinned.pinnedAt);
  assert.equal(update.calls[0][0].data.pinnedAt instanceof Date, true);

  const unpinned = await service.setPinned("c1", false, { id: "u1", role: "ADMIN" } as any);
  assert.equal(update.calls[1][0].data.pinnedAt, null);
  assert.equal(unpinned.pinnedAt, null);
});

test("autoAssignByRegion stays unassigned when nobody can be resolved", async () => {
  const updateMany = mockFn(async () => ({ count: 1 }));
  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({
          id: "c1",
          assignedToUserId: null,
          contactId: "ct1",
          leadId: null,
          contact: { id: "ct1", ownerId: null, region: "" },
          lead: null,
        })),
        updateMany,
      },
      user: { findFirst: mockFn(async () => null) },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    { getOrgChartStructure: async () => ({ assignments: {}, extraSlots: [], regions: {} }) } as any,
  );

  assert.equal(await service.autoAssignByRegion("c1"), null);
  assert.equal(updateMany.calls.length, 0);
});

test("manager cannot read a chat assigned to another manager", async () => {
  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({
          id: "c1",
          assignedToUserId: "mgr-a",
          collaborators: [],
        })),
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () => service.getMessages("c1", {}, { id: "mgr-b", role: "MANAGER" } as any),
    (err: any) =>
      (typeof err?.getStatus === "function" && err.getStatus() === 403) ||
      /another manager/i.test(String(err?.message ?? err)),
  );
});

test("manager can read own, collaborator, and unassigned chats", async () => {
  const cases = [
    { assignedToUserId: "mgr-b", collaborators: [] },
    { assignedToUserId: "mgr-a", collaborators: [{ userId: "mgr-b" }] },
    { assignedToUserId: null, collaborators: [] },
  ];
  for (const row of cases) {
    const service = new ConversationsService(
      {
        conversation: {
          findUnique: mockFn(async () => ({ id: "c1", ...row })),
        },
        message: {
          count: mockFn(async () => 0),
          findMany: mockFn(async () => []),
        },
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const res = await service.getMessages("c1", {}, { id: "mgr-b", role: "MANAGER" } as any);
    assert.equal(res.total, 0);
  }
});

test("manager list is own chats, collaborator chats, and the unbound pool", async () => {
  let where: any;
  const service = new ConversationsService(
    {
      user: { findMany: mockFn(async () => [{ telegramChatId: "staff-dm" }]) },
      conversation: {
        findMany: mockFn(async (args: any) => {
          where = args.where;
          return [];
        }),
        count: mockFn(async () => 0),
      },
      telegramAccount: { findMany: mockFn(async () => []) },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    { getTelegramSecrets: async () => ({ staffGroupChatId: "-100group" }) } as any,
  );

  const res = await service.list({ channel: "TELEGRAM" } as any, {
    id: "mgr-a",
    role: "MANAGER",
  } as any);
  assert.equal(res.total, 0);

  const visibility = (where.AND as any[]).find((part) => Array.isArray(part?.OR) && part.OR.some((row: any) => "assignedToUserId" in row && row.assignedToUserId === "mgr-a"));
  assert.ok(visibility, "visibility OR is present");
  assert.deepEqual(
    visibility.OR.map((row: any) =>
      row.assignedToUserId === undefined
        ? "collaborator"
        : row.assignedToUserId,
    ),
    ["mgr-a", null, "collaborator"],
  );
  const encoded = JSON.stringify(where);
  assert.equal(encoded.includes("mgr-b"), false);
  assert.equal(encoded.includes("staff-dm"), true);
  assert.equal(encoded.includes("-100group"), true);
});

test("admin list is not restricted to one assignee", async () => {
  let where: any;
  const service = new ConversationsService(
    {
      user: { findMany: mockFn(async () => []) },
      conversation: {
        findMany: mockFn(async (args: any) => {
          where = args.where;
          return [];
        }),
        count: mockFn(async () => 0),
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    { getTelegramSecrets: async () => ({ staffGroupChatId: null }) } as any,
  );
  await service.list({} as any, { id: "admin-1", role: "ADMIN" } as any);
  const encoded = JSON.stringify(where);
  assert.equal(encoded.includes("assignedToUserId"), false);
});

test("claiming an unbound chat does not overwrite an assignee won in between", async () => {
  const updateMany = mockFn(async () => ({ count: 0 }));
  const update = mockFn(async () => ({}));
  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({
          id: "c1",
          assignedToUserId: null,
          collaborators: [],
        })),
        updateMany,
        update,
      },
      user: { findFirst: mockFn(async () => ({ id: "mgr-b" })) },
      conversationCollaborator: { deleteMany: mockFn(async () => ({ count: 0 })) },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () => service.assign("c1", "mgr-b", { id: "mgr-b", role: "MANAGER" } as any),
    (err: any) =>
      (typeof err?.getStatus === "function" && err.getStatus() === 409) ||
      /вже призначено/i.test(String(err?.message ?? err)),
  );
  assert.equal(updateMany.calls[0][0].where.assignedToUserId, null);
  assert.equal(update.calls.length, 0);
});

test("markRead writes the current user's cursor and does not move the shared lastReadAt", async () => {
  const upsert = mockFn(async () => ({}));
  const update = mockFn(async () => ({}));
  const service = new ConversationsService(
    {
      conversation: {
        findUnique: mockFn(async () => ({
          id: "c1",
          assignedToUserId: "mgr-a",
          collaborators: [{ userId: "mgr-b" }],
        })),
        update,
      },
      conversationReadState: { upsert },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const res = await service.markRead("c1", { id: "mgr-b", role: "MANAGER" } as any);
  assert.equal(res.ok, true);
  assert.equal(upsert.calls[0][0].where.conversationId_userId.userId, "mgr-b");
  assert.equal(update.calls.length, 0);
});
