import { Injectable, Logger } from "@nestjs/common";
import {
  InventorySnapshotSource,
  InventorySnapshotStatus,
  ProductKind,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { officeToolsListAllPages, officeToolsListRems } from "./office-tools-client";
import { OfficeToolsConfigService } from "./office-tools-config.service";
import { OFFICE_TOOLS_ENTITY, OFFICE_TOOLS_INTEGRATION } from "./office-tools.constants";
import type { OfficeToolsRem } from "./office-tools.types";
import {
  normalizeOtSerial,
  otSerialKey,
  toFloat,
  toInt,
} from "./office-tools.util";

@Injectable()
export class OfficeToolsStockService {
  private readonly logger = new Logger(OfficeToolsStockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OfficeToolsConfigService,
  ) {}

  async syncRems(): Promise<{
    rows: number;
    products: number;
    warehouses: number;
    serials: number;
  }> {
    const cfg = await this.config.requireActiveConfig();
    const ctx = this.config.requestContext(cfg);
    const remRows = await officeToolsListAllPages((offset, limit) =>
      officeToolsListRems(ctx, {
        SELECT: [],
        FILTER: {},
        ORDER: { ProdID: "ASC" },
        LIMIT: limit,
        OFFSET: offset,
      }),
    );

    const warehouseByStockId = new Map<number, string>();
    const productByProdId = new Map<number, string>();
    const touchedProductIds = new Set<string>();

    for (const row of remRows) {
      const stockId = toInt(row.StockID);
      if (stockId == null) continue;
      if (!warehouseByStockId.has(stockId)) {
        const whId = await this.ensureWarehouse(stockId, row);
        warehouseByStockId.set(stockId, whId);
      }
      const prodId = toInt(row.ProdID);
      if (prodId == null) continue;
      if (!productByProdId.has(prodId)) {
        const productId = await this.ensureProduct(prodId, row);
        if (productId) productByProdId.set(prodId, productId);
      }
    }

    await this.prisma.officeToolsStockSerial.deleteMany({});

    const serialCreates: Array<{
      productId: string;
      warehouseId: string;
      prodId: number;
      stockId: number;
      serial: string;
      serialKey: string;
      qty: number;
      article: string | null;
      prodName: string | null;
    }> = [];

    const qtyByProductWarehouse = new Map<string, number>();
    const snapshotLines: Array<{
      skuRaw: string;
      qty: number;
      productId: string;
      warehouseId: string;
      warehouseRaw: string;
    }> = [];

    for (const row of remRows) {
      const stockId = toInt(row.StockID);
      const prodId = toInt(row.ProdID);
      if (stockId == null || prodId == null) continue;
      const warehouseId = warehouseByStockId.get(stockId);
      const productId = productByProdId.get(prodId);
      if (!warehouseId || !productId) continue;

      touchedProductIds.add(productId);
      const serial = normalizeOtSerial(row.SeriesNomenclatures);
      const qty = Math.max(0, Math.floor(toFloat(row.Qty)));
      const article = row.Article1?.trim() || null;
      serialCreates.push({
        productId,
        warehouseId,
        prodId,
        stockId,
        serial,
        serialKey: otSerialKey(serial),
        qty,
        article,
        prodName: row.ProdName?.trim() || null,
      });

      const key = `${productId}|${warehouseId}`;
      qtyByProductWarehouse.set(key, (qtyByProductWarehouse.get(key) ?? 0) + qty);
    }

    // Deduplicate unique(productId, warehouseId, serialKey) by summing qty
    const deduped = new Map<string, (typeof serialCreates)[number]>();
    for (const row of serialCreates) {
      const k = `${row.productId}|${row.warehouseId}|${row.serialKey}`;
      const prev = deduped.get(k);
      if (prev) prev.qty += row.qty;
      else deduped.set(k, { ...row });
    }

    const serialRows = [...deduped.values()];
    const chunkSize = 200;
    for (let i = 0; i < serialRows.length; i += chunkSize) {
      await this.prisma.officeToolsStockSerial.createMany({
        data: serialRows.slice(i, i + chunkSize),
      });
    }

    for (const [key, qty] of qtyByProductWarehouse) {
      const [productId, warehouseId] = key.split("|");
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { sku: true },
      });
      if (!product) continue;
      const wh = await this.prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { name: true },
      });
      snapshotLines.push({
        skuRaw: product.sku,
        qty,
        productId,
        warehouseId,
        warehouseRaw: wh?.name ?? warehouseId,
      });
    }

    for (const productId of touchedProductIds) {
      await this.prisma.productWarehouseStock.deleteMany({ where: { productId } });
    }
    for (const [key, qty] of qtyByProductWarehouse) {
      const [productId, warehouseId] = key.split("|");
      await this.prisma.productWarehouseStock.create({
        data: { productId, warehouseId, qty },
      });
    }
    for (const productId of touchedProductIds) {
      const rows = await this.prisma.productWarehouseStock.findMany({
        where: { productId },
        select: { qty: true },
      });
      const total = rows.reduce((s, r) => s + r.qty, 0);
      await this.prisma.product.update({
        where: { id: productId },
        data: { stock: total },
      });
    }

    const importedById =
      cfg.configuredByUserId ||
      (
        await this.prisma.user.findFirst({
          where: { role: "ADMIN" },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        })
      )?.id;

    if (importedById && snapshotLines.length) {
      const snapshot = await this.prisma.inventorySnapshot.create({
        data: {
          source: InventorySnapshotSource.OFFICE_TOOLS,
          status: InventorySnapshotStatus.STAGED,
          importedById,
          note: "Office Tools rem/list",
          lines: {
            create: snapshotLines.map((l) => ({
              skuRaw: l.skuRaw,
              qty: l.qty,
              productId: l.productId,
              warehouseId: l.warehouseId,
              warehouseRaw: l.warehouseRaw,
            })),
          },
        },
      });
      await this.prisma.$transaction(async (tx) => {
        await tx.inventorySnapshot.updateMany({
          where: {
            id: { not: snapshot.id },
            status: InventorySnapshotStatus.POSTED,
          },
          data: { status: InventorySnapshotStatus.VOID },
        });
        await tx.inventorySnapshot.update({
          where: { id: snapshot.id },
          data: {
            status: InventorySnapshotStatus.POSTED,
            postedAt: new Date(),
            postedById: importedById,
          },
        });
      });
    }

    await this.prisma.integrationSyncState.upsert({
      where: {
        integration_entity: {
          integration: OFFICE_TOOLS_INTEGRATION,
          entity: "rems",
        },
      },
      create: {
        integration: OFFICE_TOOLS_INTEGRATION,
        entity: "rems",
        lastSyncAt: new Date(),
        lastRunAt: new Date(),
        status: "ok",
        lastCursor: String(remRows.length),
      },
      update: {
        lastSyncAt: new Date(),
        lastRunAt: new Date(),
        status: "ok",
        lastCursor: String(remRows.length),
        error: null,
      },
    });

    this.logger.log(
      `Office Tools rem sync: rows=${remRows.length} serials=${serialRows.length} products=${touchedProductIds.size}`,
    );

    return {
      rows: remRows.length,
      products: touchedProductIds.size,
      warehouses: warehouseByStockId.size,
      serials: serialRows.length,
    };
  }

  private async ensureWarehouse(stockId: number, row: OfficeToolsRem): Promise<string> {
    const existing = await this.prisma.officeToolsLink.findUnique({
      where: {
        entityType_externalId: {
          entityType: OFFICE_TOOLS_ENTITY.WAREHOUSE,
          externalId: String(stockId),
        },
      },
    });
    if (existing) return existing.entityId;

    const name = row.StockName?.trim() || `Office Tools #${stockId}`;
    const warehouse = await this.prisma.warehouse.create({
      data: {
        name,
        sortOrder: 1000 + stockId,
        externalCode: null,
      },
    });
    await this.prisma.officeToolsLink.create({
      data: {
        entityType: OFFICE_TOOLS_ENTITY.WAREHOUSE,
        entityId: warehouse.id,
        externalId: String(stockId),
        externalCode: null,
        lastSyncedAt: new Date(),
      },
    });
    return warehouse.id;
  }

  private async ensureProduct(prodId: number, row: OfficeToolsRem): Promise<string | null> {
    const existing = await this.prisma.officeToolsLink.findUnique({
      where: {
        entityType_externalId: {
          entityType: OFFICE_TOOLS_ENTITY.PRODUCT,
          externalId: String(prodId),
        },
      },
    });
    if (existing) return existing.entityId;

    const article = row.Article1?.trim() || null;
    const barcode = row.ProdBarCode?.trim() || null;
    const candidates = [article, barcode, String(prodId)].filter(Boolean) as string[];

    let product =
      (await this.prisma.product.findFirst({
        where: {
          OR: [
            ...(article ? [{ sku: article }] : []),
            ...(barcode ? [{ sku: barcode }] : []),
            { externalCode: String(prodId) },
            ...(article ? [{ externalCode: article }] : []),
          ],
        },
        select: { id: true, externalCode: true },
      })) ?? null;

    if (!product) {
      const sku = article || barcode || `OT-${prodId}`;
      product = await this.prisma.product.create({
        data: {
          sku,
          name: row.ProdName?.trim() || sku,
          unit: "шт",
          basePrice: 0,
          stock: 0,
          kind: ProductKind.OTHER,
          isActive: true,
          showOnStore: false,
          externalCode: null,
        },
        select: { id: true, externalCode: true },
      });
    }

    await this.prisma.officeToolsLink.upsert({
      where: {
        entityType_entityId: {
          entityType: OFFICE_TOOLS_ENTITY.PRODUCT,
          entityId: product.id,
        },
      },
      create: {
        entityType: OFFICE_TOOLS_ENTITY.PRODUCT,
        entityId: product.id,
        externalId: String(prodId),
        externalCode: article ?? candidates[0] ?? null,
        lastSyncedAt: new Date(),
      },
      update: {
        externalId: String(prodId),
        lastSyncedAt: new Date(),
        lastError: null,
      },
    });

    return product.id;
  }
}
