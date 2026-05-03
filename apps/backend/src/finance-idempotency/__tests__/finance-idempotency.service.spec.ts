import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { FinanceIdempotencyService } from "../finance-idempotency.service";

test("FinanceIdempotencyService: reserve then complete then replay", async () => {
  const store = new Map<string, Record<string, unknown>>();
  const prisma = {
    financeIdempotencyRecord: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const k = data.idempotencyKey as string;
        if (store.has(k)) {
          const e = new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "x" });
          throw e;
        }
        store.set(k, { ...data, id: "id1" });
      },
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) => {
        const row = store.get(where.idempotencyKey);
        return row ? (row as never) : null;
      },
      update: async ({ where, data }: { where: { idempotencyKey: string }; data: Record<string, unknown> }) => {
        const cur = store.get(where.idempotencyKey);
        assert(cur);
        Object.assign(cur, data);
      },
      delete: async ({ where }: { where: { idempotencyKey: string } }) => {
        store.delete(where.idempotencyKey);
      },
    },
  } as never;

  const svc = new FinanceIdempotencyService(prisma);
  const key = "k-test-1";
  const r1 = await svc.reserveOrReplay({
    key,
    method: "POST",
    path: "/payments/cash",
    body: { amount: 10 },
  });
  assert.deepEqual(r1, {});
  await svc.complete(key, 200, { ok: true });

  const r2 = await svc.reserveOrReplay({
    key,
    method: "POST",
    path: "/payments/cash",
    body: { amount: 10 },
  });
  assert.equal(r2.replay?.status, 200);
  assert.deepEqual(r2.replay?.body, { ok: true });
});

test("FinanceIdempotencyService: in-progress row => ConflictException", async () => {
  const hashSvc = new FinanceIdempotencyService({} as never);
  const bodySha256 = hashSvc.bodyHashHex({ x: 1 });
  const row = {
    idempotencyKey: "k-inprog",
    httpMethod: "POST",
    path: "/payments/cash",
    bodySha256,
    responseStatus: 0,
    responseBody: null,
  };
  const prisma = {
    financeIdempotencyRecord: {
      create: async () => {
        const e = new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "x" });
        throw e;
      },
      findUnique: async () => row as never,
    },
  } as never;

  const svc = new FinanceIdempotencyService(prisma);
  await assert.rejects(
    () =>
      svc.reserveOrReplay({
        key: "k-inprog",
        method: "POST",
        path: "/payments/cash",
        body: { x: 1 },
      }),
    (e: unknown) => e instanceof ConflictException,
  );
});

test("FinanceIdempotencyService: same key different body => ConflictException", async () => {
  const hashSvc = new FinanceIdempotencyService({} as never);
  const row = {
    idempotencyKey: "k2",
    httpMethod: "POST",
    path: "/payments/cash",
    bodySha256: hashSvc.bodyHashHex({ a: 1 }),
    responseStatus: 200,
    responseBody: {},
  };
  const prisma = {
    financeIdempotencyRecord: {
      create: async () => {
        const e = new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "x" });
        throw e;
      },
      findUnique: async () => row as never,
    },
  } as never;

  const svc = new FinanceIdempotencyService(prisma);
  await assert.rejects(
    () =>
      svc.reserveOrReplay({
        key: "k2",
        method: "POST",
        path: "/payments/cash",
        body: { a: 2 },
      }),
    (e: unknown) => e instanceof ConflictException,
  );
});

test("FinanceIdempotencyService: abort removes row", async () => {
  const store = new Map<string, Record<string, unknown>>();
  const prisma = {
    financeIdempotencyRecord: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.set(data.idempotencyKey as string, { ...data, id: "id1" });
      },
      findUnique: async () => null,
      update: async () => {},
      delete: async ({ where }: { where: { idempotencyKey: string } }) => {
        store.delete(where.idempotencyKey);
      },
    },
  } as never;

  const svc = new FinanceIdempotencyService(prisma);
  await svc.reserveOrReplay({ key: "kab", method: "POST", path: "/bank/accounts", body: {} });
  assert.ok(store.has("kab"));
  await svc.abort("kab");
  assert.ok(!store.has("kab"));
});
