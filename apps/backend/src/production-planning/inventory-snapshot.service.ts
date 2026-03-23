import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InventorySnapshotSource, InventorySnapshotStatus } from "@prisma/client";
import * as XLSX from "xlsx";
import { PrismaService } from "../prisma/prisma.service";

type SnapshotEntry = {
  skuRaw: string;
  qty: number;
  warehouseRaw?: string | null;
};

function parseNumber(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return Math.floor(v);
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    if (!Number.isNaN(n)) return Math.floor(n);
  }
  return 0;
}

function normalizeHeader(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
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
      raw: false,
    }) as unknown[][];
    if (rows.length < 2) return [];
    const headers = rows[0].map(normalizeHeader);
    const skuIdx = headers.findIndex((h) => h === "артикул" || h === "sku" || h === "article");
    const qtyIdx = headers.findIndex(
      (h) => h === "остаток" || h === "qty" || h === "quantity" || h === "stock",
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
      throw new BadRequestException("Expected columns: SKU + qty/stock");
    }
    const out: SnapshotEntry[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const skuRaw = String(row[skuIdx] ?? "").trim();
      if (!skuRaw) continue;
      const qty = Math.max(0, parseNumber(row[qtyIdx]));
      const warehouseRaw = whIdx >= 0 ? String(row[whIdx] ?? "").trim() : null;
      out.push({ skuRaw, qty, warehouseRaw });
    }
    return out;
  }

  async createStagedFromFile(params: {
    fileBuffer: Buffer;
    importedById: string;
    note?: string;
  }) {
    const entries = this.parseFile(params.fileBuffer);
    if (entries.length === 0) throw new BadRequestException("No valid rows found");

    const skuSet = Array.from(new Set(entries.map((e) => e.skuRaw)));
    const products = await this.prisma.product.findMany({
      where: { sku: { in: skuSet } },
      select: { id: true, sku: true },
    });
    const productBySku = new Map(products.map((p) => [p.sku, p.id]));

    const whRawSet = Array.from(
      new Set(
        entries
          .map((e) => e.warehouseRaw?.trim() ?? "")
          .filter((v) => v.length > 0),
      ),
    );
    const warehouses = await this.prisma.warehouse.findMany({
      where: {
        OR: [
          { name: { in: whRawSet } },
          { externalCode: { in: whRawSet } },
        ],
      },
      select: { id: true, name: true, externalCode: true },
    });
    const warehouseByRaw = new Map<string, string>();
    for (const wh of warehouses) {
      warehouseByRaw.set(wh.name, wh.id);
      if (wh.externalCode) warehouseByRaw.set(wh.externalCode, wh.id);
    }

    const snapshot = await this.prisma.inventorySnapshot.create({
      data: {
        source: InventorySnapshotSource.FILE_UPLOAD,
        status: InventorySnapshotStatus.STAGED,
        importedById: params.importedById,
        note: params.note ?? null,
        lines: {
          create: entries.map((e) => ({
            skuRaw: e.skuRaw,
            qty: e.qty,
            productId: productBySku.get(e.skuRaw) ?? null,
            warehouseRaw: e.warehouseRaw ?? null,
            warehouseId: e.warehouseRaw ? (warehouseByRaw.get(e.warehouseRaw) ?? null) : null,
          })),
        },
      },
      include: { lines: true },
    });

    const unresolvedSku = entries.filter((e) => !productBySku.has(e.skuRaw)).map((e) => e.skuRaw);
    const unresolvedWarehouses = entries
      .filter((e) => e.warehouseRaw && !warehouseByRaw.has(e.warehouseRaw))
      .map((e) => e.warehouseRaw as string);
    return {
      snapshot,
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

