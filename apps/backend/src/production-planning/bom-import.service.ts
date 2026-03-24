import { BadRequestException, Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";
import { PrismaService } from "../prisma/prisma.service";
import { BomService, type BomLineInput } from "./bom.service";

type ParsedBomRow = {
  rowNumber: number;
  kitSkuRaw: string;
  kitSku: string;
  kitName: string | null;
  componentSkuRaw: string;
  componentSku: string;
  qtyPerKit: number;
  scrapPct: number | null;
};

type BomImportRowError = {
  rowNumber: number;
  kitSku: string;
  componentSku: string;
  reason: string;
};

type ParsedBomFile = {
  rows: ParsedBomRow[];
  rowErrors: BomImportRowError[];
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[`"'']/g, "")
    .replace(/[\s_-]+/g, "");
}

function normalizeSku(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("`") ? trimmed.slice(1) : trimmed;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

@Injectable()
export class BomImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bomService: BomService,
  ) {}

  parseFile(buffer: Buffer): ParsedBomFile {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException("BOM file is empty");
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];

    if (rows.length < 2) {
      throw new BadRequestException("BOM file must contain a header row and at least one line");
    }

    const headers = rows[0].map(normalizeHeader);
    const kitSkuIdx = headers.findIndex((h) =>
      ["kitsku", "kitsku/art", "артикулкомплекта", "артикулнабора"].includes(h),
    );
    const kitNameIdx = headers.findIndex((h) =>
      ["kitname", "наименованиекомплектапродукции", "назвакомплекту", "name"].includes(h),
    );
    const componentSkuIdx = headers.findIndex((h) =>
      ["componentsku", "component", "артикулкомпонента", "комплектующие"].includes(h),
    );
    const qtyPerKitIdx = headers.findIndex((h) =>
      ["qtyperkit", "qty", "quantity", "колво", "кількість"].includes(h),
    );
    const scrapPctIdx = headers.findIndex((h) =>
      ["scrappct", "scrap", "браки", "відсотокбраку", "scrappct%"].includes(h),
    );

    if (kitSkuIdx < 0 || componentSkuIdx < 0 || qtyPerKitIdx < 0) {
      throw new BadRequestException("Expected columns: kitSku, componentSku, qtyPerKit");
    }

    const parsedRows: ParsedBomRow[] = [];
    const rowErrors: BomImportRowError[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;

      const kitSkuRaw = String(row[kitSkuIdx] ?? "").trim();
      const componentSkuRaw = String(row[componentSkuIdx] ?? "").trim();
      const qtyRaw = row[qtyPerKitIdx];

      if (!kitSkuRaw && !componentSkuRaw && String(qtyRaw ?? "").trim() === "") {
        continue;
      }

      const normalizedKitSku = normalizeSku(kitSkuRaw);
      const normalizedComponentSku = normalizeSku(componentSkuRaw);
      const qtyParsed = parseNumber(qtyRaw);

      if (!normalizedKitSku) {
        rowErrors.push({
          rowNumber: i + 1,
          kitSku: kitSkuRaw,
          componentSku: componentSkuRaw,
          reason: "kitSku is required",
        });
        continue;
      }

      if (!normalizedComponentSku) {
        rowErrors.push({
          rowNumber: i + 1,
          kitSku: normalizedKitSku,
          componentSku: componentSkuRaw,
          reason: "componentSku is required",
        });
        continue;
      }

      if (qtyParsed == null || qtyParsed <= 0) {
        rowErrors.push({
          rowNumber: i + 1,
          kitSku: normalizedKitSku,
          componentSku: normalizedComponentSku,
          reason: "qtyPerKit must be a positive number",
        });
        continue;
      }

      const scrapPct =
        scrapPctIdx >= 0 && String(row[scrapPctIdx] ?? "").trim() !== ""
          ? parseNumber(row[scrapPctIdx])
          : null;

      parsedRows.push({
        rowNumber: i + 1,
        kitSkuRaw,
        kitSku: normalizedKitSku,
        kitName: kitNameIdx >= 0 ? String(row[kitNameIdx] ?? "").trim() || null : null,
        componentSkuRaw,
        componentSku: normalizedComponentSku,
        qtyPerKit: qtyParsed,
        scrapPct,
      });
    }

    return { rows: parsedRows, rowErrors };
  }

  async importFile(fileBuffer: Buffer) {
    const { rows, rowErrors } = this.parseFile(fileBuffer);
    if (rows.length === 0) {
      throw new BadRequestException("No valid BOM rows found");
    }

    const skuSet = new Set<string>();
    rows.forEach((row) => {
      skuSet.add(row.kitSku);
      skuSet.add(row.componentSku);
    });

    const products = await this.prisma.product.findMany({
      where: { sku: { in: Array.from(skuSet) } },
      select: { id: true, sku: true },
    });
    const productBySku = new Map(products.map((product) => [product.sku, product.id]));

    const grouped = new Map<string, ParsedBomRow[]>();
    for (const row of rows) {
      const current = grouped.get(row.kitSku) ?? [];
      current.push(row);
      grouped.set(row.kitSku, current);
    }

    const unresolvedKitSku = new Set<string>();
    const unresolvedComponentSku = new Set<string>();
    const importedKits: Array<{ kitSku: string; kitName: string | null; revision: number; lines: number }> = [];
    let importedLineCount = 0;

    for (const [kitSku, kitRows] of grouped.entries()) {
      const kitProductId = productBySku.get(kitSku);
      if (!kitProductId) {
        unresolvedKitSku.add(kitSku);
        for (const row of kitRows) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            kitSku,
            componentSku: row.componentSku,
            reason: "Kit SKU not found in catalog",
          });
        }
        continue;
      }

      const componentIds = new Set<string>();
      const duplicateComponents = new Set<string>();
      const bomLines: BomLineInput[] = [];
      let hasErrors = false;

      for (const row of kitRows) {
        const componentProductId = productBySku.get(row.componentSku);
        if (!componentProductId) {
          unresolvedComponentSku.add(row.componentSku);
          rowErrors.push({
            rowNumber: row.rowNumber,
            kitSku,
            componentSku: row.componentSku,
            reason: "Component SKU not found in catalog",
          });
          hasErrors = true;
          continue;
        }

        if (componentIds.has(componentProductId)) {
          duplicateComponents.add(row.componentSku);
          rowErrors.push({
            rowNumber: row.rowNumber,
            kitSku,
            componentSku: row.componentSku,
            reason: "Duplicate component SKU within the same kit",
          });
          hasErrors = true;
          continue;
        }

        componentIds.add(componentProductId);
        bomLines.push({
          componentProductId,
          qtyPerKit: row.qtyPerKit,
          scrapPct: row.scrapPct,
          sortOrder: bomLines.length,
        });
      }

      if (hasErrors || duplicateComponents.size > 0 || bomLines.length === 0) {
        continue;
      }

      const savedBom = await this.bomService.upsertNewRevision(kitProductId, bomLines);
      importedKits.push({
        kitSku,
        kitName: kitRows[0]?.kitName ?? null,
        revision: savedBom.revision,
        lines: bomLines.length,
      });
      importedLineCount += bomLines.length;
    }

    return {
      importedKitCount: importedKits.length,
      importedLineCount,
      importedKits,
      unresolvedKitSku: Array.from(unresolvedKitSku),
      unresolvedComponentSku: Array.from(unresolvedComponentSku),
      rowErrors,
    };
  }
}
