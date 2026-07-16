import * as XLSX from "xlsx";

export type SalesHistoryParsedRow = {
  rowNumber: number;
  skuRaw: string;
  soldAt: Date;
  qty: number;
  periodLabel: string;
};

const UK_MONTHS: Record<string, number> = {
  січень: 0,
  лютий: 1,
  березень: 2,
  квітень: 3,
  травень: 4,
  червень: 5,
  липень: 6,
  серпень: 7,
  вересень: 8,
  жовтень: 9,
  листопад: 10,
  грудень: 11,
};

const RU_MONTHS: Record<string, number> = {
  январь: 0,
  февраль: 1,
  март: 2,
  апрель: 3,
  май: 4,
  июнь: 5,
  июль: 6,
  август: 7,
  сентябрь: 8,
  октябрь: 9,
  ноябрь: 10,
  декабрь: 11,
};

const EN_MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[`"'']/g, "")
    .replace(/\s+/g, " ");
}

/** Mid-month date for monthly pivot buckets (UTC). */
export function monthBucketDate(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 15));
}

export function parseMonthPeriodHeader(raw: unknown): { year: number; monthIndex: number } | null {
  const text = normalizeHeader(raw);
  if (!text || text.includes("підсумок") || text.includes("итог") || text === "total") {
    return null;
  }

  const yearMatch = text.match(/(20\d{2})/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);

  const monthMap = { ...UK_MONTHS, ...RU_MONTHS, ...EN_MONTHS };
  for (const [name, monthIndex] of Object.entries(monthMap)) {
    if (text.includes(name)) {
      return { year, monthIndex };
    }
  }

  // e.g. 01.2025 / 2025-01 / 2025.01
  const numeric = text.match(/(?:^|[^\d])(0?[1-9]|1[0-2])[./-](20\d{2})/) ?? text.match(/(20\d{2})[./-](0?[1-9]|1[0-2])/);
  if (numeric) {
    if (numeric[1]!.startsWith("20")) {
      return { year: Number(numeric[1]), monthIndex: Number(numeric[2]) - 1 };
    }
    return { year: Number(numeric[2]), monthIndex: Number(numeric[1]) - 1 };
  }

  return null;
}

export function isOneCSalesPivotSheet(rows: unknown[][]): boolean {
  return findSalesPivotHeaderRow(rows) != null;
}

export function findSalesPivotHeaderRow(rows: unknown[][]): number | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 2) continue;
    const first = normalizeHeader(row[0]);
    if (!first.includes("номенклатура") && !first.includes("артикул") && first !== "sku") {
      continue;
    }
    let monthCols = 0;
    for (let c = 1; c < row.length; c++) {
      if (parseMonthPeriodHeader(row[c])) monthCols += 1;
    }
    if (monthCols >= 1) return i;
  }
  return null;
}

export function parseQtyCell(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function isQtyMeasureLabel(value: unknown): boolean {
  const h = normalizeHeader(value);
  if (!h) return false;
  if (h.includes("сум") || h.includes("amount") || h.includes("выруч") || h.includes("вируч")) {
    return false;
  }
  return (
    h.includes("кількість") ||
    h.includes("количество") ||
    h.includes("qty") ||
    h.includes("quantity") ||
    h === "шт" ||
    h.includes("базов")
  );
}

function isAmountMeasureLabel(value: unknown): boolean {
  const h = normalizeHeader(value);
  return h.includes("сум") || h.includes("amount") || h.includes("выруч") || h.includes("вируч");
}

export function parseOneCSalesPivotSheet(rows: unknown[][]): SalesHistoryParsedRow[] {
  const headerIdx = findSalesPivotHeaderRow(rows);
  if (headerIdx == null) return [];

  const header = rows[headerIdx] as unknown[];
  const measureRow = rows[headerIdx + 1];
  const hasMeasureHints =
    Array.isArray(measureRow) &&
    measureRow.slice(1).some((cell) => isQtyMeasureLabel(cell) || isAmountMeasureLabel(cell));

  const monthCols: Array<{ col: number; soldAt: Date; label: string }> = [];
  for (let c = 1; c < header.length; c++) {
    const period = parseMonthPeriodHeader(header[c]);
    if (!period) continue;
    if (hasMeasureHints && Array.isArray(measureRow)) {
      const measure = measureRow[c];
      if (isAmountMeasureLabel(measure)) continue;
      if (!isQtyMeasureLabel(measure) && String(measure ?? "").trim() !== "") continue;
    }
    monthCols.push({
      col: c,
      soldAt: monthBucketDate(period.year, period.monthIndex),
      label: String(header[c] ?? "").trim(),
    });
  }
  if (monthCols.length === 0) return [];

  const parsed: SalesHistoryParsedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const skuRaw = String(row[0] ?? "")
      .trim()
      .replace(/^`/, "")
      .replace(/^'/, "");
    if (!skuRaw) continue;
    const skuNorm = skuRaw.toLowerCase();
    if (skuNorm.includes("підсумок") || skuNorm.includes("итог") || skuNorm === "total") {
      continue;
    }

    // Skip sub-header rows like "Кількість (у базових од.)"
    const skuHeader = normalizeHeader(skuRaw);
    if (skuHeader.includes("кількість") || skuHeader.includes("количество") || isAmountMeasureLabel(skuRaw)) {
      continue;
    }

    for (const month of monthCols) {
      const qtyRaw = parseQtyCell(row[month.col]);
      if (qtyRaw == null || qtyRaw === 0) continue;
      const qty = Math.round(qtyRaw);
      if (qty === 0) continue;
      parsed.push({
        rowNumber: i + 1,
        skuRaw,
        soldAt: month.soldAt,
        qty,
        periodLabel: month.label,
      });
    }
  }

  return parsed;
}

export function parseOneCSalesPivotWorkbook(workbook: XLSX.WorkBook): SalesHistoryParsedRow[] {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];
  if (!isOneCSalesPivotSheet(rows)) return [];
  return parseOneCSalesPivotSheet(rows);
}
