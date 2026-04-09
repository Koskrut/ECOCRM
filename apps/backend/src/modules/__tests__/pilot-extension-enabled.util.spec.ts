import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ModuleIds } from "../module-ids";
import {
  moduleIdSetFromPilotStorage,
  normalizePilotExtensionEnabledList,
  parseStoredPilotExtensionIds,
} from "../enabled/pilot-extension-enabled.util";

describe("pilot-extension-enabled.util", () => {
  it("normalize sorts and accepts subset", () => {
    const out = normalizePilotExtensionEnabledList([
      ModuleIds.IntegrationsTelegram,
      ModuleIds.VoiceOutbound,
    ]);
    assert.deepEqual(out, [ModuleIds.IntegrationsTelegram, ModuleIds.VoiceOutbound].sort());
    assert.equal(out.length, 2);
  });

  it("normalize rejects duplicate", () => {
    assert.throws(
      () => normalizePilotExtensionEnabledList([ModuleIds.Finance, ModuleIds.Finance]),
      /DUPLICATE_IDS/,
    );
  });

  it("normalize rejects invalid id", () => {
    assert.throws(() => normalizePilotExtensionEnabledList(["ext.unknown"]), /INVALID_ID/);
  });

  it("parseStored rejects unknown string", () => {
    assert.equal(parseStoredPilotExtensionIds({ enabled: ["ext.voice_outbound", "nope"] }), null);
  });

  it("parseStored ignores legacy core in array", () => {
    const out = parseStoredPilotExtensionIds({
      enabled: [ModuleIds.CoreCrm, ModuleIds.Finance],
    });
    assert.deepEqual(out, [ModuleIds.Finance]);
  });

  it("moduleIdSetFromPilotStorage always includes core", () => {
    const s = moduleIdSetFromPilotStorage([]);
    assert.equal(s.has(ModuleIds.CoreCrm), true);
    assert.equal(s.size, 1);
  });
});
