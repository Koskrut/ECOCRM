import { BadRequestException, Injectable } from "@nestjs/common";
import { ProductKind } from "@prisma/client";
import * as XLSX from "xlsx";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildStockSkuIndex,
  registerProductInStockIndex,
  resolveStockSkuToProduct,
} from "../products/stock-sku-normalizer";
import {
  buildArticlePartSku,
  buildPackagingPartSku,
  buildPartDisplayName,
  uniquifyPartSku,
} from "./bom-part.util";
import {
  isSuprexWorkbook,
  normalizeProductName,
  normalizeSku,
  parseSuprexWorkbook,
} from "./bom-suprex.util";
import { BomService, type BomLineInput } from "./bom.service";

type ParsedBomRow = {
  rowNumber: number;
  sheetName?: string;
  kitSkuRaw: string;
  kitSku: string;
  kitName: string | null;
  componentSkuRaw: string;
  componentSku: string;
  componentName: string | null;
  qtyPerKit: number;
  scrapPct: number | null;
};

type BomImportRowError = {
  rowNumber: number;
  sheetName?: string;
  kitSku: string;
  componentSku: string;
  reason: string;
};

type BomImportFormat = "flat" | "suprex";

type ParsedBomFile = {
  format: BomImportFormat;
  rows: ParsedBomRow[];
  rowErrors: BomImportRowError[];
  sheetsProcessed?: string[];
  skippedSheets?: string[];
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[`"'']/g, "")
    .replace(/[\s_-]+/g, "");
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function buildProductNameIndex(products: Array<{ id: string; name: string }>): {
  exact: Map<string, string>;
  loose: Map<string, string | null>;
} {
  const exact = new Map<string, string>();
  const loose = new Map<string, string | null>();
  for (const product of products) {
    const exactKey = normalizeProductName(product.name, false);
    if (exactKey && !exact.has(exactKey)) exact.set(exactKey, product.id);

    const looseKey = normalizeProductName(product.name, true);
    if (!looseKey) continue;
    if (!loose.has(looseKey)) {
      loose.set(looseKey, product.id);
    } else if (loose.get(looseKey) !== product.id) {
      loose.set(looseKey, null); // ambiguous after stripping parentheses
    }
  }
  return { exact, loose };
}

@Injectable()
export class BomImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bomService: BomService,
  ) {}

  parseFile(buffer: Buffer): ParsedBomFile {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    if (workbook.SheetNames.length === 0) {
      throw new BadRequestException("BOM file is empty");
    }

    if (isSuprexWorkbook(workbook)) {
      const suprex = parseSuprexWorkbook(workbook);
      return {
        format: "suprex",
        rows: suprex.rows.map((row) => ({
          rowNumber: row.rowNumber,
          sheetName: row.sheetName,
          kitSkuRaw: row.kitSkuRaw,
          kitSku: row.kitSku,
          kitName: row.kitName,
          componentSkuRaw: row.componentSkuRaw,
          componentSku: row.componentSku,
          componentName: row.componentName,
          qtyPerKit: row.qtyPerKit,
          scrapPct: row.scrapPct,
        })),
        rowErrors: suprex.rowErrors.map((error) => ({
          rowNumber: error.rowNumber,
          sheetName: error.sheetName,
          kitSku: error.kitSku,
          componentSku: error.componentSku,
          reason: error.reason,
        })),
        sheetsProcessed: suprex.sheetsProcessed,
        skippedSheets: suprex.skippedSheets,
      };
    }

    return this.parseFlatWorkbook(workbook);
  }

  private parseFlatWorkbook(workbook: XLSX.WorkBook): ParsedBomFile {
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
        componentName: null,
        qtyPerKit: qtyParsed,
        scrapPct,
      });
    }

    return {
      format: "flat",
      rows: parsedRows,
      rowErrors,
      sheetsProcessed: [sheetName],
    };
  }

  async importFile(fileBuffer: Buffer) {
    const { format, rows, rowErrors, sheetsProcessed, skippedSheets } = this.parseFile(fileBuffer);
    if (rows.length === 0) {
      throw new BadRequestException("No valid BOM rows found");
    }

    // Kits resolve from the sales catalog (non-PART products, Bitrix-style SKUs supported).
    // Components/packaging are PART master data — not catalog items — and are auto-created on miss.
    const products = await this.prisma.product.findMany({
      select: { id: true, sku: true, name: true, isActive: true, kind: true, showOnStore: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const skuIndex = buildStockSkuIndex(products);
    const takenSkus = new Set(products.map((product) => product.sku));

    // Name lookup only among parts (packaging must not resolve to sellable kits).
    const nameIndex = buildProductNameIndex(
      products.filter(
        (product) =>
          product.isActive &&
          (product.kind === ProductKind.PART || product.kind === ProductKind.OTHER),
      ),
    );

    const resolveCatalogKitId = (sku: string): string | undefined => {
      const hit = resolveStockSkuToProduct(sku, skuIndex);
      if (!hit) return undefined;
      const product = productById.get(hit.id);
      if (!product || product.kind === ProductKind.PART) return undefined;
      return hit.id;
    };

    const registerName = (product: { id: string; name: string }) => {
      const exactKey = normalizeProductName(product.name, false);
      if (exactKey && !nameIndex.exact.has(exactKey)) nameIndex.exact.set(exactKey, product.id);
      const looseKey = normalizeProductName(product.name, true);
      if (!looseKey) return;
      if (!nameIndex.loose.has(looseKey)) nameIndex.loose.set(looseKey, product.id);
      else if (nameIndex.loose.get(looseKey) !== product.id) nameIndex.loose.set(looseKey, null);
    };

    const markAsPartOutsideCatalog = async (productId: string) => {
      const current = productById.get(productId);
      if (!current || current.kind === ProductKind.KIT) return;
      if (current.kind === ProductKind.PART && !current.showOnStore) return;
      const updated = await this.prisma.product.update({
        where: { id: productId },
        data: { kind: ProductKind.PART, showOnStore: false },
        select: { id: true, sku: true, name: true, isActive: true, kind: true, showOnStore: true },
      });
      productById.set(updated.id, updated);
    };

    const createdParts: Array<{ sku: string; name: string; id: string }> = [];

    const ensureComponentProductId = async (
      row: ParsedBomRow,
    ): Promise<{ productId?: string; ambiguous?: boolean; created?: boolean }> => {
      const trySku = (sku: string): string | undefined => {
        const hit = resolveStockSkuToProduct(sku, skuIndex);
        if (!hit) return undefined;
        const product = productById.get(hit.id);
        // Never attach a sellable kit as a BOM component — parts are separate master data.
        if (!product || product.kind === ProductKind.KIT) return undefined;
        return hit.id;
      };

      let productId =
        trySku(row.componentSku) ??
        (row.componentSkuRaw !== row.componentSku ? trySku(row.componentSkuRaw) : undefined);

      if (!productId) {
        const lookupName = row.componentName ?? row.componentSkuRaw;
        if (lookupName) {
          const exactId = nameIndex.exact.get(normalizeProductName(lookupName, false));
          if (exactId) productId = exactId;
          else {
            const looseId = nameIndex.loose.get(normalizeProductName(lookupName, true));
            if (looseId === null) return { ambiguous: true };
            if (looseId) productId = looseId;
          }
        }
      }

      if (productId) {
        await markAsPartOutsideCatalog(productId);
        return { productId };
      }

      const displayName = buildPartDisplayName(row);
      if (!displayName) return {};

      const preferredSku = row.componentName
        ? buildPackagingPartSku(displayName)
        : buildArticlePartSku(row.componentSku || row.componentSkuRaw);
      const sku = uniquifyPartSku(preferredSku, displayName, takenSkus);

      const created = await this.prisma.product.create({
        data: {
          sku,
          name: displayName,
          unit: "pcs",
          basePrice: 0,
          stock: 0,
          kind: ProductKind.PART,
          isActive: true,
          showOnStore: false,
        },
        select: { id: true, sku: true, name: true, isActive: true, kind: true, showOnStore: true },
      });

      takenSkus.add(created.sku);
      productById.set(created.id, created);
      registerProductInStockIndex(skuIndex, created);
      registerName(created);
      createdParts.push({ id: created.id, sku: created.sku, name: created.name });
      return { productId: created.id, created: true };
    };

    const grouped = new Map<string, ParsedBomRow[]>();
    for (const row of rows) {
      const current = grouped.get(row.kitSku) ?? [];
      current.push(row);
      grouped.set(row.kitSku, current);
    }

    const unresolvedKitSku = new Set<string>();
    const unresolvedComponentSku = new Set<string>();
    const skippedKits: Array<{ kitSku: string; reason: string; unresolvedComponents: string[] }> = [];
    const importedKits: Array<{ kitSku: string; kitName: string | null; revision: number; lines: number }> = [];
    let importedLineCount = 0;

    for (const [kitSku, kitRows] of grouped.entries()) {
      const kitProductId = resolveCatalogKitId(kitSku);
      if (!kitProductId) {
        unresolvedKitSku.add(kitSku);
        for (const row of kitRows) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            sheetName: row.sheetName,
            kitSku,
            componentSku: row.componentSkuRaw,
            reason: "Kit SKU not found in catalog",
          });
        }
        skippedKits.push({
          kitSku,
          reason: "Kit SKU not found in catalog",
          unresolvedComponents: [],
        });
        continue;
      }

      const componentIds = new Set<string>();
      const duplicateComponents = new Set<string>();
      const bomLines: BomLineInput[] = [];
      const kitUnresolved: string[] = [];
      let hasErrors = false;

      for (const row of kitRows) {
        const resolved = await ensureComponentProductId(row);
        if (resolved.ambiguous) {
          unresolvedComponentSku.add(row.componentSkuRaw);
          kitUnresolved.push(row.componentSkuRaw);
          rowErrors.push({
            rowNumber: row.rowNumber,
            sheetName: row.sheetName,
            kitSku,
            componentSku: row.componentSkuRaw,
            reason: "Ambiguous component name among existing parts",
          });
          hasErrors = true;
          continue;
        }
        const componentProductId = resolved.productId;
        if (!componentProductId) {
          unresolvedComponentSku.add(row.componentSkuRaw);
          kitUnresolved.push(row.componentSkuRaw);
          rowErrors.push({
            rowNumber: row.rowNumber,
            sheetName: row.sheetName,
            kitSku,
            componentSku: row.componentSkuRaw,
            reason: "Component identity is empty",
          });
          hasErrors = true;
          continue;
        }

        if (componentIds.has(componentProductId)) {
          duplicateComponents.add(row.componentSkuRaw);
          rowErrors.push({
            rowNumber: row.rowNumber,
            sheetName: row.sheetName,
            kitSku,
            componentSku: row.componentSkuRaw,
            reason: "Duplicate component within the same kit",
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
        skippedKits.push({
          kitSku,
          reason:
            bomLines.length === 0 && !hasErrors
              ? "No valid BOM lines"
              : "Skipped: unresolved or duplicate components (previous active BOM kept)",
          unresolvedComponents: kitUnresolved,
        });
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
      format,
      sheetsProcessed: sheetsProcessed ?? [],
      skippedSheets: skippedSheets ?? [],
      parsedRowCount: rows.length,
      importedKitCount: importedKits.length,
      importedLineCount,
      importedKits,
      createdPartCount: createdParts.length,
      createdParts: createdParts.slice(0, 100),
      skippedKitCount: skippedKits.length,
      skippedKits: skippedKits.slice(0, 100),
      unresolvedKitSku: Array.from(unresolvedKitSku),
      unresolvedComponentSku: Array.from(unresolvedComponentSku),
      rowErrors,
    };
  }
}
