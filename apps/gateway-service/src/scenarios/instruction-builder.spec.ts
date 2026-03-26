import { describe, it } from "node:test";
import assert from "node:assert";
import { buildDormantReactivationInstruction } from "./instruction-builder";

describe("instruction-builder", () => {
  it("includes outcome hint", () => {
    const t = buildDormantReactivationInstruction("catalog_requested");
    assert.ok(t.includes("catalog_requested"));
    assert.ok(t.includes("dormant"));
  });
});
