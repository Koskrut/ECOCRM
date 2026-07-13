import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExpoPushService } from "../expo-push.service";

describe("ExpoPushService", () => {
  it("isInvalidTokenTicket detects DeviceNotRegistered", () => {
    assert.equal(
      ExpoPushService.isInvalidTokenTicket({
        status: "error",
        message: "DeviceNotRegistered",
      }),
      true,
    );
    assert.equal(
      ExpoPushService.isInvalidTokenTicket({
        status: "error",
        message: "error",
        details: { error: "DeviceNotRegistered" },
      }),
      true,
    );
    assert.equal(
      ExpoPushService.isInvalidTokenTicket({ status: "ok", id: "ticket-1" }),
      false,
    );
  });

  it("send returns empty array for no messages", async () => {
    const service = new ExpoPushService();
    const tickets = await service.send([]);
    assert.deepEqual(tickets, []);
  });
});
