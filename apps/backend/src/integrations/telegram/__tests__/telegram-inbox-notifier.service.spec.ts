import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TelegramInboxNotifierService } from "../telegram-inbox-notifier.service";
import type { NotificationsService } from "../../../notifications/notifications.service";
import type { PrismaService } from "../../../prisma/prisma.service";

function makePrisma(overrides: Partial<Record<string, unknown>> = {}): PrismaService {
  return {
    conversation: {
      findUnique: async () => null,
    },
    user: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    telegramAccount: {
      findFirst: async () => null,
    },
    userNotification: {
      findFirst: async () => null,
      update: async ({ data }: { data: Record<string, unknown> }) => ({ id: "n1", ...data }),
    },
    ...overrides,
  } as unknown as PrismaService;
}

function makeNotifications(creates: Array<Record<string, unknown>> = []): NotificationsService {
  return {
    create: async (params: Record<string, unknown>) => {
      creates.push(params);
      return { id: "n-new", ...params };
    },
  } as unknown as NotificationsService;
}

describe("TelegramInboxNotifierService", () => {
  it("skips /link, /help, plain /start, menu labels and callbacks", () => {
    const service = new TelegramInboxNotifierService(makePrisma(), makeNotifications());
    assert.equal(service.shouldSkipNotification("/link abc123"), true);
    assert.equal(service.shouldSkipNotification("/docs 121"), true);
    assert.equal(service.shouldSkipNotification("/help"), true);
    assert.equal(service.shouldSkipNotification("/menu"), true);
    assert.equal(service.shouldSkipNotification("/start"), true);
    assert.equal(service.shouldSkipNotification("/START"), true);
    assert.equal(service.shouldSkipNotification("🛍 Каталог"), true);
    assert.equal(service.shouldSkipNotification("cat:p:1"), true);
    assert.equal(service.shouldSkipNotification("Привіт"), false);
    assert.equal(service.shouldSkipNotification(null), false);
  });

  it("notifies assigned manager only", async () => {
    const creates: Array<Record<string, unknown>> = [];
    const prisma = makePrisma({
      conversation: {
        findUnique: async () => ({
          id: "conv1",
          assignedToUserId: "mgr1",
          leadId: "lead1",
          contact: null,
          lead: { ownerId: "owner1", fullName: "Іван", firstName: null, lastName: null, phone: null },
        }),
      },
    });
    const service = new TelegramInboxNotifierService(prisma, makeNotifications(creates));
    await service.notifyInboundMessage({
      conversationId: "conv1",
      telegramChatId: "123",
      messageText: "Потрібна консультація",
    });

    assert.equal(creates.length, 1);
    assert.equal(creates[0]?.userId, "mgr1");
    assert.equal(creates[0]?.type, "TELEGRAM_MESSAGE");
    assert.equal(creates[0]?.entityType, "CONVERSATION");
    assert.equal(creates[0]?.entityId, "conv1");
  });

  it("falls back to lead owner when unassigned", async () => {
    const creates: Array<Record<string, unknown>> = [];
    const prisma = makePrisma({
      conversation: {
        findUnique: async () => ({
          id: "conv1",
          assignedToUserId: null,
          leadId: "lead1",
          contact: null,
          lead: { ownerId: "owner1", fullName: "Петро", firstName: null, lastName: null, phone: null },
        }),
      },
    });
    const service = new TelegramInboxNotifierService(prisma, makeNotifications(creates));
    await service.notifyInboundMessage({
      conversationId: "conv1",
      telegramChatId: "123",
      messageText: "Добрий день",
    });

    assert.equal(creates.length, 1);
    assert.equal(creates[0]?.userId, "owner1");
  });

  it("falls back to ADMIN and LEAD only when no assignee or owner", async () => {
    const creates: Array<Record<string, unknown>> = [];
    let roleFilter: unknown;
    const prisma = makePrisma({
      conversation: {
        findUnique: async () => ({
          id: "conv1",
          assignedToUserId: null,
          leadId: null,
          contact: { firstName: "Олена", lastName: "К.", phone: null },
          lead: null,
        }),
      },
      user: {
        findFirst: async () => null,
        findMany: async (args: { where: { role: { in: string[] } } }) => {
          roleFilter = args.where.role.in;
          return [{ id: "admin1" }, { id: "lead1" }];
        },
      },
    });
    const service = new TelegramInboxNotifierService(prisma, makeNotifications(creates));
    await service.notifyInboundMessage({
      conversationId: "conv1",
      telegramChatId: "999",
      messageText: "Hello",
    });

    assert.deepEqual(roleFilter, ["ADMIN", "LEAD"]);
    assert.equal(creates.length, 2);
    assert.deepEqual(
      creates.map((c) => c.userId).sort(),
      ["admin1", "lead1"],
    );
    assert.equal(creates[0]?.title, "Telegram: К. Олена");
  });

  it("uses telegram peer name when contact is missing", async () => {
    const creates: Array<Record<string, unknown>> = [];
    const prisma = makePrisma({
      conversation: {
        findUnique: async () => ({
          id: "conv1",
          assignedToUserId: "mgr1",
          leadId: null,
          contact: null,
          lead: null,
        }),
      },
      telegramAccount: {
        findFirst: async () => ({
          firstName: "Max",
          lastName: null,
          username: "max_tg",
        }),
      },
    });
    const service = new TelegramInboxNotifierService(prisma, makeNotifications(creates));
    await service.notifyInboundMessage({
      conversationId: "conv1",
      telegramChatId: "555",
      messageText: "Hi",
    });
    assert.equal(creates[0]?.title, "Telegram: Max · @max_tg");
  });

  it("skips notifications for linked staff chats", async () => {
    const creates: Array<Record<string, unknown>> = [];
    const prisma = makePrisma({
      conversation: {
        findUnique: async () => ({
          id: "conv1",
          assignedToUserId: null,
          leadId: null,
          contact: null,
          lead: null,
        }),
      },
      user: {
        findFirst: async () => ({ fullName: "Оля", email: "o@ex.com", role: "MANAGER" }),
        findMany: async () => [],
      },
    });
    const service = new TelegramInboxNotifierService(prisma, makeNotifications(creates));
    await service.notifyInboundMessage({
      conversationId: "conv1",
      telegramChatId: "staff-chat",
      messageText: "ping",
    });
    assert.equal(creates.length, 0);
  });
});

