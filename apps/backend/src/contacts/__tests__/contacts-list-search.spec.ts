import test from "node:test";
import assert from "node:assert/strict";
import { ContactsService } from "../contacts.service";

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
    contact: {
      findMany: mockFn(async (args: any) => {
        findManyCalls.push(args);
        return [];
      }),
      count: mockFn(async () => 0),
    },
    call: { groupBy: mockFn(async () => []) },
    order: { groupBy: mockFn(async () => []) },
  };
  const service = new ContactsService(prisma as any, {} as any);
  return { service, prisma, findManyCalls };
}

function flattenOrFields(searchOr: any[]): string[] {
  const keys: string[] = [];
  for (const cond of searchOr) {
    for (const k of Object.keys(cond)) {
      const value = cond[k];
      if (value && typeof value === "object" && "name" in value && k === "company") {
        keys.push("company.name");
      } else {
        keys.push(k);
      }
    }
  }
  return keys;
}

test("contacts.list: q includes address/addressInfo/region/city in OR", async () => {
  const { service, findManyCalls } = createService();
  await service.list({ q: "Київ" });
  const args = findManyCalls[0];
  assert.ok(args.where.AND, "where.AND should be set when q provided");
  const andParts: any[] = args.where.AND;
  const orPart = andParts.find((p) => Array.isArray(p.OR));
  assert.ok(orPart, "AND should contain an OR block for the search");
  const keys = flattenOrFields(orPart.OR);
  for (const expected of ["address", "addressInfo", "region", "city", "addresses"]) {
    assert.ok(keys.includes(expected), `OR should contain ${expected}, got: ${keys.join(", ")}`);
  }
});

test("contacts.list: multiple regions use OR filter", async () => {
  const { service, findManyCalls } = createService();
  await service.list({ regions: ["Львівська", "Одеська"] });
  const args = findManyCalls[0];
  const andParts: any[] = args.where.AND ?? [];
  const regionOr = andParts.find((p) => Array.isArray(p.OR) && p.OR.some((c: any) => c.region));
  assert.ok(regionOr, "AND should contain OR for multiple regions");
  assert.equal(regionOr.OR.length, 2);
});

test("contacts.list: multiple cities use OR filter", async () => {
  const { service, findManyCalls } = createService();
  await service.list({ cities: ["Львів", "Київ"] });
  const args = findManyCalls[0];
  const andParts: any[] = args.where.AND ?? [];
  const cityOr = andParts.find((p) => Array.isArray(p.OR) && p.OR.some((c: any) => c.city));
  assert.ok(cityOr, "AND should contain OR for multiple cities");
  assert.equal(cityOr.OR.length, 2);
});

test("contacts.list: q still includes legacy name/phone/email/company fields", async () => {
  const { service, findManyCalls } = createService();
  await service.list({ q: "Іван" });
  const args = findManyCalls[0];
  const orPart = (args.where.AND as any[]).find((p) => Array.isArray(p.OR));
  const keys = flattenOrFields(orPart.OR);
  for (const expected of [
    "firstName",
    "lastName",
    "middleName",
    "phone",
    "email",
    "company.name",
  ]) {
    assert.ok(keys.includes(expected), `OR should keep ${expected}`);
  }
  assert.ok(!keys.includes("externalCode"), "general q should not search externalCode");
});

test("contacts.list: q with / prefix searches externalCode only", async () => {
  const { service, findManyCalls } = createService();
  await service.list({ q: "/000000123" });
  const args = findManyCalls[0];
  const andParts: any[] = args.where.AND ?? [];
  assert.equal(andParts.length, 1);
  assert.deepEqual(andParts[0], {
    externalCode: { contains: "000000123", mode: "insensitive" },
  });
});
