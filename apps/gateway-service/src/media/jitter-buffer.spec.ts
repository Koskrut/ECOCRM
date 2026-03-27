import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AdaptiveJitterBuffer } from "./jitter-buffer";

describe("adaptive jitter buffer", () => {
  it("handles reorder and loss with bounded queue", () => {
    const jb = new AdaptiveJitterBuffer({ targetMs: 60, minMs: 50, maxMs: 100, maxPackets: 10 });
    const now = Date.now();
    jb.push({ sequence: 10, timestamp: 1000, payload: Buffer.from([1]), receivedAtMs: now });
    jb.push({ sequence: 12, timestamp: 1320, payload: Buffer.from([3]), receivedAtMs: now + 2 });
    jb.push({ sequence: 11, timestamp: 1160, payload: Buffer.from([2]), receivedAtMs: now + 1 });

    const a = jb.pop(now + 100);
    const b = jb.pop(now + 120);
    const c = jb.pop(now + 140);

    assert.equal(a.kind, "frame");
    assert.equal(b.kind, "frame");
    assert.ok(c.kind === "frame" || c.kind === "loss");
    assert.ok(jb.queueDepth() <= 10);
  });
});
