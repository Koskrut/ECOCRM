import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactAuditValue } from "../audit-redaction";

describe("redactAuditValue", () => {
  it("masks secret-looking keys", () => {
    const result = redactAuditValue({
      token: "secret-token",
      passwordHash: "123",
      nested: { apiKey: "abc", keep: "ok" },
    }) as Record<string, unknown>;

    assert.equal(result.token, "<redacted>");
    assert.equal(result.passwordHash, "<redacted>");
    assert.equal((result.nested as Record<string, unknown>).apiKey, "<redacted>");
    assert.equal((result.nested as Record<string, unknown>).keep, "ok");
  });
});
