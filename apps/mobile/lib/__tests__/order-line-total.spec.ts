const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  computeLineTotal,
  ORDER_PROMO_BUY_100_GET_30,
  ORDER_PROMO_QTY_25_MINUS_2,
  isPromoApplicable,
} = require("../order-line-total");

describe("order line promos", () => {
  it("BUY_100_GET_30: 130 @ 16 = 1600", () => {
    assert.equal(computeLineTotal(130, 16, 0, ORDER_PROMO_BUY_100_GET_30), 1600);
  });

  it("QTY_25_MINUS_2: 25 @ 16 = 350", () => {
    assert.equal(computeLineTotal(25, 16, 0, ORDER_PROMO_QTY_25_MINUS_2), 350);
  });

  it("promo applicability thresholds", () => {
    assert.equal(isPromoApplicable(ORDER_PROMO_BUY_100_GET_30, 129), false);
    assert.equal(isPromoApplicable(ORDER_PROMO_BUY_100_GET_30, 130), true);
    assert.equal(isPromoApplicable(ORDER_PROMO_QTY_25_MINUS_2, 24), false);
    assert.equal(isPromoApplicable(ORDER_PROMO_QTY_25_MINUS_2, 25), true);
  });
});
