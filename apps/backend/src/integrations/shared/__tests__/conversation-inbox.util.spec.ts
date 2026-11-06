import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countUnreadInbound,
  hideNoiseWhere,
  isHumanInboxMessage,
  isNoiseCommandText,
  isNoiseConversation,
  isTelegramInboxNoiseText,
  telegramHideNoiseWhere,
} from "../conversation-inbox.util";

describe("isNoiseCommandText", () => {
  it("detects /start /help /link /menu and bot-scoped forms", () => {
    assert.equal(isNoiseCommandText("/start"), true);
    assert.equal(isNoiseCommandText("/start payload"), true);
    assert.equal(isNoiseCommandText("/start@MyBot"), true);
    assert.equal(isNoiseCommandText("/help"), true);
    assert.equal(isNoiseCommandText("/menu"), true);
    assert.equal(isNoiseCommandText("/catalog"), true);
    assert.equal(isNoiseCommandText("/link TOKEN"), true);
    assert.equal(isNoiseCommandText("/client"), true);
    assert.equal(isNoiseCommandText("/docs 121"), true);
    assert.equal(isNoiseCommandText("/find"), true);
    assert.equal(isNoiseCommandText(""), true);
    assert.equal(isNoiseCommandText("   "), true);
  });

  it("keeps real messages and media placeholders", () => {
    assert.equal(isNoiseCommandText("Hello"), false);
    assert.equal(isNoiseCommandText("gfgfgg"), false);
    assert.equal(isNoiseCommandText(null), false);
    assert.equal(isNoiseCommandText("/started already"), false);
  });
});

describe("isTelegramInboxNoiseText", () => {
  it("treats menu labels and callback payloads as noise, and real text as not", () => {
    assert.equal(isTelegramInboxNoiseText("🛍 Каталог"), true);
    assert.equal(isTelegramInboxNoiseText("🛒 Кошик"), true);
    assert.equal(isTelegramInboxNoiseText("📦 Замовлення"), true);
    assert.equal(isTelegramInboxNoiseText("cat:p:1"), true);
    assert.equal(isTelegramInboxNoiseText("cart:x"), true);
    assert.equal(isTelegramInboxNoiseText("ord:1"), true);
    assert.equal(isTelegramInboxNoiseText("chk:pay"), true);
    assert.equal(isTelegramInboxNoiseText("/start payload"), true);
    assert.equal(isTelegramInboxNoiseText(""), true);
    assert.equal(isTelegramInboxNoiseText("Привіт"), false);
    assert.equal(isTelegramInboxNoiseText("[фото]"), false);
  });
});

describe("isNoiseConversation", () => {
  it("hides empty and /start-only threads", () => {
    assert.equal(isNoiseConversation([]), true);
    assert.equal(
      isNoiseConversation([{ direction: "INBOUND", text: "/start" }]),
      true,
    );
    assert.equal(
      isNoiseConversation([
        { direction: "INBOUND", text: "/start" },
        { direction: "INBOUND", text: "/help" },
      ]),
      true,
    );
  });

  it("keeps threads with human inbound, outbound, or internal notes", () => {
    assert.equal(
      isNoiseConversation([{ direction: "INBOUND", text: "Hello" }]),
      false,
    );
    assert.equal(
      isNoiseConversation([
        { direction: "INBOUND", text: "/start" },
        { direction: "OUTBOUND", text: "Вітаємо" },
      ]),
      false,
    );
    assert.equal(
      isNoiseConversation([
        { direction: "INBOUND", text: "/start" },
        { direction: "INTERNAL", text: "Тестовий чат" },
      ]),
      false,
    );
  });

  it("hides Telegram threads whose only human-looking content is bot UX", () => {
    assert.equal(
      isNoiseConversation(
        [
          { direction: "INBOUND", text: "/start" },
          { direction: "INBOUND", text: "🛍 Каталог" },
          { direction: "OUTBOUND", text: "Оберіть розділ", authorUserId: null },
        ],
        { telegram: true },
      ),
      true,
    );
    assert.equal(
      isNoiseConversation(
        [
          { direction: "INBOUND", text: "🛒 Кошик" },
          { direction: "INBOUND", text: "cat:p:1" },
        ],
        { telegram: true },
      ),
      true,
    );
  });

  it("keeps a Telegram thread when a manager replies, a note exists, or the client writes", () => {
    assert.equal(
      isNoiseConversation(
        [
          { direction: "INBOUND", text: "/start" },
          { direction: "OUTBOUND", text: "Добрий день", authorUserId: "mgr-1" },
        ],
        { telegram: true },
      ),
      false,
    );
    assert.equal(
      isNoiseConversation(
        [
          { direction: "INBOUND", text: "🛍 Каталог" },
          { direction: "INTERNAL", text: "Передзвонити" },
        ],
        { telegram: true },
      ),
      false,
    );
    assert.equal(
      isNoiseConversation(
        [{ direction: "INBOUND", text: "Потрібна ціна" }],
        { telegram: true },
      ),
      false,
    );
    assert.equal(
      isNoiseConversation(
        [{ direction: "INBOUND", text: null, mediaType: "voice" }],
        { telegram: true },
      ),
      false,
    );
  });
});

describe("isHumanInboxMessage", () => {
  it("ignores bot outbound, notes, and menu taps", () => {
    assert.equal(
      isHumanInboxMessage({ direction: "OUTBOUND", text: "меню", authorUserId: null }),
      false,
    );
    assert.equal(
      isHumanInboxMessage({ direction: "INTERNAL", text: "нотатка", authorUserId: "mgr" }),
      false,
    );
    assert.equal(
      isHumanInboxMessage({ direction: "INBOUND", text: "📦 Замовлення" }),
      false,
    );
    assert.equal(
      isHumanInboxMessage({ direction: "INBOUND", text: "Де моє замовлення?" }),
      true,
    );
    assert.equal(
      isHumanInboxMessage({ direction: "OUTBOUND", text: "Відправили", authorUserId: "mgr" }),
      true,
    );
    assert.equal(
      isHumanInboxMessage({ direction: "INBOUND", text: "[голосове повідомлення]", mediaType: "voice" }),
      true,
    );
  });
});

describe("hide noise where", () => {
  it("keeps Meta outbound even when the author is null", () => {
    const where = hideNoiseWhere();
    const outbound = where.OR?.find(
      (part) =>
        part &&
        typeof part === "object" &&
        "messages" in part &&
        part.messages?.some?.direction === "OUTBOUND",
    );
    assert.ok(outbound);
    assert.equal(JSON.stringify(outbound).includes("authorUserId"), false);
  });

  it("requires a real author for Telegram outbound to keep the thread", () => {
    const where = telegramHideNoiseWhere();
    const encoded = JSON.stringify(where);
    assert.equal(encoded.includes('"authorUserId"'), true);
    assert.equal(encoded.includes("🛍 Каталог"), true);
    assert.equal(encoded.includes("INTERNAL"), true);
  });
});

describe("countUnreadInbound", () => {
  const t0 = new Date("2026-01-01T10:00:00Z");
  const t1 = new Date("2026-01-01T11:00:00Z");
  const t2 = new Date("2026-01-01T12:00:00Z");

  it("counts all inbound when never read", () => {
    assert.equal(
      countUnreadInbound(
        [
          { direction: "INBOUND", sentAt: t0 },
          { direction: "OUTBOUND", sentAt: t1 },
          { direction: "INBOUND", sentAt: t2 },
          { direction: "INTERNAL", sentAt: t2 },
        ],
        null,
      ),
      2,
    );
  });

  it("counts only inbound after lastReadAt", () => {
    assert.equal(
      countUnreadInbound(
        [
          { direction: "INBOUND", sentAt: t0 },
          { direction: "INBOUND", sentAt: t2 },
        ],
        t1,
      ),
      1,
    );
  });
});
