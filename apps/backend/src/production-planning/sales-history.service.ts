import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { SalesHistoryUploadStatus } from "@prisma/client";
import * as XLSX from "xlsx";
import { PrismaService } from "../prisma/prisma.service";
import {
  isOneCSalesPivotSheet,
  monthBucketDate,
  parseMonthPeriodHeader,
  parseOneCSalesPivotSheet,
} from "./sales-history-1c.util";

export type ParsedSalesRow = {
  skuRaw: string;
  soldAt: Date;
  yearMonth: string;
  qty: number;
};

export type SalesUploadResult = {
  upload: {
    id: string;
    status: SalesHistoryUploadStatus;
    note: string | null;
    importedAt: Date;
    postedAt: Date | null;
    _count?: { lines: number };
  };
  format: "flat" | "onec_monthly_pivot" | "flat_month_columns";
  rowsInFile: number;
  importedRows: number;
  resolvedRows: number;
  unresolvedSku: string[];
};

function normalizeSku(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^`/, "")
    .replace(/^'/, "");
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[`"'']/g, "")
    .replace(/\s+/g, " ");
}

export function soldAtToYearMonth(soldAt: Date): string {
  return `${soldAt.getUTCFullYear()}-${String(soldAt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseDate(raw: unknown): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const asDate = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return Number.isNaN(asDate.getTime()) ? null : asDate;
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseQty(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const s = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Flat sheet: SKU column + month headers (YYYY-MM / 01.2025). */
export function parseFlatMonthColumnSheet(rows: unknown[][]): ParsedSalesRow[] {
  if (rows.length < 2) return [];
  const headers = rows[0] as unknown[];
  const normalized = headers.map(normalizeHeader);
  const skuIdx = normalized.findIndex(
    (h) => h === "sku" || h === "артикул" || h.includes("номенклатура.артикул"),
  );
  if (skuIdx < 0) return [];

  const monthCols: Array<{ col: number; soldAt: Date; yearMonth: string }> = [];
  for (let c = 0; c < headers.length; c++) {
    if (c === skuIdx) continue;
    const period = parseMonthPeriodHeader(headers[c]);
    if (!period) continue;
    const soldAt = monthBucketDate(period.year, period.monthIndex);
    monthCols.push({ col: c, soldAt, yearMonth: soldAtToYearMonth(soldAt) });
  }
  if (monthCols.length === 0) return [];

  const parsed: ParsedSalesRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const skuRaw = normalizeSku(row[skuIdx]);
    if (!skuRaw) continue;
    const skuNorm = skuRaw.toLowerCase();
    if (skuNorm.includes("підсумок") || skuNorm.includes("итог") || skuNorm === "total") continue;

    for (const month of monthCols) {
      const qty = parseQty(row[month.col]);
      if (qty == null || qty === 0) continue;
      parsed.push({
        skuRaw,
        soldAt: month.soldAt,
        yearMonth: month.yearMonth,
        qty,
      });
    }
  }
  return parsed;
}

export function parseSalesWorkbook(buffer: Buffer): {
  format: SalesUploadResult["format"];
  rowsInFile: number;
  parsed: ParsedSalesRow[];
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestException("Workbook has no sheets");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new BadRequestException("Workbook has no sheets");

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];

  if (isOneCSalesPivotSheet(matrix)) {
    const pivotRows = parseOneCSalesPivotSheet(matrix);
    return {
      format: "onec_monthly_pivot",
      rowsInFile: matrix.length,
      parsed: pivotRows.map((row) => ({
        skuRaw: row.skuRaw,
        soldAt: row.soldAt,
        yearMonth: soldAtToYearMonth(row.soldAt),
        qty: row.qty,
      })),
    };
  }

  const flatMonth = parseFlatMonthColumnSheet(matrix);
  if (flatMonth.length > 0) {
    return {
      format: "flat_month_columns",
      rowsInFile: matrix.length,
      parsed: flatMonth,
    };
  }

  const flatRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const parsed: ParsedSalesRow[] = [];
  for (const row of flatRows) {
    const skuRaw = normalizeSku(
      row.sku ?? row.SKU ?? row.Sku ?? row.productSku ?? row["Номенклатура.Артикул"],
    );
    const qty = parseQty(row.qty ?? row.Qty ?? row.quantity ?? row.Quantity);
    const soldRaw = row.soldAt ?? row.date ?? row.Date ?? row.sold_at ?? row.period;
    const soldAt = parseDate(soldRaw);
    if (!skuRaw || !soldAt || qty == null || qty === 0) continue;
    parsed.push({ skuRaw, soldAt, yearMonth: soldAtToYearMonth(soldAt), qty });
  }

  return {
    format: "flat",
    rowsInFile: flatRows.length,
    parsed,
  };
}

@Injectable()
export class SalesHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  parseFile(buffer: Buffer) {
    return parseSalesWorkbook(buffer);
  }

  async upload(params: { buffer: Buffer; importedById: string; note?: string }): Promise<SalesUploadResult> {
    const { format, rowsInFile, parsed } = parseSalesWorkbook(params.buffer);
    if (parsed.length === 0) {
      throw new BadRequestException(
        "No valid sales rows found. Expected 1C monthly pivot (SKU × months), flat month columns, or sku/date/qty rows.",
      );
    }

    const skuSet = Array.from(new Set(parsed.map((p) => p.skuRaw)));
    const products = await this.prisma.product.findMany({
      where: { sku: { in: skuSet } },
      select: { id: true, sku: true },
    });
    const productBySku = new Map(products.map((p) => [p.sku, p.id]));
    const unresolvedSku: string[] = [];

    const lineData = parsed.map((p) => {
      const productId = productBySku.get(p.skuRaw) ?? null;
      if (!productId) unresolvedSku.push(p.skuRaw);
      return {
        productId,
        skuRaw: p.skuRaw,
        yearMonth: p.yearMonth,
        soldAt: p.soldAt,
        qty: p.qty,
        source: "EXCEL_IMPORT",
      };
    });

    const upload = await this.prisma.salesHistoryUpload.create({
      data: {
        status: SalesHistoryUploadStatus.STAGED,
        importedById: params.importedById,
        note: params.note ?? null,
        lines: { create: lineData },
      },
      include: { _count: { select: { lines: true } } },
    });

    return {
      upload,
      format,
      rowsInFile,
      importedRows: lineData.length,
      resolvedRows: lineData.filter((d) => d.productId).length,
      unresolvedSku: [...new Set(unresolvedSku)],
    };
  }

  async list(limit = 20) {
    return this.prisma.salesHistoryUpload.findMany({
      orderBy: { importedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
      include: { _count: { select: { lines: true } } },
    });
  }

  async get(id: string) {
    const upload = await this.prisma.salesHistoryUpload.findUnique({
      where: { id },
      include: { lines: true, _count: { select: { lines: true } } },
    });
    if (!upload) throw new NotFoundException("Sales history upload not found");
    return upload;
  }

  async latestPosted() {
    return this.prisma.salesHistoryUpload.findFirst({
      where: { status: SalesHistoryUploadStatus.POSTED },
      orderBy: { postedAt: "desc" },
      include: { _count: { select: { lines: true } } },
    });
  }

  async post(id: string, userId: string) {
    const upload = await this.prisma.salesHistoryUpload.findUnique({ where: { id } });
    if (!upload) throw new NotFoundException("Sales history upload not found");
    if (upload.status === SalesHistoryUploadStatus.VOID) {
      throw new BadRequestException("Cannot post VOID sales upload");
    }
    if (upload.status === SalesHistoryUploadStatus.POSTED) return this.get(id);

    return this.prisma.$transaction(async (tx) => {
      await tx.salesHistoryUpload.updateMany({
        where: { status: SalesHistoryUploadStatus.POSTED, id: { not: id } },
        data: { status: SalesHistoryUploadStatus.VOID },
      });
      await tx.salesHistoryUpload.update({
        where: { id },
        data: {
          status: SalesHistoryUploadStatus.POSTED,
          postedAt: new Date(),
          postedById: userId,
        },
      });
      return tx.salesHistoryUpload.findUnique({
        where: { id },
        include: { lines: true, _count: { select: { lines: true } } },
      });
    });
  }
}
