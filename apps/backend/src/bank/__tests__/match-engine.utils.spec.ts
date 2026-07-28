const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  extractOrderNumberFromDescription,
  extractOrderCandidatesFromDescription,
  resolveOrderCandidates,
  stripDescriptionNoise,
  amountsMatchAbsolute,
  normalizeCounterpartyName,
  extractEdrpouFromDescription,
} = require("../match-engine.utils");

describe("extractOrderNumberFromDescription", () => {
  it("returns null for null or empty", () => {
    assert.strictEqual(extractOrderNumberFromDescription(null), null);
    assert.strictEqual(extractOrderNumberFromDescription(""), null);
    assert.strictEqual(extractOrderNumberFromDescription("   "), null);
  });

  it('extracts number from "заказ 12345"', () => {
    assert.strictEqual(extractOrderNumberFromDescription("заказ 12345"), "12345");
    assert.strictEqual(extractOrderNumberFromDescription("Оплата заказ 12345"), "12345");
  });

  it('extracts number from "оплата 12345"', () => {
    assert.strictEqual(extractOrderNumberFromDescription("оплата 12345"), "12345");
  });

  it('extracts number from "#12345" and "12345"', () => {
    assert.strictEqual(extractOrderNumberFromDescription("#12345"), "12345");
    assert.strictEqual(extractOrderNumberFromDescription("12345"), "12345");
  });

  it("extracts 4–8 digits", () => {
    assert.strictEqual(extractOrderNumberFromDescription("заказ 1234"), "1234");
    assert.strictEqual(extractOrderNumberFromDescription("заказ 12345678"), "12345678");
  });

  it("returns null when multiple number groups (ambiguous)", () => {
    assert.strictEqual(extractOrderNumberFromDescription("12345 and 67890"), null);
    assert.strictEqual(extractOrderNumberFromDescription("pay 1111 2222"), null);
  });

  it("prefers a labeled number even amid other bank digits", () => {
    assert.strictEqual(
      extractOrderNumberFromDescription("заказ 9336, рахунок 12345678"),
      "9336",
    );
    assert.strictEqual(
      extractOrderNumberFromDescription("Оплата #9329 МФО 305299"),
      "9329",
    );
  });

  it("returns null when no digits", () => {
    assert.strictEqual(extractOrderNumberFromDescription("no numbers here"), null);
  });
});

describe("extractOrderCandidatesFromDescription (v2)", () => {
  it("single number", () => {
    const c = extractOrderCandidatesFromDescription("Оплата замовлення 7001");
    assert.deepStrictEqual(
      c.map((x) => x.orderNumber),
      ["7001"],
    );
  });

  it("UA multi-order list", () => {
    const c = extractOrderCandidatesFromDescription("Оплата замовлення 7001, 7002");
    assert.deepStrictEqual(
      c.map((x) => x.orderNumber).sort(),
      ["7001", "7002"],
    );
  });

  it("semicolon / slash lists", () => {
    const c = extractOrderCandidatesFromDescription("order 7001; 7002 / 7003");
    assert.deepStrictEqual(
      c.map((x) => x.orderNumber).sort(),
      ["7001", "7002", "7003"],
    );
  });

  it("filters dates and phones as noise", () => {
    const cleaned = stripDescriptionNoise(
      "Оплата 24.07.2026 тел +380501112233 замовлення 7001",
    );
    assert.ok(!cleaned.includes("24.07.2026"));
    assert.ok(!cleaned.includes("380501112233"));
    const c = extractOrderCandidatesFromDescription(
      "Оплата 24.07.2026 тел +380501112233 замовлення 7001",
    );
    assert.deepStrictEqual(
      c.map((x) => x.orderNumber),
      ["7001"],
    );
  });

  it("filters currency amounts near грн/UAH", () => {
    const c = extractOrderCandidatesFromDescription("Сума 1500 грн order 7001");
    assert.deepStrictEqual(
      c.map((x) => x.orderNumber),
      ["7001"],
    );
  });

  it("parses explicit amounts", () => {
    const c = extractOrderCandidatesFromDescription(
      "Оплата замовлення 7001 - 1200, замовлення 7002 сума 800",
    );
    const by = Object.fromEntries(c.map((x) => [x.orderNumber, x.explicitAmount]));
    assert.strictEqual(by["7001"], 1200);
    assert.strictEqual(by["7002"], 800);
  });

  it("returns empty for garbage", () => {
    assert.deepStrictEqual(extractOrderCandidatesFromDescription("xxx"), []);
    assert.deepStrictEqual(extractOrderCandidatesFromDescription(null), []);
  });
});

describe("extractDocumentRefsFromDescription", () => {
  const { extractDocumentRefsFromDescription } = require("../match-engine.utils");

  it("extracts invoice number without treating as orderNumber", () => {
    const refs = extractDocumentRefsFromDescription("Оплата рахунок INV-2026-001");
    assert.deepStrictEqual(refs.invoices, ["INV-2026-001"]);
    assert.deepStrictEqual(refs.waybills, []);
    assert.strictEqual(extractOrderNumberFromDescription("Оплата рахунок INV-2026-001"), null);
  });

  it("extracts waybill РН token", () => {
    const refs = extractDocumentRefsFromDescription("Оплата РН ABC-1234 за товар");
    assert.deepStrictEqual(refs.waybills, ["ABC-1234"]);
  });

  it("orderNumber regression: замовлення still works", () => {
    assert.strictEqual(extractOrderNumberFromDescription("Оплата замовлення 7001"), "7001");
  });

  it("заказ wins over nearby invoice digits", () => {
    assert.strictEqual(
      extractOrderNumberFromDescription("заказ 9336, рахунок 12345678"),
      "9336",
    );
    const refs = extractDocumentRefsFromDescription("заказ 9336, рахунок 12345678");
    assert.ok(refs.invoices.includes("12345678"));
  });
});

describe("resolveOrderCandidates", () => {
  it("exact match + notFound + dedupe", () => {
    const map = new Map([
      ["7001", { orderNumber: "7001", id: "a" }],
      ["7002", { orderNumber: "7002", id: "b" }],
    ]);
    const { found, notFound } = resolveOrderCandidates(
      [
        { orderNumber: "7001" },
        { orderNumber: "7001", explicitAmount: 10 },
        { orderNumber: "9999" },
        { orderNumber: "7002" },
      ],
      map,
    );
    assert.strictEqual(found.length, 2);
    assert.deepStrictEqual(notFound, ["9999"]);
    assert.strictEqual(found[0].explicitAmount, 10);
  });
});

describe("name / edrpou helpers", () => {
  it("normalizes company name", () => {
    assert.strictEqual(normalizeCounterpartyName('ТОВ "Ромашка"'), "ромашка");
  });

  it("extracts edrpou", () => {
    assert.strictEqual(extractEdrpouFromDescription("код ЄДРПОУ 12345678 оплата"), "12345678");
  });

  it("absolute amount tolerance", () => {
    assert.strictEqual(amountsMatchAbsolute(1000, 1000.5, 1), true);
    assert.strictEqual(amountsMatchAbsolute(1000, 1002, 1), false);
  });
});

describe("extractPersonNameFromDescription", () => {
  const {
    extractPersonNameFromDescription,
    amountsMatchWithinTolerance,
    contactMatchesPerson,
    expectedPaymentAmountInCurrency,
    isSharedOrGatewayCounterparty,
    namesMatchIgnoringApostrophe,
  } = require("../match-engine.utils");

  it("extracts name after comma in bank description", () => {
    const name = extractPersonNameFromDescription(
      "Сплата за ....медматериалы, Сидоренко Микола Васильович",
    );
    assert.deepStrictEqual(name, {
      lastName: "Сидоренко",
      firstName: "Микола",
      middleName: "Васильович",
    });
  });

  it("returns null when no cyrillic name", () => {
    assert.strictEqual(extractPersonNameFromDescription("payment for goods"), null);
  });

  it("apostrophe: Лагута В'ячеслав matches CRM Вячеслав", () => {
    const person = extractPersonNameFromDescription(
      "Сплата за медичні товари, Лагута В'ячеслав Олександрович",
    );
    assert.ok(person);
    assert.strictEqual(person.lastName, "Лагута");
    assert.strictEqual(person.firstName, "В'ячеслав");
    assert.ok(namesMatchIgnoringApostrophe("В'ячеслав", "Вячеслав"));
    assert.ok(
      contactMatchesPerson(
        { lastName: "Лагута", firstName: "Вячеслав" },
        person,
      ),
    );
  });

  it("matches amount within 1% tolerance using exchange rate", () => {
    const expected = expectedPaymentAmountInCurrency(56, "USD", "UAH", 45);
    assert.strictEqual(expected, 2520);
    assert.strictEqual(amountsMatchWithinTolerance(2520, 2520), true);
    assert.strictEqual(amountsMatchWithinTolerance(2520, 2510), true);
    assert.strictEqual(amountsMatchWithinTolerance(2520, 2400), false);
  });
});

describe("isSharedOrGatewayCounterparty", () => {
  const { isSharedOrGatewayCounterparty } = require("../match-engine.utils");

  it("detects Privat24 transit account name", () => {
    assert.strictEqual(
      isSharedOrGatewayCounterparty("Транз.рахунок платежi_ DN, DG, DZ"),
      true,
    );
  });

  it("detects liqpay / portmone markers", () => {
    assert.strictEqual(isSharedOrGatewayCounterparty("LiqPay Merch"), true);
    assert.strictEqual(isSharedOrGatewayCounterparty("оплата Portmone"), true);
  });

  it("treats IBAN with ≥5 distinct contacts as shared", () => {
    assert.strictEqual(
      isSharedOrGatewayCounterparty("Іваненко Іван", "UA123", 5),
      true,
    );
    assert.strictEqual(
      isSharedOrGatewayCounterparty("Іваненко Іван", "UA123", 2),
      false,
    );
  });

  it("ordinary counterparty is not shared", () => {
    assert.strictEqual(
      isSharedOrGatewayCounterparty("ШУШАРІН ІГОР ІГОРОВИЧ", "UA999"),
      false,
    );
  });
});
