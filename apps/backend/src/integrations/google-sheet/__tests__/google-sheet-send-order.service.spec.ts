import assert from "node:assert/strict";
import test from "node:test";
import { GoogleSheetSendOrderService } from "../google-sheet-send-order.service";

function orderRow() {
  return {
    id: "ord-1",
    orderNumber: "ORD-1",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    contact: null,
    client: null,
    owner: { id: "u1", fullName: "Менеджер" },
    bankAccount: null,
    warehouse: null,
    paymentMethod: "BANK_TRANSFER",
    exchangeRate: null,
    orderStage: "RECEIVED",
    status: "RECEIVED",
    items: [
      {
        id: "i1",
        qty: 4,
        price: 100,
        lineTotal: 400,
        productNameSnapshot: null,
        product: { id: "p1", sku: "SKU-A", name: "A" },
      },
      {
        id: "i2",
        qty: 2,
        price: 50,
        lineTotal: 100,
        productNameSnapshot: null,
        product: { id: "p2", sku: "SKU-B", name: "B" },
      },
    ],
    returns: [
      {
        status: "CLOSED",
        reason: "CUSTOMER_CHANGE",
        outboundWaivedAt: null,
        items: [
          { orderItemId: "i1", qtyReturned: 1 },
          { orderItemId: "i2", qtyReturned: 2 },
        ],
      },
    ],
  };
}

test("sheet payload sent to 1C drops returned qty", async () => {
  const prisma = { order: { findUnique: async () => orderRow() } };
  const settings = { getGoogleSheetSecrets: async () => ({}) };
  const svc = new GoogleSheetSendOrderService(prisma as never, settings as never);
  const payload = await svc.buildPayload("ord-1");
  assert.ok(payload);
  assert.deepEqual(payload!.items, [{ sku: "SKU-A", qty: 3, price: 100 }]);
});

test("sheet payload keeps full qty when the return is not yet received", async () => {
  const row = orderRow();
  row.returns[0]!.status = "IN_TRANSIT_BACK";
  const prisma = { order: { findUnique: async () => row } };
  const settings = { getGoogleSheetSecrets: async () => ({}) };
  const svc = new GoogleSheetSendOrderService(prisma as never, settings as never);
  const payload = await svc.buildPayload("ord-1");
  assert.deepEqual(
    payload!.items.map((it) => ({ sku: it.sku, qty: it.qty })),
    [
      { sku: "SKU-A", qty: 4 },
      { sku: "SKU-B", qty: 2 },
    ],
  );
});
