import { describe, it } from "node:test";
import assert from "node:assert";
import { extractMockOutcome } from "./mock-outcome.util";

describe("extractMockOutcome", () => {
  it("reads crmContext.mockOutcome", () => {
    assert.strictEqual(
      extractMockOutcome({}, { mockOutcome: "no_answer" }),
      "no_answer",
    );
  });

  it("falls back to context.mockOutcome", () => {
    assert.strictEqual(extractMockOutcome({ mockOutcome: "price_issue" }, {}), "price_issue");
  });

  it("defaults to default for unknown", () => {
    assert.strictEqual(extractMockOutcome({ mockOutcome: "nope" }, {}), "default");
  });
});
