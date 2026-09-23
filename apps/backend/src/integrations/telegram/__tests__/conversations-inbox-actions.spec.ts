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
  assert.equal(conversationUpdate.calls.length, 1);
  assert.ok(result);
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
  const service = new ConversationsService(prisma as any, {} as any, {} as any, {} as any);

  const pinned = await service.setPinned("c1", true, { id: "u1", role: "ADMIN" } as any);
  assert.ok(pinned.pinnedAt);
  assert.equal(update.calls[0][0].data.pinnedAt instanceof Date, true);

  const unpinned = await service.setPinned("c1", false, { id: "u1", role: "ADMIN" } as any);
  assert.equal(update.calls[1][0].data.pinnedAt, null);
  assert.equal(unpinned.pinnedAt, null);
});
