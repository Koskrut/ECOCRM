import * as XLSX from "xlsx";

export const SUPREX_SKIP_SHEETS = new Set(["Инструмент", "Преміли", "Временная"]);

export type SuprexParsedBomRow = {
  rowNumber: number;
  sheetName: string;
  kitSkuRaw: string;
  kitSku: string;
  kitName: string | null;
  componentSkuRaw: string;
  componentSku: string;
  componentName: string | null;
  qtyPerKit: number;
  scrapPct: number | null;
};

export type SuprexBomRowError = {
  rowNumber: number;
  sheetName: string;
  kitSku: string;
  componentSku: string;
  reason: string;
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[`"'']/g, "")
    .replace(/[\s_-]+/g, "");
}

export function normalizeSku(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("`") ? trimmed.slice(1) : trimmed;
}

export function normalizeProductName(value: string, stripParens = false): string {
  let normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[«»""'']/g, "")
    .replace(/\s+/g, " ");
  if (stripParens) {
    normalized = normalized.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  }
  return normalized.trim();
}

export function looksLikeComponentSku(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^\d+\.\d+$/.test(trimmed)) return true;
  return /^[A-Z]{2,}[-/][A-Z0-9./-]+$/i.test(trimmed);
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

export function isSuprexSpecificationSheet(rows: unknown[][]): boolean {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const kitNameHeader = normalizeHeader(row[1]);
    const componentsHeader = normalizeHeader(row[3]);
    if (
      kitNameHeader.includes("наименованиекомплектапродукции") &&
      componentsHeader.includes("комплектующие")
    ) {
      return true;
    }
  }
  return false;
}

export function isSuprexWorkbook(workbook: XLSX.WorkBook): boolean {
  return workbook.SheetNames.some((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return false;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    return isSuprexSpecificationSheet(rows);
  });
}

function findSuprexHeaderRow(rows: unknown[][]): number | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const kitNameHeader = normalizeHeader(row[1]);
    const componentsHeader = normalizeHeader(row[3]);
    if (
      kitNameHeader.includes("наименованиекомплектапродукции") &&
      componentsHeader.includes("комплектующие")
    ) {
      return i;
    }
  }
  return null;
}

export function parseSuprexSheet(
  rows: unknown[][],
  sheetName: string,
): { rows: SuprexParsedBomRow[]; rowErrors: SuprexBomRowError[] } {
  const parsedRows: SuprexParsedBomRow[] = [];
  const rowErrors: SuprexBomRowError[] = [];

  const headerRow = findSuprexHeaderRow(rows);
  if (headerRow == null) {
    return { rows: parsedRows, rowErrors };
  }

  let currentKitSku = "";
  let currentKitName: string | null = null;
  const dataStart = headerRow + 2;

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const kitNameRaw = String(row[1] ?? "").trim();
    const kitSkuRaw = String(row[2] ?? "").trim();
    const componentRaw = String(row[3] ?? "").trim();
    const qtyRaw = row[5];

    if (kitSkuRaw) {
      currentKitSku = normalizeSku(kitSkuRaw);
      currentKitName = kitNameRaw || null;
    }

    if (!componentRaw && String(qtyRaw ?? "").trim() === "") {
      continue;
    }

    const rowNumber = i + 1;

    if (!currentKitSku) {
      rowErrors.push({
        rowNumber,
        sheetName,
        kitSku: kitSkuRaw,
        componentSku: componentRaw,
        reason: "kitSku is required (no kit context above this row)",
      });
      continue;
    }

    if (!componentRaw) {
      rowErrors.push({
        rowNumber,
        sheetName,
        kitSku: currentKitSku,
        componentSku: componentRaw,
        reason: "component is required",
      });
      continue;
    }

    const qtyParsed = parseNumber(qtyRaw);
    // Suprex sheets sometimes leave Кол-во blank for a known component — treat as 1.
    const qtyPerKit =
      qtyParsed != null && qtyParsed > 0 ? qtyParsed : String(qtyRaw ?? "").trim() === "" ? 1 : null;
    if (qtyPerKit == null) {
      rowErrors.push({
        rowNumber,
        sheetName,
        kitSku: currentKitSku,
        componentSku: componentRaw,
        reason: "qtyPerKit must be a positive number",
      });
      continue;
    }

    const isSku = looksLikeComponentSku(componentRaw);
    const normalizedComponent = isSku ? normalizeSku(componentRaw) : componentRaw;

    parsedRows.push({
      rowNumber,
      sheetName,
      kitSkuRaw: currentKitSku,
      kitSku: currentKitSku,
      kitName: currentKitName,
      componentSkuRaw: componentRaw,
      componentSku: normalizedComponent,
      componentName: isSku ? null : componentRaw,
      qtyPerKit,
      scrapPct: null,
    });
  }

  return { rows: parsedRows, rowErrors };
}

export function parseSuprexWorkbook(workbook: XLSX.WorkBook): {
  rows: SuprexParsedBomRow[];
  rowErrors: SuprexBomRowError[];
  sheetsProcessed: string[];
  skippedSheets: string[];
} {
  const parsedRows: SuprexParsedBomRow[] = [];
  const rowErrors: SuprexBomRowError[] = [];
  const sheetsProcessed: string[] = [];
  const skippedSheets: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (SUPREX_SKIP_SHEETS.has(sheetName)) {
      skippedSheets.push(sheetName);
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];

    if (!isSuprexSpecificationSheet(rows)) {
      skippedSheets.push(sheetName);
      continue;
    }

    const parsed = parseSuprexSheet(rows, sheetName);
    if (parsed.rows.length === 0 && parsed.rowErrors.length === 0) {
      skippedSheets.push(sheetName);
      continue;
    }

    sheetsProcessed.push(sheetName);
    parsedRows.push(...parsed.rows);
    rowErrors.push(...parsed.rowErrors);
  }

  return { rows: parsedRows, rowErrors, sheetsProcessed, skippedSheets };
}
