import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { absolutePayUrl, resolvePublicPayPageOrigin } from "../public-pay-url";

describe("public pay url", () => {
  it("prefers an https store setting and strips a trailing slash", () => {
    assert.equal(
      resolvePublicPayPageOrigin("https://crm.example.com/", {
        CRM_WEB_URL: "https://ignored.example",
      }),
      "https://crm.example.com",
    );
  });

  it("falls back to CRM_WEB_URL when the setting is empty or http", () => {
    assert.equal(
      resolvePublicPayPageOrigin("", { CRM_WEB_URL: "https://crm.from-env.example" }),
      "https://crm.from-env.example",
    );
    assert.equal(
      resolvePublicPayPageOrigin("http://localhost:3000", {
        CRM_WEB_URL: "https://crm.from-env.example",
      }),
      "https://crm.from-env.example",
    );
  });

  it("joins /pay/{token} onto the origin", () => {
    assert.equal(
      absolutePayUrl("pay/tok", "https://crm.example.com"),
      "https://crm.example.com/pay/tok",
    );
  });
});
