import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TelegramInboxNotifierService } from "../telegram-inbox-notifier.service";

describe("TelegramInboxNotifierService mute", () => {
  it("skips notify for a muted manager+conversation pair", async () => {
    const creates: unknown[] = [];
    const prisma = {
      conversation: {
        findUnique: async () => ({
          id: "conv-1",
          assignedToUserId: "mgr-1",
          leadId: null,
          contact: { firstName: "A", lastName: "B", phone: null },
          lead: null,
        }),
      },
      userNotification: {
        findFirst: async () => null,
      },
    };
    const notifications = {
      create: async (params: unknown) => {
        creates.push(params);
        return { id: "n1" };
      },
    };
    const svc = new TelegramInboxNotifierService(prisma as never, notifications as never);
    svc.muteConversation("mgr-1", "conv-1", 60_000);

    await svc.notifyInboundMessage({
      conversationId: "conv-1",
      telegramChatId: "100",
      messageText: "Привіт",
    });

    assert.equal(creates.length, 0);
  });
});
