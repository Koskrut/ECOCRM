import { Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";
import { normalizeArticle } from "./article-normalizer";
import type { StockUpdateEntry, StockByWarehouseEntry } from "./product.store";

export type WarehouseForUpload = { id: string; name: string };

const SKU_HEADERS = ["артикул", "sku", "article"];
const NAME_HEADERS = ["название", "name", "наименование", "товар"];
const PRICE_HEADERS = ["цена", "price", "базовая цена", "baseprice", "base_price"];
const STOCK_HEADERS = ["остаток", "qty", "quantity", "stock"];

/** Extra header aliases per warehouse name (DB name is always included). */
const WAREHOUSE_HEADER_ALIASES: Record<string, string[]> = {
  днепр: ["dnipro", "dnepro"],
  одесса: ["одеса", "odesa", "odessa"],
  львов: ["льво", "lviv", "lvov"],
  киев: ["kyiv", "kiev", "київ"],
  луцьк: ["луцк", "lutsk"],
  "хмельницький": ["хмельницкий", "khmelnytskyi", "khmelnytsky"],
};

function normalizeHeader(s: unknown): string {
  if (s == null) return "";
  return String(s).trim().toLowerCase();
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeader(headers[i]);
    if (aliases.some((a) => h === a || h.includes(a))) return i;
  }
  return -1;
}

function warehouseHeaderAliases(warehouseName: string): string[] {
  const base = normalizeHeader(warehouseName);
  const extras = WAREHOUSE_HEADER_ALIASES[base] ?? [];
  return [base, ...extras];
}

function headerMatchesWarehouse(headerNorm: string, warehouseName: string): boolean {
  if (!headerNorm) return false;
  return warehouseHeaderAliases(warehouseName).some(
    (alias) => headerNorm.includes(alias) || alias.includes(headerNorm) || headerNorm === alias,
  );
}

export function findWarehouseColumnIndex(headerRow: string[], warehouseName: string): number {
  return headerRow.findIndex((h) => headerMatchesWarehouse(normalizeHeader(h), warehouseName));
}

function parseNumber(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

type ParsedSheet = {
  sheet: XLSX.WorkSheet;
  headerRow: string[];
  rows: unknown[][];
};

function readFirstSheet(buffer: Buffer): ParsedSheet | null {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return null;

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];

  if (rows.length < 1) return null;
  const headerRow = rows[0].map((c) => String(c ?? "").trim());
  return { sheet, headerRow, rows };
}

/** Read article from cell: prefer Excel formatted text (cell.w), then SSF format (cell.z). */
export function readArticleFromCell(
  sheet: XLSX.WorkSheet,
  rowIndex: number,
  colIndex: number,
): { raw: string; normalized: string } {
  const addr = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  const cell = sheet[addr];
  if (!cell || cell.v == null || cell.v === "") return { raw: "", normalized: "" };

  let raw: string;
  if (cell.t === "n") {
    if (cell.z != null && XLSX.SSF) {
      raw = String(XLSX.SSF.format(cell.z, cell.v)).trim();
    } else if (cell.w != null && String(cell.w).trim() !== "") {
      raw = String(cell.w).trim();
    } else {
      raw = String(cell.v);
    }
  } else if (cell.w != null && String(cell.w).trim() !== "") {
    raw = String(cell.w).trim();
  } else if (cell.t === "s") {
    raw = String(cell.v).trim();
  } else {
    raw = String(cell.v).trim();
  }

  return { raw, normalized: normalizeArticle(raw) };
}

function readQtyFromCell(sheet: XLSX.WorkSheet, rowIndex: number, colIndex: number): number {
  const addr = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  const cell = sheet[addr];
  if (!cell || cell.v == null || cell.v === "") return 0;
  if (cell.w != null && String(cell.w).trim() !== "") return parseNumber(cell.w);
  return parseNumber(cell.v);
}

@Injectable()
export class StockUploadService {
  /**
   * Parse Excel buffer: first row = headers. Columns: Артикул/sku + Остаток/qty/quantity/stock.
   * Returns list of { sku, stock } for rows with non-empty sku.
   */
  public parseExcelBuffer(buffer: Buffer): StockUpdateEntry[] {
    const parsed = readFirstSheet(buffer);
    if (!parsed || parsed.rows.length < 2) return [];

    const { sheet, headerRow, rows } = parsed;
    const skuIdx = findColumnIndex(headerRow, SKU_HEADERS);
    const nameIdx = findColumnIndex(headerRow, NAME_HEADERS);
    const priceIdx = findColumnIndex(headerRow, PRICE_HEADERS);
    const stockIdx = findColumnIndex(headerRow, STOCK_HEADERS);

    if (skuIdx < 0) return [];
    const entries: StockUpdateEntry[] = [];

    for (let i = 1; i < rows.length; i++) {
      const { raw, normalized } = readArticleFromCell(sheet, i, skuIdx);
      if (!normalized) continue;
      const stock = stockIdx >= 0 ? readQtyFromCell(sheet, i, stockIdx) : 0;
      const name =
        nameIdx >= 0
          ? (readArticleFromCell(sheet, i, nameIdx).raw ||
              String(rows[i]?.[nameIdx] ?? "")).trim() || undefined
          : undefined;
      const basePrice = priceIdx >= 0 ? readQtyFromCell(sheet, i, priceIdx) : undefined;
      entries.push({
        sku: normalized,
        stock,
        name,
        basePrice,
        fileSku: raw || undefined,
      });
    }

    return entries;
  }

  /**
   * Parse Excel for stock-by-warehouse upload (variant B).
   * Headers: Артикул/sku + columns per warehouse: "Днепр", "Остаток Днепр", etc.
   */
  public parseExcelBufferByWarehouses(
    buffer: Buffer,
    warehouses: WarehouseForUpload[],
  ): StockByWarehouseEntry[] {
    const parsed = readFirstSheet(buffer);
    if (!parsed || parsed.rows.length < 2 || warehouses.length === 0) return [];

    const { sheet, headerRow } = parsed;
    const skuIdx = findColumnIndex(headerRow, SKU_HEADERS);
    if (skuIdx < 0) return [];

    const warehouseColIndices: { warehouseId: string; colIndex: number }[] = [];
    for (const wh of warehouses) {
      const idx = findWarehouseColumnIndex(headerRow, wh.name);
      if (idx >= 0) warehouseColIndices.push({ warehouseId: wh.id, colIndex: idx });
    }

    const entries: StockByWarehouseEntry[] = [];
    for (let i = 1; i < parsed.rows.length; i++) {
      const { raw, normalized } = readArticleFromCell(sheet, i, skuIdx);
      if (!normalized) continue;
      for (const { warehouseId, colIndex } of warehouseColIndices) {
        const qty = readQtyFromCell(sheet, i, colIndex);
        entries.push({
          sku: normalized,
          fileSku: raw || undefined,
          warehouseId,
          qty,
        });
      }
    }
    return entries;
  }

  /** Matched warehouse columns in the file (warehouseId → column header). */
  public getMatchedWarehouseColumns(
    buffer: Buffer,
    warehouses: WarehouseForUpload[],
  ): Array<{ warehouseId: string; warehouseName: string; columnHeader: string }> {
    const parsed = readFirstSheet(buffer);
    if (!parsed || warehouses.length === 0) return [];

    const { headerRow } = parsed;
    const matched: Array<{ warehouseId: string; warehouseName: string; columnHeader: string }> = [];
    for (const wh of warehouses) {
      const idx = findWarehouseColumnIndex(headerRow, wh.name);
      if (idx >= 0) {
        matched.push({
          warehouseId: wh.id,
          warehouseName: wh.name,
          columnHeader: headerRow[idx] ?? wh.name,
        });
      }
    }
    return matched;
  }

  /** Warehouse names from DB with no matching column in the Excel header row. */
  public getUnmatchedWarehouseNames(
    buffer: Buffer,
    warehouses: WarehouseForUpload[],
  ): string[] {
    const parsed = readFirstSheet(buffer);
    if (!parsed || warehouses.length === 0) return warehouses.map((w) => w.name);

    const { headerRow } = parsed;
    return warehouses
      .filter((wh) => findWarehouseColumnIndex(headerRow, wh.name) < 0)
      .map((wh) => wh.name);
  }
}
