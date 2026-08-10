import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildExistingKeySet,
  collectSampleIds,
  idempotencyKeyString,
  isDuplicateSample,
  markSampleAccepted,
  normalizeDeviceId,
  normalizeSampleId,
} from "../field-samples-idempotency";

describe("normalizeSampleId", () => {
  it("trims and rejects empty", () => {
    assert.equal(normalizeSampleId("  abc  "), "abc");
    assert.equal(normalizeSampleId(""), null);
    assert.equal(normalizeSampleId(null), null);
  });
});

describe("normalizeDeviceId", () => {
  it("prefers item deviceId over batch fallback", () => {
    assert.equal(normalizeDeviceId({ deviceId: " dev-1 " }, "batch"), "dev-1");
    assert.equal(normalizeDeviceId({}, "batch"), "batch");
    assert.equal(normalizeDeviceId({}, null), null);
  });
});

describe("idempotency within batch", () => {
  it("treats same owner+device+sampleId as duplicate", () => {
    const keys = new Set<string>();
    const ownerId = "owner-1";
    const deviceId = "dev-1";
    const sampleId = "11111111-1111-4111-8111-111111111111";

    assert.equal(isDuplicateSample(ownerId, deviceId, sampleId, keys), false);
    markSampleAccepted(ownerId, deviceId, sampleId, keys);
    assert.equal(isDuplicateSample(ownerId, deviceId, sampleId, keys), true);
  });

  it("allows same sampleId on different devices", () => {
    const keys = new Set<string>();
    const ownerId = "owner-1";
    const sampleId = "22222222-2222-4222-8222-222222222222";

    markSampleAccepted(ownerId, "dev-a", sampleId, keys);
    assert.equal(isDuplicateSample(ownerId, "dev-b", sampleId, keys), false);
  });

  it("collectSampleIds skips blanks", () => {
    assert.deepEqual(
      collectSampleIds([{ sampleId: "a" }, { sampleId: "  " }, { sampleId: "b" }]),
      ["a", "b"],
    );
  });
});

describe("buildExistingKeySet", () => {
  it("scopes to owner and includes deviceId", () => {
    const set = buildExistingKeySet(
      [
        { ownerId: "owner-1", deviceId: "dev-1", sampleId: "s1" },
        { ownerId: "owner-2", deviceId: "dev-1", sampleId: "s2" },
      ],
      "owner-1",
    );
    assert.equal(set.size, 1);
    assert.equal(
      set.has(idempotencyKeyString({ ownerId: "owner-1", deviceId: "dev-1", sampleId: "s1" })),
      true,
    );
  });

  it("matches legacy stored row without deviceId", () => {
    const keys = buildExistingKeySet(
      [{ ownerId: "owner-1", deviceId: null, sampleId: "s1" }],
      "owner-1",
    );
    assert.equal(isDuplicateSample("owner-1", "dev-1", "s1", keys), true);
  });
});
