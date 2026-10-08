import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { presentAuditEntry } from "../changeHistoryDisplay";
import type { TimelineItem } from "../../components/timeline/types";
import { callFacts, statusTransition, timelineBody, timelineTitle } from "../timelineDisplay";

const ownerBefore = "clxxxxxxxxxxxxxxxxxxxxx01";
const ownerAfter = "clyyyyyyyyyyyyyyyyyyyyy02";

function timelineItem(partial: Partial<TimelineItem> & Pick<TimelineItem, "kind" | "meta">): TimelineItem {
  return {
    id: "1",
    source: "activity",
    entity: { type: "order", id: "o1" },
    title: "",
    body: "",
    at: "2026-10-08T12:00:00.000Z",
    createdAt: "2026-10-08T12:00:00.000Z",
    pinnedAt: null,
    actor: { id: null, name: "system" },
    canEdit: false,
    canDelete: false,
    canPin: false,
    ...partial,
  };
}

describe("order change history display", () => {
  it("shows a stage move in words and hides the timestamp bump", () => {
    const presented = presentAuditEntry({
      action: "STATUS_CHANGE",
      changedBy: "system",
      diff: [
        { field: "orderStage", before: "NEW", after: "CONFIRMED" },
        { field: "updatedAt", before: "2026-10-01T00:00:00.000Z", after: "2026-10-08T00:00:00.000Z" },
      ],
      before: { currency: "USD" },
      after: { currency: "USD" },
    });

    assert.equal(presented.headline, "Етап");
    assert.equal(presented.actor, "Система");
    assert.equal(presented.rows.length, 1);
    assert.equal(presented.rows[0].before, "Новий");
    assert.equal(presented.rows[0].after, "Підтверджено");
    assert.equal(presented.technical, false);
  });

  it("formats money and names the person who changed the order", () => {
    const presented = presentAuditEntry({
      action: "UPDATE",
      changedBy: ownerAfter,
      changedByName: "Марія Коваленко",
      diff: [
        { field: "totalAmount", before: 1000, after: 1200.5 },
        { field: "deliveryMethod", before: "PICKUP", after: "NOVA_POSHTA" },
      ],
      before: { currency: "USD" },
      after: { currency: "USD" },
    });

    assert.equal(presented.actor, "Марія Коваленко");
    assert.equal(presented.rows[0].label, "Разом");
    assert.match(presented.rows[0].before, /1[\s\u00a0\u202f]?000 USD/);
    assert.match(presented.rows[0].after, /1[\s\u00a0\u202f]?200,5 USD/);
    assert.equal(presented.rows[1].before, "Самовивіз");
    assert.equal(presented.rows[1].after, "Нова Пошта");
  });

  it("does not print raw ids when the responsible person changes", () => {
    const presented = presentAuditEntry({
      action: "UPDATE",
      changedBy: "integration:ringostat",
      diff: [{ field: "ownerId", before: ownerBefore, after: ownerAfter }],
      before: null,
      after: null,
    });

    assert.equal(presented.actor, "Ringostat");
    assert.equal(presented.rows[0].label, "Відповідальний");
    assert.equal(presented.rows[0].after, "змінено");
    assert.equal(presented.rows[0].before.includes(ownerBefore), false);
    assert.equal(presented.rows[0].after.includes(ownerAfter), false);
  });

  it("summarizes creation with the fields a person can read", () => {
    const presented = presentAuditEntry({
      action: "CREATE",
      changedBy: "system",
      diff: null,
      before: null,
      after: {
        id: "ord_1",
        orderNumber: "1042",
        orderStage: "NEW",
        totalAmount: 50,
        currency: "USD",
        updatedAt: "2026-10-08T00:00:00.000Z",
        comment: "передзвонити",
      },
    });

    assert.equal(presented.headline, "Створено");
    assert.deepEqual(
      presented.rows.map((row) => row.field),
      ["orderNumber", "orderStage", "totalAmount", "comment"],
    );
    assert.equal(presented.rows[1].after, "Новий");
  });
});

describe("order activity display", () => {
  it("turns a raw stage title into named stages", () => {
    const item = timelineItem({
      kind: "status_change",
      source: "order_status",
      title: "NEW → SHIPPED",
      meta: {
        kind: "status",
        data: { fromStage: "NEW", toStage: "SHIPPED", fromStatus: null, toStatus: null },
      },
    });

    assert.equal(timelineTitle(item), "Етап");
    assert.deepEqual(statusTransition(item), { from: "Новий", to: "Відправлено" });
  });

  it("replaces a call dump with direction, result and duration", () => {
    const item = timelineItem({
      kind: "call",
      title: "Звонок входящий",
      body: "Статус: ANSWERED · Направление: входящий · Длительность: 72",
      meta: {
        kind: "call",
        data: {
          direction: "INBOUND",
          status: "ANSWERED",
          talkSec: 72,
          from: "+380501112233",
        },
      },
    });

    assert.equal(timelineTitle(item), "Дзвінок");
    assert.equal(timelineBody(item), null);
    assert.deepEqual(callFacts(item), ["Вхідний", "Відповіли", "1 хв 12 с", "+380501112233"]);
  });

  it("keeps a written comment and localizes the fallback title", () => {
    const item = timelineItem({
      kind: "comment",
      title: "Комментарий",
      body: "Клієнт просить відстрочку до пʼятниці",
      meta: { kind: "raw", data: {} },
    });

    assert.equal(timelineTitle(item), "Коментар");
    assert.equal(timelineBody(item), "Клієнт просить відстрочку до пʼятниці");
  });

  it("names a shipment by TTN and drops the duplicated status line", () => {
    const item = timelineItem({
      kind: "shipment",
      source: "ttn",
      title: "TTN 20450123456789",
      body: "Відправлення прямує",
      meta: {
        kind: "shipment",
        data: {
          documentNumber: "20450123456789",
          statusCode: "5",
          statusText: "Відправлення прямує",
          carrier: "Нова Пошта",
          cost: 90,
        },
      },
    });

    assert.equal(timelineTitle(item), "ТТН 20450123456789");
    assert.equal(timelineBody(item), null);
  });
});
