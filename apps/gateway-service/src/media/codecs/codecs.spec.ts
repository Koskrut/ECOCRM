import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeAlaw8k, decodeMulaw8k, encodeAlaw8k, encodeMulaw8k } from "./g711";
import { resample16kTo8k, resample8kTo16k, resample8kTo24k, resample24kTo8k } from "./resample";

function tone(len: number, amp = 3000): Int16Array {
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = Math.round(Math.sin((i / len) * Math.PI * 2) * amp);
  }
  return out;
}

describe("media codecs", () => {
  it("mulaw roundtrip keeps waveform shape", () => {
    const pcm = tone(160);
    const ulaw = encodeMulaw8k(pcm);
    const decoded = decodeMulaw8k(ulaw);
    assert.equal(decoded.length, pcm.length);
    let err = 0;
    for (let i = 0; i < pcm.length; i++) err += Math.abs(decoded[i] - pcm[i]);
    assert.ok(err / pcm.length < 400, `avg error too high: ${err / pcm.length}`);
  });

  it("alaw roundtrip keeps waveform shape", () => {
    const pcm = tone(160);
    const alaw = encodeAlaw8k(pcm);
    const decoded = decodeAlaw8k(alaw);
    assert.equal(decoded.length, pcm.length);
    let err = 0;
    for (let i = 0; i < pcm.length; i++) err += Math.abs(decoded[i] - pcm[i]);
    assert.ok(err / pcm.length < 500, `avg error too high: ${err / pcm.length}`);
  });

  it("resample 8k<->24k roundtrip keeps length", () => {
    const pcm8 = tone(160);
    const up = resample8kTo24k(pcm8);
    const down = resample24kTo8k(up);
    assert.equal(up.length, 480);
    assert.equal(down.length, 160);
  });
});
