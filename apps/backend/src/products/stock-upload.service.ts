import { Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";
import type { StockUpdateEntry, StockByWarehouseEntry } from "./product.store";

export type WarehouseForUpload = { id: string; name: string };

const SKU_HEADERS = ["артикул", "sku", "article"];
const NAME_HEADERS = ["название", "name", "наименование", "товар"];
const PRICE_HEADERS = ["цена", "price", "базовая цена", "baseprice", "base_price"];
const STOCK_HEADERS = ["остаток", "qty", "quantity", "stock"];

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

function findWarehouseColumnIndex(headerRow: string[], warehouseName: string): number {
  const nameLower = warehouseName.trim().toLowerCase();
  return headerRow.findIndex((h) => {
    const hNorm = normalizeHeader(h);
    return hNorm.includes(nameLower) || nameLower.includes(hNorm) || hNorm === nameLower;
  });
}

function parseNumber(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

@Injectable()
export class StockUploadService {
  /**
   * Parse Excel buffer: first row = headers. Columns: Артикул/sku + Остаток/qty/quantity/stock.
   * Returns list of { sku, stock } for rows with non-empty sku.
   */
  public parseExcelBuffer(buffer: Buffer): StockUpdateEntry[] {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];

    if (rows.length < 2) return [];

    const headerRow = rows[0].map((c) => String(c ?? "").trim());
    const skuIdx = findColumnIndex(headerRow, SKU_HEADERS);
    const nameIdx = findColumnIndex(headerRow, NAME_HEADERS);
    const priceIdx = findColumnIndex(headerRow, PRICE_HEADERS);
    const stockIdx = findColumnIndex(headerRow, STOCK_HEADERS);

    if (skuIdx < 0) return [];
    const entries: StockUpdateEntry[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const sku = row[skuIdx] != null ? String(row[skuIdx]).trim() : "";
      if (!sku) continue;
      const stock = stockIdx >= 0 ? parseNumber(row[stockIdx]) : 0;
      const name = nameIdx >= 0 && row[nameIdx] != null ? String(row[nameIdx]).trim() : undefined;
      const basePrice = priceIdx >= 0 ? parseNumber(row[priceIdx]) : undefined;
      entries.push({ sku, stock, name: name || undefined, basePrice });
    }

    return entries;
  }

  /**
   * Parse Excel for stock-by-warehouse upload (variant B).
   * Headers: Артикул/sku + columns per warehouse: "Остаток Днепр", "Днепр", "Одесса", "Остаток Одесса", etc.
   * warehouses: list from GET /warehouses to map column header -> warehouseId.
   * Returns flat list { sku, warehouseId, qty } for each (row, warehouse) with non-empty sku.
   */
  public parseExcelBufferByWarehouses(
    buffer: Buffer,
    warehouses: WarehouseForUpload[],
  ): StockByWarehouseEntry[] {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName || warehouses.length === 0) return [];

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];

    if (rows.length < 2) return [];

    const headerRow = rows[0].map((c) => String(c ?? "").trim());
    const skuIdx = findColumnIndex(headerRow, SKU_HEADERS);
    if (skuIdx < 0) return [];

    const warehouseColIndices: { warehouseId: string; colIndex: number }[] = [];
    for (const wh of warehouses) {
      const idx = findWarehouseColumnIndex(headerRow, wh.name);
      if (idx >= 0) warehouseColIndices.push({ warehouseId: wh.id, colIndex: idx });
    }

    const entries: StockByWarehouseEntry[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const sku = row[skuIdx] != null ? String(row[skuIdx]).trim() : "";
      if (!sku) continue;
      for (const { warehouseId, colIndex } of warehouseColIndices) {
        const qty = parseNumber(row[colIndex]);
        entries.push({ sku, warehouseId, qty });
      }
    }
    return entries;
  }

  /** Warehouse names from DB with no matching column in the Excel header row. */
  public getUnmatchedWarehouseNames(
    buffer: Buffer,
    warehouses: WarehouseForUpload[],
  ): string[] {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName || warehouses.length === 0) return warehouses.map((w) => w.name);

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    if (rows.length < 1) return warehouses.map((w) => w.name);

    const headerRow = rows[0].map((c) => String(c ?? "").trim());
    return warehouses
      .filter((wh) => findWarehouseColumnIndex(headerRow, wh.name) < 0)
      .map((wh) => wh.name);
  }
}
