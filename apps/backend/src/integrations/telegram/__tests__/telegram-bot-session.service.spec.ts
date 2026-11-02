import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TelegramBotSessionService } from "../telegram-bot-session.service";

describe("TelegramBotSessionService", () => {
  it("preserves staffShopMode across client set() that omits the flag", async () => {
    let stored: { state: string; payload: Record<string, unknown> } = {
      state: "idle",
      payload: { staffShopMode: true },
    };
    const prisma = {
      telegramBotSession: {
        findUnique: async () => stored,
        upsert: async (args: {
          create: { state: string; payload: Record<string, unknown> };
          update: { state: string; payload: Record<string, unknown> };
        }) => {
          stored = {
            state: args.update.state,
            payload: args.update.payload,
          };
          return stored;
        },
      },
    };
    const sessions = new TelegramBotSessionService(prisma as never);

    await sessions.set("tg-1", "catalog_search", {});
    assert.equal(stored.state, "catalog_search");
    assert.equal(stored.payload.staffShopMode, true);

    await sessions.set("tg-1", "idle", { staffShopMode: false });
    assert.equal(stored.payload.staffShopMode, undefined);
    assert.deepEqual(stored.payload, {});
  });
});
