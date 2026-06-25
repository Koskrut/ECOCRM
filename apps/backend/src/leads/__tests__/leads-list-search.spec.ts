import test from "node:test";
import assert from "node:assert/strict";
import { LeadSource, UserRole } from "@prisma/client";
import { LeadsService } from "../leads.service";
import type { AuthUser } from "../../auth/auth.types";
import type { ListLeadsQueryDto } from "../leads.dto";

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
  const prisma = {
    lead: {
      findMany: mockFn(async (args: any) => {
        findManyCalls.push(args);
        return [];
      }),
      count: mockFn(async () => 0),
    },
    $transaction: mockFn(async (ops: any[]) => Promise.all(ops.map((op) => op))),
  };
  const service = new LeadsService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, prisma, findManyCalls };
}

function manager(id: string): AuthUser {
  return { id, email: `${id}@crm.test`, fullName: id, role: UserRole.MANAGER };
}

function flattenOrFields(searchOr: any[]): string[] {
  return searchOr.flatMap((cond) => Object.keys(cond));
}

async function listWithQ(actor?: AuthUser, q?: string) {
  const { service, findManyCalls } = createService();
  const dto: ListLeadsQueryDto = { q } as ListLeadsQueryDto;
  await service.list(dto, actor);
  return findManyCalls[0];
}

test("leads.list: q includes address/region/city in search OR", async () => {
  const args = await listWithQ(undefined, "Львів");
  const andParts: any[] = args.where.AND ?? [];
  const orPart = andParts.find((p) => Array.isArray(p.OR));
  assert.ok(orPart, "AND should contain search OR");
  const keys = flattenOrFields(orPart.OR);
  for (const expected of ["address", "region", "city"]) {
    assert.ok(keys.includes(expected), `search OR should contain ${expected}: ${keys.join(", ")}`);
  }
});

test("leads.list: q with phone-like digits enables phoneNormalized lookup", async () => {
  const args = await listWithQ(undefined, "+380 (50) 123-45-67");
  const orPart = (args.where.AND as any[]).find((p) => Array.isArray(p.OR));
  const phoneNormalizedCond = (orPart.OR as any[]).find((c) => "phoneNormalized" in c);
  assert.ok(phoneNormalizedCond, "search OR should contain phoneNormalized when q has ≥5 digits");
  assert.equal(phoneNormalizedCond.phoneNormalized.contains, "380501234567");
});

test("leads.list: MANAGER RBAC stays effective even when q is supplied (regression)", async () => {
  const args = await listWithQ(manager("mgr-1"), "Іван");
  const andParts: any[] = args.where.AND ?? [];
  // Three AND-parts: active statuses, search OR, RBAC OR.
  assert.equal(andParts.length, 3, `expected 3 AND parts, got ${andParts.length}`);
  const rbacPart = andParts.find(
    (p) =>
      Array.isArray(p.OR) &&
      p.OR.some((c: any) => c.ownerId === "mgr-1" || c.source === LeadSource.WEBSITE),
  );
  assert.ok(rbacPart, "RBAC OR must be its own AND-part, not merged with search OR");
  assert.ok(rbacPart.OR.some((c: any) => c.ownerId === "mgr-1"), "includes own leads");
  assert.ok(rbacPart.OR.some((c: any) => c.source === LeadSource.WEBSITE), "includes website leads");
  assert.ok(
    rbacPart.OR.some((c: any) => c.contact?.is?.OR?.some((x: any) => x.ownerId === "mgr-1")),
    "includes managed contact leads",
  );
});

test("leads.list: without q, MANAGER RBAC still applied via AND", async () => {
  const args = await listWithQ(manager("mgr-2"));
  const andParts: any[] = args.where.AND ?? [];
  assert.equal(andParts.length, 2);
  const activePart = andParts.find((p) => Array.isArray(p.status?.in));
  assert.ok(activePart, "default list should restrict to active statuses");
  assert.deepEqual(activePart.status.in.sort(), ["IN_PROGRESS", "NEW"]);
  const rbacPart = andParts.find(
    (p) =>
      Array.isArray(p.OR) &&
      p.OR.some((c: any) => c.ownerId === "mgr-2" || c.source === LeadSource.WEBSITE),
  );
  assert.ok(rbacPart, "RBAC OR must be present");
});

test("leads.list: without status filter, only active leads (NEW, IN_PROGRESS)", async () => {
  const args = await listWithQ();
  const andParts: any[] = args.where.AND ?? [];
  const activePart = andParts.find((p) => Array.isArray(p.status?.in));
  assert.ok(activePart, "default list should restrict to active statuses");
  assert.deepEqual(activePart.status.in.sort(), ["IN_PROGRESS", "NEW"]);
});

test("leads.list: explicit status filter overrides active-only default", async () => {
  const { service, findManyCalls } = createService();
  const dto: ListLeadsQueryDto = { status: "WON" } as ListLeadsQueryDto;
  await service.list(dto);
  const args = findManyCalls[0];
  assert.equal(args.where.status, "WON");
  const andParts: any[] = args.where.AND ?? [];
  const activePart = andParts.find((p) => Array.isArray(p.status?.in));
  assert.equal(activePart, undefined, "status=in should not be applied when status filter set");
});
