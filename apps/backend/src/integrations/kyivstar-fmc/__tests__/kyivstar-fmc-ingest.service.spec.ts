import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaService } from "../../prisma/prisma.service";
import type { PhoneEntityLookupService } from "../../../common/phone-entity-lookup.service";
import { KyivstarFmcIngestService } from "../kyivstar-fmc-ingest.service";

describe("KyivstarFmcIngestService", () => {
  const prisma = {
    integrationSetting: { findFirst: async () => null },
  } as unknown as PrismaService;
  const phoneLookup = {
    findContactByNormalizedKeys: async () => null,
    findCompanyIdByNormalizedKeys: async () => null,
  } as unknown as PhoneEntityLookupService;
  const service = new KyivstarFmcIngestService(prisma, phoneLookup);

  it("normalizes UA phone numbers", () => {
    const normalize = (s: string | undefined) =>
      // @ts-expect-error private
      service["normalizePhone"](s) as string | null;
    assert.equal(normalize("+380501234567"), "+380501234567");
    assert.equal(normalize("0501234567"), "+380501234567");
  });

  it("resolveDirectionFromPayload maps Kyivstar directions", () => {
    const resolve = (raw: Record<string, unknown>) =>
      // @ts-expect-error private
      service["resolveDirectionFromPayload"](raw) as string;
    assert.equal(resolve({ direction: "incoming" }), "INBOUND");
    assert.equal(resolve({ direction: "outgoing" }), "OUTBOUND");
    assert.equal(resolve({ direction: "local" }), "LOCAL");
  });

  it("resolveStatusFromHistory treats zero duration as missed", () => {
    const resolve = (duration: number | null, cause: number | null) =>
      // @ts-expect-error private
      service["resolveStatusFromHistory"](duration, cause) as string;
    assert.equal(resolve(0, 16), "MISSED");
    assert.equal(resolve(0, 17), "BUSY");
    assert.equal(resolve(42, 16), "ANSWERED");
  });

  it("extractPhones maps incoming call legs", () => {
    const extract = (raw: Record<string, unknown>, dir: "INBOUND" | "OUTBOUND") =>
      // @ts-expect-error private
      service["extractPhones"](raw, dir) as { customerPhoneRaw?: string; managerPhoneRaw?: string };
    const inbound = extract(
      {
        calling_number: "+380501111111",
        called_number: "+380672222222",
        phone_number: "0441111111",
        state_owner: "+380672222222",
      },
      "INBOUND",
    );
    assert.equal(inbound.customerPhoneRaw, "0441111111");
    assert.equal(inbound.managerPhoneRaw, "+380672222222");
  });

  it("buildRecordingProxyUrl returns web API path", () => {
    const url = service.buildRecordingProxyUrl("rec123");
    assert.match(url, /^\/api\/integrations\/kyivstar-fmc\/recordings\?record_id=/);
  });
});
