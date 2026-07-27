import test from "node:test";
import assert from "node:assert/strict";
import {
  documentConflictsWithOrderNumber,
  resolveUniqueDocumentOrder,
} from "../document-match.utils";

type AnyFn = (...args: any[]) => any;

function mockFn(impl?: AnyFn) {
  const fn = ((...args: any[]) => {
    fn.calls.push(args);
    return impl ? impl(...args) : undefined;
  }) as AnyFn & { calls: any[][] };
  fn.calls = [];
  return fn;
}

test("resolveUniqueDocumentOrder: unique invoice match", async () => {
  const prisma = {
    order: {
      findMany: mockFn(async (args: any) => {
        if (args.where.invoiceNumber?.in) {
          return [{ id: "o1", invoiceNumber: "INV-9", waybillNumber: null }];
        }
        return [];
      }),
    },
  };
  const result = await resolveUniqueDocumentOrder(prisma as any, {
    invoices: ["INV-9"],
    waybills: [],
    unlabeled: [],
  });
  assert.equal(result.orderId, "o1");
  assert.equal(result.matchType, "invoice");
  assert.equal(result.ambiguous, false);
});

test("resolveUniqueDocumentOrder: ambiguous invoice", async () => {
  const prisma = {
    order: {
      findMany: mockFn(async () => [
        { id: "o1", invoiceNumber: "INV-9", waybillNumber: null },
        { id: "o2", invoiceNumber: "INV-9", waybillNumber: null },
      ]),
    },
  };
  const result = await resolveUniqueDocumentOrder(prisma as any, {
    invoices: ["INV-9"],
    waybills: [],
    unlabeled: [],
  });
  assert.equal(result.orderId, null);
  assert.equal(result.ambiguous, true);
});

test("resolveUniqueDocumentOrder: waybill when no invoice", async () => {
  const prisma = {
    order: {
      findMany: mockFn(async (args: any) => {
        if (args.where.waybillNumber?.in) {
          return [{ id: "o2", invoiceNumber: null, waybillNumber: "RN-55" }];
        }
        return [];
      }),
    },
  };
  const result = await resolveUniqueDocumentOrder(prisma as any, {
    invoices: [],
    waybills: ["RN-55"],
    unlabeled: [],
  });
  assert.equal(result.orderId, "o2");
  assert.equal(result.matchType, "waybill");
});

test("resolveUniqueDocumentOrder: unlabeled token matches unique invoice field", async () => {
  const prisma = {
    order: {
      findMany: mockFn(async (args: any) => {
        if (args.where.invoiceNumber === "DOC-7777") {
          return [{ id: "o3", invoiceNumber: "DOC-7777", waybillNumber: null }];
        }
        return [];
      }),
    },
  };
  const result = await resolveUniqueDocumentOrder(prisma as any, {
    invoices: [],
    waybills: [],
    unlabeled: ["DOC-7777"],
  });
  assert.equal(result.orderId, "o3");
  assert.equal(result.matchType, "invoice");
});

test("resolveUniqueDocumentOrder: invoice wins over waybill lookup", async () => {
  const prisma = {
    order: {
      findMany: mockFn(async (args: any) => {
        if (args.where.invoiceNumber?.in) {
          return [{ id: "o-inv", invoiceNumber: "INV-1", waybillNumber: "RN-1" }];
        }
        return [];
      }),
    },
  };
  const result = await resolveUniqueDocumentOrder(prisma as any, {
    invoices: ["INV-1"],
    waybills: ["RN-1"],
    unlabeled: [],
  });
  assert.equal(result.orderId, "o-inv");
  assert.equal(result.matchType, "invoice");
});

test("documentConflictsWithOrderNumber detects mismatch", () => {
  assert.equal(documentConflictsWithOrderNumber("a", "b"), true);
  assert.equal(documentConflictsWithOrderNumber("a", "a"), false);
  assert.equal(documentConflictsWithOrderNumber(null, "a"), false);
});
