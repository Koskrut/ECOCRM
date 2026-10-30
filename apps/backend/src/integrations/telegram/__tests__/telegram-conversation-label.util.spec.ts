import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatTelegramConversationLabel,
  formatTelegramPeerLabel,
  isPlaceholderPersonName,
} from "../telegram-conversation-label.util";

describe("telegram-conversation-label.util", () => {
  it("detects placeholder CRM names", () => {
    assert.equal(isPlaceholderPersonName("Telegram", "User"), true);
    assert.equal(isPlaceholderPersonName("Олена", "К."), false);
  });

  it("formats telegram peer with username", () => {
    assert.equal(
      formatTelegramPeerLabel({ firstName: "Іван", lastName: "Петренко", username: "ivan_p" }),
      "Іван Петренко · @ivan_p",
    );
    assert.equal(formatTelegramPeerLabel({ username: "only_user" }), "@only_user");
  });

  it("prefers real contact name and phone", () => {
    assert.equal(
      formatTelegramConversationLabel({
        contact: { firstName: "Олена", lastName: "Коваль", phone: "+380501112233" },
      }),
      "Коваль Олена · +380501112233",
    );
  });

  it("falls back from placeholder contact to telegram peer", () => {
    assert.equal(
      formatTelegramConversationLabel({
        contact: { firstName: "Telegram", lastName: "User", phone: null },
        peer: { firstName: "Oleg", lastName: null, username: "oleg_tg" },
        telegramChatId: "999",
      }),
      "Oleg · @oleg_tg",
    );
  });

  it("marks staff clearly", () => {
    assert.equal(
      formatTelegramConversationLabel({
        staffUser: { fullName: "Оля Менеджер", email: "o@ex.com" },
        peer: { firstName: "Olya", username: "olya" },
      }),
      "Співробітник · Оля Менеджер",
    );
  });

  it("uses telegram profile when no CRM link", () => {
    assert.equal(
      formatTelegramConversationLabel({
        peer: { firstName: "Max", lastName: "T", username: null },
        telegramChatId: "42",
      }),
      "Max T",
    );
  });
});
