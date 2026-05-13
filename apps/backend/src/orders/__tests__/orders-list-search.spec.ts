import test from "node:test";
import assert from "node:assert/strict";
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
  const prisma = {
    order: {
      findMany: mockFn(async (args: any) => {
        findManyCalls.push(args);
        return [];
      }),
      count: mockFn(async () => 0),
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
  return { service, prisma, findManyCalls };
}

function extractSearchOr(args: any): any[] {
  const andList: any[] = args.where.AND ?? [];
  const searchAnd = andList.find((p) => Array.isArray(p.OR));
  assert.ok(searchAnd, "Expected an AND-part with search OR");
  return searchAnd.OR as any[];
}

function hasOrFieldPath(orList: any[], path: string): boolean {
  return orList.some((cond) => {
    const segs = path.split(".");
    let cur: any = cond;
    for (const s of segs) {
      if (cur == null || typeof cur !== "object" || !(s in cur)) return false;
      cur = cur[s];
    }
    return true;
  });
}

test("orders.list: q includes TTN documentNumber via direct ttns relation", async () => {
  const { service, findManyCalls } = createService();
  await service.list({ q: "20451234567890" } as any);
  const orList = extractSearchOr(findManyCalls[0]);
  assert.ok(
    hasOrFieldPath(orList, "ttns.some.documentNumber"),
    "search OR should include ttns.some.documentNumber",
  );
});

test("orders.list: q includes TTN documentNumber via shipments.ttns relation", async () => {
  const { service, findManyCalls } = createService();
  await service.list({ q: "20451234567890" } as any);
  const orList = extractSearchOr(findManyCalls[0]);
  assert.ok(
    hasOrFieldPath(orList, "shipments.some.ttns.some.documentNumber"),
    "search OR should include shipments.some.ttns.some.documentNumber",
  );
});

test("orders.list: q digits-only TTN match is added when ≥5 digits", async () => {
  const { service, findManyCalls } = createService();
  await service.list({ q: "2045 1234 5678 90" } as any);
  const orList = extractSearchOr(findManyCalls[0]);
  const digitsCond = orList.find(
    (c) =>
      c.ttns?.some?.documentNumber?.contains === "20451234567890" &&
      c.ttns.some.documentNumber.mode === undefined,
  );
  assert.ok(digitsCond, "digits-only TTN contains condition should be present");
});

test("orders.list: q includes product search via items.productNameSnapshot and product.name", async () => {
  const { service, findManyCalls } = createService();
  await service.list({ q: "крышка" } as any);
  const orList = extractSearchOr(findManyCalls[0]);
  const itemsCond = orList.find((c) => c.items?.some?.OR);
  assert.ok(itemsCond, "search OR should include items.some.OR for product search");
  const inner: any[] = itemsCond.items.some.OR;
  assert.ok(
    inner.some((c) => "productNameSnapshot" in c),
    "inner OR should match productNameSnapshot",
  );
  assert.ok(
    inner.some((c) => c.product?.name?.contains === "крышка"),
    "inner OR should match product.name",
  );
});

test("orders.list: q still preserves legacy orderNumber + client + company", async () => {
  const { service, findManyCalls } = createService();
  await service.list({ q: "ORD-42" } as any);
  const orList = extractSearchOr(findManyCalls[0]);
  assert.ok(hasOrFieldPath(orList, "orderNumber.contains"));
  assert.ok(hasOrFieldPath(orList, "company.is.name.contains"));
  assert.ok(hasOrFieldPath(orList, "client.is.OR"));
});
