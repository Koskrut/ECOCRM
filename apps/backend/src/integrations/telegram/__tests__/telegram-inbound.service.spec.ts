import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { Prisma } from "@prisma/client";
import { TelegramService } from "../telegram.service";
import type { TelegramUpdate } from "../telegram.types";

type AnyRec = Record<string, unknown>;

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint", {
    code: "P2002",
    clientVersion: "test",
  });
}

/** Mock Prisma with recording + per-test overrides for the handleInboundUpdate path. */
function makePrisma(overrides: AnyRec = {}) {
  const calls: Record<string, AnyRec[]> = {
    leadCreate: [],
    contactCreate: [],
    inboundUpdate: [],
    messageCreate: [],
  };
  const base: AnyRec = {
    telegramInboundUpdate: {
      create: async () => ({ id: "inb1", createdAt: new Date() }),
      findUnique: async () => null,
      update: async (args: AnyRec) => {
        calls.inboundUpdate.push(args);
        return {};
      },
      deleteMany: async () => ({ count: 0 }),
    },
    storeTelegramLinkToken: {
      findUnique: async () => null,
      delete: async () => ({}),
    },
    lead: {
      findFirst: async () => null,
      findUnique: async () => null,
      create: async (args: AnyRec) => {
        calls.leadCreate.push(args);
        return { id: "lead-new" };
      },
      update: async () => ({}),
    },
    contact: {
      findUnique: async () => null,
      create: async (args: AnyRec) => {
        calls.contactCreate.push(args);
        return { id: "contact-new" };
      },
    },
    company: {
      findFirst: async () => null,
    },
    telegramAccount: {
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    conversation: {
      findUnique: async () => null,
      create: async () => ({ id: "conv1" }),
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    message: {
      create: async (args: AnyRec) => {
        calls.messageCreate.push(args);
        return {};
      },
      count: async () => 1,
    },
    $transaction: async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops),
    ...overrides,
  };
  return { prisma: base, calls };
}

function makeService(prisma: AnyRec) {
  const sent: Array<{ chatId: string; text: string }> = [];
  const confirmLinkCalls: AnyRec[] = [];
  const settings = {
    getTelegramSecrets: async () => ({
      botToken: "T",
      webhookSecret: "S",
      publicBaseUrl: "https://api.example.com",
      leadCompanyId: null,
    }),
  };
  const contactsService = { findContactByPhone: async () => null };
  const phoneEntityLookup = { findCompanyIdByNormalizedKeys: async () => null };
  const authService = {
    confirmTelegramLink: async (...args: unknown[]) => {
      confirmLinkCalls.push({ args });
      return { email: "user@example.com" };
    },
  };
  const inboxNotifier = { notifyInboundMessage: async () => undefined };

  const service = new TelegramService(
    prisma as never,
    settings as never,
    contactsService as never,
    phoneEntityLookup as never,
    authService as never,
    inboxNotifier as never,
  );

  // Focus tests on orchestration: stub account upsert / menu / send.
  const upsertCalls: AnyRec[] = [];
  (service as unknown as AnyRec).upsertTelegramAccount = async (params: AnyRec) => {
    upsertCalls.push(params);
    return { id: "acc1", contactId: null, leadId: null };
  };
  (service as unknown as AnyRec).handleClientMenuAction = async () => false;
  (service as unknown as AnyRec).sendMessageToChat = async (chatId: string, text: string) => {
    sent.push({ chatId, text });
    return { messageId: 999 };
  };

  return {
    service,
    sent,
    upsertCalls,
    confirmLinkCalls,
    contactsService,
    phoneEntityLookup,
    settings,
  };
}

function textUpdate(text: string, updateId = 1): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: 100 + updateId,
      date: 1700000000,
      chat: { id: 12345, type: "private" },
      from: { id: 777, first_name: "Тест" },
      text,
    },
  };
}

function contactShareUpdate(phone: string, updateId = 2): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: 200 + updateId,
      date: 1700000000,
      chat: { id: 12345, type: "private" },
      from: { id: 777, first_name: "Тест" },
      contact: { phone_number: phone },
    },
  };
}

describe("TelegramService.handleInboundUpdate", () => {
  let harness: ReturnType<typeof makeService>;
  let mock: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    mock = makePrisma();
    harness = makeService(mock.prisma);
  });

  it("is idempotent: already-processed duplicate update is skipped", async () => {
    mock = makePrisma({
      telegramInboundUpdate: {
        create: async () => {
          throw p2002();
        },
        findUnique: async () => ({ id: "inb1", processedAt: new Date(), createdAt: new Date() }),
        update: async () => ({}),
      },
    });
    harness = makeService(mock.prisma);

    await harness.service.handleInboundUpdate(textUpdate("Привіт"));

    assert.equal(harness.upsertCalls.length, 0, "should not process the account");
    assert.equal(harness.sent.length, 0, "should not send any reply");
  });

  it("is idempotent: recent unprocessed duplicate is skipped (no reprocess)", async () => {
    mock = makePrisma({
      telegramInboundUpdate: {
        create: async () => {
          throw p2002();
        },
        findUnique: async () => ({ id: "inb1", processedAt: null, createdAt: new Date() }),
        update: async () => ({}),
      },
    });
    harness = makeService(mock.prisma);

    await harness.service.handleInboundUpdate(textUpdate("Привіт"));

    assert.equal(harness.upsertCalls.length, 0);
    assert.equal(harness.sent.length, 0);
  });

  it("does not stack request-phone and auto-reply on the first message", async () => {
    await harness.service.handleInboundUpdate(textUpdate("Хочу замовлення"));

    // Exactly one reply: the request-phone prompt (auto-reply suppressed).
    assert.equal(harness.sent.length, 1);
    assert.match(harness.sent[0].text, /номер/i);
  });

  it("sends a single welcome for plain /start without phone", async () => {
    await harness.service.handleInboundUpdate(textUpdate("/start"));

    assert.equal(harness.sent.length, 1);
    assert.match(harness.sent[0].text, /Вітаємо/);
  });

  it("creates a lead in the company the phone already belongs to", async () => {
    mock = makePrisma();
    harness = makeService(mock.prisma);
    (harness.phoneEntityLookup as AnyRec).findCompanyIdByNormalizedKeys = async () => "company-42";

    await harness.service.handleInboundUpdate(contactShareUpdate("+380501234567"));

    assert.equal(mock.calls.leadCreate.length, 1);
    const data = mock.calls.leadCreate[0].data as AnyRec;
    assert.equal(data.companyId, "company-42");
    assert.equal(mock.calls.contactCreate.length, 0, "no placeholder contact");
  });

  it("does not create a placeholder contact when no company can be resolved", async () => {
    await harness.service.handleInboundUpdate(contactShareUpdate("+380501234567"));

    assert.equal(mock.calls.contactCreate.length, 0);
    assert.equal(mock.calls.leadCreate.length, 0);
  });

  it("rejects /link outside a private chat and does not confirm the link", async () => {
    const update: TelegramUpdate = {
      update_id: 5,
      message: {
        message_id: 500,
        date: 1700000000,
        chat: { id: -100, type: "group" },
        from: { id: 777, first_name: "Тест" },
        text: "/link abc123",
      },
    };

    await harness.service.handleInboundUpdate(update);

    assert.equal(harness.confirmLinkCalls.length, 0);
    assert.equal(harness.sent.length, 1);
    assert.match(harness.sent[0].text, /приватному чаті/);
  });

  it("confirms /link in a private chat and replies with the linked account", async () => {
    await harness.service.handleInboundUpdate(textUpdate("/link tok-123", 6));

    assert.equal(harness.confirmLinkCalls.length, 1);
    assert.deepEqual(harness.confirmLinkCalls[0].args, ["tok-123", "777", "12345"]);
    assert.equal(harness.sent.length, 1);
    assert.match(harness.sent[0].text, /user@example.com/);
  });

  it("persists media messages with mediaType and fileId", async () => {
    const update: TelegramUpdate = {
      update_id: 7,
      message: {
        message_id: 700,
        date: 1700000000,
        chat: { id: 12345, type: "private" },
        from: { id: 777, first_name: "Тест" },
        photo: [{ file_id: "small" }, { file_id: "large" }],
      },
    };

    await harness.service.handleInboundUpdate(update);

    assert.equal(mock.calls.messageCreate.length, 1);
    const data = mock.calls.messageCreate[0].data as AnyRec;
    assert.equal(data.mediaType, "photo");
    assert.equal(data.fileId, "large");
  });
});
