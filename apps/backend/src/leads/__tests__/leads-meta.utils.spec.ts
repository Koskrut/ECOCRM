const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  normalizePhone,
  isPhoneValid,
  scoreLeadFromAnswers,
} = require("../leads-meta.utils");

describe("normalizePhone", () => {
  it("returns null for null or empty", () => {
    assert.strictEqual(normalizePhone(null), null);
    assert.strictEqual(normalizePhone(undefined), null);
    assert.strictEqual(normalizePhone(""), null);
    assert.strictEqual(normalizePhone("   "), null);
  });

  it("normalizes 10-digit Ukrainian number to +380", () => {
    assert.strictEqual(normalizePhone("0501234567"), "+380501234567");
    assert.strictEqual(normalizePhone("501234567"), "+380501234567");
    assert.strictEqual(normalizePhone("0 50 123 45 67"), "+380501234567");
  });

  it("strips spaces, parentheses, dashes", () => {
    assert.strictEqual(normalizePhone("+38 (050) 123-45-67"), "+380501234567");
    assert.strictEqual(normalizePhone("38 050 123 45 67"), "+380501234567");
  });

  it("keeps full international 38... as +38...", () => {
    assert.strictEqual(normalizePhone("380501234567"), "+380501234567");
  });

  it("returns null for too few digits", () => {
    assert.strictEqual(normalizePhone("123"), null);
    assert.strictEqual(normalizePhone("12345"), null);
  });
});

describe("isPhoneValid", () => {
  it("returns true for valid normalized phones", () => {
    assert.strictEqual(isPhoneValid("+380501234567"), true);
    assert.strictEqual(isPhoneValid("0501234567"), true);
  });

  it("returns false for null, empty, or invalid", () => {
    assert.strictEqual(isPhoneValid(null), false);
    assert.strictEqual(isPhoneValid(""), false);
    assert.strictEqual(isPhoneValid("123"), false);
  });
});

describe("scoreLeadFromAnswers", () => {
  it("adds +3 for deadline hot keywords", () => {
    const score = scoreLeadFromAnswers(
      [{ key: "comment", value: "Нужно срочно сегодня" }],
      "+380501234567",
    );
    assert.strictEqual(score, 3);
  });

  it("adds +2 for premium need", () => {
    const score = scoreLeadFromAnswers(
      [{ key: "category", value: "премиум товары" }],
      "+380501234567",
    );
    assert.strictEqual(score, 2);
  });

  it("adds +2 for high qty", () => {
    const score = scoreLeadFromAnswers(
      [{ key: "qty", value: "15" }],
      "+380501234567",
    );
    assert.strictEqual(score, 2);
  });

  it("subtracts 2 when phone invalid", () => {
    const score = scoreLeadFromAnswers(
      [{ key: "full_name", value: "Ivan" }],
      null,
    );
    assert.strictEqual(score, -2);
  });

  it("returns 0 for neutral answers with valid phone", () => {
    const score = scoreLeadFromAnswers(
      [{ key: "full_name", value: "Ivan" }],
      "+380501234567",
    );
    assert.strictEqual(score, 0);
  });
});
