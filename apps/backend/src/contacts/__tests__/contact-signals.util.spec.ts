import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContactScoringSignal,
  callCountsAsContact,
  contactStatusIsDuplicate,
  orderCountsAsPurchase,
} from "../contact-signals.util";

const now = new Date("2026-11-19T12:00:00.000Z");

function ago(days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

test("callCountsAsContact ignores missed busy and failed calls", () => {
  assert.equal(callCountsAsContact("ANSWERED"), true);
  assert.equal(callCountsAsContact("UNKNOWN"), true);
  assert.equal(callCountsAsContact(null), true);
  assert.equal(callCountsAsContact("MISSED"), false);
  assert.equal(callCountsAsContact("NO ANSWER"), false);
  assert.equal(callCountsAsContact("BUSY"), false);
  assert.equal(callCountsAsContact("FAILED"), false);
});

test("orderCountsAsPurchase keeps legacy orders and drops voids", () => {
  assert.equal(orderCountsAsPurchase({ orderStage: null }), true);
  assert.equal(orderCountsAsPurchase({ orderStage: "SHIPPED" }), true);
  assert.equal(orderCountsAsPurchase({ orderStage: "CANCELED" }), false);
  assert.equal(orderCountsAsPurchase({ orderStage: "REFUSED" }), false);
});

test("buildContactScoringSignal treats an order as the last contact", () => {
  const signal = buildContactScoringSignal({
    contactId: "c1",
    createdAt: ago(200),
    now,
    lastActivityAt: ago(40),
    lastCallAt: ago(40),
    lastMessageAt: null,
    lastOrderAt: ago(3),
    anyOrderAt: ago(3),
    ordersCountAll: 1,
    overdueFollowupTasks: 0,
    openTasksCount: 0,
    debtAmount: 0,
    revenue30: 100,
    revenue90: 100,
    revenue365: 100,
    ordersCount30: 1,
    ordersCount90: 1,
    ordersCount365: 1,
  });

  assert.equal(signal.daysSinceLastContact, 3);
  assert.equal(signal.daysSinceLastOrder, 3);
  assert.equal(signal.isAtRisk, false);
  assert.equal(signal.isDormant, false);
});

test("buildContactScoringSignal keeps purchase risk after a recent call", () => {
  const signal = buildContactScoringSignal({
    contactId: "c2",
    createdAt: ago(400),
    now,
    lastActivityAt: ago(5),
    lastCallAt: ago(5),
    lastMessageAt: null,
    lastOrderAt: ago(60),
    anyOrderAt: ago(60),
    ordersCountAll: 2,
    overdueFollowupTasks: 0,
    openTasksCount: 0,
    debtAmount: 0,
    revenue30: 0,
    revenue90: 0,
    revenue365: 200,
    ordersCount30: 0,
    ordersCount90: 0,
    ordersCount365: 2,
  });

  assert.equal(signal.daysSinceLastContact, 5);
  assert.equal(signal.daysSinceLastOrder, 60);
  assert.equal(signal.isAtRisk, true);
  assert.equal(signal.isDormant, false);
});

test("a message is a contact, and silence after two weeks enters the no-contact gap", () => {
  const messaged = buildContactScoringSignal({
    contactId: "c3",
    createdAt: ago(40),
    now,
    lastActivityAt: ago(40),
    lastCallAt: null,
    lastMessageAt: ago(2),
    lastOrderAt: null,
    anyOrderAt: null,
    ordersCountAll: 0,
    overdueFollowupTasks: 0,
    openTasksCount: 0,
    debtAmount: 0,
    revenue30: 0,
    revenue90: 0,
    revenue365: 0,
    ordersCount30: 0,
    ordersCount90: 0,
    ordersCount365: 0,
  });
  assert.equal(messaged.daysSinceLastContact, 2);
  assert.equal(messaged.isNewLeadNoFirstContact, false);

  const quiet = buildContactScoringSignal({
    contactId: "c4",
    createdAt: ago(20),
    now,
    lastActivityAt: null,
    lastCallAt: null,
    lastMessageAt: null,
    lastOrderAt: null,
    anyOrderAt: null,
    ordersCountAll: 0,
    overdueFollowupTasks: 0,
    openTasksCount: 0,
    debtAmount: 0,
    revenue30: 0,
    revenue90: 0,
    revenue365: 0,
    ordersCount30: 0,
    ordersCount90: 0,
    ordersCount365: 0,
  });
  assert.equal(quiet.lastContactAt, null);
  assert.equal(quiet.daysSinceLastContact, 20);
  assert.equal(quiet.isNewLeadNoFirstContact, false);

  const fresh = buildContactScoringSignal({
    contactId: "c5",
    createdAt: ago(10),
    now,
    lastActivityAt: null,
    lastCallAt: null,
    lastMessageAt: null,
    lastOrderAt: null,
    anyOrderAt: null,
    ordersCountAll: 0,
    overdueFollowupTasks: 0,
    openTasksCount: 0,
    debtAmount: 0,
    revenue30: 0,
    revenue90: 0,
    revenue365: 0,
    ordersCount30: 0,
    ordersCount90: 0,
    ordersCount365: 0,
  });
  assert.equal(fresh.isNewLeadNoFirstContact, true);
  assert.equal(fresh.daysSinceLastContact, null);
});

test("contactStatusIsDuplicate recognizes the duplicate status", () => {
  assert.equal(contactStatusIsDuplicate("Дублікат"), true);
  assert.equal(contactStatusIsDuplicate("дубликат"), true);
  assert.equal(contactStatusIsDuplicate("Клієнт"), false);
  assert.equal(contactStatusIsDuplicate(null), false);
});
