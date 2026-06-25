import test from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { LeadSource, UserRole } from "@prisma/client";
import { LeadsService } from "../leads.service";

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
    lead: {
      findMany: mockFn(async (args: any) => {
        findManyCalls.push(args);
        return [];
      }),
      count: mockFn(async (args: any) => {
        countCalls.push(args);
        return 0;
      }),
      findUnique: mockFn(async () => null),
    },
    $transaction: mockFn(async (ops: any[]) => Promise.all(ops.map((op) => op))),
    call: { groupBy: mockFn(async () => []) },
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
  return { service, prisma, findManyCalls, countCalls };
}

const managerActor = { id: "mgr-1", role: UserRole.MANAGER, email: "m@test", fullName: "Manager" };

function extractManagerVisibilityOr(where: any): any[] | null {
  const andList: any[] = where.AND ?? [];
  const visibility = andList.find(
    (p) =>
      Array.isArray(p.OR) &&
      p.OR.some((c: any) => c.ownerId === "mgr-1" || c.source === LeadSource.WEBSITE),
  );
  return visibility?.OR ?? null;
}

test("leads.list: manager visibility includes owned, website, and managed contact leads", async () => {
  const { service, findManyCalls } = createService();
  await service.list({}, managerActor as any);
  const orList = extractManagerVisibilityOr(findManyCalls[0].where);
  assert.ok(orList, "manager visibility filter should be in AND");
  assert.ok(orList.some((c) => c.ownerId === "mgr-1"), "includes own leads");
  assert.ok(orList.some((c) => c.source === LeadSource.WEBSITE), "includes website leads");
  assert.ok(
    orList.some((c) => c.contact?.is?.OR?.some((x: any) => x.ownerId === "mgr-1")),
    "includes contact-owned leads",
  );
});

test("leads.getById: manager denied for lead on foreign contact", async () => {
  const { service, prisma } = createService();
  const lead = {
    id: "lead-2",
    ownerId: "other-user",
    source: LeadSource.OTHER,
    contact: { ownerId: "other-mgr" },
  };
  prisma.lead.findUnique = mockFn(async () => lead);
  prisma.lead.count = mockFn(async () => 0);

  await assert.rejects(
    () => service.getById("lead-2", managerActor as any),
    (err: unknown) =>
      err instanceof ForbiddenException || /only access leads/i.test(String((err as Error)?.message)),
  );
});
