import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHmac } from "crypto";
import { appendCatalogHandoff } from "../store-catalog-handoff";
import { StoreTelegramWebAppService } from "../store-telegram-webapp.service";

function signInitData(botToken: string, fields: Record<string, string>): string {
  const pairs = Object.entries(fields)
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  const dataCheckString = pairs.join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return [...pairs, `hash=${hash}`].join("&");
}

describe("StoreTelegramWebAppService.createSession", () => {
  it("prefills CRM contact names even when telegramAccount already has a phone", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-store-tg";
    const botToken = "123456:ABC-DEF";
    const user = JSON.stringify({
      id: 777,
      first_name: "TgName",
      last_name: "TgLast",
    });
    const initData = signInitData(botToken, {
      user,
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "q1",
    });

    const prisma = {
      telegramAccount: {
        findUnique: async () => ({
          id: "acc1",
          telegramChatId: "777",
          phone: "+380501112233",
          contactId: "c1",
          leadId: null,
          firstName: "TgName",
          lastName: "TgLast",
        }),
        create: async () => {
          throw new Error("should not create");
        },
        updateMany: async () => ({ count: 0 }),
      },
      conversation: { findUnique: async () => null },
      lead: { findUnique: async () => null },
      contact: {
        findUnique: async () => ({
          phone: "+380501112233",
          firstName: "Олена",
          lastName: "Коваленко",
        }),
      },
      customer: {
        findUnique: async () => ({ id: "cust1", contactId: "c1" }),
        create: async () => ({ id: "cust1", contactId: "c1" }),
      },
    };
    const service = new StoreTelegramWebAppService(
      prisma as never,
      { getTelegramSecrets: async () => ({ botToken }) } as never,
      { findContactByPhone: async () => null } as never,
      { unifyTelegramCart: async () => undefined } as never,
    );

    const session = await service.createSession(initData);
    assert.equal(session.loggedIn, true);
    assert.equal(session.firstName, "Олена");
    assert.equal(session.lastName, "Коваленко");
    assert.equal(session.phone, "+380501112233");
    assert.ok(session.storeToken);
  });

  it("resolves contactId from conversation when account link is missing", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-store-tg";
    const botToken = "123456:ABC-DEF";
    const user = JSON.stringify({ id: 888, first_name: "Max" });
    const initData = signInitData(botToken, {
      user,
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "q2",
    });

    const updates: unknown[] = [];
    const prisma = {
      telegramAccount: {
        findUnique: async () => ({
          id: "acc2",
          telegramChatId: "888",
          phone: "+380671112233",
          contactId: null,
          leadId: null,
          firstName: "Max",
          lastName: null,
        }),
        create: async () => {
          throw new Error("should not create");
        },
        updateMany: async (args: unknown) => {
          updates.push(args);
          return { count: 1 };
        },
      },
      conversation: {
        findUnique: async () => ({ contactId: "c-conv" }),
      },
      lead: { findUnique: async () => null },
      contact: {
        findUnique: async () => ({
          phone: "+380671112233",
          firstName: "Максим",
          lastName: "Петренко",
        }),
      },
      customer: {
        findUnique: async () => null,
        create: async () => ({ id: "cust2", contactId: "c-conv" }),
      },
    };
    const service = new StoreTelegramWebAppService(
      prisma as never,
      { getTelegramSecrets: async () => ({ botToken }) } as never,
      { findContactByPhone: async () => null } as never,
      { unifyTelegramCart: async () => undefined } as never,
    );

    const session = await service.createSession(initData);
    assert.equal(session.contactId, "c-conv");
    assert.equal(session.firstName, "Максим");
    assert.equal(session.lastName, "Петренко");
    assert.equal(session.loggedIn, true);
    assert.ok(updates.length >= 1);
  });

  it("logs in by the phone saved on the telegram account", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-store-tg";
    const botToken = "123456:ABC-DEF";
    const user = JSON.stringify({ id: 555, first_name: "Tg" });
    const initData = signInitData(botToken, {
      user,
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "q3",
    });
    const service = new StoreTelegramWebAppService(
      {
        telegramAccount: {
          findUnique: async () => ({
            id: "acc3",
            telegramChatId: "555",
            phone: "+380501112233",
            contactId: null,
            leadId: null,
            firstName: "Tg",
            lastName: null,
          }),
          create: async () => {
            throw new Error("should not create");
          },
          updateMany: async () => ({ count: 1 }),
        },
        conversation: { findUnique: async () => null },
        lead: { findUnique: async () => null, findFirst: async () => null },
        contact: {
          findUnique: async () => ({
            phone: "+380501112233",
            firstName: "Ірина",
            lastName: "Савчук",
          }),
        },
        customer: {
          findUnique: async () => ({ id: "cust3", contactId: "c-phone" }),
          create: async () => ({ id: "cust3", contactId: "c-phone" }),
        },
      } as never,
      { getTelegramSecrets: async () => ({ botToken }) } as never,
      { findContactByPhone: async () => ({ id: "c-phone" }) } as never,
      { unifyTelegramCart: async () => undefined } as never,
    );
    const session = await service.createSession(initData);
    assert.equal(session.loggedIn, true);
    assert.equal(session.contactId, "c-phone");
    assert.equal(session.firstName, "Ірина");
    assert.ok(session.storeToken);
  });

  it("does not open the cabinet when the phone is not in CRM yet", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-store-tg";
    const botToken = "123456:ABC-DEF";
    const user = JSON.stringify({ id: 556, first_name: "Олег" });
    const initData = signInitData(botToken, {
      user,
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "q4",
    });
    let created = false;
    const service = new StoreTelegramWebAppService(
      {
        telegramAccount: {
          findUnique: async () => ({
            id: "acc4",
            telegramChatId: "556",
            phone: "+380671234567",
            contactId: null,
            leadId: null,
            firstName: "Олег",
            lastName: "Мельник",
          }),
          create: async () => {
            throw new Error("should not create account");
          },
          updateMany: async () => ({ count: 1 }),
        },
        conversation: { findUnique: async () => null },
        lead: { findUnique: async () => null, findFirst: async () => null },
        contact: {
          findUnique: async () => null,
          create: async () => {
            created = true;
            return { id: "c-new" };
          },
        },
        customer: {
          findUnique: async () => null,
          create: async () => {
            throw new Error("should not create customer");
          },
        },
      } as never,
      { getTelegramSecrets: async () => ({ botToken }) } as never,
      { findContactByPhone: async () => null } as never,
      { unifyTelegramCart: async () => undefined } as never,
    );
    const session = await service.createSession(initData);
    assert.equal(created, false);
    assert.equal(session.contactId, null);
    assert.equal(session.loggedIn, false);
    assert.equal(session.storeToken, null);
    assert.equal(session.phone, "+380671234567");
  });

  it("keeps a draft contact out of the cabinet until onboarding finishes", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-store-tg";
    const botToken = "123456:ABC-DEF";
    const user = JSON.stringify({ id: 557, first_name: "Олег" });
    const initData = signInitData(botToken, {
      user,
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "q4b",
    });
    const service = new StoreTelegramWebAppService(
      {
        telegramAccount: {
          findUnique: async () => ({
            id: "acc4b",
            telegramChatId: "557",
            phone: "+380671234567",
            contactId: "c-draft",
            leadId: null,
            firstName: "Олег",
            lastName: null,
          }),
          create: async () => {
            throw new Error("should not create account");
          },
          updateMany: async () => ({ count: 1 }),
        },
        conversation: { findUnique: async () => null },
        lead: { findUnique: async () => null, findFirst: async () => null },
        contact: {
          findUnique: async () => ({
            phone: "+380671234567",
            firstName: "Клієнт",
            lastName: "Telegram",
            region: null,
            clientType: "Врач",
          }),
        },
        customer: {
          findUnique: async () => null,
          create: async () => {
            throw new Error("should not create customer");
          },
        },
      } as never,
      { getTelegramSecrets: async () => ({ botToken }) } as never,
      { findContactByPhone: async () => ({ id: "c-draft" }) } as never,
      { unifyTelegramCart: async () => undefined } as never,
    );
    const session = await service.createSession(initData);
    assert.equal(session.loggedIn, false);
    assert.equal(session.contactId, null);
    assert.equal(session.storeToken, null);
    assert.equal(session.firstName, null);
    assert.equal(session.lastName, null);
    assert.equal(session.region, null);
    assert.equal(session.phone, "+380671234567");
  });

  it("logs in from the catalog handoff phone when the telegram account has no contact", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-store-tg";
    const botToken = "123456:ABC-DEF";
    const user = JSON.stringify({ id: 555, first_name: "Tg" });
    const initData = signInitData(botToken, {
      user,
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "q5",
    });
    const tgAuth = new URL(
      appendCatalogHandoff("https://shop.example.com", {
        telegramUserId: "555",
        phone: "+380501112233",
        contactId: "c-handoff",
        firstName: "Ірина",
        lastName: "Савчук",
      }),
    ).searchParams.get("tgAuth");
    const service = new StoreTelegramWebAppService(
      {
        telegramAccount: {
          findUnique: async () => ({
            id: "acc5",
            telegramChatId: "555",
            phone: null,
            contactId: null,
            leadId: null,
            firstName: "Tg",
            lastName: null,
          }),
          create: async () => {
            throw new Error("should not create");
          },
          updateMany: async () => ({ count: 1 }),
        },
        conversation: { findUnique: async () => null },
        lead: { findUnique: async () => null, findFirst: async () => null },
        contact: {
          findUnique: async () => ({
            phone: "+380501112233",
            firstName: "Ірина",
            lastName: "Савчук",
          }),
        },
        customer: {
          findUnique: async () => ({ id: "cust5", contactId: "c-handoff" }),
          create: async () => ({ id: "cust5", contactId: "c-handoff" }),
        },
      } as never,
      { getTelegramSecrets: async () => ({ botToken }) } as never,
      { findContactByPhone: async () => null } as never,
      { unifyTelegramCart: async () => undefined } as never,
    );
    const session = await service.createSession(initData, tgAuth);
    assert.equal(session.loggedIn, true);
    assert.equal(session.contactId, "c-handoff");
    assert.equal(session.phone, "+380501112233");
    assert.ok(session.storeToken);
  });

  it("ignores a catalog handoff that belongs to a different Telegram user", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-store-tg";
    const botToken = "123456:ABC-DEF";
    const user = JSON.stringify({ id: 555, first_name: "Tg" });
    const initData = signInitData(botToken, {
      user,
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "q6",
    });
    const tgAuth = new URL(
      appendCatalogHandoff("https://shop.example.com", {
        telegramUserId: "999",
        phone: "+380501112233",
        contactId: "c-other",
      }),
    ).searchParams.get("tgAuth");
    const service = new StoreTelegramWebAppService(
      {
        telegramAccount: {
          findUnique: async () => ({
            id: "acc6",
            telegramChatId: "555",
            phone: null,
            contactId: null,
            leadId: null,
            firstName: "Tg",
            lastName: null,
          }),
          create: async () => {
            throw new Error("should not create");
          },
          updateMany: async () => ({ count: 1 }),
        },
        conversation: { findUnique: async () => null },
        lead: { findUnique: async () => null, findFirst: async () => null },
        contact: { findUnique: async () => null, create: async () => ({ id: "should-not" }) },
        customer: {
          findUnique: async () => null,
          create: async () => ({ id: "should-not", contactId: "should-not" }),
        },
      } as never,
      { getTelegramSecrets: async () => ({ botToken }) } as never,
      { findContactByPhone: async () => null } as never,
      { unifyTelegramCart: async () => undefined } as never,
    );
    const session = await service.createSession(initData, tgAuth);
    assert.equal(session.loggedIn, false);
    assert.equal(session.contactId, null);
    assert.equal(session.storeToken, null);
  });

  it("replaces a placeholder telegram phone with the catalog handoff", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-store-tg";
    const botToken = "123456:ABC-DEF";
    const user = JSON.stringify({ id: 555, first_name: "Tg" });
    const initData = signInitData(botToken, {
      user,
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "q7",
    });
    const tgAuth = new URL(
      appendCatalogHandoff("https://shop.example.com", {
        telegramUserId: "555",
        phone: "+380671112233",
        contactId: "c-real",
        firstName: "Олег",
        lastName: "Мельник",
      }),
    ).searchParams.get("tgAuth");
    const service = new StoreTelegramWebAppService(
      {
        telegramAccount: {
          findUnique: async () => ({
            id: "acc7",
            telegramChatId: "555",
            phone: "00123456789",
            contactId: null,
            leadId: null,
            firstName: "Tg",
            lastName: null,
          }),
          create: async () => {
            throw new Error("should not create");
          },
          updateMany: async () => ({ count: 1 }),
        },
        conversation: { findUnique: async () => null },
        lead: { findUnique: async () => null, findFirst: async () => null },
        contact: {
          findUnique: async () => ({
            phone: "+380671112233",
            firstName: "Олег",
            lastName: "Мельник",
          }),
        },
        customer: {
          findUnique: async () => ({ id: "cust7", contactId: "c-real" }),
          create: async () => ({ id: "cust7", contactId: "c-real" }),
        },
      } as never,
      { getTelegramSecrets: async () => ({ botToken }) } as never,
      { findContactByPhone: async () => null } as never,
      { unifyTelegramCart: async () => undefined } as never,
    );
    const session = await service.createSession(initData, tgAuth);
    assert.equal(session.loggedIn, true);
    assert.equal(session.contactId, "c-real");
    assert.equal(session.phone, "+380671112233");
    assert.ok(session.storeToken);
  });
});
