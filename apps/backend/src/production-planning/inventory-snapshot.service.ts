import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  InventorySnapshotSource,
  InventorySnapshotStatus,
  ProductKind,
} from "@prisma/client";
import * as XLSX from "xlsx";
import { PrismaService } from "../prisma/prisma.service";
import {
  isOneCStockPivotSheet,
  normalizeSnapshotSku,
  parseOneCStockPivotSheet,
  parseSnapshotQty,
} from "./inventory-snapshot-1c.util";

export { normalizeSnapshotSku } from "./inventory-snapshot-1c.util";

type SnapshotEntry = {
  skuRaw: string;
  skuNormalized: string;
  qty: number;
  warehouseRaw?: string | null;
};

function normalizeHeader(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * Keep only rows whose SKU is a planning kit or an active-BOM component (semi-finished).
 * Irrelevant 1C stock lines are dropped.
 */
export function filterPlanningRelevantEntries<T extends { skuNormalized: string }>(
  entries: T[],
  relevantSkus: Set<string>,
): { kept: T[]; skippedIrrelevant: number } {
  const kept: T[] = [];
  let skippedIrrelevant = 0;
  for (const entry of entries) {
    if (relevantSkus.has(entry.skuNormalized)) {
      kept.push(entry);
    } else {
      skippedIrrelevant += 1;
    }
  }
  return { kept, skippedIrrelevant };
}

@Injectable()
export class InventorySnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  parseFile(buffer: Buffer): SnapshotEntry[] {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const first = wb.SheetNames[0];
    if (!first) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[first], {
      header: 1,
      defval: "",
      raw: true,
    }) as unknown[][];
    if (rows.length < 2) return [];

    if (isOneCStockPivotSheet(rows)) {
      return parseOneCStockPivotSheet(rows);
    }

    return this.parseFlatSheet(rows);
  }

  private parseFlatSheet(rows: unknown[][]): SnapshotEntry[] {
    const headers = rows[0].map(normalizeHeader);
    const skuIdx = headers.findIndex(
      (h) =>
        h === "артикул" ||
        h === "sku" ||
        h === "article" ||
        h.includes("номенклатура.артикул"),
    );
    const qtyIdx = headers.findIndex(
      (h) =>
        h === "остаток" ||
        h === "qty" ||
        h === "quantity" ||
        h === "stock" ||
        h.includes("кількість") ||
        h.includes("количество"),
    );
    const whIdx = headers.findIndex(
      (h) =>
        h === "склад" ||
        h === "warehouse" ||
        h === "warehousecode" ||
        h === "warehouse_code" ||
        h === "warehouse name",
    );
    if (skuIdx < 0 || qtyIdx < 0) {
      throw new BadRequestException(
        "Expected 1C stock report (SKU × warehouses) or flat columns: SKU + qty/stock",
      );
    }
    const out: SnapshotEntry[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const skuRaw = String(row[skuIdx] ?? "").trim();
      const skuNormalized = normalizeSnapshotSku(skuRaw);
      if (!skuNormalized) continue;
      const qty = parseSnapshotQty(row[qtyIdx]);
      if (qty <= 0) continue;
      const warehouseRaw = whIdx >= 0 ? String(row[whIdx] ?? "").trim() || null : null;
      out.push({ skuRaw, skuNormalized, qty, warehouseRaw });
    }
    return out;
  }

  /**
   * SKUs used by planning: active kits + components of active BOMs (полуфабрикаты).
   */
  async getPlanningRelevantSkus(): Promise<Set<string>> {
    const [kits, bomLines] = await Promise.all([
      this.prisma.product.findMany({
        where: { kind: ProductKind.KIT, isActive: true },
        select: { sku: true, externalCode: true },
      }),
      this.prisma.kitBomLine.findMany({
        where: { bom: { isActive: true } },
        select: { component: { select: { sku: true, externalCode: true } } },
      }),
    ]);
    const relevant = new Set<string>();
    const add = (sku: string | null | undefined, externalCode?: string | null) => {
      const normalizedSku = sku ? normalizeSnapshotSku(sku) : "";
      if (normalizedSku) relevant.add(normalizedSku);
      const code = externalCode?.trim();
      if (code) relevant.add(code);
    };
    for (const kit of kits) add(kit.sku, kit.externalCode);
    for (const line of bomLines) add(line.component.sku, line.component.externalCode);
    return relevant;
  }

  async createStagedFromFile(params: {
    fileBuffer: Buffer;
    importedById: string;
    note?: string;
  }) {
    const allEntries = this.parseFile(params.fileBuffer);
    if (allEntries.length === 0) throw new BadRequestException("No valid rows found");

    const relevantSkus = await this.getPlanningRelevantSkus();
    if (relevantSkus.size === 0) {
      throw new BadRequestException(
        "No planning SKUs configured. Import kit BOMs first (kits + component parts).",
      );
    }

    const { kept: filteredEntries, skippedIrrelevant } = filterPlanningRelevantEntries(
      allEntries,
      relevantSkus,
    );
    if (filteredEntries.length === 0) {
      throw new BadRequestException(
        `File has ${allEntries.length} rows, but none match planning kits or BOM components. Check BOM and product kinds.`,
      );
    }

    // Merge duplicate (sku, warehouse) cells so availability sums stay correct.
    const merged = new Map<string, SnapshotEntry>();
    for (const entry of filteredEntries) {
      const key = `${entry.skuNormalized}||${entry.warehouseRaw?.trim() ?? ""}`;
      const prev = merged.get(key);
      if (prev) {
        prev.qty += entry.qty;
      } else {
        merged.set(key, {
          ...entry,
          warehouseRaw: entry.warehouseRaw?.trim() || null,
        });
      }
    }
    const entries = Array.from(merged.values());

    const skuSet = Array.from(new Set(entries.map((e) => e.skuNormalized)));
    const products = await this.prisma.product.findMany({
      where: {
        OR: [{ sku: { in: skuSet } }, { externalCode: { in: skuSet } }],
      },
      select: { id: true, sku: true, externalCode: true },
    });
    const productBySku = new Map<string, string>();
    const productByExternalCode = new Map<string, string>();
    for (const p of products) {
      productBySku.set(normalizeSnapshotSku(p.sku), p.id);
      if (p.externalCode) productByExternalCode.set(p.externalCode.trim(), p.id);
    }

    const whRawSet = Array.from(
      new Set(
        entries
          .map((e) => e.warehouseRaw?.trim() ?? "")
          .filter((v) => v.length > 0),
      ),
    );
    const warehouses =
      whRawSet.length > 0
        ? await this.prisma.warehouse.findMany({
            where: {
              OR: [{ name: { in: whRawSet } }, { externalCode: { in: whRawSet } }],
            },
            select: { id: true, name: true, externalCode: true },
          })
        : [];
    const warehouseByRaw = new Map<string, string>();
    for (const wh of warehouses) {
      warehouseByRaw.set(wh.name.trim(), wh.id);
      if (wh.externalCode) warehouseByRaw.set(wh.externalCode.trim(), wh.id);
    }

    const snapshot = await this.prisma.inventorySnapshot.create({
      data: {
        source: InventorySnapshotSource.FILE_UPLOAD,
        status: InventorySnapshotStatus.STAGED,
        importedById: params.importedById,
        note: params.note ?? null,
        lines: {
          create: entries.map((e) => {
            const warehouseRaw = e.warehouseRaw?.trim() || null;
            return {
              skuRaw: e.skuNormalized,
              qty: e.qty,
              productId: productBySku.get(e.skuNormalized) ?? productByExternalCode.get(e.skuNormalized) ?? null,
              warehouseRaw,
              warehouseId: warehouseRaw ? (warehouseByRaw.get(warehouseRaw) ?? null) : null,
            };
          }),
        },
      },
      include: { lines: true },
    });

    const unresolvedSku = entries
      .filter(
        (e) =>
          !productBySku.has(e.skuNormalized) && !productByExternalCode.has(e.skuNormalized),
      )
      .map((e) => e.skuNormalized);
    const unresolvedWarehouses = entries
      .filter((e) => {
        const wh = e.warehouseRaw?.trim();
        return Boolean(wh && !warehouseByRaw.has(wh));
      })
      .map((e) => e.warehouseRaw!.trim());

    return {
      snapshot,
      rowsInFile: allEntries.length,
      keptRows: entries.length,
      skippedIrrelevant,
      relevantSkuCount: relevantSkus.size,
      unresolvedSku: Array.from(new Set(unresolvedSku)),
      unresolvedWarehouses: Array.from(new Set(unresolvedWarehouses)),
    };
  }

  async list(limit = 20) {
    return this.prisma.inventorySnapshot.findMany({
      orderBy: { importedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
      include: { _count: { select: { lines: true } } },
    });
  }

  async latestPosted() {
    return this.prisma.inventorySnapshot.findFirst({
      where: { status: InventorySnapshotStatus.POSTED },
      orderBy: { postedAt: "desc" },
      include: { lines: true },
    });
  }

  async postSnapshot(id: string, userId: string) {
    const snapshot = await this.prisma.inventorySnapshot.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!snapshot) throw new NotFoundException("Snapshot not found");
    if (snapshot.status === InventorySnapshotStatus.VOID) {
      throw new BadRequestException("Cannot post VOID snapshot");
    }
    if (snapshot.status === InventorySnapshotStatus.POSTED) return snapshot;

    return this.prisma.inventorySnapshot.update({
      where: { id },
      data: {
        status: InventorySnapshotStatus.POSTED,
        postedAt: new Date(),
        postedById: userId,
      },
      include: { lines: true },
    });
  }
}
