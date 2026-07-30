import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isInboundReturnReceivedByNpStatus,
  normalizeTtnNumber,
} from "../return-package-np-status.utils";

describe("return-package-np-status.utils", () => {
  it("normalizeTtnNumber strips spaces", () => {
    assert.equal(normalizeTtnNumber(" 2045 0000 0000 00 "), "20450000000000");
  });

  it("detects delivered inbound return by NP code", () => {
    assert.equal(isInboundReturnReceivedByNpStatus("9", ""), true);
    assert.equal(isInboundReturnReceivedByNpStatus("3", "В дорозі"), false);
  });

  it("detects delivered inbound return by Ukrainian text", () => {
    assert.equal(isInboundReturnReceivedByNpStatus("", "Отримано одержувачем"), true);
  });
});
