import test from "node:test";
import assert from "node:assert/strict";
import { PayerAliasService } from "../payer-alias.service";

type AnyFn = (...args: any[]) => any;

function mockFn(impl?: AnyFn) {
  const fn = ((...args: any[]) => {
    fn.calls.push(args);
    return impl ? impl(...args) : undefined;
  }) as AnyFn & { calls: any[][] };
  fn.calls = [];
  return fn;
}

test("learnFromAllocation: skips transit/gateway IBAN — no PayerAlias create", async () => {
  const prisma = {
    payerAlias: {
      findUnique: mockFn(async () => null),
      create: mockFn(async () => ({ id: "a1" })),
      findFirst: mockFn(async () => null),
      update: mockFn(async () => ({})),
    },
    payment: {
      findMany: mockFn(async () => []),
    },
  };
  const service = new PayerAliasService(prisma as any);
  await service.learnFromAllocation({
    contactId: "c-wrong",
    counterpartyIban: "UA293052990000029023866100110",
    counterpartyName: "Транз.рахунок платежi_ DN, DG, DZ",
  });
  assert.strictEqual(prisma.payerAlias.create.calls.length, 0);
  assert.strictEqual(prisma.payerAlias.findUnique.calls.length, 0);
  assert.strictEqual(prisma.payerAlias.update.calls.length, 0);
});

test("learnFromAllocation: ordinary IBAN still creates alias", async () => {
  const prisma = {
    payerAlias: {
      findUnique: mockFn(async () => null),
      create: mockFn(async () => ({ id: "a1" })),
      findFirst: mockFn(async () => null),
      update: mockFn(async () => ({})),
    },
    payment: {
      findMany: mockFn(async () => []),
    },
  };
  const service = new PayerAliasService(prisma as any);
  await service.learnFromAllocation({
    contactId: "c1",
    counterpartyIban: "UA123456789012345678901234567",
    counterpartyName: "Петренко Іван",
  });
  assert.strictEqual(prisma.payerAlias.create.calls.length, 1);
  const data = prisma.payerAlias.create.calls[0]![0].data;
  assert.strictEqual(data.contactId, "c1");
  assert.strictEqual(data.counterpartyIban, "UA123456789012345678901234567");
});
