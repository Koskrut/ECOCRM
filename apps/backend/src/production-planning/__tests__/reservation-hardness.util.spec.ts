import test from "node:test";
import assert from "node:assert/strict";
import { OrderStage, ReservationHardness } from "@prisma/client";
import { reservationHardnessForStage } from "../../orders/reservation-hardness.util";

test("NEW and AWAITING_PAYMENT use SOFT reservations", () => {
  assert.equal(reservationHardnessForStage(OrderStage.NEW), ReservationHardness.SOFT);
  assert.equal(
    reservationHardnessForStage(OrderStage.AWAITING_PAYMENT),
    ReservationHardness.SOFT,
  );
});

test("confirmed pipeline stages use HARD reservations", () => {
  assert.equal(reservationHardnessForStage(OrderStage.CONFIRMED), ReservationHardness.HARD);
  assert.equal(reservationHardnessForStage(OrderStage.AWAITING_STOCK), ReservationHardness.HARD);
  assert.equal(reservationHardnessForStage(OrderStage.READY_TO_SHIP), ReservationHardness.HARD);
});
