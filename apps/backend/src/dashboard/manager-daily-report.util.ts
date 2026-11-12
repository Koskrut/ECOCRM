import { DateTime } from "luxon";
import { CRM_TIME_ZONE, kyivDayBounds } from "../crm-timezone";
import type {
  ManagerDailyReportMetrics,
  ManagerDailyReportPerson,
} from "./manager-daily-report.types";

export function emptyManagerDailyReportMetrics(): ManagerDailyReportMetrics {
  return {
    callsOutbound: 0,
    callsInbound: 0,
    visitsPlanned: 0,
    visitsSuccess: 0,
    visitsFailed: 0,
    ordersCount: 0,
    ordersAmountUsd: 0,
    monthSalesUsd: 0,
    paymentsUsd: 0,
    leadsNew: 0,
    leadsOpen: 0,
  };
}

/** Inclusive Kyiv month start through end of the given calendar day. */
export function kyivMonthThroughDayBounds(dateYmd: string): { from: Date; to: Date } {
  const day = DateTime.fromISO(dateYmd, { zone: CRM_TIME_ZONE });
  if (!day.isValid || day.toISODate() !== dateYmd) {
    throw new Error("Invalid date");
  }
  return {
    from: day.startOf("month").toJSDate(),
    to: day.endOf("day").toJSDate(),
  };
}

export function formatReportDateDdMm(dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-");
  if (!y || !m || !d) return dateYmd;
  return `${d}.${m}`;
}

/** Space thousands separator; whole dollars without cents, else two decimals. */
export function formatUsdAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const intPart = Math.floor(abs + 1e-9);
  const frac = Math.round((abs - intPart) * 100);
  const intStr = String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const body = frac === 0 ? intStr : `${intStr}.${String(frac).padStart(2, "0")}`;
  return `${negative ? "-" : ""}${body} USD`;
}

export function formatMetricsBlock(metrics: ManagerDailyReportMetrics): string {
  return [
    `Дзвінки: ${metrics.callsOutbound} вих. / ${metrics.callsInbound} вх.`,
    `Зустрічі: ${metrics.visitsPlanned} план. / ${metrics.visitsSuccess} усп. / ${metrics.visitsFailed} відмова`,
    `Замовлення: ${metrics.ordersCount} · ${formatUsdAmount(metrics.ordersAmountUsd)}`,
    `Продаж за місяць: ${formatUsdAmount(metrics.monthSalesUsd)}`,
    `Оплати: ${formatUsdAmount(metrics.paymentsUsd)}`,
    `Нові ліди: ${metrics.leadsNew}`,
    `Усього лідів: ${metrics.leadsOpen}`,
  ].join("\n");
}

export function formatPersonalReportBody(metrics: ManagerDailyReportMetrics): string {
  return formatMetricsBlock(metrics);
}

export function sumManagerDailyReportMetrics(
  rows: ManagerDailyReportMetrics[],
): ManagerDailyReportMetrics {
  const out = emptyManagerDailyReportMetrics();
  for (const row of rows) {
    out.callsOutbound += row.callsOutbound;
    out.callsInbound += row.callsInbound;
    out.visitsPlanned += row.visitsPlanned;
    out.visitsSuccess += row.visitsSuccess;
    out.visitsFailed += row.visitsFailed;
    out.ordersCount += row.ordersCount;
    out.ordersAmountUsd += row.ordersAmountUsd;
    out.monthSalesUsd += row.monthSalesUsd;
    out.paymentsUsd += row.paymentsUsd;
    out.leadsNew += row.leadsNew;
    out.leadsOpen += row.leadsOpen;
  }
  out.ordersAmountUsd = Math.round(out.ordersAmountUsd * 100) / 100;
  out.monthSalesUsd = Math.round(out.monthSalesUsd * 100) / 100;
  out.paymentsUsd = Math.round(out.paymentsUsd * 100) / 100;
  return out;
}

export function formatTeamReportBlock(people: ManagerDailyReportPerson[]): string {
  if (people.length === 0) return "";
  const sections: string[] = ["Команда"];
  for (const person of people) {
    sections.push("");
    sections.push(person.fullName);
    sections.push(formatMetricsBlock(person.metrics));
  }
  sections.push("");
  sections.push("Разом");
  sections.push(formatMetricsBlock(sumManagerDailyReportMetrics(people.map((p) => p.metrics))));
  return sections.join("\n");
}

export function buildDailyReportBody(params: {
  personal: ManagerDailyReportMetrics;
  team?: ManagerDailyReportPerson[];
}): string {
  const personal = formatPersonalReportBody(params.personal);
  const team = params.team?.length ? formatTeamReportBlock(params.team) : "";
  return team ? `${personal}\n\n${team}` : personal;
}

export function buildDailyReportTitle(dateYmd: string): string {
  return `Підсумок ${formatReportDateDdMm(dateYmd)}`;
}

export function dayAndMonthBounds(dateYmd: string): {
  dayFrom: Date;
  dayTo: Date;
  monthFrom: Date;
  monthTo: Date;
} {
  const day = kyivDayBounds(dateYmd);
  const month = kyivMonthThroughDayBounds(dateYmd);
  return {
    dayFrom: day.from,
    dayTo: day.to,
    monthFrom: month.from,
    monthTo: month.to,
  };
}
