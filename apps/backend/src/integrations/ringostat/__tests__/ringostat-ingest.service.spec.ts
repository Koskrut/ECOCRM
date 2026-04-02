import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaService } from "../../prisma/prisma.service";
import { RingostatIngestService } from "../ringostat-ingest.service";

describe("RingostatIngestService", () => {
  const prisma = {} as unknown as PrismaService;
  const service = new RingostatIngestService(prisma);

  it("normalizes UA phone numbers to E.164-like format", () => {
    const normalize = (s: string | undefined) =>
      // @ts-expect-error private
      service["normalizePhone"](s) as string | null;

    assert.equal(normalize("+380501234567"), "+380501234567");
    assert.equal(normalize("050 123 45 67"), "+380501234567");
    assert.equal(normalize("380501234567"), "+380501234567");
    assert.equal(normalize("501234567"), "+380501234567");
  });

  it("builds activity body with status, direction, duration and phone", () => {
    const build = (args: Parameters<typeof service["buildActivityBody"]>[0]) =>
      // @ts-expect-error private
      service["buildActivityBody"](args);

    const body = build({
      direction: "INBOUND",
      status: "MISSED",
      durationSec: 42,
      customerPhoneNormalized: "+380501234567",
      hasRecording: true,
    });

    assert.match(body, /Статус: MISSED/);
    assert.match(body, /Направление: входящий/);
    assert.match(body, /Длительность: 42 сек\./);
    assert.match(body, /Телефон: \+380501234567/);
    assert.match(body, /Запись: доступна/);
  });

  it("resolveDirection: Ringostat KB type in/out; empty direction must not hide type", () => {
    const resolve = (raw: Record<string, unknown>) =>
      // @ts-expect-error private
      service["resolveDirection"](raw) as string;

    // https://help.ringostat.com/en/articles/6583751-webhooks-outbound-call-event — "type":"out"
    assert.equal(resolve({ type: "out", direction: "", caller: "x" }), "OUTBOUND");
    // https://help.ringostat.com/en/articles/6559993-webhooks-incoming-call-event — "type":"in"
    assert.equal(resolve({ type: "in", direction: "" }), "INBOUND");
    assert.equal(resolve({ type: "OUT", callee: "380" }), "OUTBOUND");
  });

  it("outbound webhook: type=out with caller+callee maps to OUTBOUND and uses callee as customer", () => {
    const resolve = (raw: Record<string, unknown>) =>
      // @ts-expect-error private
      service["resolveDirection"](raw) as string;
    const extract = (raw: Record<string, unknown>, dir: "INBOUND" | "OUTBOUND" | "UNKNOWN") =>
      // @ts-expect-error private
      service["extractPhonesAndExtension"](raw, dir) as {
        customerPhoneRaw?: string;
        managerPhoneRaw?: string;
        extension?: string;
      };

    const raw = {
      type: "out",
      caller: "+380441112233",
      callee: "+380501234567",
      direction: "",
    };
    assert.equal(resolve(raw), "OUTBOUND");
    const phones = extract(raw, "OUTBOUND");
    assert.equal(phones.customerPhoneRaw, "+380501234567");
    assert.equal(phones.managerPhoneRaw, "+380441112233");
  });

  it("polling payload: direction=out without type must return OUTBOUND", () => {
    const resolve = (raw: Record<string, unknown>) =>
      // @ts-expect-error private
      service["resolveDirection"](raw) as string;

    const raw = {
      calldate: "2026-04-02 12:00:00",
      direction: "out",
      caller: "101",
      dst: "+380501234567",
    };
    assert.equal(resolve(raw), "OUTBOUND");
  });
});
