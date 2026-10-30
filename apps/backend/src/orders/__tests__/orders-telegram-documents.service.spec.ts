import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { OrdersTelegramDocumentsService } from "../orders-telegram-documents.service";

function mockFn<T extends (...args: any[]) => any>(impl?: T) {
  const fn = ((...args: any[]) => {
    fn.calls.push(args);
    if (impl) return impl(...args);
    return undefined;
  }) as T & { calls: any[][] };
  fn.calls = [];
  return fn;
}

const actor = { id: "u1", email: "a@b.c", role: "MANAGER" as const, fullName: "Mgr" };

const sampleOrder = {
  id: "ord-1",
  orderNumber: "ORD-100",
  contactId: "c1",
  clientId: "c1",
  ownerId: "u1",
};

test("getStatus reports manager and client telegram links", async () => {
  const prisma = {
    user: {
      findUnique: mockFn(async () => ({ telegramChatId: "mgr-chat" })),
    },
    telegramAccount: {
      findFirst: mockFn(async () => ({ telegramChatId: "client-chat" })),
    },
    conversation: { findFirst: mockFn(async () => null) },
  };
  const orderDocuments = {
    getOrderForDocument: mockFn(async () => sampleOrder),
  };
  const telegram = { sendDocumentToChat: mockFn(async () => ({ messageId: 1 })) };
  const svc = new OrdersTelegramDocumentsService(
    prisma as any,
    orderDocuments as any,
    telegram as any,
  );

  const status = await svc.getStatus("ord-1", actor);
  assert.deepEqual(status, { managerLinked: true, clientLinked: true });
});

test("sendDocument me sends PDF to manager chat", async () => {
  const prisma = {
    user: {
      findUnique: mockFn(async () => ({ telegramChatId: "mgr-chat" })),
    },
    telegramAccount: { findFirst: mockFn(async () => null) },
    conversation: { findFirst: mockFn(async () => null) },
  };
  const pdf = Buffer.from("%PDF-test");
  const orderDocuments = {
    getOrderForDocument: mockFn(async () => sampleOrder),
    buildInvoicePdfFromOrder: mockFn(async () => pdf),
    buildWaybillPdfFromOrder: mockFn(async () => pdf),
  };
  const telegram = { sendDocumentToChat: mockFn(async () => ({ messageId: 1 })) };
  const svc = new OrdersTelegramDocumentsService(
    prisma as any,
    orderDocuments as any,
    telegram as any,
  );

  const result = await svc.sendDocument("ord-1", "invoice", "me", actor);
  assert.equal(result.ok, true);
  assert.equal(telegram.sendDocumentToChat.calls.length, 1);
  assert.equal(telegram.sendDocumentToChat.calls[0][0], "mgr-chat");
  assert.equal(telegram.sendDocumentToChat.calls[0][2], "invoice-ORD-100.pdf");
});

test("sendDocument me throws when manager has no Telegram", async () => {
  const prisma = {
    user: { findUnique: mockFn(async () => ({ telegramChatId: null })) },
    telegramAccount: { findFirst: mockFn(async () => null) },
    conversation: { findFirst: mockFn(async () => null) },
  };
  const orderDocuments = {
    getOrderForDocument: mockFn(async () => sampleOrder),
    buildInvoicePdfFromOrder: mockFn(async () => Buffer.from("%PDF")),
  };
  const telegram = { sendDocumentToChat: mockFn(async () => ({ messageId: 1 })) };
  const svc = new OrdersTelegramDocumentsService(
    prisma as any,
    orderDocuments as any,
    telegram as any,
  );

  await assert.rejects(
    () => svc.sendDocument("ord-1", "invoice", "me", actor),
    (err: unknown) => err instanceof BadRequestException,
  );
  assert.equal(telegram.sendDocumentToChat.calls.length, 0);
});

test("sendDocument client sends to linked client chat", async () => {
  const prisma = {
    user: { findUnique: mockFn(async () => ({ telegramChatId: "mgr-chat" })) },
    telegramAccount: {
      findFirst: mockFn(async () => ({ telegramChatId: "client-chat" })),
    },
    conversation: { findFirst: mockFn(async () => null) },
  };
  const pdf = Buffer.from("%PDF-way");
  const orderDocuments = {
    getOrderForDocument: mockFn(async () => sampleOrder),
    buildWaybillPdfFromOrder: mockFn(async () => pdf),
  };
  const telegram = { sendDocumentToChat: mockFn(async () => ({ messageId: 2 })) };
  const svc = new OrdersTelegramDocumentsService(
    prisma as any,
    orderDocuments as any,
    telegram as any,
  );

  await svc.sendDocument("ord-1", "waybill", "client", actor);
  assert.equal(telegram.sendDocumentToChat.calls[0][0], "client-chat");
  assert.equal(telegram.sendDocumentToChat.calls[0][2], "waybill-ORD-100.pdf");
  assert.match(String(telegram.sendDocumentToChat.calls[0][3]?.caption ?? ""), /SUPREX/);
});

test("sendDocument client throws when client has no Telegram", async () => {
  const prisma = {
    user: { findUnique: mockFn(async () => ({ telegramChatId: "mgr-chat" })) },
    telegramAccount: { findFirst: mockFn(async () => null) },
    conversation: { findFirst: mockFn(async () => null) },
  };
  const orderDocuments = {
    getOrderForDocument: mockFn(async () => sampleOrder),
    buildInvoicePdfFromOrder: mockFn(async () => Buffer.from("%PDF")),
  };
  const telegram = { sendDocumentToChat: mockFn(async () => ({ messageId: 1 })) };
  const svc = new OrdersTelegramDocumentsService(
    prisma as any,
    orderDocuments as any,
    telegram as any,
  );

  await assert.rejects(
    () => svc.sendDocument("ord-1", "invoice", "client", actor),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("sendDocument respects managerChatId override", async () => {
  const prisma = {
    user: { findUnique: mockFn(async () => ({ telegramChatId: "db-chat" })) },
    telegramAccount: { findFirst: mockFn(async () => null) },
    conversation: { findFirst: mockFn(async () => null) },
  };
  const orderDocuments = {
    getOrderForDocument: mockFn(async () => sampleOrder),
    buildInvoicePdfFromOrder: mockFn(async () => Buffer.from("%PDF")),
  };
  const telegram = { sendDocumentToChat: mockFn(async () => ({ messageId: 1 })) };
  const svc = new OrdersTelegramDocumentsService(
    prisma as any,
    orderDocuments as any,
    telegram as any,
  );

  await svc.sendDocument("ord-1", "invoice", "me", actor, { managerChatId: "override-chat" });
  assert.equal(telegram.sendDocumentToChat.calls[0][0], "override-chat");
  assert.equal(prisma.user.findUnique.calls.length, 0);
});
