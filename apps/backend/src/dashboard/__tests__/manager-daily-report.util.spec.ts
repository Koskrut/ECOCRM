import assert from "node:assert/strict";
import test from "node:test";
import type { ManagerDailyReportMetrics } from "../manager-daily-report.types";
import {
  buildDailyReportBody,
  buildDailyReportTitle,
  emptyManagerDailyReportMetrics,
  formatMetricsBlock,
  formatTeamReportBlock,
  formatUsdAmount,
  kyivMonthThroughDayBounds,
  sumManagerDailyReportMetrics,
} from "../manager-daily-report.util";

function sample(partial: Partial<ManagerDailyReportMetrics> = {}): ManagerDailyReportMetrics {
  return { ...emptyManagerDailyReportMetrics(), ...partial };
}

test("formatUsdAmount uses space thousands and omits cents when whole", () => {
  assert.equal(formatUsdAmount(1240), "1 240 USD");
  assert.equal(formatUsdAmount(0), "0 USD");
  assert.equal(formatUsdAmount(18400.5), "18 400.50 USD");
});

test("formatMetricsBlock keeps zero lines and Ukrainian labels", () => {
  const text = formatMetricsBlock(sample());
  assert.match(text, /^Дзвінки: 0 вих\. \/ 0 вх\.$/m);
  assert.match(text, /^Зустрічі: 0 план\. \/ 0 усп\. \/ 0 відмова$/m);
  assert.match(text, /^Замовлення: 0 · 0 USD$/m);
  assert.match(text, /^Продаж за місяць: 0 USD$/m);
  assert.match(text, /^Оплати: 0 USD$/m);
  assert.match(text, /^Нові ліди: 0$/m);
  assert.match(text, /^Усього лідів: 0$/m);
  assert.doesNotMatch(text, /Встречи|месяц|Всего|отказ/);
});

test("formatMetricsBlock formats visits plan/success/failed", () => {
  const text = formatMetricsBlock(
    sample({
      callsOutbound: 8,
      callsInbound: 3,
      visitsPlanned: 5,
      visitsSuccess: 1,
      visitsFailed: 2,
      ordersCount: 2,
      ordersAmountUsd: 1240,
      monthSalesUsd: 18400,
      paymentsUsd: 3100,
      leadsNew: 2,
      leadsOpen: 14,
    }),
  );
  assert.equal(
    text,
    [
      "Дзвінки: 8 вих. / 3 вх.",
      "Зустрічі: 5 план. / 1 усп. / 2 відмова",
      "Замовлення: 2 · 1 240 USD",
      "Продаж за місяць: 18 400 USD",
      "Оплати: 3 100 USD",
      "Нові ліди: 2",
      "Усього лідів: 14",
    ].join("\n"),
  );
});

test("team block is vertical list with Разом sum excluding lead personal", () => {
  const text = formatTeamReportBlock([
    {
      fullName: "Іванов",
      metrics: sample({
        callsOutbound: 8,
        callsInbound: 3,
        visitsPlanned: 5,
        visitsSuccess: 1,
        visitsFailed: 2,
        ordersCount: 2,
        ordersAmountUsd: 1240,
        monthSalesUsd: 12000,
        paymentsUsd: 800,
        leadsNew: 2,
        leadsOpen: 14,
      }),
    },
    {
      fullName: "Петров",
      metrics: sample({ leadsOpen: 3 }),
    },
  ]);

  assert.match(text, /^Команда$/m);
  assert.match(text, /^Іванов$/m);
  assert.match(text, /^Петров$/m);
  assert.match(text, /^Разом$/m);
  assert.match(text, /Усього лідів: 17/);
  assert.doesNotMatch(text, /Іванов —/);
});

test("buildDailyReportBody appends team after personal blank line", () => {
  const body = buildDailyReportBody({
    personal: sample({ callsOutbound: 1 }),
    team: [{ fullName: "Іванов", metrics: sample({ callsOutbound: 2 }) }],
  });
  assert.ok(body.startsWith("Дзвінки: 1 вих."));
  assert.ok(body.includes("\n\nКоманда\n\nІванов\nДзвінки: 2 вих."));
});

test("buildDailyReportTitle uses DD.MM", () => {
  assert.equal(buildDailyReportTitle("2026-11-12"), "Підсумок 12.11");
});

test("sumManagerDailyReportMetrics totals open leads as sum of people", () => {
  const sum = sumManagerDailyReportMetrics([
    sample({ leadsOpen: 14, paymentsUsd: 800.1 }),
    sample({ leadsOpen: 3, paymentsUsd: 0.05 }),
  ]);
  assert.equal(sum.leadsOpen, 17);
  assert.equal(sum.paymentsUsd, 800.15);
});

test("kyivMonthThroughDayBounds starts on month 1st Kyiv", () => {
  const { from, to } = kyivMonthThroughDayBounds("2026-11-12");
  assert.equal(from.toISOString(), "2026-10-31T22:00:00.000Z");
  assert.ok(to.getTime() > from.getTime());
});
