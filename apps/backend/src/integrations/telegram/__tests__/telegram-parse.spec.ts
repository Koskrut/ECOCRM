const { describe, it } = require("node:test");
const assert = require("node:assert");

// TelegramService.parseInbound is pure (no Prisma in path), so we test it via the class with a mock PrismaService
const { TelegramService } = require("../telegram.service");

const mockPrisma = {};
const service = new TelegramService(mockPrisma as never);

describe("TelegramService.parseInbound", () => {
  it("returns null when update has no message", () => {
    const update = { update_id: 1 };
    assert.strictEqual(service.parseInbound(update), null);
  });

  it("extracts chatId, userId, text from message", () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 101,
        date: 1700000000,
        chat: { id: -1001234567890 },
        from: {
          id: 123456789,
          first_name: "John",
          last_name: "Doe",
          username: "johndoe",
        },
        text: "Hello",
      },
    };
    const parsed = service.parseInbound(update);
    assert.ok(parsed);
    assert.strictEqual(parsed!.chatId, "-1001234567890");
    assert.strictEqual(parsed!.userId, "123456789");
    assert.strictEqual(parsed!.username, "johndoe");
    assert.strictEqual(parsed!.firstName, "John");
    assert.strictEqual(parsed!.lastName, "Doe");
    assert.strictEqual(parsed!.text, "Hello");
    assert.strictEqual(parsed!.phone, null);
    assert.strictEqual(parsed!.messageId, 101);
  });

  it("extracts phone from contact share", () => {
    const update = {
      update_id: 2,
      message: {
        message_id: 102,
        date: 1700000001,
        chat: { id: 987654321 },
        from: { id: 111, first_name: "Jane" },
        contact: {
          phone_number: "+38 050 123 45 67",
          first_name: "Jane",
          user_id: 111,
        },
      },
    };
    const parsed = service.parseInbound(update);
    assert.ok(parsed);
    assert.strictEqual(parsed!.chatId, "987654321");
    assert.strictEqual(parsed!.userId, "111");
    assert.strictEqual(parsed!.firstName, "Jane");
    assert.ok(parsed!.phone && parsed!.phone.includes("050"));
  });

  it("returns null when message has no from", () => {
    const update = {
      update_id: 3,
      message: {
        message_id: 103,
        date: 1700000002,
        chat: { id: 1 },
        text: "No from",
      },
    };
    assert.strictEqual(service.parseInbound(update), null);
  });

  it("parses an edited message instead of dropping it", () => {
    const update = {
      update_id: 4,
      edited_message: {
        message_id: 104,
        date: 1700000003,
        chat: { id: 555, type: "private" },
        from: { id: 222, first_name: "Edit" },
        text: "Edited text",
      },
    };
    const parsed = service.parseInbound(update);
    assert.ok(parsed);
    assert.equal(parsed.isEdit, true);
    assert.equal(parsed.text, "Edited text");
    assert.equal(parsed.messageId, 104);
  });

  it("does not treat a contact of another user as the sender phone", () => {
    const update = {
      update_id: 5,
      message: {
        message_id: 105,
        date: 1700000004,
        chat: { id: 111, type: "private" },
        from: { id: 111, first_name: "Jane" },
        contact: {
          phone_number: "+380671112233",
          first_name: "Other",
          user_id: 999,
        },
      },
    };
    const parsed = service.parseInbound(update);
    assert.equal(parsed.phone, null);
    assert.match(parsed.text, /380671112233/);
  });
});
