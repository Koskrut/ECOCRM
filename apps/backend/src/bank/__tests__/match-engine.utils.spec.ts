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

  it("returns null when no digits", () => {
    assert.strictEqual(extractOrderNumberFromDescription("no numbers here"), null);
  });
});
