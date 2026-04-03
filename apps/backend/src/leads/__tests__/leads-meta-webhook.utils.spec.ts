const { describe, it } = require("node:test");
const assert = require("node:assert");
const { createHmac } = require("node:crypto");
const {
  verifyMetaSignatureSha256,
  parseMetaCreatedTime,
} = require("../leads-meta-webhook.utils");

describe("verifyMetaSignatureSha256", () => {
  it("accepts valid sha256 signature", () => {
    const secret = "test_app_secret";
    const raw = Buffer.from('{"object":"page"}', "utf8");
    const hex = createHmac("sha256", secret).update(raw).digest("hex");
    assert.strictEqual(
      verifyMetaSignatureSha256(raw, `sha256=${hex}`, secret),
      true,
    );
  });

  it("rejects wrong secret", () => {
    const raw = Buffer.from("{}", "utf8");
    const hex = createHmac("sha256", "a").update(raw).digest("hex");
    assert.strictEqual(
      verifyMetaSignatureSha256(raw, `sha256=${hex}`, "b"),
      false,
    );
  });

  it("rejects missing or malformed header", () => {
    const raw = Buffer.from("x", "utf8");
    assert.strictEqual(verifyMetaSignatureSha256(raw, undefined, "s"), false);
    assert.strictEqual(verifyMetaSignatureSha256(raw, "md5=abc", "s"), false);
    assert.strictEqual(verifyMetaSignatureSha256(undefined, "sha256=ab", "s"), false);
  });
});

describe("parseMetaCreatedTime", () => {
  it("parses unix seconds", () => {
    const d = parseMetaCreatedTime(1730123456);
    assert.strictEqual(d.getTime(), 1730123456000);
  });

  it("parses unix as numeric string", () => {
    const d = parseMetaCreatedTime("1730123456");
    assert.strictEqual(d.getTime(), 1730123456000);
  });

  it("parses ISO string", () => {
    const d = parseMetaCreatedTime("2024-01-15T12:00:00.000Z");
    assert.strictEqual(Number.isNaN(d.getTime()), false);
  });
});
