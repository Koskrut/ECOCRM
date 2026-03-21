const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  effectivePaymentRequestStatus,
  toPaymentRequestPublicDto,
} = require("../payment-request-public.mapper");

describe("effectivePaymentRequestStatus", () => {
  it("returns EXPIRED when PENDING and past expiresAt", () => {
    const s = effectivePaymentRequestStatus(
      { status: "PENDING", expiresAt: new Date("2020-01-01") },
      new Date("2025-01-01"),
    );
    assert.strictEqual(s, "EXPIRED");
  });

  it("returns PENDING when not yet expired", () => {
    const s = effectivePaymentRequestStatus(
      { status: "PENDING", expiresAt: new Date("2030-01-01") },
      new Date("2025-01-01"),
    );
    assert.strictEqual(s, "PENDING");
  });

  it("returns PAID unchanged", () => {
    const s = effectivePaymentRequestStatus(
      { status: "PAID", expiresAt: new Date("2020-01-01") },
      new Date("2025-01-01"),
    );
    assert.strictEqual(s, "PAID");
  });
});

describe("toPaymentRequestPublicDto", () => {
  it("exposes only safe fields (no orderId, publicToken, internal ids)", () => {
    const dto = toPaymentRequestPublicDto(
      {
        id: "internal-id",
        orderId: "order-secret",
        status: "PENDING",
        amount: 10 as unknown as never,
        currency: "UAH",
        purpose: "test purpose ok",
        expiresAt: new Date("2030-06-01T12:00:00.000Z"),
        recipientName: "Seller",
        iban: "UA111",
        edrpou: "12345678",
        mfo: null,
        bankName: null,
        publicToken: "secret-token",
        nbuDeeplink: "https://bank.gov.ua/qr/xx",
        createdByUserId: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        paidAt: null,
        linkedPaymentId: null,
      } as never,
      "data:image/png;base64,abc",
      new Date("2025-01-01"),
    );
    const keys = Object.keys(dto).sort();
    assert.deepStrictEqual(keys, [
      "amount",
      "bankName",
      "currency",
      "edrpou",
      "effectiveStatus",
      "expiresAt",
      "iban",
      "mfo",
      "nbuDeeplink",
      "purpose",
      "qrPngDataUrl",
      "recipientName",
      "status",
    ]);
    assert.strictEqual((dto as { publicToken?: string }).publicToken, undefined);
    assert.strictEqual((dto as { orderId?: string }).orderId, undefined);
  });
});
