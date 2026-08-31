import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LEADS_URL,
  buildLeadsSearchParams,
  isLeadsFilterActive,
  parseLeadsUrl,
  type LeadsUrlState,
} from "../leads-url";

function fromQuery(query: string) {
  return parseLeadsUrl(new URLSearchParams(query));
}

test("parseLeadsUrl defaults", () => {
  const parsed = fromQuery("");
  assert.deepEqual(parsed, DEFAULT_LEADS_URL);
});

test("parseLeadsUrl maps open alias to leadId", () => {
  const parsed = fromQuery("open=lead-42");
  assert.equal(parsed.leadId, "lead-42");
});

test("parseLeadsUrl prefers leadId over open", () => {
  const parsed = fromQuery("leadId=a&open=b");
  assert.equal(parsed.leadId, "a");
});

test("parseLeadsUrl reads filters, attention, ids, page", () => {
  const parsed = fromQuery(
    "q=ivan&status=all&source=META&channel=FB_LEAD_ADS&ownerId=unassigned&dateFrom=2026-01-01&dateTo=2026-01-31&sortBy=score&sortOrder=asc&attention=without-touch&ids=a,b&page=3&leadId=l1",
  );
  assert.equal(parsed.q, "ivan");
  assert.equal(parsed.status, "all");
  assert.equal(parsed.source, "META");
  assert.equal(parsed.channel, "FB_LEAD_ADS");
  assert.equal(parsed.ownerId, "unassigned");
  assert.equal(parsed.dateFrom, "2026-01-01");
  assert.equal(parsed.dateTo, "2026-01-31");
  assert.equal(parsed.sortBy, "score");
  assert.equal(parsed.sortOrder, "asc");
  assert.equal(parsed.attention, "without-touch");
  assert.equal(parsed.ids, "a,b");
  assert.equal(parsed.page, 3);
  assert.equal(parsed.leadId, "l1");
});

test("parseLeadsUrl ignores invalid status/source/attention", () => {
  const parsed = fromQuery("status=FOO&source=BAD&attention=nope");
  assert.equal(parsed.status, "");
  assert.equal(parsed.source, "");
  assert.equal(parsed.attention, "");
});

test("buildLeadsSearchParams omits defaults", () => {
  assert.equal(buildLeadsSearchParams({ ...DEFAULT_LEADS_URL }).toString(), "");
});

test("buildLeadsSearchParams round-trips", () => {
  const state: LeadsUrlState = {
    ...DEFAULT_LEADS_URL,
    q: "call",
    status: "IN_PROGRESS",
    source: "KYIVSTAR",
    channel: "IG_DM",
    ownerId: "u1",
    dateFrom: "2026-02-01",
    dateTo: "2026-02-28",
    sortBy: "score",
    sortOrder: "asc",
    attention: "stale-in-progress",
    ids: "x,y",
    page: 2,
    leadId: "lead-9",
  };
  const parsed = parseLeadsUrl(buildLeadsSearchParams(state));
  assert.deepEqual(parsed, state);
});

test("buildLeadsSearchParams writes leadId not open", () => {
  const params = buildLeadsSearchParams({ ...DEFAULT_LEADS_URL, leadId: "x" });
  assert.equal(params.get("leadId"), "x");
  assert.equal(params.get("open"), null);
});

test("isLeadsFilterActive detects attention and q", () => {
  assert.equal(isLeadsFilterActive(DEFAULT_LEADS_URL), false);
  assert.equal(isLeadsFilterActive({ ...DEFAULT_LEADS_URL, q: "a" }), true);
  assert.equal(
    isLeadsFilterActive({ ...DEFAULT_LEADS_URL, attention: "without-touch" }),
    true,
  );
});
