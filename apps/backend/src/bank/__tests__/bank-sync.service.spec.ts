const { describe, it } = require("node:test");
const assert = require("node:assert");
const { BankSyncService } = require("../bank-sync.service");

describe("BankSyncService sync cursor handling", () => {
  it("ignores stored syncCursor when explicit date range is provided", async () => {
    const account = {
      id: "acc-1",
      provider: "PRIVAT24",
      iban: "UA123456789012345678901234567",
      credentials: { token: "t" },
      syncCursor: "stale-cursor",
      syncWindowDays: 2,
      lastBookedAt: new Date("2024-01-01T00:00:00.000Z"),
      lastSyncAt: new Date(Date.now() - 5 * 60 * 1000),
    };
    let capturedCursor = "not-called";

    const prisma = {
      bankAccount: {
        findUnique: async () => account,
        update: async () => ({}),
      },
      bankTransaction: {
        upsert: async () => ({}),
      },
    };
    const matchEngine = { run: async () => ({ matched: 0 }) };
    const service = new BankSyncService(prisma, matchEngine);
    service.privat24 = {
      fetchStatement: async (_accountId, _credentials, _iban, _from, _to, cursor) => {
        capturedCursor = cursor;
        return { transactions: [], nextCursor: undefined };
      },
    };

    await service.syncAccount("acc-1", {
      dateFrom: new Date("2024-01-01T00:00:00.000Z"),
      dateTo: new Date("2024-01-02T00:00:00.000Z"),
    });

    assert.strictEqual(capturedCursor, undefined);
  });
});
