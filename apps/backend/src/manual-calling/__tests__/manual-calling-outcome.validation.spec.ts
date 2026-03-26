import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ManualCallOutcome } from "@prisma/client";
import { validateManualCallCompletePayload } from "../manual-calling-outcome.validation";

describe("validateManualCallCompletePayload", () => {
  it("requires callbackAt for REQUESTED_CALLBACK", () => {
    assert.throws(
      () =>
        validateManualCallCompletePayload({
          outcome: ManualCallOutcome.REQUESTED_CALLBACK,
        }),
      /callbackAt/,
    );
  });

  it("requires note for WRONG_NUMBER", () => {
    assert.throws(
      () =>
        validateManualCallCompletePayload({
          outcome: ManualCallOutcome.WRONG_NUMBER,
        }),
      /note/,
    );
  });

  it("accepts valid WRONG_NUMBER with note", () => {
    assert.doesNotThrow(() =>
      validateManualCallCompletePayload({
        outcome: ManualCallOutcome.WRONG_NUMBER,
        note: "bad",
      }),
    );
  });
});
