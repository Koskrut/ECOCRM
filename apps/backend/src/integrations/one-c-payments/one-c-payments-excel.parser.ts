import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

export type OneCPaymentExcelRow = {
  /** 0-based row index in the sheet (header is not counted in data rows; this is data row index). */
  rowIndex: number;
  paidAt: Date;
  /** 1C document number (column «Номер»). */
  documentNumber: string;
  enterpriseCode: string;
  enterpriseName: string;
  currency: string;
  amountLv: number;
  rateOv: number | null;
  amountOv: number | null;
  purpose: string;
  attribute1Code: string | null;
  attribute1Name: string | null;
  attribute2Code: string | null;
  attribute2Name: string | null;
  attribute3Code: string | null;
  attribute3Name: string | null;
  managerCode: string | null;
  managerName: string | null;
  isNovaPay: boolean;
  /** Stable idempotency key for this row. */
  importKey: string;
};

const HEADER_ALIASES: Record<keyof Omit<
  OneCPaymentExcelRow,
  "rowIndex" | "isNovaPay" | "importKey" | "paidAt" | "currency" | "amountLv" | "rateOv" | "amountOv"
> | "paidAt" | "currency" | "amountLv" | "rateOv" | "amountOv", string[]> = {
  paidAt: ["дата", "date"],
  documentNumber: ["номер", "number", "№", "no"],
  enterpriseCode: ["предприятие", "підприємство", "enterprise", "код контрагента"],
  enterpriseName: [
    "имя предприятия",
    "ім'я підприємства",
    "назва підприємства",
    "enterprise name",
    "контрагент",
  ],
  currency: ["валюта", "currency"],
  amountLv: ["сумма лв", "сума лв", "сумма", "сума", "amount"],
  rateOv: ["курс ов", "курс", "rate"],
  amountOv: ["сумма ов", "сума ов", "amount usd", "usd"],
  purpose: ["формулировка", "формулювання", "назначение", "призначення", "purpose"],
  attribute1Code: ["признак 1", "ознака 1"],
  attribute1Name: ["имя признака 1", "ім'я ознаки 1"],
  attribute2Code: ["признак 2", "ознака 2"],
  attribute2Name: ["имя признака 2", "ім'я ознаки 2"],
  attribute3Code: ["признак 3", "ознака 3"],
  attribute3Name: ["имя признака 3", "ім'я ознаки 3"],
  managerCode: ["менеджер", "manager"],
  managerName: ["имя менеджера", "ім'я менеджера", "manager name"],
};

function normalizeHeader(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseAmount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Trim + strip leading zeros: `000006495` → `6495`. */
export function normalizeOneCCode(raw: unknown): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  // Excel may give numeric codes as floats (455.0)
  if (/^\d+(\.0+)?$/.test(trimmed)) {
    const asInt = String(Math.trunc(Number(trimmed)));
    return asInt.replace(/^0+/, "") || "0";
  }
  const withoutLeadingZeros = trimmed.replace(/^0+/, "");
  return withoutLeadingZeros || "0";
}

function parseDocumentNumber(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
  const s = String(v).trim();
  if (/^\d+(\.0+)?$/.test(s)) return String(Math.trunc(Number(s)));
  return s;
}

/** Excel serial date → JS Date (UTC noon to avoid TZ day-shift). */
export function excelSerialToDate(serial: unknown): Date | null {
  if (serial instanceof Date && !Number.isNaN(serial.getTime())) return serial;
  const n = typeof serial === "number" ? serial : parseFloat(String(serial ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 1) return null;
  // Excel epoch 1899-12-30
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  // Normalize to UTC noon
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}

/** ISO 4217 numeric → alpha (extend as needed). */
export function mapCurrencyCode(raw: unknown): string {
  const n = normalizeOneCCode(raw);
  if (n === "980") return "UAH";
  if (n === "840") return "USD";
  if (n === "978") return "EUR";
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "UAH" || s === "USD" || s === "EUR") return s;
  return "UAH";
}

export function buildOneCImportKey(input: {
  paidAt: Date;
  documentNumber: string;
  enterpriseCode: string;
  amountLv: number;
}): string {
  const day = input.paidAt.toISOString().slice(0, 10);
  const amount = Number(input.amountLv).toFixed(2);
  const raw = `${day}|${input.documentNumber}|${input.enterpriseCode}|${amount}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    if (aliases.includes(h)) return i;
  }
  // Fuzzy: header starts with / equals alias
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    for (const a of aliases) {
      if (h === a || h.startsWith(a + " ") || h.includes(a)) return i;
    }
  }
  return -1;
}

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const headers = row.map(normalizeHeader);
    const dateIdx = findColumnIndex(headers, HEADER_ALIASES.paidAt);
    const numIdx = findColumnIndex(headers, HEADER_ALIASES.documentNumber);
    const amtIdx = findColumnIndex(headers, HEADER_ALIASES.amountLv);
    if (dateIdx >= 0 && numIdx >= 0 && amtIdx >= 0) return i;
  }
  return -1;
}

function cell(row: unknown[], idx: number): unknown {
  if (idx < 0 || idx >= row.length) return undefined;
  return row[idx];
}

function isNovaPayRow(attr2Code: string | null, attr2Name: string | null): boolean {
  if (attr2Code === "12") return true;
  const name = (attr2Name ?? "").toLowerCase();
  return name.includes("новапей") || name.includes("novapay");
}

export function parseOneCPaymentsExcel(buffer: Buffer): OneCPaymentExcelRow[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch (e) {
    throw new BadRequestException(
      `Failed to read Excel file: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const first = wb.SheetNames[0];
  if (!first) throw new BadRequestException("Excel file has no sheets");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[first], {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];

  if (rows.length < 2) throw new BadRequestException("Excel file has no data rows");

  const headerRowIdx = findHeaderRowIndex(rows);
  if (headerRowIdx < 0) {
    throw new BadRequestException(
      "Expected a header row with Дата, Номер, and Сумма ЛВ (or Summa) columns",
    );
  }

  const headers = rows[headerRowIdx]!.map(normalizeHeader);
  const idx = {
    paidAt: findColumnIndex(headers, HEADER_ALIASES.paidAt),
    documentNumber: findColumnIndex(headers, HEADER_ALIASES.documentNumber),
    enterpriseCode: findColumnIndex(headers, HEADER_ALIASES.enterpriseCode),
    enterpriseName: findColumnIndex(headers, HEADER_ALIASES.enterpriseName),
    currency: findColumnIndex(headers, HEADER_ALIASES.currency),
    amountLv: findColumnIndex(headers, HEADER_ALIASES.amountLv),
    rateOv: findColumnIndex(headers, HEADER_ALIASES.rateOv),
    amountOv: findColumnIndex(headers, HEADER_ALIASES.amountOv),
    purpose: findColumnIndex(headers, HEADER_ALIASES.purpose),
    attribute1Code: findColumnIndex(headers, HEADER_ALIASES.attribute1Code),
    attribute1Name: findColumnIndex(headers, HEADER_ALIASES.attribute1Name),
    attribute2Code: findColumnIndex(headers, HEADER_ALIASES.attribute2Code),
    attribute2Name: findColumnIndex(headers, HEADER_ALIASES.attribute2Name),
    attribute3Code: findColumnIndex(headers, HEADER_ALIASES.attribute3Code),
    attribute3Name: findColumnIndex(headers, HEADER_ALIASES.attribute3Name),
    managerCode: findColumnIndex(headers, HEADER_ALIASES.managerCode),
    managerName: findColumnIndex(headers, HEADER_ALIASES.managerName),
  };

  if (idx.paidAt < 0 || idx.documentNumber < 0 || idx.amountLv < 0) {
    throw new BadRequestException("Required columns missing: Дата, Номер, Сумма ЛВ");
  }

  const out: OneCPaymentExcelRow[] = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const paidAt = excelSerialToDate(cell(row, idx.paidAt));
    const documentNumber = parseDocumentNumber(cell(row, idx.documentNumber));
    const amountLv = parseAmount(cell(row, idx.amountLv));
    if (!paidAt || !documentNumber || amountLv == null || amountLv === 0) continue;

    const enterpriseCode = normalizeOneCCode(cell(row, idx.enterpriseCode));
    const enterpriseName = String(cell(row, idx.enterpriseName) ?? "").trim();
    const purpose = String(cell(row, idx.purpose) ?? "").trim();
    const attr2Code = idx.attribute2Code >= 0 ? normalizeOneCCode(cell(row, idx.attribute2Code)) || null : null;
    const attr2Name =
      idx.attribute2Name >= 0 ? String(cell(row, idx.attribute2Name) ?? "").trim() || null : null;

    const rateOv = idx.rateOv >= 0 ? parseAmount(cell(row, idx.rateOv)) : null;
    const amountOv = idx.amountOv >= 0 ? parseAmount(cell(row, idx.amountOv)) : null;

    const importKey = buildOneCImportKey({
      paidAt,
      documentNumber,
      enterpriseCode,
      amountLv,
    });

    out.push({
      rowIndex: i - headerRowIdx - 1,
      paidAt,
      documentNumber,
      enterpriseCode,
      enterpriseName,
      currency: mapCurrencyCode(cell(row, idx.currency)),
      amountLv,
      rateOv,
      amountOv,
      purpose,
      attribute1Code:
        idx.attribute1Code >= 0 ? normalizeOneCCode(cell(row, idx.attribute1Code)) || null : null,
      attribute1Name:
        idx.attribute1Name >= 0
          ? String(cell(row, idx.attribute1Name) ?? "").trim() || null
          : null,
      attribute2Code: attr2Code,
      attribute2Name: attr2Name,
      attribute3Code:
        idx.attribute3Code >= 0 ? normalizeOneCCode(cell(row, idx.attribute3Code)) || null : null,
      attribute3Name:
        idx.attribute3Name >= 0
          ? String(cell(row, idx.attribute3Name) ?? "").trim() || null
          : null,
      managerCode:
        idx.managerCode >= 0 ? normalizeOneCCode(cell(row, idx.managerCode)) || null : null,
      managerName:
        idx.managerName >= 0 ? String(cell(row, idx.managerName) ?? "").trim() || null : null,
      isNovaPay: isNovaPayRow(attr2Code, attr2Name),
      importKey,
    });
  }

  if (out.length === 0) {
    throw new BadRequestException("No valid payment rows found in the file");
  }

  return out;
}
