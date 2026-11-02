import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHmac } from "crypto";
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
      { mergeCart: async () => undefined } as never,
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
      { mergeCart: async () => undefined } as never,
    );

    const session = await service.createSession(initData);
    assert.equal(session.contactId, "c-conv");
    assert.equal(session.firstName, "Максим");
    assert.equal(session.lastName, "Петренко");
    assert.equal(session.loggedIn, true);
    assert.ok(updates.length >= 1);
  });
});
