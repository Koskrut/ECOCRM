import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { kyivDayBounds } from "../../crm-timezone";

const CRM_TIME_ZONE = "Europe/Kyiv";

describe("visits day query (Kyiv calendar)", () => {
  it("includes timeline slots for tomorrow in Kyiv bounds", () => {
    const tomorrow = DateTime.now().setZone(CRM_TIME_ZONE).plus({ days: 1 }).toISODate()!;
    const { from, to } = kyivDayBounds(tomorrow);
    const [y, mo, d] = tomorrow.split("-").map(Number);

    for (let hour = 9; hour < 22; hour++) {
      for (const minute of [0, 30]) {
        const slot = DateTime.fromObject(
          { year: y, month: mo, day: d, hour, minute, second: 0 },
          { zone: CRM_TIME_ZONE },
        ).toJSDate();
        assert.ok(slot.getTime() >= from.getTime());
        assert.ok(slot.getTime() <= to.getTime());
      }
    }
  });

  it("UTC-midnight bounds would miss early-morning Kyiv visits on the same calendar day", () => {
    const dateStr = "2026-06-26";
    const utcStart = new Date(`${dateStr}T00:00:00.000Z`);
    const earlyKyiv = DateTime.fromObject(
      { year: 2026, month: 6, day: 26, hour: 1, minute: 0 },
      { zone: CRM_TIME_ZONE },
    ).toJSDate();
    const { from, to } = kyivDayBounds(dateStr);

    assert.ok(earlyKyiv.getTime() < utcStart.getTime());
    assert.ok(earlyKyiv.getTime() >= from.getTime());
    assert.ok(earlyKyiv.getTime() <= to.getTime());
  });
});
