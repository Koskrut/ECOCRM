import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OrderStage, Prisma } from "@prisma/client";
import { TelegramClientNotifyService } from "../telegram-client-notify.service";

type AnyRec = Record<string, unknown>;

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("TelegramClientNotifyService", () => {
  it("skips duplicate stage fingerprints", async () => {
    let creates = 0;
    const sent: string[] = [];
    const prisma = {
      telegramClientNotifyLog: {
        create: async () => {
          creates += 1;
          if (creates > 1) throw p2002();
          return { id: "n1" };
        },
        deleteMany: async () => ({ count: 0 }),
      },
      order: {
        findUnique: async () => ({
          id: "o1",
          orderNumber: "100",
          clientId: "c1",
          contactId: "c1",
          debtAmount: 0,
          currency: "USD",
          ttns: [],
        }),
      },
      telegramAccount: {
        findFirst: async () => ({ telegramChatId: "chat-1" }),
      },
      conversation: {
        findUnique: async () => ({ id: "conv1" }),
        update: async () => ({}),
      },
      message: { create: async () => ({}) },
    };
    const telegram = {
      sendMessageToChat: async (_chat: string, text: string) => {
        sent.push(text);
        return { messageId: 1 };
      },
    };
    const service = new TelegramClientNotifyService(
      prisma as never,
      { getStoreConfig: async () => ({}) } as never,
      { registerClientOrderNotify: () => undefined } as never,
      { createPaymentLink: async () => ({ payPath: "/pay/x" }) } as never,
      telegram as never,
    );

    await service.notifyOrderStageChanged({
      orderId: "o1",
      fromStage: OrderStage.NEW,
      toStage: OrderStage.CONFIRMED,
    });
    await service.notifyOrderStageChanged({
      orderId: "o1",
      fromStage: OrderStage.NEW,
      toStage: OrderStage.CONFIRMED,
    });

    assert.equal(sent.length, 1);
    assert.match(sent[0], /Підтверджено|CONFIRMED|№100/);
  });

  it("does not consume dedup when there is no telegram chat", async () => {
    let creates = 0;
    const prisma = {
      telegramClientNotifyLog: {
        create: async () => {
          creates += 1;
          return { id: "n1" };
        },
        deleteMany: async () => ({ count: 0 }),
      },
      order: {
        findUnique: async () => ({
          id: "o1",
          orderNumber: "100",
          clientId: "c1",
          contactId: "c1",
          debtAmount: 0,
          currency: "USD",
          ttns: [],
        }),
      },
      telegramAccount: { findFirst: async () => null },
    };
    const service = new TelegramClientNotifyService(
      prisma as never,
      { getStoreConfig: async () => ({}) } as never,
      { registerClientOrderNotify: () => undefined } as never,
      { createPaymentLink: async () => ({ payPath: "/pay/x" }) } as never,
      { sendMessageToChat: async () => ({ messageId: 1 }) } as never,
    );

    await service.notifyOrderStageChanged({
      orderId: "o1",
      fromStage: OrderStage.NEW,
      toStage: OrderStage.CONFIRMED,
    });
    assert.equal(creates, 0);
  });

  it("ignores stages outside the client push set", async () => {
    const sent: string[] = [];
    const service = new TelegramClientNotifyService(
      {
        telegramClientNotifyLog: { create: async () => ({ id: "x" }), deleteMany: async () => ({ count: 0 }) },
      } as never,
      { getStoreConfig: async () => ({}) } as never,
      { registerClientOrderNotify: () => undefined } as never,
      { createPaymentLink: async () => ({ payPath: "/pay/x" }) } as never,
      {
        sendMessageToChat: async (_c: string, t: string) => {
          sent.push(t);
          return { messageId: 1 };
        },
      } as never,
    );

    await service.notifyOrderStageChanged({
      orderId: "o1",
      fromStage: OrderStage.NEW,
      toStage: OrderStage.AWAITING_STOCK,
    });
    assert.equal(sent.length, 0);
  });
});
