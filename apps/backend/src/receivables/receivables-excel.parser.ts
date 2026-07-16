import { BadRequestException } from "@nestjs/common";
import * as XLSX from "xlsx";

export type ReceivablesExcelRow = {
  counterpartyCode1C: string;
  amount: number;
};

function normalizeHeader(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseAmount(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Trim + strip leading zeros: `000006495` → `6495`. */
export function normalizeCounterpartyCode1C(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withoutLeadingZeros = trimmed.replace(/^0+/, "");
  return withoutLeadingZeros || "0";
}

const CODE_HEADERS = new Set([
  "код 1с",
  "код1с",
  "код 1c",
  "код1c",
  "code",
  "counterparty",
  "контрагент код",
  "код контрагента",
  "код",
]);

const AMOUNT_HEADERS = new Set([
  "сумма",
  "sum",
  "amount",
  "долг",
  "дебитор",
  "задолженность",
  "борг",
  "заборгованість",
]);

function isCodeHeader(h: string): boolean {
  return CODE_HEADERS.has(h) || h.includes("код");
}

function isAmountHeader(h: string): boolean {
  return AMOUNT_HEADERS.has(h) || /долг|борг|заборг|сумм|amount|sum/.test(h);
}

function findCodeColumnIndex(headers: string[]): number {
  return headers.findIndex(isCodeHeader);
}

function findAmountColumnIndex(headers: string[]): number {
  return headers.findIndex(isAmountHeader);
}

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const headers = row.map(normalizeHeader);
    if (findCodeColumnIndex(headers) >= 0 && findAmountColumnIndex(headers) >= 0) {
      return i;
    }
  }
  return -1;
}

export function parseReceivablesExcel(buffer: Buffer): ReceivablesExcelRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
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
      "Expected a header row with code (код) and amount (долг / сумма / борг)",
    );
  }

  const headers = rows[headerRowIdx].map(normalizeHeader);
  const codeIdx = findCodeColumnIndex(headers);
  const amountIdx = findAmountColumnIndex(headers);

  if (codeIdx < 0 || amountIdx < 0) {
    throw new BadRequestException(
      "Expected columns: code 1C (код 1с) and amount (сумма / долг / борг)",
    );
  }

  const out: ReceivablesExcelRow[] = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const code = normalizeCounterpartyCode1C(String(row[codeIdx] ?? ""));
    if (!code) continue;
    const amount = parseAmount(row[amountIdx]);
    if (amount <= 0) continue;
    out.push({ counterpartyCode1C: code, amount });
  }

  if (out.length === 0) {
    throw new BadRequestException("No valid rows with code 1C and positive amount");
  }

  return out;
}

export function aggregateReceivablesRows(rows: ReceivablesExcelRow[]): Map<string, number> {
  const byCode = new Map<string, number>();
  for (const row of rows) {
    const code = normalizeCounterpartyCode1C(row.counterpartyCode1C);
    const prev = byCode.get(code) ?? 0;
    byCode.set(code, prev + row.amount);
  }
  return byCode;
}
