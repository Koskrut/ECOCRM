import { formatReportDateDdMm, formatUsdAmount } from "./manager-daily-report.util";

export const MORNING_BRIEF_TOP_OVERDUE = 20;
/** Stay under Telegram's 4096-character cap, including the title line. */
export const MORNING_BRIEF_PART_LIMIT = 3500;

export type MorningBriefAtRiskClient = {
  name: string;
  daysSinceLastOrder: number | null;
  daysSinceLastContact: number | null;
};

export type MorningBriefOverdueClient = {
  name: string;
  amount: number;
  days: number;
};

export type MorningOverdueOrder = {
  contactId: string;
  name: string;
  amount: number;
  days: number;
};

export function buildMorningBriefTitle(dateYmd: string): string {
  return `Ранок ${formatReportDateDdMm(dateYmd)}`;
}

export function formatBriefAmount(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase() || "USD";
  if (code === "USD") return formatUsdAmount(amount);
  const usd = formatUsdAmount(amount);
  return usd.replace(/ USD$/, ` ${code}`);
}

/** Sum overdue orders per client, highest amount first. */
export function rankOverdueClients(
  orders: MorningOverdueOrder[],
  limit = MORNING_BRIEF_TOP_OVERDUE,
): { totalClients: number; top: MorningBriefOverdueClient[] } {
  const byContact = new Map<string, MorningBriefOverdueClient>();
  for (const order of orders) {
    if (!(order.amount > 0)) continue;
    const prev = byContact.get(order.contactId);
    if (prev) {
      prev.amount = Math.round((prev.amount + order.amount) * 100) / 100;
      prev.days = Math.max(prev.days, order.days);
    } else {
      byContact.set(order.contactId, {
        name: order.name.trim() || "Клієнт",
        amount: Math.round(order.amount * 100) / 100,
        days: order.days,
      });
    }
  }
  const ranked = [...byContact.values()].sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return b.days - a.days;
  });
  return {
    totalClients: ranked.length,
    top: ranked.slice(0, Math.max(0, limit)),
  };
}

function atRiskLine(client: MorningBriefAtRiskClient, index: number): string {
  const bits = [`${index + 1}. ${client.name}`];
  if (client.daysSinceLastOrder != null) {
    bits.push(`замовлення ${client.daysSinceLastOrder} дн.`);
  }
  if (client.daysSinceLastContact != null) {
    bits.push(`контакт ${client.daysSinceLastContact} дн.`);
  }
  return bits.join(" · ");
}

export function formatMorningBriefBody(params: {
  leadsOpen: number;
  atRiskClients: MorningBriefAtRiskClient[];
  overdueTotal: number;
  overdueTop: MorningBriefOverdueClient[];
  currency: string;
}): string {
  const lines = [`Ліди: ${params.leadsOpen}`, `Ризик втрати: ${params.atRiskClients.length}`];
  params.atRiskClients.forEach((client, index) => {
    lines.push(atRiskLine(client, index));
  });
  lines.push(`Прострочена дебіторка: ${params.overdueTotal}`);
  if (params.overdueTop.length === 0) {
    lines.push("Простроченої дебіторки немає.");
    return lines.join("\n");
  }
  lines.push("");
  lines.push(`Топ ${params.overdueTop.length}`);
  params.overdueTop.forEach((client, index) => {
    const days = client.days > 0 ? ` · ${client.days} дн.` : "";
    lines.push(
      `${index + 1}. ${client.name} · ${formatBriefAmount(client.amount, params.currency)}${days}`,
    );
  });
  return lines.join("\n");
}

/** Split on line boundaries so a long at-risk list is delivered in full. */
export function splitMorningBriefText(
  text: string,
  limit = MORNING_BRIEF_PART_LIMIT,
): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (current && next.length > limit) {
      parts.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts.length > 0 ? parts : [text];
}
