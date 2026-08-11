import test from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ContactsService } from "../contacts.service";
import type { AuthUser } from "../../auth/auth.types";

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

function createService(overrides?: Partial<any>) {
  const prisma = {
    contact: { findUnique: mockFn() },
    order: { findMany: mockFn(), count: mockFn() },
    ...overrides,
  };
  const service = new ContactsService(prisma as any);
  return { service, prisma };
}

function manager(id: string): AuthUser {
  return { id, email: `${id}@crm.test`, fullName: id, role: UserRole.MANAGER };
}

function contactRow(id = "c1", ownerId: string | null = "m1") {
  return { id, ownerId };
}

function orderRow(
  overrides: Record<string, unknown> & { id: string; orderNumber: string },
) {
  return {
    status: "SUCCESS",
    orderStage: "RECEIVED",
    financialStatus: "CLOSED",
    totalAmount: 1000,
    returnAdjustmentAmount: 0,
    paidAmount: 1000,
    debtAmount: 0,
    creditAmount: 0,
    fxWriteOffAmount: 0,
    currency: "UAH",
    exchangeRate: null,
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    parentOrderId: null,
    parentOrder: null,
    childOrders: [],
    returns: [],
    payments: [],
    ...overrides,
  };
}

test("getOrdersMovement: denies manager for чужой assigned contact", async () => {
  const { service } = createService({
    contact: { findUnique: mockFn(async () => contactRow("c1", "owner-2")) },
  });

  await assert.rejects(
    () => service.getOrdersMovement("c1", undefined, manager("owner-1")),
    ForbiddenException,
  );
});

test("getOrdersMovement: nests children and does not duplicate them at the root", async () => {
  const parent = orderRow({
    id: "o-parent",
    orderNumber: "100",
    createdAt: new Date("2026-08-10T10:00:00.000Z"),
    childOrders: [
      orderRow({
        id: "o-child",
        orderNumber: "100-2",
        parentOrderId: "o-parent",
        totalAmount: 300,
        paidAmount: 0,
        debtAmount: 300,
        createdAt: new Date("2026-08-11T10:00:00.000Z"),
      }),
    ],
  });
  const child = orderRow({
    id: "o-child",
    orderNumber: "100-2",
    parentOrderId: "o-parent",
    totalAmount: 300,
    paidAmount: 0,
    debtAmount: 300,
    createdAt: new Date("2026-08-11T10:00:00.000Z"),
  });

  const { service, prisma } = createService({
    contact: { findUnique: mockFn(async () => contactRow()) },
    order: { findMany: mockFn(async () => [parent, child]) },
  });

  const result = await service.getOrdersMovement("c1", undefined, manager("m1"));
  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "o-parent");
  assert.equal(result.items[0].children.length, 1);
  assert.equal(result.items[0].children[0].id, "o-child");
  assert.equal(result.items[0].counts.children, 1);

  const where = (prisma.order.findMany as any).calls[0][0].where;
  assert.equal(where.clientId, "c1");
  assert.equal(where.ownerId, "m1");
});

test("getOrdersMovement: orphaned child becomes a root when parent is not in selection", async () => {
  const orphan = orderRow({
    id: "o-orphan",
    orderNumber: "200-2",
    parentOrderId: "missing-parent",
    parentOrder: { id: "missing-parent", orderNumber: "200" },
    paidAmount: 0,
    debtAmount: 1000,
  });

  const { service } = createService({
    contact: { findUnique: mockFn(async () => contactRow()) },
    order: { findMany: mockFn(async () => [orphan]) },
  });

  const result = await service.getOrdersMovement("c1");
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, "o-orphan");
  assert.equal(result.items[0].parent?.orderNumber, "200");
});

test("getOrdersMovement: counts open returns and previews last 5 payments", async () => {
  const payments = Array.from({ length: 6 }, (_, i) => ({
    id: `p${i}`,
    amount: 100 + i,
    currency: "UAH",
    sourceType: "BANK",
    paidAt: new Date(`2026-08-0${i + 1}T10:00:00.000Z`),
    status: "COMPLETED",
  }));

  const order = orderRow({
    id: "o1",
    orderNumber: "300",
    returnAdjustmentAmount: 150,
    returns: [
      {
        id: "r-open",
        status: "REQUESTED",
        requestedAt: new Date("2026-08-08T10:00:00.000Z"),
        creditAmount: null,
        refundAmount: null,
        replacementOrder: null,
      },
      {
        id: "r-closed",
        status: "CLOSED",
        requestedAt: new Date("2026-08-07T10:00:00.000Z"),
        creditAmount: 150,
        refundAmount: 0,
        replacementOrder: { id: "o-repl", orderNumber: "301" },
      },
    ],
    payments,
  });

  const { service } = createService({
    contact: { findUnique: mockFn(async () => contactRow()) },
    order: { findMany: mockFn(async () => [order]) },
  });

  const result = await service.getOrdersMovement("c1");
  const node = result.items[0];
  assert.equal(node.counts.returns, 2);
  assert.equal(node.counts.openReturns, 1);
  assert.equal(node.counts.payments, 6);
  assert.equal(node.paymentsSummary.length, 5);
  assert.equal(node.paymentsSummary[0].id, "p0");
  assert.equal(node.returnsSummary[1].replacementOrderNumber, "301");
  assert.equal(node.returnAdjustmentAmount, 150);
});

test("getOrdersMovement: admin query has no ownerId filter", async () => {
  const { service, prisma } = createService({
    contact: { findUnique: mockFn(async () => contactRow("c-admin", "m1")) },
    order: { findMany: mockFn(async () => []) },
  });

  const admin: AuthUser = {
    id: "admin",
    email: "admin@crm.test",
    fullName: "Admin",
    role: UserRole.ADMIN,
  };
  await service.getOrdersMovement("c-admin", { page: 1, pageSize: 20 }, admin);
  const where = (prisma.order.findMany as any).calls[0][0].where;
  assert.equal(where.clientId, "c-admin");
  assert.equal("ownerId" in where, false);
});
