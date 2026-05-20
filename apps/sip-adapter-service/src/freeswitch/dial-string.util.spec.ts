import { describe, it } from "node:test";
import assert from "node:assert";
import { destinationToDialString } from "./dial-string.util";

describe("destinationToDialString", () => {
  it("converts +380 E.164", () => {
    assert.strictEqual(destinationToDialString("+380501112233"), "380501112233");
  });

  it("converts 0-prefixed national", () => {
    assert.strictEqual(destinationToDialString("0501112233"), "380501112233");
  });
});
