import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countUnreadInbound,
  isNoiseCommandText,
  isNoiseConversation,
} from "../conversation-inbox.util";

describe("isNoiseCommandText", () => {
  it("detects /start /help /link and bot-scoped forms", () => {
    assert.equal(isNoiseCommandText("/start"), true);
    assert.equal(isNoiseCommandText("/start payload"), true);
    assert.equal(isNoiseCommandText("/start@MyBot"), true);
    assert.equal(isNoiseCommandText("/help"), true);
    assert.equal(isNoiseCommandText("/link TOKEN"), true);
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
