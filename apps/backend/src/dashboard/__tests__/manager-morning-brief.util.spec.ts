import assert from "node:assert/strict";
import test from "node:test";
import {
  MORNING_BRIEF_TOP_OVERDUE,
  buildMorningBriefTitle,
  formatMorningBriefBody,
  rankOverdueClients,
  splitMorningBriefText,
} from "../manager-morning-brief.util";

test("buildMorningBriefTitle uses DD.MM", () => {
  assert.equal(buildMorningBriefTitle("2026-11-23"), "Ранок 23.11");
});

test("rankOverdueClients sums orders and keeps the top 20", () => {
  const orders = Array.from({ length: 21 }, (_, index) => ({
    contactId: `c${index + 1}`,
    name: `Клієнт ${index + 1}`,
    amount: index + 1,
    days: index + 1,
  }));
  orders.push({ contactId: "c21", name: "Клієнт 21", amount: 100, days: 3 });

  const ranked = rankOverdueClients(orders);
  assert.equal(MORNING_BRIEF_TOP_OVERDUE, 20);
  assert.equal(ranked.totalClients, 21);
  assert.equal(ranked.top.length, 20);
  assert.equal(ranked.top[0]?.name, "Клієнт 21");
  assert.equal(ranked.top[0]?.amount, 121);
  assert.equal(ranked.top[0]?.days, 21);
  assert.equal(ranked.top.some((row) => row.name === "Клієнт 1"), false);
});

test("formatMorningBriefBody lists every at-risk client and the overdue top", () => {
  const text = formatMorningBriefBody({
    leadsOpen: 14,
    atRiskClients: [
      { name: "Іваненко", daysSinceLastOrder: 60, daysSinceLastContact: 40 },
      { name: "Сидоренко", daysSinceLastOrder: 45, daysSinceLastContact: null },
    ],
    overdueTotal: 2,
    currency: "USD",
    overdueTop: [
      { name: "Коваль Марія", amount: 1240, days: 18 },
      { name: "Петренко", amount: 80.5, days: 4 },
    ],
  });
  assert.equal(
    text,
    [
      "Ліди: 14",
      "Ризик втрати: 2",
      "1. Іваненко · замовлення 60 дн. · контакт 40 дн.",
      "2. Сидоренко · замовлення 45 дн.",
      "Прострочена дебіторка: 2",
      "",
      "Топ 2",
      "1. Коваль Марія · 1 240 USD · 18 дн.",
      "2. Петренко · 80.50 USD · 4 дн.",
    ].join("\n"),
  );
});

test("formatMorningBriefBody says when nobody is overdue", () => {
  const text = formatMorningBriefBody({
    leadsOpen: 0,
    atRiskClients: [],
    overdueTotal: 0,
    currency: "USD",
    overdueTop: [],
  });
  assert.match(text, /Ризик втрати: 0/);
  assert.match(text, /Простроченої дебіторки немає\./);
});

test("splitMorningBriefText keeps every line across parts", () => {
  const lines = Array.from({ length: 40 }, (_, index) => `${index + 1}. Клієнт ${index + 1}`);
  const parts = splitMorningBriefText(lines.join("\n"), 80);
  assert.ok(parts.length > 1);
  assert.equal(parts.join("\n"), lines.join("\n"));
  for (const part of parts) assert.ok(part.length <= 80);
});
