import { createHash } from "crypto";
import type {
  OfficeToolsAccCreateBody,
  OfficeToolsAccDetail,
  OfficeToolsComp,
  OfficeToolsCompRec,
} from "./office-tools.types";

export function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

export function toFloat(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim().replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function normalizeOtSerial(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\r\n\t]/g, "")
    .trim();
}

export function otSerialKey(serial: string): string {
  return serial.toUpperCase();
}

/** Positive debt from SumAC (API uses negative for debt). */
export function debtFromSumAc(sumAc: unknown): number {
  const n = toFloat(sumAc);
  return Math.abs(n);
}

export function buildCompCreateBody(contact: {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone: string;
  documentDisplayName?: string | null;
  city?: string | null;
  address?: string | null;
  externalCode?: string | null;
}): Record<string, unknown> {
  const name =
    contact.documentDisplayName?.trim() ||
    [contact.lastName, contact.firstName, contact.middleName].filter(Boolean).join(" ").trim();
  return {
    CompName: name,
    Code: contact.externalCode?.trim() || "",
    Phone1: contact.phone,
    TaxPayer: "1",
    City: contact.city?.trim() || "",
    ...(contact.address?.trim() ? { Address: contact.address.trim() } : {}),
  };
}

export function extractCompIdentity(
  result: OfficeToolsComp | OfficeToolsComp[] | null | undefined,
): { compId: number | null; code: string | null } {
  const row = Array.isArray(result) ? result[0] : result;
  if (!row || typeof row !== "object") return { compId: null, code: null };
  const compId = toInt(row.CompID);
  const code = row.Code != null && String(row.Code).trim() ? String(row.Code).trim() : null;
  return { compId, code };
}

export function receiptImportKey(row: OfficeToolsCompRec): string {
  const payload = [
    String(row.CompID ?? ""),
    String(row.Code ?? ""),
    String(row.DocDate ?? ""),
    String(row.SumCC ?? row.SumMC ?? ""),
    String(row.ManagerID ?? ""),
    String(row.OurID ?? ""),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function kyivDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Expand order lines: one DETAIL row per serial (Qty 1), or one row with full qty when no serials.
 */
export function buildAccDetails(params: {
  lines: Array<{
    prodId: number;
    qty: number;
    price: number;
    serials: string[];
  }>;
}): OfficeToolsAccDetail[] {
  const details: OfficeToolsAccDetail[] = [];
  for (const line of params.lines) {
    const serials = line.serials.map(normalizeOtSerial).filter(Boolean);
    if (serials.length === 0) {
      details.push({
        ProdID: line.prodId,
        Qty: line.qty,
        Price: line.price,
        SeriesNomenclatures: "",
      });
      continue;
    }
    for (const serial of serials) {
      details.push({
        ProdID: line.prodId,
        Qty: 1,
        Price: line.price,
        SeriesNomenclatures: serial,
      });
    }
  }
  return details;
}

export function buildAccCreateBody(params: {
  docDate: string;
  stockId: number;
  compId: number;
  codeId1: number;
  empId: number;
  currId: number;
  notes: string;
  managerId: number;
  details: OfficeToolsAccDetail[];
}): OfficeToolsAccCreateBody {
  return {
    HEADER: {
      DocDate: params.docDate,
      StockID: params.stockId,
      CompID: params.compId,
      CodeID1: params.codeId1,
      CodeID2: 0,
      CodeID3: 0,
      CodeID4: 0,
      CodeID5: 0,
      EmpID: params.empId,
      CurrID: params.currId,
      Notes: params.notes,
      ManagerID: params.managerId,
    },
    DETAILS: params.details,
  };
}
