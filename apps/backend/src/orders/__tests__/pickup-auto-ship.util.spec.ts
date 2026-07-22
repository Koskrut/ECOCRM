import assert from "node:assert/strict";
import { PICKUP_AUTO_SHIP_REASON, PICKUP_AUTO_SHIP_WHERE } from "../pickup-auto-ship.util";

assert.equal(PICKUP_AUTO_SHIP_WHERE.deliveryMethod, "PICKUP");
assert.equal(PICKUP_AUTO_SHIP_WHERE.orderStage, "READY_TO_SHIP");
assert.ok(PICKUP_AUTO_SHIP_REASON.includes("самовивіз"));
console.log("pickup-auto-ship.util.spec: ok");
