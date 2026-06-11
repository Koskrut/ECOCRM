import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FuelCompensationStatus, UserRole } from "@prisma/client";
/** Mirrors transition rules in FieldFuelService.patchDay. */
function canTransition(
  actorRole: UserRole,
  isSelf: boolean,
  current: FuelCompensationStatus,
  next: FuelCompensationStatus,
): boolean {
  const isSupervisor = actorRole === UserRole.ADMIN || actorRole === UserRole.LEAD;
  if (next === FuelCompensationStatus.SUBMITTED) {
    return (
      isSelf &&
      (current === FuelCompensationStatus.DRAFT || current === FuelCompensationStatus.REJECTED)
    );
  }
  if (next === FuelCompensationStatus.APPROVED || next === FuelCompensationStatus.REJECTED) {
    return isSupervisor && current === FuelCompensationStatus.SUBMITTED;
  }
  if (next === FuelCompensationStatus.PAID) {
    return actorRole === UserRole.ADMIN && current === FuelCompensationStatus.APPROVED;
  }
  return false;
}

describe("fuel compensation status transitions", () => {
  it("manager can submit own draft", () => {
    assert.equal(
      canTransition(UserRole.MANAGER, true, FuelCompensationStatus.DRAFT, FuelCompensationStatus.SUBMITTED),
      true,
    );
  });

  it("manager cannot approve", () => {
    assert.equal(
      canTransition(
        UserRole.MANAGER,
        true,
        FuelCompensationStatus.SUBMITTED,
        FuelCompensationStatus.APPROVED,
      ),
      false,
    );
  });

  it("lead can approve submitted report", () => {
    assert.equal(
      canTransition(
        UserRole.LEAD,
        false,
        FuelCompensationStatus.SUBMITTED,
        FuelCompensationStatus.APPROVED,
      ),
      true,
    );
  });

  it("only admin can mark paid", () => {
    assert.equal(
      canTransition(UserRole.LEAD, false, FuelCompensationStatus.APPROVED, FuelCompensationStatus.PAID),
      false,
    );
    assert.equal(
      canTransition(UserRole.ADMIN, false, FuelCompensationStatus.APPROVED, FuelCompensationStatus.PAID),
      true,
    );
  });
});
