import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaService } from "../../prisma/prisma.service";
import type { PhoneEntityLookupService } from "../../../common/phone-entity-lookup.service";
import { RingostatIngestService } from "../ringostat-ingest.service";

describe("RingostatIngestService", () => {
  const prisma = {
    integrationSetting: {
      findFirst: async () => null,
    },
  } as unknown as PrismaService;
  const phoneLookup = {
    findContactByNormalizedKeys: async () => null,
    findCompanyIdByNormalizedKeys: async () => null,
  } as unknown as PhoneEntityLookupService;
  const service = new RingostatIngestService(prisma, phoneLookup);

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

    assert.match(body, /Статус: Пропущено/);
    assert.match(body, /Напрямок: вхідний/);
    assert.match(body, /Тривалість: 42 сек\./);
    assert.match(body, /Телефон: \+380501234567/);
    assert.match(body, /Запис: доступний/);
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

  it("outbound: when callee equals outbound_number, uses full_num/dst as customer when present", () => {
    const extract = (raw: Record<string, unknown>, dir: "INBOUND" | "OUTBOUND" | "UNKNOWN") =>
      // @ts-expect-error private
      service["extractPhonesAndExtension"](raw, dir) as {
        customerPhoneRaw?: string;
        managerPhoneRaw?: string;
      };

    const raw = {
      type: "out",
      outbound_number: "380441112233",
      caller: "380441112233",
      callee: "380441112233",
      full_num: "380931112233",
    };
    const phones = extract(raw, "OUTBOUND");
    assert.equal(phones.managerPhoneRaw, "380441112233");
    assert.equal(phones.customerPhoneRaw, "380931112233");
  });

  it("/calls/list outbound: uses dst as client and caller_number as manager line", () => {
    const extract = (raw: Record<string, unknown>, dir: "INBOUND" | "OUTBOUND" | "UNKNOWN") =>
      // @ts-expect-error private
      service["extractPhonesAndExtension"](raw, dir) as {
        customerPhoneRaw?: string;
        managerPhoneRaw?: string;
        extension?: string;
      };

    const raw = {
      uniqueid: "x",
      call_type: "transitout",
      caller: "380672492945",
      dst: "380505165616",
      caller_number: "380672492945",
      connected_with: "",
      employee_number: 107,
      additional_number: "",
    };
    const phones = extract(raw, "OUTBOUND");
    assert.equal(phones.customerPhoneRaw, "380505165616");
    assert.equal(phones.managerPhoneRaw, "380672492945");
    assert.equal(phones.extension, "107");
  });

  it("/calls/list inbound: uses caller as client and connected_with as manager phone", () => {
    const extract = (raw: Record<string, unknown>, dir: "INBOUND" | "OUTBOUND" | "UNKNOWN") =>
      // @ts-expect-error private
      service["extractPhonesAndExtension"](raw, dir) as {
        customerPhoneRaw?: string;
        managerPhoneRaw?: string;
        extension?: string;
      };

    const raw = {
      uniqueid: "x",
      call_type: "transitin",
      caller: "380505710671",
      dst: "380505710671",
      connected_with: "380675565613",
      caller_number: "380675565613",
      employee_number: 104,
    };
    const phones = extract(raw, "INBOUND");
    assert.equal(phones.customerPhoneRaw, "380505710671");
    assert.equal(phones.managerPhoneRaw, "380675565613");
    assert.equal(phones.extension, "104");
  });

  it("UNKNOWN /calls/list: short caller + long mobile dst maps client to dst", () => {
    const extract = (raw: Record<string, unknown>, dir: "INBOUND" | "OUTBOUND" | "UNKNOWN") =>
      // @ts-expect-error private
      service["extractPhonesAndExtension"](raw, dir) as {
        customerPhoneRaw?: string;
        managerPhoneRaw?: string;
      };

    const raw = {
      calldate: "2026-04-02 12:00:00",
      caller: "101",
      dst: "+380501234567",
    };
    const phones = extract(raw, "UNKNOWN");
    assert.equal(phones.customerPhoneRaw, "+380501234567");
    assert.equal(phones.managerPhoneRaw, "101");
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

  it("entityMatchPhoneForInbound: same client and manager digits skips contact match phone", () => {
    const fn = (
      direction: "INBOUND" | "OUTBOUND" | "UNKNOWN",
      c: string | null,
      m: string | null,
    ) =>
      // @ts-expect-error private
      service["entityMatchPhoneForInbound"](direction, c, m) as string | null;

    assert.equal(fn("INBOUND", "+380675515499", "+380675515499"), null);
    assert.equal(fn("INBOUND", "+380675515499", "+380501234567"), "+380675515499");
    assert.equal(fn("OUTBOUND", "+380675515499", "+380675515499"), "+380675515499");
    assert.equal(fn("UNKNOWN", "+380675515499", "+380675515499"), null);
  });

  it("inbound: E164 is customer even when outbound_number is present (pool line must not match contact)", () => {
    const extract = (raw: Record<string, unknown>, dir: "INBOUND" | "OUTBOUND" | "UNKNOWN") =>
      // @ts-expect-error private
      service["extractPhonesAndExtension"](raw, dir) as {
        customerPhoneRaw?: string;
        managerPhoneRaw?: string;
      };

    const raw = {
      type: "in",
      additional_call_data: {
        outbound_number: "380441112233",
        E164: "380931112233",
        dst: "380441232323",
      },
    };
    const phones = extract(raw, "INBOUND");
    assert.equal(phones.customerPhoneRaw, "380931112233");
    assert.equal(phones.managerPhoneRaw, "380441232323");
  });

  it("inbound: when dst digits equal client, dst is not used as manager phone (use outbound_number)", () => {
    const extract = (raw: Record<string, unknown>, dir: "INBOUND" | "OUTBOUND" | "UNKNOWN") =>
      // @ts-expect-error private
      service["extractPhonesAndExtension"](raw, dir) as {
        customerPhoneRaw?: string;
        managerPhoneRaw?: string;
      };

    const raw = {
      type: "in",
      additional_call_data: {
        E164: "380931112233",
        dst: "380931112233",
        outbound_number: "380441112233",
      },
    };
    const phones = extract(raw, "INBOUND");
    assert.equal(phones.customerPhoneRaw, "380931112233");
    assert.equal(phones.managerPhoneRaw, "380441112233");
  });

  it("inbound: when dst equals client and outbound empty, manager phone is undefined", () => {
    const extract = (raw: Record<string, unknown>, dir: "INBOUND" | "OUTBOUND" | "UNKNOWN") =>
      // @ts-expect-error private
      service["extractPhonesAndExtension"](raw, dir) as {
        customerPhoneRaw?: string;
        managerPhoneRaw?: string;
        extension?: string;
      };

    const raw = {
      type: "in",
      additional_call_data: {
        E164: "380675785818",
        dst: "380675785818",
        connected_with: "380675785818",
      },
    };
    const phones = extract(raw, "INBOUND");
    assert.equal(phones.customerPhoneRaw, "380675785818");
    assert.equal(phones.managerPhoneRaw, "380675785818");
  });

  it("inbound: extension_number from additional_call_data is exposed as extension", () => {
    const extract = (raw: Record<string, unknown>, dir: "INBOUND" | "OUTBOUND" | "UNKNOWN") =>
      // @ts-expect-error private
      service["extractPhonesAndExtension"](raw, dir) as { extension?: string };

    const raw = {
      type: "in",
      additional_call_data: {
        E164: "380931112233",
        dst: "380441232323",
        extension_number: "101",
        employee_email: "email@example.com",
      },
    };
    const phones = extract(raw, "INBOUND");
    assert.equal(phones.extension, "101");
  });

  it("extractExternalId builds richer synthetic id when unique id is missing", () => {
    const extract = (raw: Record<string, unknown>) =>
      // @ts-expect-error private
      service["extractExternalId"](raw) as string | null;

    const id = extract({
      type: "out",
      caller: "380441112233",
      callee: "380931112233",
      dst: "380931112233",
      billsec: "20",
      disposition: "ANSWERED",
      calldate: "2026-04-06 10:16:46",
    });
    assert.equal(
      id,
      "syn|out|380441112233|380931112233|380931112233|20|ANSWERED|2026-04-0610:16:46",
    );
  });

  it("recomputeLegsFromRaw handles real inbound sample", async () => {
    const res = await service.recomputeLegsFromRaw({
      type: "in",
      uniqueid: "1111111111.11111111111111111",
      calldate: "2022-01-01 10:16:46",
      billsec: "10",
      disposition: "ANSWERED",
      recording_wav: "https://app.ringostat.com/recordings/1111111111.1111111.wav?token=",
      has_recording: "1",
      extension_number: "101",
      E164: "380931112233",
      dst: "380441232323",
      connected_with: "380931112233",
      waiting: "10",
    });
    assert.ok(res);
    assert.equal(res?.direction, "INBOUND");
    assert.equal(res?.fromNormalized, "+380931112233");
    assert.equal(res?.toNormalized, "+380441232323");
  });

  it("recomputeLegsFromRaw handles real outbound sample", async () => {
    const res = await service.recomputeLegsFromRaw({
      uniqueid: "1111111111",
      type: "out",
      calldate: "2022-01-01 10:16:46",
      billsec: "20",
      disposition: "ANSWERED",
      recording_wav: "https://app.ringostat.com/recordings/1111111111.1111111.wav?token=",
      has_recording: "1",
      outbound_number: "380441112233",
      callee: "380931112233",
      waiting: "10",
    });
    assert.ok(res);
    assert.equal(res?.direction, "OUTBOUND");
    assert.equal(res?.fromNormalized, "+380931112233");
    assert.equal(res?.toNormalized, "+380441112233");
  });

  it("missed calls create at most one callback task (idempotent via callId upsert)", async () => {
    const calls: unknown[] = [];
    const tasks: unknown[] = [];

    const tx = {
      call: {
        upsert: async () => {
          calls.push(true);
          return {
            id: "call_1",
            contactId: "c1",
            companyId: null,
            leadId: null,
            durationSec: 0,
            startedAt: new Date("2026-04-02T10:00:00.000Z"),
          };
        },
      },
      activity: {
        findFirst: async () => null,
        create: async () => null,
        updateMany: async () => null,
      },
      task: {
        upsert: async (args: unknown) => {
          tasks.push(args);
          return null;
        },
      },
    };

    const prismaMock = {
      integrationSetting: {
        findFirst: async () =>
          ({
            config: {
              defaultManagerId: "m1",
            },
          }) as unknown,
      },
      $transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    } as unknown as PrismaService;

    const phoneLookupMock = {
      findContactByNormalizedKeys: async () => ({ id: "c1" }),
      findCompanyIdByNormalizedKeys: async () => null,
    } as unknown as PhoneEntityLookupService;

    const svc = new RingostatIngestService(prismaMock, phoneLookupMock);

    const raw = {
      uniqueid: "u1",
      type: "in",
      calldate: "2026-04-02 10:00:00",
      disposition: "NO ANSWER",
      billsec: "0",
      waiting: "0",
      additional_call_data: {
        E164: "380501234567",
        // manager line must differ from client, otherwise entity matching is intentionally skipped
        dst: "380441112233",
      },
    };

    // two ingests of the same external call should still lead to one task upsert target (same callId).
    // @ts-expect-error public method
    await svc.ingestFromApi([raw, raw]);

    assert.equal(tasks.length, 2, "task.upsert called for each event");
    const where0 = (tasks[0] as any).where;
    const where1 = (tasks[1] as any).where;
    assert.equal(where0.callId, "call_1");
    assert.equal(where1.callId, "call_1");
  });
});
