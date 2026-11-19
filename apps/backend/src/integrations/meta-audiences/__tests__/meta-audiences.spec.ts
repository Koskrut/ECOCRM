import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { UserRole } from "@prisma/client";
import { ROLES_KEY } from "../../../auth/roles.decorator";
import { MetaAudiencesController } from "../meta-audiences.controller";
import { applyMetaAudiencesPatch, parseStoredMetaAudiences, toPublicMetaAudiences } from "../meta-audience.config";
import { createMetaAudienceGraph } from "../meta-audience.graph";
import {
  normalizeAudienceEmail,
  normalizeAudienceName,
  normalizeAudiencePhone,
  sanitizeMetaError,
  sha256Hex,
} from "../meta-audience.normalize";
import { buildAudienceSegments, latestCompletionDate, type AudienceContactInput, type AudienceOrderInput, type AudienceSource } from "../meta-audience.segments";
import { MetaAudiencesService } from "../meta-audiences.service";
import { AUDIENCE_CATALOG, emptyStoredMetaAudiences } from "../meta-audience.types";
import type { PrismaService } from "../../../prisma/prisma.service";
import type { SettingsService } from "../../../settings/settings.service";

const NOW = new Date("2026-11-19T10:00:00.000Z");
const TOKEN = "EAASECRETTOKEN1234567890";

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function contact(partial: Partial<AudienceContactInput> & Pick<AudienceContactInput, "id">): AudienceContactInput {
  return {
    phone: null,
    phoneNormalized: null,
    email: null,
    firstName: "Іван",
    lastName: "Петренко",
    marketingCallOptOut: false,
    ...partial,
  };
}

function order(partial: Partial<AudienceOrderInput> & Pick<AudienceOrderInput, "id">): AudienceOrderInput {
  return {
    clientId: null,
    contactId: null,
    orderStage: "COMPLETED",
    totalAmount: 100,
    currency: "UAH",
    debtAmount: 0,
    updatedAt: daysAgo(10),
    completedHistory: [daysAgo(10)],
    ...partial,
  };
}

function source(partial: Partial<AudienceSource>): AudienceSource {
  return {
    orders: [],
    contacts: [],
    leads: [],
    now: NOW,
    lapsedDays: 120,
    seedWindowDays: 365,
    rates: { UAH_TO_USD: 0.025, EUR_TO_USD: 1.1, baseCurrency: "USD" },
    ...partial,
  };
}

function phones(segment: { people: { phone: string | null }[] }): Array<string | null> {
  return segment.people.map((person) => person.phone);
}

test("meta customer list normalization hashes digits, not the plus form", () => {
  assert.equal(normalizeAudiencePhone("050 123 45 67"), "380501234567");
  assert.equal(normalizeAudiencePhone(null, "380501234567"), "380501234567");
  const phone = "380501234567";
  assert.equal(sha256Hex(phone), createHash("sha256").update(phone).digest("hex"));
  assert.notEqual(sha256Hex(phone), sha256Hex(`+${phone}`));
  assert.equal(normalizeAudienceEmail("  A@B.C "), "a@b.c");
  assert.equal(normalizeAudienceName("Марія-Анна"), "маріяанна");
  assert.equal(sha256Hex("ua"), createHash("sha256").update("ua").digest("hex"));
});

test("purchase date is the latest move to COMPLETED, otherwise updatedAt", () => {
  const updated = daysAgo(1);
  assert.equal(latestCompletionDate([daysAgo(40), daysAgo(12)], updated).getTime(), daysAgo(12).getTime());
  assert.equal(latestCompletionDate([], updated).getTime(), updated.getTime());
});

test("buyer segments follow completion, debt, window and opt-out", () => {
  const recent = contact({
    id: "c-new",
    phone: "0501112233",
    phoneNormalized: "380501112233",
    email: "new@example.com",
    firstName: "Олена",
    lastName: "Нова",
  });
  const lapsed = contact({
    id: "c-old",
    phone: "0502223344",
    phoneNormalized: "380502223344",
    email: "old@example.com",
  });
  const opted = contact({
    id: "c-out",
    phone: "0503334455",
    phoneNormalized: "380503334455",
    email: "out@example.com",
    marketingCallOptOut: true,
  });
  const noReach = contact({ id: "c-empty", phone: "", email: "  " });
  const leadOnly = contact({ id: "c-lead", phone: "0505556677", phoneNormalized: "380505556677" });

  const built = buildAudienceSegments(
    source({
      contacts: [recent, lapsed, opted, noReach, leadOnly],
      orders: [
        order({ id: "o-new", clientId: "c-new", totalAmount: 150, completedHistory: [daysAgo(10)], currency: "UAH" }),
        order({ id: "o-new-old", clientId: "c-new", totalAmount: 999, completedHistory: [daysAgo(200)], currency: "UAH" }),
        order({ id: "o-new-ancient", clientId: "c-new", totalAmount: 50, completedHistory: [daysAgo(400)], currency: "UAH" }),
        order({ id: "o-old", contactId: "c-old", completedHistory: [daysAgo(400)], updatedAt: daysAgo(1) }),
        order({ id: "o-out", clientId: "c-out", completedHistory: [daysAgo(5)] }),
        order({ id: "o-empty", clientId: "c-empty", completedHistory: [daysAgo(5)] }),
        order({ id: "o-debt", clientId: "c-lead", debtAmount: 20, completedHistory: [daysAgo(3)] }),
        order({ id: "o-received", clientId: "c-lead", orderStage: "RECEIVED", debtAmount: 0, completedHistory: [] }),
        order({ id: "o-cancel", clientId: "c-lead", orderStage: "CANCELED", debtAmount: 0 }),
        order({ id: "o-refused", clientId: "c-lead", orderStage: "REFUSED", debtAmount: 0 }),
        order({ id: "o-return", clientId: "c-lead", orderStage: "FULLY_RETURNED", debtAmount: 0 }),
      ],
      leads: [
        {
          id: "l-open",
          contactId: "c-lead",
          status: "IN_PROGRESS",
          phone: "0505556677",
          phoneNormalized: "380505556677",
          email: "lead@example.com",
          firstName: "Лід",
          lastName: "Без",
          name: null,
          fullName: null,
          updatedAt: daysAgo(2),
        },
        {
          id: "l-buyer",
          contactId: "c-new",
          status: "WON",
          phone: "0501112233",
          phoneNormalized: "380501112233",
          email: "new@example.com",
          firstName: "Олена",
          lastName: "Нова",
          name: null,
          fullName: null,
          updatedAt: daysAgo(1),
        },
        {
          id: "l-spam",
          contactId: null,
          status: "SPAM",
          phone: "0506667788",
          phoneNormalized: "380506667788",
          email: "spam@example.com",
          firstName: null,
          lastName: null,
          name: null,
          fullName: null,
          updatedAt: daysAgo(1),
        },
        {
          id: "l-skip",
          contactId: null,
          status: "NOT_TARGET",
          phone: "0507778899",
          phoneNormalized: "380507778899",
          email: null,
          firstName: null,
          lastName: null,
          name: null,
          fullName: null,
          updatedAt: daysAgo(1),
        },
        {
          id: "l-out",
          contactId: "c-out",
          status: "NEW",
          phone: "0503334455",
          phoneNormalized: "380503334455",
          email: "out@example.com",
          firstName: null,
          lastName: null,
          name: null,
          fullName: null,
          updatedAt: daysAgo(1),
        },
        {
          id: "l-mail-only",
          contactId: null,
          status: "NEW",
          phone: null,
          phoneNormalized: null,
          email: "only@example.com",
          firstName: null,
          lastName: null,
          name: null,
          fullName: null,
          updatedAt: daysAgo(1),
        },
      ],
    }),
  );

  assert.deepEqual(phones(built.buyers_12m), ["380501112233"]);
  assert.equal(built.buyers_12m.people[0].value, 1149);
  assert.deepEqual(phones(built.buyers_all).sort(), ["380501112233", "380502223344"]);
  assert.deepEqual(phones(built.buyers_lapsed), ["380502223344"]);
  assert.equal(built.buyers_lapsed.people[0].value, null);
  assert.deepEqual(phones(built.leads_no_order), ["380505556677"]);
  assert.ok(!phones(built.buyers_all).includes("380503334455"));
  assert.ok(!phones(built.leads_no_order).includes("380503334455"));
  assert.ok(!phones(built.leads_no_order).includes("380501112233"));
});

test("mixed currencies omit lookalike value and a single foreign currency converts to UAH", () => {
  const mixed = buildAudienceSegments(
    source({
      contacts: [contact({ id: "c1", phoneNormalized: "380501111111", phone: "0501111111", email: "a@a.a" })],
      orders: [
        order({ id: "a", clientId: "c1", currency: "UAH", totalAmount: 10, completedHistory: [daysAgo(2)] }),
        order({ id: "b", clientId: "c1", currency: "USD", totalAmount: 10, completedHistory: [daysAgo(1)] }),
      ],
    }),
  );
  assert.equal(mixed.buyers_12m.people[0].value, null);

  const usd = buildAudienceSegments(
    source({
      contacts: [contact({ id: "c1", phoneNormalized: "380501111111", phone: "0501111111" })],
      orders: [order({ id: "a", clientId: "c1", currency: "USD", totalAmount: 10, completedHistory: [daysAgo(2)] })],
    }),
  );
  assert.equal(usd.buyers_12m.people[0].value, 400);
});

test("a buyer inside 365 days but past the lapse threshold is not in the seed", () => {
  const built = buildAudienceSegments(
    source({
      contacts: [contact({ id: "c1", phoneNormalized: "380501010101", phone: "0501010101", email: "b@b.b" })],
      orders: [order({ id: "a", clientId: "c1", completedHistory: [daysAgo(200)] })],
    }),
  );
  assert.equal(built.buyers_12m.people.length, 0);
  assert.equal(built.buyers_lapsed.people.length, 1);
  assert.equal(built.buyers_all.people.length, 1);
});

test("saved settings hide the token and keep the same audience ids", () => {
  const stored = applyMetaAudiencesPatch(emptyStoredMetaAudiences(), {
    adAccountId: "act_1234567890",
    accessToken: TOKEN,
    enabled: true,
    lapsedDays: 120,
    seedWindowDays: 365,
  });
  stored.audiences.buyers_12m.audienceId = "aud-1";
  const pub = toPublicMetaAudiences(stored);
  const json = JSON.stringify(pub);
  assert.equal(json.includes(TOKEN), false);
  assert.equal("accessToken" in pub, false);
  assert.equal(pub.accessTokenMasked.endsWith("7890"), true);
  assert.equal(pub.adAccountId, "1234567890");
  const again = applyMetaAudiencesPatch(parseStoredMetaAudiences(stored), { enabled: true });
  assert.equal(again.adAccountId, "1234567890");
  assert.equal(again.accessToken, TOKEN);
  assert.equal(again.audiences.buyers_12m.audienceId, "aud-1");
});

test("meta error text drops the token, phones and hashes", () => {
  const hash = sha256Hex("380501112233");
  const text = sanitizeMetaError(`Meta 190: bad ${TOKEN} 380501112233 ${hash} user@example.com`, TOKEN);
  assert.equal(text.includes(TOKEN), false);
  assert.equal(text.includes("380501112233"), false);
  assert.equal(text.includes(hash), false);
  assert.equal(text.includes("user@example.com"), false);
});

test("graph replace sends hashes only and does not put the token in the url", async () => {
  const calls: Array<{ url: string; method: string; body: string; authorization: string | null }> = [];
  const graph = createMetaAudienceGraph(async (url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      method: String(init?.method ?? "GET"),
      body: String(init?.body ?? ""),
      authorization: headers.get("authorization"),
    });
    if (String(url).includes("usersreplace")) {
      return new Response(
        JSON.stringify({
          num_received: 1,
          invalid_entry_samples: { "380501112233": "nope" },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ id: "555" }), { status: 200 });
  });
  const id = await graph.createAudience({
    adAccountId: "1234567890",
    accessToken: TOKEN,
    version: "v21.0",
    name: "CRM buyers 12m",
    description: "seed",
    valueBased: true,
  });
  assert.equal(id, "555");
  const received = await graph.replaceUsers({
    audienceId: id,
    accessToken: TOKEN,
    version: "v21.0",
    valueBased: true,
    people: [
      {
        phone: "380501112233",
        email: "a@b.c",
        firstName: "олена",
        lastName: "нова",
        value: 150,
      },
    ],
  });
  assert.equal(received, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://graph.facebook.com/v21.0/act_1234567890/customaudiences");
  assert.equal(calls[1].url, "https://graph.facebook.com/v21.0/555/usersreplace");
  assert.equal(new URLSearchParams(calls[0].body).get("name"), "CRM buyers 12m");
  for (const call of calls) {
    assert.equal(call.method, "POST");
    assert.equal(call.url.includes("access_token"), false);
    assert.equal(call.url.includes(TOKEN), false);
    assert.equal(call.authorization, `Bearer ${TOKEN}`);
    assert.equal(call.body.includes("380501112233"), false);
    assert.equal(call.body.includes("a@b.c"), false);
  }
  const payload = JSON.parse(new URLSearchParams(calls[1].body).get("payload") || "{}") as {
    schema: string[];
    data: Array<Array<string | number>>;
  };
  assert.deepEqual(payload.schema, ["PHONE", "EMAIL", "FN", "LN", "COUNTRY", "LOOKALIKE_VALUE"]);
  assert.equal(payload.data[0][0], sha256Hex("380501112233"));
  assert.equal(payload.data[0][1], sha256Hex("a@b.c"));
  assert.equal(payload.data[0][4], sha256Hex("ua"));
  assert.equal(payload.data[0][5], 150);
  const session = JSON.parse(new URLSearchParams(calls[1].body).get("session") || "{}") as {
    last_batch_flag: boolean;
    batch_seq: number;
  };
  assert.equal(session.batch_seq, 1);
  assert.equal(session.last_batch_flag, true);
});

test("graph errors do not echo samples, tokens or phones", async () => {
  const hash = sha256Hex("380501112233");
  const graph = createMetaAudienceGraph(async () => {
    return new Response(
      JSON.stringify({
        error: { message: `bad ${TOKEN} 380509998877 ${hash}`, code: 190 },
        invalid_entry_samples: { "380501112233": "x" },
      }),
      { status: 400 },
    );
  });
  await assert.rejects(
    () =>
      graph.createAudience({
        adAccountId: "1234567890",
        accessToken: TOKEN,
        version: "v21.0",
        name: "CRM buyers all",
        description: "all",
        valueBased: false,
      }),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.equal(message.includes(TOKEN), false);
      assert.equal(message.includes("380509998877"), false);
      assert.equal(message.includes("380501112233"), false);
      assert.equal(message.includes(hash), false);
      assert.match(message, /Meta 190/);
      return true;
    },
  );
});

test("sync creates four audiences once, skips an empty replace, and keeps the token out of the response", async () => {
  let saved: unknown = null;
  const contacts = [
    contact({ id: "c-new", phone: "0501112233", phoneNormalized: "380501112233", email: "new@example.com" }),
    contact({ id: "c-old", phone: "0502223344", phoneNormalized: "380502223344", email: "old@example.com" }),
    contact({ id: "c-lead", phone: "0505556677", phoneNormalized: "380505556677" }),
  ];
  const orders = [
    {
      id: "o-new",
      clientId: "c-new",
      contactId: null,
      orderStage: "COMPLETED",
      totalAmount: 80,
      currency: "UAH",
      debtAmount: 0,
      updatedAt: daysAgo(1),
      statusHistory: [{ createdAt: daysAgo(4) }],
    },
    {
      id: "o-old",
      clientId: "c-old",
      contactId: null,
      orderStage: "COMPLETED",
      totalAmount: 50,
      currency: "UAH",
      debtAmount: 0,
      updatedAt: daysAgo(1),
      statusHistory: [{ createdAt: daysAgo(400) }],
    },
    {
      id: "o-debt",
      clientId: "c-lead",
      contactId: null,
      orderStage: "COMPLETED",
      totalAmount: 10,
      currency: "UAH",
      debtAmount: 10,
      updatedAt: daysAgo(1),
      statusHistory: [{ createdAt: daysAgo(2) }],
    },
  ];
  const leads = [
    {
      id: "l-open",
      contactId: "c-lead",
      status: "NEW",
      phone: "0505556677",
      phoneNormalized: "380505556677",
      email: "lead@example.com",
      firstName: "Лід",
      lastName: "Один",
      name: null,
      fullName: null,
      updatedAt: daysAgo(1),
    },
  ];
  const prisma = {
    systemSetting: {
      findUnique: async () => (saved == null ? null : { value: saved }),
      upsert: async (args: { create: { value: unknown }; update: { value: unknown } }) => {
        saved = args.update.value;
        return { value: saved };
      },
    },
    order: { findMany: async () => orders },
    lead: { findMany: async () => leads },
    contact: {
      findMany: async (args: { where?: { OR?: unknown; id?: { in?: string[] } } }) => {
        if (args.where?.id?.in) return contacts.filter((row) => args.where?.id?.in?.includes(row.id));
        return contacts.filter((row) => row.marketingCallOptOut);
      },
    },
  };
  const settings = { getExchangeRates: async () => ({ UAH_TO_USD: 0.025, EUR_TO_USD: 1.1, baseCurrency: "USD" }) };
  const service = new MetaAudiencesService(prisma as unknown as PrismaService, settings as unknown as SettingsService);
  const created: string[] = [];
  const names: string[] = [];
  const accounts: string[] = [];
  const replaced: string[] = [];
  let nextId = 700;
  service.graph = {
    createAudience: async (input) => {
      nextId += 1;
      const id = String(nextId);
      created.push(id);
      names.push(input.name);
      accounts.push(input.adAccountId);
      return id;
    },
    replaceUsers: async (input) => {
      replaced.push(input.audienceId);
      return input.people.length;
    },
  };

  const savedConfig = await service.update({
    adAccountId: "1234567890",
    accessToken: TOKEN,
    enabled: true,
    lapsedDays: 120,
    seedWindowDays: 365,
  });
  assert.equal(JSON.stringify(savedConfig).includes(TOKEN), false);
  assert.equal(savedConfig.accessTokenMasked.endsWith("7890"), true);

  const first = await service.sync(true);
  assert.equal(created.length, 4);
  assert.deepEqual(
    [
      AUDIENCE_CATALOG.buyers_12m.name,
      AUDIENCE_CATALOG.buyers_all.name,
      AUDIENCE_CATALOG.buyers_lapsed.name,
      AUDIENCE_CATALOG.leads_no_order.name,
    ],
    ["CRM buyers 12m", "CRM buyers all", "CRM buyers lapsed", "CRM leads no order"],
  );
  assert.deepEqual(names, [
    AUDIENCE_CATALOG.buyers_12m.name,
    AUDIENCE_CATALOG.buyers_all.name,
    AUDIENCE_CATALOG.buyers_lapsed.name,
    AUDIENCE_CATALOG.leads_no_order.name,
  ]);
  assert.deepEqual(accounts, ["1234567890", "1234567890", "1234567890", "1234567890"]);
  assert.deepEqual(
    first.audiences.map((row) => row.key),
    ["buyers_12m", "buyers_all", "buyers_lapsed", "leads_no_order"],
  );
  const byKey = Object.fromEntries(first.audiences.map((row) => [row.key, row]));
  assert.equal(byKey.buyers_12m.status, "ok");
  assert.equal(byKey.buyers_12m.crmCount, 1);
  assert.equal(byKey.buyers_12m.metaReceived, 1);
  assert.equal(byKey.buyers_12m.warning, "small");
  assert.equal(byKey.buyers_all.crmCount, 2);
  assert.equal(byKey.buyers_lapsed.crmCount, 1);
  assert.equal(byKey.leads_no_order.crmCount, 1);
  assert.equal(JSON.stringify(first).includes(TOKEN), false);
  const ids = first.audiences.map((row) => row.audienceId);
  assert.equal(new Set(ids).size, 4);

  const second = await service.sync(true);
  assert.equal(created.length, 4);
  assert.deepEqual(
    second.audiences.map((row) => row.audienceId),
    ids,
  );
  assert.deepEqual(replaced.slice(4), ids);

  const stored = parseStoredMetaAudiences(saved);
  assert.equal(stored.accessToken, TOKEN);
});

test("an empty segment does not replace the cabinet list", async () => {
  let saved: unknown = null;
  const prisma = {
    systemSetting: {
      findUnique: async () => (saved == null ? null : { value: saved }),
      upsert: async (args: { update: { value: unknown } }) => {
        saved = args.update.value;
        return { value: saved };
      },
    },
    order: { findMany: async () => [] },
    lead: { findMany: async () => [] },
    contact: { findMany: async () => [] },
  };
  const service = new MetaAudiencesService(
    prisma as unknown as PrismaService,
    { getExchangeRates: async () => ({ UAH_TO_USD: 0.025, EUR_TO_USD: 1, baseCurrency: "USD" }) } as unknown as SettingsService,
  );
  let replaced = 0;
  service.graph = {
    createAudience: async () => "1",
    replaceUsers: async () => {
      replaced += 1;
      return 0;
    },
  };
  await service.update({ adAccountId: "act_1234567890", accessToken: TOKEN, enabled: true });
  const result = await service.sync(true);
  assert.equal(replaced, 0);
  assert.ok(result.audiences.every((row) => row.status === "empty"));
  assert.ok(result.audiences.every((row) => row.audienceId === "1"));
});

test("a meta failure is stored without the token and a second run reuses the audience", async () => {
  let saved: unknown = null;
  const prisma = {
    systemSetting: {
      findUnique: async () => (saved == null ? null : { value: saved }),
      upsert: async (args: { update: { value: unknown } }) => {
        saved = args.update.value;
        return { value: saved };
      },
    },
    order: { findMany: async () => [] },
    lead: {
      findMany: async () => [
        {
          id: "l1",
          contactId: null,
          status: "NEW",
          phone: "0505556677",
          phoneNormalized: "380505556677",
          email: "lead@example.com",
          firstName: "A",
          lastName: "B",
          name: null,
          fullName: null,
          updatedAt: daysAgo(1),
        },
      ],
    },
    contact: { findMany: async () => [] },
  };
  const service = new MetaAudiencesService(
    prisma as unknown as PrismaService,
    { getExchangeRates: async () => ({ UAH_TO_USD: 0.025, EUR_TO_USD: 1, baseCurrency: "USD" }) } as unknown as SettingsService,
  );
  let creates = 0;
  service.graph = {
    createAudience: async () => {
      creates += 1;
      return `id-${creates}`;
    },
    replaceUsers: async () => {
      throw new Error(`cabinet failed ${TOKEN} 380505556677`);
    },
  };
  await service.update({ adAccountId: "act_1234567890", accessToken: TOKEN, enabled: true });
  const failed = await service.sync(true);
  const leadRow = failed.audiences.find((row) => row.key === "leads_no_order");
  assert.equal(leadRow?.status, "error");
  assert.equal(JSON.stringify(failed).includes(TOKEN), false);
  assert.equal(leadRow?.error?.includes("380505556677"), false);
  assert.match(leadRow?.error || "", /cabinet failed/);
  const createsAfterFirst = creates;
  await service.sync(true);
  assert.equal(creates, createsAfterFirst);
});

test("audience settings are admin only", () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, MetaAudiencesController), [UserRole.ADMIN]);
});
