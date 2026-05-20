import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AppConfig } from "../config/configuration";
import { RtpPortAllocatorService } from "./rtp-port-allocator.service";

function cfg(start: number, end: number): AppConfig {
  return {
    rtpPortStart: start,
    rtpPortEnd: end,
  } as AppConfig;
}

describe("RtpPortAllocatorService", () => {
  it("allocates and releases ports in range", () => {
    const alloc = new RtpPortAllocatorService(cfg(30000, 30002));
    const p1 = alloc.allocate();
    const p2 = alloc.allocate();
    assert.strictEqual(p1, 30000);
    assert.strictEqual(p2, 30001);
    alloc.release(p1);
    const p3 = alloc.allocate();
    assert.strictEqual(p3, 30000);
  });

  it("throws when range exhausted", () => {
    const alloc = new RtpPortAllocatorService(cfg(30000, 30000));
    alloc.allocate();
    assert.throws(() => alloc.allocate(), /RTP_PORT_RANGE_EXHAUSTED/);
  });
});
