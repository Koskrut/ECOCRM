import { BadRequestException } from "@nestjs/common";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FieldShiftStatus,
  FieldTrackingEventType,
  FieldTrackingRestartReason,
} from "@prisma/client";

import { FieldShiftsService } from "../field-shifts.service";

describe("FieldShiftsService recordTrackingEvent", () => {
  it("stores tracking_task_restarted for active shift owner", async () => {
    const created = {
      id: "evt-1",
      shiftId: "shift-1",
      ownerId: "user-1",
      type: FieldTrackingEventType.TRACKING_TASK_RESTARTED,
      reason: FieldTrackingRestartReason.OS_KILL,
      clientRecordedAt: new Date("2026-07-02T12:00:00.000Z"),
    };

    const prisma = {
      fieldShift: {
        findFirst: async () => ({
          id: "shift-1",
          ownerId: "user-1",
          status: FieldShiftStatus.ACTIVE,
        }),
      },
      fieldTrackingEvent: {
        create: async () => created,
      },
    };

    const service = new FieldShiftsService(
      prisma as never,
      {} as never,
      {} as never,
    );

    const result = await service.recordTrackingEvent(
      { id: "user-1" } as never,
      "shift-1",
      {
        type: "tracking_task_restarted",
        reason: "os_kill",
        clientRecordedAt: "2026-07-02T12:00:00.000Z",
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.event.reason, "os_kill");
  });

  it("rejects unsupported event type", async () => {
    const service = new FieldShiftsService({} as never, {} as never, {} as never);
    await assert.rejects(
      () =>
        service.recordTrackingEvent(
          { id: "user-1" } as never,
          "shift-1",
          {
            type: "other",
            clientRecordedAt: "2026-07-02T12:00:00.000Z",
          },
        ),
      BadRequestException,
    );
  });
});
