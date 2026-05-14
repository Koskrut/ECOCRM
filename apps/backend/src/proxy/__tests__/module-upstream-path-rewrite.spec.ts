import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  restorePathAfterExpressMount,
  rewriteNovaPoshtaUpstreamPath,
} from "../module-upstream-path-rewrite";

describe("restorePathAfterExpressMount", () => {
  it("prepends /np when Express stripped the mount (TTN create)", () => {
    assert.equal(restorePathAfterExpressMount("/np", "/ttn/order-1"), "/np/ttn/order-1");
  });

  it("leaves path unchanged if prefix already present", () => {
    assert.equal(
      restorePathAfterExpressMount("/np", "/np/ttn/order-1"),
      "/np/ttn/order-1",
    );
  });

  it("handles /store/np mount (pathname without query)", () => {
    assert.equal(restorePathAfterExpressMount("/store/np", "/cities"), "/store/np/cities");
  });
});

describe("rewriteNovaPoshtaUpstreamPath", () => {
  it("maps /orders/:id/np/ttn to /np/ttn/:id", () => {
    assert.equal(
      rewriteNovaPoshtaUpstreamPath("/orders/cmp54/np/ttn"),
      "/np/ttn/cmp54",
    );
  });

  it("maps reuse-existing suffix", () => {
    assert.equal(
      rewriteNovaPoshtaUpstreamPath("/orders/cmp54/np/ttn/reuse-existing"),
      "/np/ttn/cmp54/reuse-existing",
    );
  });

  it("maps legacy /orders/:id/ttn", () => {
    assert.equal(rewriteNovaPoshtaUpstreamPath("/orders/cmp54/ttn"), "/np/ttn/cmp54");
  });

  it("maps shipment TTN paths", () => {
    assert.equal(
      rewriteNovaPoshtaUpstreamPath("/shipments/sh1/np/ttn/unlink"),
      "/np/shipment/sh1/ttn/unlink",
    );
  });

  it("passes through already-normalized paths", () => {
    assert.equal(
      rewriteNovaPoshtaUpstreamPath("/np/ttn/cmp54"),
      "/np/ttn/cmp54",
    );
  });
});
