import test from "node:test";
import assert from "node:assert/strict";
import { extractPrivat24StableDedupKey } from "../../integrations/privat24/privat24-dedup";
import { resolveBankTransactionDedupKey } from "../bank-dedup.util";
import type { RawBankTransaction } from "../providers/types";

const bookedAt = new Date("2026-06-01T00:00:00.000Z");

function rawTx(overrides: Partial<RawBankTransaction> = {}): RawBankTransaction {
  return {
    bookedAt,
    amount: 1000,
    currency: "UAH",
    direction: "IN",
    description: "test",
    externalId: "ext-123",
    ...overrides,
  };
}

test("resolveBankTransactionDedupKey prefers p24-ref over externalId", () => {
  const tx = rawTx({
    rawPayload: { REF: "A1", REFN: "B2" },
  });
  const provider = { resolveStableDedupKey: extractPrivat24StableDedupKey };
  assert.equal(resolveBankTransactionDedupKey(provider, tx), "p24-ref:A1+B2");
});

test("resolveBankTransactionDedupKey falls back to externalId", () => {
  const tx = rawTx({ rawPayload: undefined });
  assert.equal(resolveBankTransactionDedupKey(undefined, tx), "ext-123");
});

test("bank sync: same externalId with/without REF yields one transaction", async () => {
  const { BankSyncService } = require("../bank-sync.service");

  const store = new Map<string, any>();
  let seq = 0;

  const prisma = {
    bankAccount: {
      findUnique: async () => ({ id: "acc-1", provider: "PRIVAT24" }),
    },
    bankTransaction: {
      findFirst: async (args: any) => {
        if (args?.where?.externalId) {
          for (const row of store.values()) {
            if (
              row.bankAccountId === args.where.bankAccountId &&
              row.externalId === args.where.externalId
            ) {
              return row;
            }
          }
        }
        return null;
      },
      upsert: async (args: any) => {
        const key = `${args.where.bankAccountId_dedupKey.bankAccountId}|${args.where.bankAccountId_dedupKey.dedupKey}`;
        const existing = store.get(key);
        if (existing) {
          Object.assign(existing, args.update);
          return existing;
        }
        const row = { id: `tx-${++seq}`, ...args.create };
        store.set(key, row);
        return row;
      },
      update: async (args: any) => {
        for (const [key, row] of store.entries()) {
          if (row.id === args.where.id) {
            Object.assign(row, args.data);
            const newKey = `${row.bankAccountId}|${row.dedupKey}`;
            if (newKey !== key) {
              store.delete(key);
              store.set(newKey, row);
            }
            return row;
          }
        }
        throw new Error("not found");
      },
    },
  };

  const provider = {
    resolveStableDedupKey: extractPrivat24StableDedupKey,
  };
  const classifier = {
    getOwnAccountHints: async () => [],
    technicalCreateFields: () => ({ matchStatus: "UNMATCHED" }),
    classifyExistingUnmatched: async () => 0,
  };
  const service = new BankSyncService(
    prisma,
    { run: async () => ({ matched: 0 }) },
    { get: () => provider, isProviderLicensed: async () => true },
    classifier,
  );

  const withoutRef = rawTx({ rawPayload: undefined, externalId: "ext-123" });
  await service.importTransactions("acc-1", [withoutRef]);
  assert.equal(store.size, 1);
  const first = [...store.values()][0];
  assert.equal(first.dedupKey, "ext-123");

  const withRef = rawTx({
    rawPayload: { REF: "A1", REFN: "B2" },
    externalId: "ext-123",
  });
  await service.importTransactions("acc-1", [withRef]);
  assert.equal(store.size, 1);
  const merged = [...store.values()][0];
  assert.equal(merged.dedupKey, "p24-ref:A1+B2");
  assert.equal(merged.externalId, "ext-123");
});
