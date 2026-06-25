import test from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { OrderSource, UserRole } from "@prisma/client";
import { OrdersService } from "../orders.service";

type AnyFn = (...args: any[]) => any;

function mockFn(impl?: AnyFn) {
  const fn = ((...args: any[]) => {
    fn.calls.push(args);
    if (impl) return impl(...args);
    return undefined;
  }) as AnyFn & { calls: any[][] };
  fn.calls = [];
  return fn;
}

function createService() {
  const findManyCalls: any[] = [];
  const countCalls: any[] = [];
  const prisma = {
    order: {
      findMany: mockFn(async (args: any) => {
        findManyCalls.push(args);
        return [];
      }),
      count: mockFn(async (args: any) => {
        countCalls.push(args);
        return 0;
      }),
    },
    user: { findMany: mockFn(async () => []) },
    product: { findMany: mockFn(async () => []) },
    orderTtn: { findMany: mockFn(async () => []) },
  };
  const service = new OrdersService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, prisma, findManyCalls, countCalls };
}

const managerActor = { id: "mgr-1", role: UserRole.MANAGER, email: "m@test", fullName: "Manager" };

function extractManagerVisibilityOr(where: any): any[] | null {
  const andList: any[] = where.AND ?? [];
  const visibility = andList.find(
    (p) =>
      Array.isArray(p.OR) &&
      p.OR.some((c: any) => c.ownerId === "mgr-1" || c.orderSource === OrderSource.STORE),
  );
  return visibility?.OR ?? null;
}

test("orders.list: manager visibility includes owned, store, and managed contact orders", async () => {
  const { service, findManyCalls } = createService();
  await service.list({}, managerActor as any);
  const orList = extractManagerVisibilityOr(findManyCalls[0].where);
  assert.ok(orList, "manager visibility filter should be in AND");
  assert.ok(orList.some((c) => c.ownerId === "mgr-1"), "includes own orders");
  assert.ok(orList.some((c) => c.orderSource === OrderSource.STORE), "includes store orders");
  assert.ok(
    orList.some((c) => c.contact?.is?.OR?.some((x: any) => x.ownerId === "mgr-1")),
    "includes contact-owned orders",
  );
  assert.ok(
    orList.some((c) => c.client?.is?.OR?.some((x: any) => x.ownerId === "mgr-1")),
    "includes client-owned orders",
  );
  assert.ok(
    orList.some((c) => c.company?.is?.OR?.some((x: any) => x.ownerId === "mgr-1")),
    "includes company-owned orders",
  );
});

test("orders.list: manager visibility does not overwrite board OR filter", async () => {
  const { service, findManyCalls } = createService();
  await service.list({ board: true }, managerActor as any);
  const where = findManyCalls[0].where;
  assert.ok(Array.isArray(where.OR), "board OR should remain on where.OR");
  assert.ok(Array.isArray(where.AND), "manager filter should be in AND");
  const orList = extractManagerVisibilityOr(where);
  assert.ok(orList, "manager visibility still present");
});

test("orders.getById: manager denied for order on foreign contact", async () => {
  const { service } = createService();
  const order = {
    id: "ord-2",
    ownerId: "other-user",
    orderSource: null,
    contact: { ownerId: "other-mgr" },
    client: null,
    company: { ownerId: "other-mgr" },
  };
  const prisma = (service as any).prisma;
  prisma.order.findUnique = mockFn(async () => order);
  prisma.order.count = mockFn(async () => 0);

  await assert.rejects(
    () => service.getById("ord-2", managerActor as any),
    (err: unknown) =>
      err instanceof ForbiddenException || /only access orders/i.test(String((err as Error)?.message)),
  );
});
