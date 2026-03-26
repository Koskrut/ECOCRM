/** Shared “vs previous period” lines for analytics KPI cards (Ukrainian copy, consistent formatting). */

export function deltaCountLine(current: number, prev: number | undefined): string | null {
  if (prev === undefined) return null;
  const diff = current - prev;
  return `vs попередній: ${diff >= 0 ? "+" : ""}${Math.round(diff)}`;
}

export function deltaPctPoints(current: number, prev: number | undefined): string | null {
  if (prev === undefined) return null;
  const diff = current - prev;
  return `vs попередній: ${diff >= 0 ? "+" : ""}${diff.toFixed(1)} п.п.`;
}

export function deltaMoneyLine(current: number, prev: number | undefined): string | null {
  if (prev === undefined) return null;
  const diff = current - prev;
  const sign = diff >= 0 ? "+" : "−";
  const abs = Math.abs(diff);
  const absFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(abs);
  const pct = prev === 0 ? null : (diff / prev) * 100;
  const base = `vs попередній: ${sign}${absFmt} $`;
  if (pct === null || !Number.isFinite(pct)) return base;
  return `${base} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
}

export function deltaMoneyLineFine(current: number, prev: number | undefined): string | null {
  if (prev === undefined) return null;
  const diff = current - prev;
  const sign = diff >= 0 ? "+" : "−";
  const absFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Math.abs(diff));
  const pct = prev === 0 ? null : (diff / prev) * 100;
  const base = `vs попередній: ${sign}${absFmt} $`;
  if (pct === null || !Number.isFinite(pct)) return base;
  return `${base} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
}
