import * as XLSX from "xlsx";

export type SnapshotPivotEntry = {
  skuRaw: string;
  skuNormalized: string;
  qty: number;
  warehouseRaw: string | null;
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeSnapshotSku(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("`") ? trimmed.slice(1).trim() : trimmed;
}

/** Parse 1C qty cells: 12, 12.5, "1,816.500", "1.816,5", "1 816". */
export function parseSnapshotQty(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value !== "string") return 0;
  let s = value.trim().replace(/\s/g, "").replace(/\u00a0/g, "");
  if (!s) return 0;

  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }

  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function isTotalLabel(value: unknown): boolean {
  const h = normalizeHeader(value);
  return h.includes("підсумок") || h.includes("итог") || h === "total" || h.includes("всего");
}

export function findStockPivotHeaderRow(rows: unknown[][]): number | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 3) continue;
    const first = normalizeHeader(row[0]);
    if (!first.includes("номенклатура") && !first.includes("артикул") && first !== "sku") {
      continue;
    }
    let warehouseCols = 0;
    for (let c = 1; c < row.length; c++) {
      const label = String(row[c] ?? "").trim();
      if (!label || isTotalLabel(label)) continue;
      warehouseCols += 1;
    }
    if (warehouseCols >= 1) return i;
  }
  return null;
}

export function isOneCStockPivotSheet(rows: unknown[][]): boolean {
  return findStockPivotHeaderRow(rows) != null;
}

export function parseOneCStockPivotSheet(rows: unknown[][]): SnapshotPivotEntry[] {
  const headerIdx = findStockPivotHeaderRow(rows);
  if (headerIdx == null) return [];

  const header = rows[headerIdx] as unknown[];
  const warehouseCols: Array<{ col: number; name: string }> = [];
  for (let c = 1; c < header.length; c++) {
    const label = String(header[c] ?? "").trim();
    if (!label || isTotalLabel(label)) continue;
    warehouseCols.push({ col: c, name: label });
  }
  if (warehouseCols.length === 0) return [];

  const out: SnapshotPivotEntry[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const skuNormalized = normalizeSnapshotSku(row[0]);
    if (!skuNormalized) continue;
    if (isTotalLabel(skuNormalized)) continue;

    const skuHeader = normalizeHeader(skuNormalized);
    if (
      skuHeader.includes("кількість") ||
      skuHeader.includes("количество") ||
      skuHeader.includes("кінцевий") ||
      skuHeader.includes("конечный")
    ) {
      continue;
    }

    for (const wh of warehouseCols) {
      const qty = parseSnapshotQty(row[wh.col]);
      if (qty <= 0) continue;
      out.push({
        skuRaw: String(row[0] ?? "").trim(),
        skuNormalized,
        qty,
        warehouseRaw: wh.name,
      });
    }
  }

  return out;
}

export function parseOneCStockPivotWorkbook(workbook: XLSX.WorkBook): SnapshotPivotEntry[] {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];
  if (!isOneCStockPivotSheet(rows)) return [];
  return parseOneCStockPivotSheet(rows);
}
