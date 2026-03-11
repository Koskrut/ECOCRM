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

  it("uses edited_message when present", () => {
    const update = {
      update_id: 4,
      edited_message: {
        message_id: 104,
        date: 1700000003,
        chat: { id: 555 },
        from: { id: 222, first_name: "Edit" },
        text: "Edited text",
      },
    };
    const parsed = service.parseInbound(update);
    assert.ok(parsed);
    assert.strictEqual(parsed!.chatId, "555");
    assert.strictEqual(parsed!.userId, "222");
    assert.strictEqual(parsed!.text, "Edited text");
  });
});
