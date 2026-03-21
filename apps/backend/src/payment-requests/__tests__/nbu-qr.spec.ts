const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  buildNbuPaymentDeeplink,
  buildNbuQrPayloadLines,
  normalizePurpose,
  NBU_QR_URL_BASE,
} = require("../nbu-qr");

describe("normalizePurpose", () => {
  it("pads short purpose to 10 characters", () => {
    assert.strictEqual(normalizePurpose("123456789").length, 10);
    assert.strictEqual(normalizePurpose("short").length, 10);
  });

  it("truncates to 140", () => {
    const long = "a".repeat(200);
    assert.strictEqual(normalizePurpose(long).length, 140);
  });
});

describe("buildNbuQrPayloadLines", () => {
  it("builds UCT payload with BCD header and LF endings", () => {
    const lines = buildNbuQrPayloadLines({
      recipientName: "ТОВ Тест",
      iban: "UA213223130000026007233566001",
      receiverCode: "12345678",
      currency: "UAH",
      amount: 100.5,
      purpose: "Оплата замовлення 7001",
      displayText: "",
    });
    assert.ok(lines.startsWith("BCD\n002\n1\nUCT\n"));
    assert.ok(lines.includes("UA213223130000026007233566001"));
    assert.ok(lines.includes("UAH100.5"));
    assert.ok(lines.endsWith("\n"));
  });
});

describe("buildNbuPaymentDeeplink", () => {
  it("returns official bank.gov.ua/qr base64url URL", () => {
    const url = buildNbuPaymentDeeplink({
      recipientName: "ТОВ Тест",
      iban: "UA213223130000026007233566001",
      receiverCode: "12345678",
      currency: "UAH",
      amount: 10,
      purpose: "Оплата тестового замовлення",
      displayText: "",
    });
    assert.ok(url.startsWith(`${NBU_QR_URL_BASE}/`));
    const rest = url.slice(NBU_QR_URL_BASE.length + 1);
    assert.ok(!rest.includes("+"));
    assert.ok(!rest.includes("/"));
    assert.ok(!rest.includes("="));
  });

  it("is stable for fixed input (regression)", () => {
    const url = buildNbuPaymentDeeplink({
      recipientName: "Acme LLC",
      iban: "UA213223130000026007233566001",
      receiverCode: "12345678",
      currency: "UAH",
      amount: 1,
      purpose: "Оплата замовлення 0001",
      displayText: "",
    });
    assert.strictEqual(
      url,
      "https://bank.gov.ua/qr/QkNECjAwMgoxClVDVAoKQWNtZSBMTEMKVUEyMTMyMjMxMzAwMDAwMjYwMDcyMzM1NjYwMDEKVUFIMQoxMjM0NTY3OAoKCtCe0L_Qu9Cw0YLQsCDQt9Cw0LzQvtCy0LvQtdC90L3RjyAwMDAxCgo",
    );
  });
});
