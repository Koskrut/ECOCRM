import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolveMarketingAttribution } from "../marketing-attribution";
import { classifyLeadPayment } from "../marketing-metrics";
import { decideNewLead, decidePurchase, decideQualitySignal } from "../marketing-signals";
import { businessMinutesBetween, dayMatured, leadMatured } from "../marketing-time";
import { dedupeAudience, shouldHaltShrink } from "../marketing-audience.rules";
import { parseSpendCsv } from "../marketing-csv";
import { hashPhoneForAds } from "../marketing-hash";
import { canConvertCurrency } from "../marketing-money";

test("meta form is Meta even when the lead source is the site", () => {
  const decision = resolveMarketingAttribution({
    channel: "FB_LEAD_ADS",
    metaForm: { campaignId: "c1", adsetId: "s1", adId: "a1", campaignName: "Весна" },
  });
  assert.equal(decision.platform, "META");
  assert.equal(decision.countsTowardAds, true);
  assert.equal(decision.resolvedFrom, "meta_form");
  assert.equal(decision.displayName, "Весна");
});

test("facebook source alone is not an ad", () => {
  const decision = resolveMarketingAttribution({ channel: "FB_DM" });
  assert.equal(decision.countsTowardAds, false);
  assert.equal(decision.platform, null);
  assert.equal(decision.resolvedFrom, "site");
});

test("gclid is Google and organic google is still the site", () => {
  const paid = resolveMarketingAttribution({ click: { gclid: "abc", utmSource: "google", utmMedium: "organic" } });
  assert.equal(paid.platform, "GOOGLE");
  assert.equal(paid.countsTowardAds, true);

  const organic = resolveMarketingAttribution({
    click: { utmSource: "google", utmMedium: "organic", referrer: "https://www.google.com/" },
  });
  assert.equal(organic.countsTowardAds, false);
  assert.equal(organic.platform, null);
});

test("fbclid and ttclid pick their platforms", () => {
  assert.equal(resolveMarketingAttribution({ click: { fbclid: "fb" } }).platform, "META");
  assert.equal(resolveMarketingAttribution({ click: { ttclid: "tt" } }).platform, "TIKTOK");
});

test("a link with a campaign counts as ads; a link without one only counts leads", () => {
  const withCampaign = resolveMarketingAttribution({
    link: {
      id: "lnk",
      channel: "GOOGLE",
      campaignExternalId: "g-1",
      utmSource: "google",
      utmCampaign: "spring",
      utmContent: "lnk",
    },
  });
  assert.equal(withCampaign.countsTowardAds, true);
  assert.equal(withCampaign.campaignExternalId, "g-1");

  const plain = resolveMarketingAttribution({
    link: {
      id: "lnk",
      channel: "GOOGLE",
      campaignExternalId: null,
      utmSource: "google",
      utmCampaign: "spring",
      utmContent: "lnk",
    },
  });
  assert.equal(plain.countsTowardAds, false);
  assert.equal(plain.linkId, "lnk");
  assert.equal(plain.resolvedFrom, "link_only");
});

test("direct from an ad is remembered before the name exists", () => {
  const decision = resolveMarketingAttribution({ direct: { adId: "ad-9" } });
  assert.equal(decision.platform, "META");
  assert.equal(decision.displayName, "Реклама Meta");
  assert.equal(decision.adExternalId, "ad-9");
});

test("quality is one signal; lost is not junk unless asked; an unsent return to work sends nothing", () => {
  assert.deepEqual(
    decideQualitySignal({ countsTowardAds: true, status: "WON", lostAsJunk: false, existing: null }),
    { action: "enqueue", kind: "QUALITY", retract: false },
  );
  assert.deepEqual(
    decideQualitySignal({
      countsTowardAds: true,
      status: "WON",
      lostAsJunk: false,
      existing: { status: "SENT", kind: "QUALITY" },
    }),
    { action: "noop" },
  );
  assert.equal(
    decideQualitySignal({ countsTowardAds: true, status: "LOST", lostAsJunk: false, existing: null }).action,
    "skip",
  );
  assert.equal(
    decideQualitySignal({ countsTowardAds: true, status: "SPAM", lostAsJunk: false, existing: null }).action,
    "enqueue",
  );
  assert.deepEqual(
    decideQualitySignal({
      countsTowardAds: true,
      status: "IN_PROGRESS",
      lostAsJunk: false,
      existing: { status: "PENDING", kind: "QUALITY" },
    }),
    { action: "cancel", reason: "returned_to_work" },
  );
  assert.deepEqual(
    decideQualitySignal({
      countsTowardAds: true,
      status: "IN_PROGRESS",
      lostAsJunk: false,
      existing: { status: "SENT", kind: "QUALITY" },
    }),
    { action: "cancel", reason: "returned_to_work" },
  );
  assert.equal(
    decideNewLead({ countsTowardAds: true, resolvedFrom: "meta_form", hasClick: false, alreadyQueued: false }),
    "skip",
  );
  assert.equal(
    decideNewLead({ countsTowardAds: true, resolvedFrom: "google_click", hasClick: true, alreadyQueued: false }),
    "enqueue",
  );
});

test("payments inside the window count for leads; only matured ones count for ROI", () => {
  assert.deepEqual(classifyLeadPayment({ insideWindow: true, leadMatured: false }), {
    countInPaymentsFromLeads: true,
    countInRoi: false,
  });
  assert.deepEqual(classifyLeadPayment({ insideWindow: true, leadMatured: true }), {
    countInPaymentsFromLeads: true,
    countInRoi: true,
  });
});

test("a payment outside the window and a repeated payment are not sent", () => {
  const created = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(
    decidePurchase({
      sourceType: "BANK",
      status: "COMPLETED",
      paidAt: new Date("2026-01-10T00:00:00.000Z"),
      leadCreatedAt: created,
      windowDays: 30,
      alreadySent: false,
    }),
    "enqueue",
  );
  assert.equal(
    decidePurchase({
      sourceType: "BANK",
      status: "COMPLETED",
      paidAt: new Date("2026-03-01T00:00:00.000Z"),
      leadCreatedAt: created,
      windowDays: 30,
      alreadySent: false,
    }),
    "skip",
  );
  assert.equal(
    decidePurchase({
      sourceType: "CASH",
      status: "COMPLETED",
      paidAt: created,
      leadCreatedAt: created,
      windowDays: 30,
      alreadySent: true,
    }),
    "skip",
  );
  assert.equal(
    decidePurchase({
      sourceType: "CREDIT_TRANSFER",
      status: "COMPLETED",
      paidAt: created,
      leadCreatedAt: created,
      windowDays: 30,
      alreadySent: false,
    }),
    "skip",
  );
});

test("working hours skip nights and weekends", () => {
  const mondayNine = new Date("2026-10-19T06:00:00.000Z");
  const mondayEleven = new Date("2026-10-19T08:00:00.000Z");
  assert.equal(businessMinutesBetween(mondayNine, mondayEleven), 120);

  const fridayFive = new Date("2026-10-16T14:00:00.000Z");
  const mondayTen = new Date("2026-10-19T07:00:00.000Z");
  assert.equal(businessMinutesBetween(fridayFive, mondayTen), 120);
});

test("a fresh lead is not mature and an old day is", () => {
  const now = new Date("2026-10-21T12:00:00.000Z");
  assert.equal(leadMatured(now, 30, now), false);
  assert.equal(dayMatured("2026-09-01", 30, now), true);
});

test("audience shrink keeps the previous list unless forced", () => {
  assert.equal(shouldHaltShrink(100, 49, false), true);
  assert.equal(shouldHaltShrink(100, 50, false), false);
  assert.equal(shouldHaltShrink(100, 10, true), false);
  assert.equal(shouldHaltShrink(null, 1, false), false);
});

test("audience dedupe drops people without a phone or email", () => {
  const result = dedupeAudience([
    { phone: "380501112233", email: "a@b.c", firstName: "А", lastName: null, city: null },
    { phone: "380501112233", email: "other@b.c", firstName: "Б", lastName: null, city: null },
    { phone: null, email: null, firstName: "В", lastName: null, city: null },
  ]);
  assert.equal(result.people.length, 1);
  assert.equal(result.skippedNoContact, 1);
});

test("spend file rejects a campaign total and keeps ad rows", () => {
  const csv = [
    "date,campaign_id,adset_id,ad_id,spend,impressions,clicks,currency",
    "2026-10-01,c1,s1,,10,1,1,UAH",
    "2026-10-01,c1,s1,a1,4,10,2,UAH",
    "2026-10-01,c1,s1,a2,6,8,1,UAH",
  ].join("\n");
  const parsed = parseSpendCsv(csv);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.errors.length, 1);
  assert.equal(
    parsed.rows.reduce((sum, row) => sum + row.spend, 0),
    10,
  );
});

test("phone hash uses the +380 form", () => {
  const expected = createHash("sha256").update("+380501234567").digest("hex");
  assert.equal(hashPhoneForAds("380501234567"), expected);
});

test("unknown currency is not converted", () => {
  assert.equal(
    canConvertCurrency("XXX", { UAH_TO_USD: 0.024, EUR_TO_USD: 1.1, baseCurrency: "USD" }),
    false,
  );
  assert.equal(
    canConvertCurrency("UAH", { UAH_TO_USD: 0.024, EUR_TO_USD: 1.1, baseCurrency: "USD" }),
    true,
  );
});
