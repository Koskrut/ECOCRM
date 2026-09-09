import assert from "node:assert/strict";
import test from "node:test";
import { shouldActivateRowKey } from "../contacts-a11y";
import {
  DEFAULT_CONTACTS_URL,
  buildContactsSearchParams,
  clampContactsPage,
  isContactsFilterActive,
  parseContactsUrl,
  resolveQueueEmptyAction,
  type ContactsUrlState,
} from "../contacts-url";
import {
  isCurrentContactsRequest,
  shouldInitFilterDraft,
  shouldShowContactsEmpty,
} from "../contacts-ui-state";

function fromQuery(query: string) {
  return parseContactsUrl(new URLSearchParams(query));
}

test("parseContactsUrl defaults", () => {
  assert.deepEqual(fromQuery(""), DEFAULT_CONTACTS_URL);
});

test("parseContactsUrl reads list filters and preset", () => {
  const parsed = fromQuery(
    "q=ivan&workPreset=overdue&ownerId=u1&companyId=c1&hasPhone=yes&hasEmail=no&hasCallToday=yes&hasMissedCall=no&region=Kyiv&city=Bucha&clientType=doctor&sortBy=name&sortDir=asc&page=3&contactId=ct1&reason=HAS_DEBT&reason=NOPE&reason=OVERDUE_FOLLOWUP",
  );
  assert.equal(parsed.q, "ivan");
  assert.equal(parsed.workPreset, "overdue");
  assert.equal(parsed.ownerId, "u1");
  assert.equal(parsed.companyId, "c1");
  assert.equal(parsed.hasPhone, "yes");
  assert.equal(parsed.hasEmail, "no");
  assert.equal(parsed.hasCallToday, "yes");
  assert.equal(parsed.hasMissedCall, "no");
  assert.deepEqual(parsed.regions, ["Kyiv"]);
  assert.deepEqual(parsed.cities, ["Bucha"]);
  assert.equal(parsed.clientType, "doctor");
  assert.equal(parsed.sortBy, "name");
  assert.equal(parsed.sortDir, "asc");
  assert.equal(parsed.page, 3);
  assert.equal(parsed.contactId, "ct1");
  assert.deepEqual(parsed.reasons, ["HAS_DEBT", "OVERDUE_FOLLOWUP"]);
});

test("parseContactsUrl drops reasons outside preset mode", () => {
  assert.deepEqual(fromQuery("reason=HAS_DEBT").reasons, []);
  assert.deepEqual(fromQuery("workPreset=all&reason=HAS_DEBT").reasons, []);
});

test("parseContactsUrl ignores invalid page and preset", () => {
  const parsed = fromQuery("page=2.7&workPreset=nope&hasPhone=maybe");
  assert.equal(parsed.page, 2);
  assert.equal(parsed.workPreset, "all");
  assert.equal(parsed.hasPhone, "");
});

test("parseContactsUrl rejects non-positive pages", () => {
  assert.equal(fromQuery("page=0").page, 1);
  assert.equal(fromQuery("page=-3").page, 1);
  assert.equal(fromQuery("page=abc").page, 1);
});

test("buildContactsSearchParams preserves modal and unknown params", () => {
  const existing = new URLSearchParams(
    "contactId=new&prefillCompanyId=co1&phone=%2B380&firstName=A&lastName=B&utm=x",
  );
  const state: ContactsUrlState = {
    ...DEFAULT_CONTACTS_URL,
    q: "doc",
    workPreset: "attention",
    ownerId: "u1",
    page: 2,
    contactId: "ct9",
  };
  const built = buildContactsSearchParams(state, existing);
  assert.equal(built.get("contactId"), "ct9");
  assert.equal(built.get("prefillCompanyId"), "co1");
  assert.equal(built.get("phone"), "+380");
  assert.equal(built.get("firstName"), "A");
  assert.equal(built.get("lastName"), "B");
  assert.equal(built.get("utm"), "x");
  assert.equal(built.get("workPreset"), "attention");
  assert.equal(built.get("q"), "doc");
  assert.equal(built.get("ownerId"), "u1");
  assert.equal(built.get("page"), "2");
  assert.equal(built.get("companyId"), null);
});

test("buildContactsSearchParams round-trips list state", () => {
  const state: ContactsUrlState = {
    ...DEFAULT_CONTACTS_URL,
    q: "call",
    workPreset: "all",
    companyId: "c1",
    ownerId: "u2",
    hasPhone: "yes",
    regions: ["Lviv", "Odesa"],
    cities: ["Lviv"],
    clientType: "tech",
    sortBy: "updatedAt",
    sortDir: "asc",
    page: 4,
    contactId: "open-1",
  };
  const parsed = parseContactsUrl(buildContactsSearchParams(state));
  assert.deepEqual(parsed, state);
});

test("buildContactsSearchParams round-trips preset reasons", () => {
  const state: ContactsUrlState = {
    ...DEFAULT_CONTACTS_URL,
    workPreset: "attention",
    ownerId: "u9",
    reasons: ["HAS_DEBT", "DORMANT"],
    page: 2,
  };
  const built = buildContactsSearchParams(state);
  assert.deepEqual(built.getAll("reason"), ["HAS_DEBT", "DORMANT"]);
  assert.deepEqual(parseContactsUrl(built), state);

  const asAll = buildContactsSearchParams({ ...state, workPreset: "all" });
  assert.equal(asAll.get("reason"), null);
  assert.deepEqual(parseContactsUrl(asAll).reasons, []);
});

test("isContactsFilterActive and clampContactsPage", () => {
  assert.equal(isContactsFilterActive(DEFAULT_CONTACTS_URL), false);
  assert.equal(
    isContactsFilterActive({ ...DEFAULT_CONTACTS_URL, workPreset: "overdue", ownerId: "u1" }),
    true,
  );
  assert.equal(
    isContactsFilterActive({
      ...DEFAULT_CONTACTS_URL,
      workPreset: "attention",
      reasons: ["HAS_DEBT"],
    }),
    true,
  );
  assert.equal(isContactsFilterActive({ ...DEFAULT_CONTACTS_URL, workPreset: "attention" }), false);
  assert.equal(clampContactsPage(99, 20, 20), 1);
  assert.equal(clampContactsPage(3, 45, 20), 3);
  assert.equal(clampContactsPage(5, 45, 20), 3);
});

test("resolveQueueEmptyAction picks accurate CTA", () => {
  assert.equal(resolveQueueEmptyAction({ ownerId: "", q: "" }), "openAll");
  assert.equal(resolveQueueEmptyAction({ ownerId: "u1", q: "" }), "resetOwner");
  assert.equal(resolveQueueEmptyAction({ ownerId: "", q: "x" }), "resetFilters");
  assert.equal(resolveQueueEmptyAction({ ownerId: "u1", q: "x" }), "resetFilters");
  assert.equal(
    resolveQueueEmptyAction({ ownerId: "", q: "", reasons: ["HAS_DEBT"] }),
    "resetFilters",
  );
  assert.equal(
    resolveQueueEmptyAction({ ownerId: "u1", q: "", reasons: ["HAS_DEBT"] }),
    "resetFilters",
  );
});

test("shouldActivateRowKey ignores nested controls", () => {
  const row = { id: "row" } as unknown as EventTarget;
  const nested = { id: "nested" } as unknown as EventTarget;
  assert.equal(shouldActivateRowKey({ target: row, currentTarget: row, key: "Enter" }), true);
  assert.equal(shouldActivateRowKey({ target: nested, currentTarget: row, key: "Enter" }), false);
  assert.equal(shouldActivateRowKey({ target: row, currentTarget: row, key: "Tab" }), false);
});

test("shouldShowContactsEmpty is exclusive with error", () => {
  assert.equal(shouldShowContactsEmpty({ loading: false, error: null }), true);
  assert.equal(shouldShowContactsEmpty({ loading: true, error: null }), false);
  assert.equal(shouldShowContactsEmpty({ loading: false, error: "boom" }), false);
  assert.equal(shouldShowContactsEmpty({ loading: true, error: "boom" }), false);
});

test("isCurrentContactsRequest drops stale pagination responses", () => {
  assert.equal(isCurrentContactsRequest(1, 1), true);
  assert.equal(isCurrentContactsRequest(1, 2), false);
  assert.equal(isCurrentContactsRequest(3, 3), true);
});

test("shouldInitFilterDraft only on closed→open", () => {
  assert.equal(shouldInitFilterDraft(true, false), true);
  assert.equal(shouldInitFilterDraft(true, true), false);
  assert.equal(shouldInitFilterDraft(false, true), false);
  assert.equal(shouldInitFilterDraft(false, false), false);
});
