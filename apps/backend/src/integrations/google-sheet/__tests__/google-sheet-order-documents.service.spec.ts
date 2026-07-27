import test from "node:test";
import assert from "node:assert/strict";
import { NotFoundException } from "@nestjs/common";
import { GoogleSheetOrderDocumentsService } from "../google-sheet-order-documents.service";

type AnyFn = (...args: any[]) => any;

function mockFn(impl?: AnyFn) {
  const fn = ((...args: any[]) => {
    fn.calls.push(args);
    return impl ? impl(...args) : undefined;
  }) as AnyFn & { calls: any[][] };
  fn.calls = [];
  return fn;
}

const existingOrder = {
  id: "ord-1",
  invoiceNumber: "INV-100",
  invoiceDate: new Date("2026-01-01"),
  waybillNumber: "RN-200",
  waybillDate: new Date("2026-01-02"),
};

test("updateOrderDocuments sets invoice and waybill fields", async () => {
  const update = mockFn(async () => existingOrder);
  const prisma = {
    order: {
      findUnique: mockFn(async () => existingOrder),
      update,
    },
  };
  const service = new GoogleSheetOrderDocumentsService(prisma as any);
  const result = await service.updateOrderDocuments("ord-1", {
    invoiceNumber: "INV-999",
    waybillNumber: "RN-888",
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(update.calls.length, 1);
  assert.deepEqual(update.calls[0]![0].data, {
    invoiceNumber: "INV-999",
    waybillNumber: "RN-888",
  });
});

test("updateOrderDocuments empty string clears to null", async () => {
  const update = mockFn(async () => existingOrder);
  const prisma = {
    order: {
      findUnique: mockFn(async () => existingOrder),
      update,
    },
  };
  const service = new GoogleSheetOrderDocumentsService(prisma as any);
  await service.updateOrderDocuments("ord-1", {
    invoiceNumber: "",
    invoiceDate: "",
    waybillNumber: "",
    waybillDate: "",
  });
  assert.deepEqual(update.calls[0]![0].data, {
    invoiceNumber: null,
    invoiceDate: null,
    waybillNumber: null,
    waybillDate: null,
  });
});

test("updateOrderDocuments partial update leaves omitted fields untouched", async () => {
  const update = mockFn(async () => existingOrder);
  const prisma = {
    order: {
      findUnique: mockFn(async () => existingOrder),
      update,
    },
  };
  const service = new GoogleSheetOrderDocumentsService(prisma as any);
  await service.updateOrderDocuments("ord-1", { invoiceNumber: "INV-777" });
  assert.deepEqual(update.calls[0]![0].data, { invoiceNumber: "INV-777" });
});

test("updateOrderDocuments idempotent re-post skips update when no keys", async () => {
  const update = mockFn(async () => existingOrder);
  const prisma = {
    order: {
      findUnique: mockFn(async () => existingOrder),
      update,
    },
  };
  const service = new GoogleSheetOrderDocumentsService(prisma as any);
  await service.updateOrderDocuments("ord-1", {});
  assert.equal(update.calls.length, 0);
});

test("updateOrderDocuments throws when order missing", async () => {
  const prisma = {
    order: { findUnique: mockFn(async () => null) },
  };
  const service = new GoogleSheetOrderDocumentsService(prisma as any);
  await assert.rejects(
    () => service.updateOrderDocuments("missing", { invoiceNumber: "X" }),
    NotFoundException,
  );
});
