import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ActivitiesService } from "../activities.service";
import type { AuthUser } from "../../auth/auth.types";

type Fn<TArgs extends unknown[] = unknown[], TResult = unknown> = (...args: TArgs) => TResult;

function mockFn<TArgs extends unknown[] = unknown[], TResult = unknown>(impl?: Fn<TArgs, TResult>) {
  const fn = ((...args: TArgs) => {
    fn.calls.push(args);
    if (impl) return impl(...args);
    return undefined as TResult;
  }) as Fn<TArgs, TResult> & { calls: TArgs[] };
  fn.calls = [];
  return fn;
}

function actor(id: string, role: UserRole): AuthUser {
  return { id, role, email: `${id}@crm.test`, fullName: id };
}

function createService(overrides?: Record<string, unknown>) {
  const prisma = {
    activity: {
      findMany: mockFn(),
      findUnique: mockFn(),
      update: mockFn(),
      delete: mockFn(),
      create: mockFn(),
    },
    company: { findUnique: mockFn() },
    contact: { findUnique: mockFn() },
    lead: { findUnique: mockFn() },
    order: { findUnique: mockFn() },
    user: { findMany: mockFn(async () => []) },
    ...overrides,
  };
  return {
    prisma,
    service: new ActivitiesService(prisma as never, undefined),
  };
}

test("listForCompany: denies MANAGER for чужая assigned company", async () => {
  const { service } = createService({
    company: {
      findUnique: mockFn(async () => ({ ownerId: "owner-2" })),
    },
  });
  await assert.rejects(
    () => service.listForCompany("cmp-1", actor("owner-1", UserRole.MANAGER)),
    ForbiddenException,
  );
});

test("listForCompany: allows MANAGER for unassigned company", async () => {
  const findMany = mockFn(async () => []);
  const { service } = createService({
    company: { findUnique: mockFn(async () => ({ ownerId: null })) },
    activity: { findMany },
  });
  await service.listForCompany("cmp-1", actor("m-1", UserRole.MANAGER));
  assert.equal(findMany.calls.length, 1);
});

test("listForContact: allows MANAGER for unassigned contact", async () => {
  const { service } = createService({
    contact: { findUnique: mockFn(async () => ({ ownerId: null })) },
    activity: { findMany: mockFn(async () => []) },
  });
  await assert.doesNotReject(() => service.listForContact("ct-1", actor("m-1", UserRole.MANAGER)));
});

test("listForOrder: throws NotFound for missing order", async () => {
  const { service } = createService({
    order: { findUnique: mockFn(async () => null) },
  });
  await assert.rejects(
    () => service.listForOrder("missing-order", actor("m-1", UserRole.MANAGER)),
    NotFoundException,
  );
});

test("listForOrder: nextCursor when page is full", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: `a-${i}`, createdBy: "u1" }));
  const findMany = mockFn(async () => rows);
  const { service } = createService({
    order: { findUnique: mockFn(async () => ({ ownerId: "m1" })) },
    activity: { findMany },
    user: { findMany: mockFn(async () => [{ id: "u1", fullName: "User" }]) },
  });
  const page = await service.listForOrder("ord-1", actor("m1", UserRole.MANAGER), { limit: 100 });
  assert.equal(page.items.length, 100);
  assert.equal(page.nextCursor, "a-99");
});

test("updateOne: multi-link activity validates all linked scopes", async () => {
  const { service } = createService({
    activity: {
      findUnique: mockFn(async (args: { select?: unknown }) => {
        if (args.select) {
          return {
            id: "a1",
            contactId: "c1",
            leadId: null,
            companyId: "cmp-foreign",
            orderId: null,
          };
        }
        return { id: "a1", body: "old", title: null, pinnedAt: null };
      }),
      update: mockFn(async () => ({ id: "a1", body: "new", title: null, pinnedAt: null })),
    },
    contact: { findUnique: mockFn(async () => ({ ownerId: "manager-1" })) },
    company: { findUnique: mockFn(async () => ({ ownerId: "manager-2" })) },
  });

  await assert.rejects(
    () => service.updateOne("a1", { body: "new" }, actor("manager-1", UserRole.MANAGER)),
    ForbiddenException,
  );
});
