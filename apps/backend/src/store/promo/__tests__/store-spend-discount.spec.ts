import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatStoreSpendPromoLines,
  storeCartMerchandiseUsd,
  storeSpendPromoForSubtotal,
} from "../store-spend-discount";

describe("store spend promo", () => {
  it("gives $60 off for every full $460 and nothing below the tier", () => {
    assert.equal(storeSpendPromoForSubtotal(0).discountUsd, 0);
    assert.equal(storeSpendPromoForSubtotal(459.99).discountUsd, 0);
    assert.equal(storeSpendPromoForSubtotal(459.99).totalUsd, 459.99);

    const one = storeSpendPromoForSubtotal(460);
    assert.equal(one.promo.steps, 1);
    assert.equal(one.discountUsd, 60);
    assert.equal(one.totalUsd, 400);

    const between = storeSpendPromoForSubtotal(919.99);
    assert.equal(between.promo.steps, 1);
    assert.equal(between.discountUsd, 60);
    assert.equal(between.totalUsd, 859.99);

    const two = storeSpendPromoForSubtotal(920);
    assert.equal(two.promo.steps, 2);
    assert.equal(two.discountUsd, 120);
    assert.equal(two.totalUsd, 800);

    assert.equal(storeSpendPromoForSubtotal(1380).discountUsd, 180);
  });

  it("rounds merchandise to cents before counting tiers", () => {
    assert.equal(storeCartMerchandiseUsd([{ price: 459.995, qty: 1 }]), 460);
    assert.equal(storeSpendPromoForSubtotal(459.995).discountUsd, 60);
    assert.equal(
      storeCartMerchandiseUsd([
        { price: 100.004, qty: 2 },
        { price: 260, qty: 1 },
      ]),
      460,
    );
  });

  it("keeps the plain total line until the discount applies", () => {
    assert.equal(
      formatStoreSpendPromoLines({
        subtotalUsd: 100,
        discountUsd: 0,
        totalUsd: 100,
        uahPerUsd: 40,
      }),
      "Разом: 4000 грн",
    );
    assert.equal(
      formatStoreSpendPromoLines({
        subtotalUsd: 460,
        discountUsd: 60,
        totalUsd: 400,
        uahPerUsd: 40,
      }),
      "Товари: 18400 грн\nЗнижка −60 $ за кожні 460 $: −2400 грн\nДо сплати: 16000 грн",
    );
  });
});
