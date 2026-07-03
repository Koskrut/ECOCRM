const { describe, it } = require("node:test");
const assert = require("node:assert");
const { extractOrderNumberFromDescription } = require("../match-engine.utils");

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

describe("extractPersonNameFromDescription", () => {
  const { extractPersonNameFromDescription, amountsMatchWithinTolerance, expectedPaymentAmountInCurrency } = require("../match-engine.utils");

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

  it("matches amount within 1% tolerance using exchange rate", () => {
    const expected = expectedPaymentAmountInCurrency(56, "USD", "UAH", 45);
    assert.strictEqual(expected, 2520);
    assert.strictEqual(amountsMatchWithinTolerance(2520, 2520), true);
    assert.strictEqual(amountsMatchWithinTolerance(2520, 2510), true);
    assert.strictEqual(amountsMatchWithinTolerance(2520, 2400), false);
  });
});
