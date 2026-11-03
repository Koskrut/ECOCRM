import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import {
  assertManagerStageCap,
  isPastConfirmedStage,
  managerCanAdvancePastConfirmed,
} from "../order-manager-stage-cap";

describe("order-manager-stage-cap", () => {
  it("marks stages after CONFIRMED as past", () => {
    assert.equal(isPastConfirmedStage("CONFIRMED"), false);
    assert.equal(isPastConfirmedStage("AWAITING_STOCK"), false);
    assert.equal(isPastConfirmedStage("CANCELED"), false);
    assert.equal(isPastConfirmedStage("READY_TO_SHIP"), true);
    assert.equal(isPastConfirmedStage("SHIPPED"), true);
    assert.equal(isPastConfirmedStage("COMPLETED"), true);
    assert.equal(isPastConfirmedStage("REFUSED"), true);
  });

  it("allows only owner who is warehouse responsible", () => {
    assert.equal(
      managerCanAdvancePastConfirmed({
        actorId: "m1",
        ownerId: "m1",
        warehouseResponsibleUserId: "m1",
      }),
      true,
    );
    assert.equal(
      managerCanAdvancePastConfirmed({
        actorId: "m1",
        ownerId: "m2",
        warehouseResponsibleUserId: "m1",
      }),
      false,
    );
    assert.equal(
      managerCanAdvancePastConfirmed({
        actorId: "m1",
        ownerId: "m1",
        warehouseResponsibleUserId: null,
      }),
      false,
    );
  });

  it("blocks ordinary manager past CONFIRMED", () => {
    assert.throws(
      () =>
        assertManagerStageCap(
          { id: "m1", email: "m@x", role: UserRole.MANAGER, fullName: "M" },
          { ownerId: "m1", warehouseResponsibleUserId: null },
          "CONFIRMED",
          "READY_TO_SHIP",
        ),
      ForbiddenException,
    );
  });

  it("allows back/cancel without exception", () => {
    assert.doesNotThrow(() =>
      assertManagerStageCap(
        { id: "m1", email: "m@x", role: UserRole.MANAGER, fullName: "M" },
        { ownerId: "m1", warehouseResponsibleUserId: null },
        "CONFIRMED",
        "AWAITING_STOCK",
      ),
    );
    assert.doesNotThrow(() =>
      assertManagerStageCap(
        { id: "m1", email: "m@x", role: UserRole.MANAGER, fullName: "M" },
        { ownerId: "m1", warehouseResponsibleUserId: null },
        "CONFIRMED",
        "CANCELED",
      ),
    );
  });

  it("allows warehouse-responsible manager on own order", () => {
    assert.doesNotThrow(() =>
      assertManagerStageCap(
        { id: "m1", email: "m@x", role: UserRole.MANAGER, fullName: "M" },
        { ownerId: "m1", warehouseResponsibleUserId: "m1" },
        "CONFIRMED",
        "READY_TO_SHIP",
      ),
    );
  });

  it("does not cap ADMIN / LEAD / WAREHOUSE", () => {
    for (const role of [UserRole.ADMIN, UserRole.LEAD, UserRole.WAREHOUSE] as const) {
      assert.doesNotThrow(() =>
        assertManagerStageCap(
          { id: "u1", email: "u@x", role, fullName: "U" },
          { ownerId: "other", warehouseResponsibleUserId: null },
          "CONFIRMED",
          "READY_TO_SHIP",
        ),
      );
    }
  });
});
