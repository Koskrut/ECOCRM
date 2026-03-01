import { Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";
import type { StockUpdateEntry } from "./product.store";

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
}
