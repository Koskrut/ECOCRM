import { CustomFieldEntityType, Prisma, ReservationHardness, ReservationStatus } from "@prisma/client";
import { BadRequestException, ConflictException, Injectable, Optional } from "@nestjs/common";
import { WorkflowDomainEmitterService } from "../workflows/workflow-domain-emitter.service";
import type { Pagination } from "../common/pagination";
import type { Product } from "./product.entity";
import { PrismaService } from "../prisma/prisma.service";
import { ProductImageStore } from "./product-image.store";
import {
  buildStockSkuIndex,
  resolveStockSkuToProduct,
  type StockSkuIndex,
} from "./stock-sku-normalizer";

export type StockByWarehouseItem = {
  warehouseId: string;
  warehouseName: string;
  qty: number;
  /** Warehouse physical qty minus active hard reservations in this warehouse. */
  availableQty: number;
};

type ProductListItem = Pick<
  Product,
  | "id"
  | "sku"
  | "name"
  | "unit"
  | "basePrice"
  | "stock"
  | "showOnStore"
  | "primaryImageUrl"
  | "primaryImageId"
  | "characteristics"
>;

type ProductListItemWithAvailability = ProductListItem & {
  /** Physical stock minus active hard reservations. */
  availableStock: number;
};

export type ProductListItemWithStockByWarehouse = ProductListItemWithAvailability & {
  stockByWarehouse?: StockByWarehouseItem[];
  /** Present when listing catalog with search (includes inactive matches). */
  isActive?: boolean;
};

type ProductListResult = {
  items: ProductListItemWithAvailability[];
  total: number;
};

export type ProductListResultWithStockByWarehouse = {
  items: ProductListItemWithStockByWarehouse[];
  total: number;
};

type PrismaProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: number;
  stock: number;
  isActive: boolean;
  showOnStore: boolean;
  characteristics: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StockUpdateEntry = { sku: string; stock: number; name?: string; basePrice?: number };

export type StockByWarehouseEntry = { sku: string; warehouseId: string; qty: number };

export type BulkStockUpdateResult = {
  updated: number;
  created: number;
  notFound: string[];
};

export type CreateProductData = {
  sku: string;
  name?: string;
  unit?: string;
  basePrice?: number;
  showOnStore?: boolean;
};

export type UpdateProductData = {
  sku?: string;
  name?: string;
  unit?: string;
  basePrice?: number;
  stock?: number;
};

export type WarehouseStockUpdateInput = {
  warehouseId: string;
  qty: number;
};

function parseCharacteristicsJson(raw: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

@Injectable()
export class ProductStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productImageStore: ProductImageStore,
    @Optional() private readonly workflowEmitter?: WorkflowDomainEmitterService,
  ) {}

  private toEntity(
    row: PrismaProduct,
    primary?: { url: string; imageId: string } | null,
  ): Product {
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      basePrice: row.basePrice,
      stock: row.stock,
      isActive: row.isActive,
      showOnStore: row.showOnStore,
      characteristics: parseCharacteristicsJson(row.characteristics),
      primaryImageUrl: primary?.url ?? null,
      primaryImageId: primary?.imageId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async enrichWithPrimaryImage<T extends { id: string }>(
    items: T[],
  ): Promise<(T & { primaryImageUrl: string | null; primaryImageId: string | null })[]> {
    if (items.length === 0) return [];
    const ids = items.map((i) => i.id);
    const imageMap = await this.productImageStore.getPrimaryImageIdsByProductIds(ids);
    return items.map((item) => ({
      ...item,
      primaryImageUrl: imageMap.get(item.id)?.url ?? null,
      primaryImageId: imageMap.get(item.id)?.imageId ?? null,
    }));
  }

  private async getActiveHardReservationsByProductIds(
    productIds: string[],
  ): Promise<Map<string, number>> {
    const ids = Array.from(new Set(productIds.filter(Boolean)));
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.materialReservation.groupBy({
      by: ["productId"],
      where: {
        productId: { in: ids },
        status: ReservationStatus.ACTIVE,
        hardness: ReservationHardness.HARD,
      },
      _sum: { qty: true },
    });
    return new Map(rows.map((r) => [r.productId, r._sum.qty ?? 0]));
  }

  private attachAvailableStock<T extends { id: string; stock: number }>(
    items: T[],
    hardReservedByProductId: Map<string, number>,
  ): Array<T & { availableStock: number }> {
    return items.map((item) => ({
      ...item,
      availableStock: Math.max(0, Number(item.stock ?? 0) - (hardReservedByProductId.get(item.id) ?? 0)),
    }));
  }

  public async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    if (!row) return null;
    const primary = await this.productImageStore.findPrimaryByProductId(id);
    return this.toEntity(
      row as PrismaProduct,
      primary ? { url: primary.url, imageId: primary.id } : null,
    );
  }

  public async findBySku(sku: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { sku: sku.trim() } });
    if (!row) return null;
    const primary = await this.productImageStore.findPrimaryByProductId(row.id);
    return this.toEntity(
      row as PrismaProduct,
      primary ? { url: primary.url, imageId: primary.id } : null,
    );
  }

  public async create(data: CreateProductData): Promise<Product> {
    const skuTrim = data.sku?.trim();
    if (!skuTrim) {
      throw new BadRequestException("Артикул обязателен");
    }
    const name = data.name?.trim() || skuTrim;
    const unit = data.unit?.trim() || "pcs";
    const basePrice =
      data.basePrice !== undefined && data.basePrice !== null && !Number.isNaN(data.basePrice)
        ? Math.max(0, Number(data.basePrice))
        : 0;
    const showOnStore = data.showOnStore ?? true;
    try {
      const row = await this.prisma.product.create({
        data: {
          sku: skuTrim,
          name,
          unit,
          basePrice,
          stock: 0,
          isActive: true,
          showOnStore,
        },
      });
      const product = await this.findById(row.id);
      if (!product) throw new Error("Product not found after create");
      this.workflowEmitter?.emitRecordCreated(CustomFieldEntityType.PRODUCT, product.id, {
        ...product,
        characteristics: product.characteristics ?? undefined,
      });
      return product;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Товар с таким артикулом уже существует");
      }
      throw err;
    }
  }

  public async updateStockBySku(sku: string, stock: number): Promise<boolean> {
    const result = await this.prisma.product.updateMany({
      where: { sku: sku.trim() },
      data: { stock: Math.max(0, Math.floor(stock)) },
    });
    return result.count > 0;
  }

  public async updateStockById(id: string, stock: number): Promise<boolean> {
    const result = await this.prisma.product.updateMany({
      where: { id },
      data: { stock: Math.max(0, Math.floor(stock)) },
    });
    return result.count > 0;
  }

  public async updateBasics(id: string, data: UpdateProductData): Promise<boolean> {
    const update: Prisma.ProductUpdateInput = {};
    if (data.sku !== undefined) {
      const skuTrim = data.sku.trim();
      if (!skuTrim) throw new BadRequestException("Артикул обязателен");
      update.sku = skuTrim;
    }
    if (data.name !== undefined) {
      const nameTrim = data.name.trim();
      if (!nameTrim) throw new BadRequestException("Наименование обязательно");
      update.name = nameTrim;
    }
    if (data.unit !== undefined) {
      const unitTrim = data.unit.trim();
      if (!unitTrim) throw new BadRequestException("Ед. измерения обязательна");
      update.unit = unitTrim;
    }
    if (data.basePrice !== undefined) {
      const n = Number(data.basePrice);
      if (Number.isNaN(n)) throw new BadRequestException("Цена должна быть числом");
      update.basePrice = Math.max(0, n);
    }
    if (data.stock !== undefined) {
      update.stock = Math.max(0, Math.floor(Number(data.stock)));
    }
    if (Object.keys(update).length === 0) return true;
    try {
      const result = await this.prisma.product.updateMany({
        where: { id },
        data: update,
      });
      if (result.count > 0 && this.workflowEmitter) {
        const next = await this.findById(id);
        if (next) {
          this.workflowEmitter.emitRecordUpdated(CustomFieldEntityType.PRODUCT, id, {
            ...next,
            characteristics: next.characteristics ?? undefined,
          });
        }
      }
      return result.count > 0;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Товар с таким артикулом уже существует");
      }
      throw err;
    }
  }

  /** Returns map productId -> stockByWarehouse[]. */
  public async getStocksByWarehouseForProductIds(
    productIds: string[],
  ): Promise<Map<string, StockByWarehouseItem[]>> {
    if (productIds.length === 0) return new Map();
    const [rows, reservations] = await Promise.all([
      this.prisma.productWarehouseStock.findMany({
        where: { productId: { in: productIds } },
        include: { warehouse: { select: { id: true, name: true } } },
      }),
      this.prisma.materialReservation.groupBy({
        by: ["productId", "warehouseId"],
        where: {
          productId: { in: productIds },
          warehouseId: { not: null },
          status: ReservationStatus.ACTIVE,
          hardness: ReservationHardness.HARD,
        },
        _sum: { qty: true },
      }),
    ]);
    const reservedByProductWarehouse = new Map<string, number>();
    for (const r of reservations) {
      if (!r.warehouseId) continue;
      reservedByProductWarehouse.set(
        `${r.productId}:${r.warehouseId}`,
        r._sum.qty ?? 0,
      );
    }
    const map = new Map<string, StockByWarehouseItem[]>();
    for (const r of rows) {
      const list = map.get(r.productId) ?? [];
      const hardReserved = reservedByProductWarehouse.get(`${r.productId}:${r.warehouse.id}`) ?? 0;
      list.push({
        warehouseId: r.warehouse.id,
        warehouseName: r.warehouse.name,
        qty: r.qty,
        availableQty: Math.max(0, r.qty - hardReserved),
      });
      map.set(r.productId, list);
    }
    return map;
  }

  /** Get stock for one product at one warehouse (0 if no row). */
  public async getStockAtWarehouse(productId: string, warehouseId: string): Promise<number> {
    const row = await this.prisma.productWarehouseStock.findUnique({
      where: {
        productId_warehouseId: { productId, warehouseId },
      },
      select: { qty: true },
    });
    return row?.qty ?? 0;
  }

  /** Upsert ProductWarehouseStock and recalc Product.stock as sum across warehouses. */
  public async upsertProductWarehouseStock(
    productId: string,
    warehouseId: string,
    qty: number,
  ): Promise<void> {
    const qtyVal = Math.max(0, Math.floor(qty));
    await this.prisma.productWarehouseStock.upsert({
      where: {
        productId_warehouseId: { productId, warehouseId },
      },
      create: { productId, warehouseId, qty: qtyVal },
      update: { qty: qtyVal },
    });
    await this.recalcProductTotalStock(productId);
  }

  private async recalcProductTotalStock(productId: string): Promise<void> {
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

  private async loadStockSkuIndex(): Promise<StockSkuIndex> {
    const rows = await this.prisma.product.findMany({
      select: { id: true, sku: true },
    });
    return buildStockSkuIndex(rows);
  }

  /**
   * Resolve upload rows to product IDs (exact SKU, then homoglyph-normalized exact match).
   */
  public async prepareBulkWarehouseStock(entries: StockByWarehouseEntry[]): Promise<{
    updates: Array<{ productId: string; warehouseId: string; qty: number }>;
    productIds: Set<string>;
    notFound: string[];
  }> {
    const index = await this.loadStockSkuIndex();
    const notFoundSet = new Set<string>();
    const updateMap = new Map<string, { productId: string; warehouseId: string; qty: number }>();

    for (const { sku, warehouseId, qty } of entries) {
      const skuTrim = sku.trim();
      const whId = warehouseId?.trim();
      if (!skuTrim || !whId) continue;

      const ref = resolveStockSkuToProduct(skuTrim, index);
      if (!ref) {
        notFoundSet.add(skuTrim);
        continue;
      }

      const key = `${ref.id}:${whId}`;
      updateMap.set(key, {
        productId: ref.id,
        warehouseId: whId,
        qty: Math.max(0, Math.floor(qty)),
      });
    }

    const updates = Array.from(updateMap.values());
    const productIds = new Set(updates.map((u) => u.productId));
    return { updates, productIds, notFound: Array.from(notFoundSet) };
  }

  /**
   * For warehouse stock upload overwrite: zero rows in given warehouses for products
   * not present in the upload file (by resolved product id, not raw SKU string).
   */
  public async resetWarehouseStocksExceptProductIds(
    warehouseIds: string[],
    productIds: Set<string>,
  ): Promise<{ affectedProducts: number; affectedRows: number }> {
    const whIds = Array.from(new Set(warehouseIds.map((s) => s.trim()).filter(Boolean)));
    const keepIds = Array.from(productIds).filter(Boolean);
    if (whIds.length === 0) return { affectedProducts: 0, affectedRows: 0 };

    if (keepIds.length === 0) {
      const productIdsAll = await this.prisma.productWarehouseStock.findMany({
        where: { warehouseId: { in: whIds } },
        select: { productId: true },
      });
      const ids = Array.from(new Set(productIdsAll.map((r) => r.productId)));
      const result = await this.prisma.productWarehouseStock.updateMany({
        where: { warehouseId: { in: whIds } },
        data: { qty: 0 },
      });
      for (const productId of ids) await this.recalcProductTotalStock(productId);
      return { affectedProducts: ids.length, affectedRows: result.count };
    }

    const affected = await this.prisma.productWarehouseStock.findMany({
      where: {
        warehouseId: { in: whIds },
        productId: { notIn: keepIds },
      },
      select: { productId: true },
    });
    const affectedProductIds = Array.from(new Set(affected.map((r) => r.productId)));
    const result = await this.prisma.productWarehouseStock.updateMany({
      where: {
        warehouseId: { in: whIds },
        productId: { notIn: keepIds },
      },
      data: { qty: 0 },
    });
    for (const productId of affectedProductIds) {
      await this.recalcProductTotalStock(productId);
    }
    return { affectedProducts: affectedProductIds.length, affectedRows: result.count };
  }

  public async applyBulkWarehouseStock(
    updates: Array<{ productId: string; warehouseId: string; qty: number }>,
  ): Promise<{ updated: number; created: number }> {
    const productIds = new Set<string>();
    let updated = 0;
    for (const { productId, warehouseId, qty } of updates) {
      await this.prisma.productWarehouseStock.upsert({
        where: {
          productId_warehouseId: { productId, warehouseId },
        },
        create: { productId, warehouseId, qty },
        update: { qty },
      });
      productIds.add(productId);
      updated++;
    }
    for (const productId of productIds) {
      await this.recalcProductTotalStock(productId);
    }
    return { updated, created: 0 };
  }

  /** @deprecated Use prepareBulkWarehouseStock + resetWarehouseStocksExceptProductIds */
  public async resetWarehouseStocksExceptSkus(
    warehouseIds: string[],
    skus: Set<string>,
  ): Promise<{ affectedProducts: number; affectedRows: number }> {
    const index = await this.loadStockSkuIndex();
    const productIds = new Set<string>();
    for (const sku of skus) {
      const ref = resolveStockSkuToProduct(sku, index);
      if (ref) productIds.add(ref.id);
    }
    return this.resetWarehouseStocksExceptProductIds(warehouseIds, productIds);
  }

  public async bulkSetStocksByWarehouses(
    entries: StockByWarehouseEntry[],
  ): Promise<BulkStockUpdateResult> {
    const prepared = await this.prepareBulkWarehouseStock(entries);
    const applied = await this.applyBulkWarehouseStock(prepared.updates);
    return {
      updated: applied.updated,
      created: applied.created,
      notFound: prepared.notFound,
    };
  }

  /** Product IDs that appear in the upload file (resolved), for overwrite reset. */
  public async resolveStockUploadProductIds(skus: Iterable<string>): Promise<Set<string>> {
    const index = await this.loadStockSkuIndex();
    const productIds = new Set<string>();
    for (const sku of skus) {
      const ref = resolveStockSkuToProduct(sku, index);
      if (ref) productIds.add(ref.id);
    }
    return productIds;
  }

  /** Set stock to 0 for all products not in the upload file (by resolved product id). */
  public async resetStockExceptProductIds(productIds: Set<string>): Promise<number> {
    const keepIds = Array.from(productIds).filter(Boolean);
    if (keepIds.length === 0) {
      const result = await this.prisma.product.updateMany({
        data: { stock: 0 },
      });
      return result.count;
    }
    const result = await this.prisma.product.updateMany({
      where: { id: { notIn: keepIds } },
      data: { stock: 0 },
    });
    return result.count;
  }

  /** @deprecated Use resetStockExceptProductIds */
  public async resetStockExceptSkus(skus: Set<string>): Promise<number> {
    const productIds = await this.resolveStockUploadProductIds(skus);
    return this.resetStockExceptProductIds(productIds);
  }

  public async bulkUpdateStocks(entries: StockUpdateEntry[]): Promise<BulkStockUpdateResult> {
    const index = await this.loadStockSkuIndex();
    const notFound: string[] = [];
    let updated = 0;
    let created = 0;
    const stockVal = (n: number) => Math.max(0, Math.floor(n));
    for (const { sku, stock, name: entryName, basePrice: entryPrice } of entries) {
      const skuTrim = sku.trim();
      if (!skuTrim) continue;
      const stockData = stockVal(stock);
      const updateData: { stock: number; basePrice?: number } = { stock: stockData };
      if (entryPrice !== undefined && entryPrice !== null && !Number.isNaN(entryPrice)) {
        updateData.basePrice = Math.max(0, Number(entryPrice));
      }

      const ref = resolveStockSkuToProduct(skuTrim, index);
      if (ref) {
        await this.prisma.product.update({
          where: { id: ref.id },
          data: updateData,
        });
        updated++;
        continue;
      }

      try {
        const name = entryName?.trim() || skuTrim;
        const basePrice =
          entryPrice !== undefined && entryPrice !== null && !Number.isNaN(entryPrice)
            ? Math.max(0, Number(entryPrice))
            : 0;
        await this.prisma.product.create({
          data: {
            sku: skuTrim,
            name,
            unit: "pcs",
            basePrice,
            stock: stockVal(stock),
          },
        });
        created++;
      } catch {
        notFound.push(skuTrim);
      }
    }
    return { updated, created, notFound };
  }

  public async findActiveById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findFirst({
      where: { id, isActive: true, showOnStore: true },
    });
    if (!row) return null;
    const primary = await this.productImageStore.findPrimaryByProductId(id);
    return this.toEntity(
      row as PrismaProduct,
      primary ? { url: primary.url, imageId: primary.id } : null,
    );
  }

  /** Normalize SKU for search: remove dots and spaces so "01.021" matches "01021". */
  private buildSearchConditions(search: string) {
    const trimmed = search.trim();
    const normalized = trimmed.replace(/[.\s]/g, "");
    return { searchPattern: `%${trimmed}%`, normalizedPattern: `%${normalized}%` };
  }

  /** Category = product group id (SKU prefix), e.g. "01" for Straumann RC. Only digits, 1-2 chars. */
  private normalizeCategory(category: string | undefined): string | undefined {
    if (!category || typeof category !== "string") return undefined;
    const trimmed = category.trim();
    return /^\d{1,2}$/.test(trimmed) ? trimmed : undefined;
  }

  /** `characteristics.subcategory_name` value (e.g. Аналоги, Трансфери). */
  private normalizeSubcategory(sub: string | undefined): string | undefined {
    if (!sub || typeof sub !== "string") return undefined;
    const t = sub.trim();
    if (t.length === 0 || t.length > 240) return undefined;
    return t;
  }

  /**
   * Store-facing facet chips: distinct non-empty trimmed values from
   * `subcategory_name`, `category_name`, and `platform` (workbook columns).
   * Union avoids hiding `category_name` when `subcategory_name` is also set (e.g. Аналог + Гвинт).
   */
  private skuGroupSql(groupId: string): Prisma.Sql {
    return Prisma.sql`AND (sku LIKE ${groupId + ".%"} OR sku = ${groupId})`;
  }

  /** Subcategory chip filter: row matches if any of the three JSON fields equals `subTrim` (trimmed). */
  private subcategoryChipMatchSql(subTrim: string): Prisma.Sql {
    return Prisma.sql`AND (
      NULLIF(TRIM(characteristics->>'subcategory_name'), '') = ${subTrim}
      OR NULLIF(TRIM(characteristics->>'category_name'), '') = ${subTrim}
      OR NULLIF(TRIM(characteristics->>'platform'), '') = ${subTrim}
    )`;
  }

  /**
   * Distinct facet labels for active store products in a SKU group (e.g. "01").
   */
  public async listDistinctSubcategoriesForCategory(category: string): Promise<string[]> {
    const groupId = this.normalizeCategory(category);
    if (!groupId) return [];
    const skuCond = this.skuGroupSql(groupId);
    const rows = await this.prisma.$queryRaw<{ sub: string }[]>`
      SELECT DISTINCT TRIM(v.col) AS sub
      FROM "Product" p,
      LATERAL (
        VALUES
          (NULLIF(TRIM(p.characteristics->>'subcategory_name'), '')),
          (NULLIF(TRIM(p.characteristics->>'category_name'), '')),
          (NULLIF(TRIM(p.characteristics->>'platform'), ''))
      ) AS v(col)
      WHERE p."isActive" = true
        AND p."showOnStore" = true
        ${skuCond}
        AND p.characteristics IS NOT NULL
        AND v.col IS NOT NULL
        AND TRIM(v.col) <> ''
      ORDER BY sub ASC
    `;
    return rows.map((r) => r.sub).filter(Boolean);
  }

  public async listActive(
    search: string | undefined,
    category: string | undefined,
    pagination: Pagination,
    subcategory?: string,
  ): Promise<ProductListResult> {
    const groupId = this.normalizeCategory(category);
    const subTrim = this.normalizeSubcategory(subcategory);
    const hasSearch = search && search.trim().length > 0;

    const subFacetMatchSql =
      subTrim && groupId ? this.subcategoryChipMatchSql(subTrim) : Prisma.empty;

    if (!hasSearch) {
      if (groupId && subTrim) {
        const skuCond = this.skuGroupSql(groupId);
        const rows = await this.prisma.$queryRaw<
          Array<{
            id: string;
            sku: string;
            name: string;
            unit: string;
            basePrice: number;
            stock: number;
            showOnStore: boolean;
            characteristics: Prisma.JsonValue | null;
          }>
        >`
          SELECT id, sku, name, unit, "basePrice", stock, "showOnStore", characteristics
          FROM "Product"
          WHERE "isActive" = true AND "showOnStore" = true
            ${skuCond}
            ${subFacetMatchSql}
          ORDER BY name
          LIMIT ${pagination.limit} OFFSET ${pagination.offset}
        `;
        const [{ count }] = await this.prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*)::int AS count
          FROM "Product"
          WHERE "isActive" = true AND "showOnStore" = true
            ${skuCond}
            ${subFacetMatchSql}
        `;
        const enriched = await this.enrichWithPrimaryImage(rows);
        const itemsBase = enriched.map((item) => ({
          ...item,
          characteristics: parseCharacteristicsJson(
            (item as { characteristics?: Prisma.JsonValue | null }).characteristics ?? null,
          ),
        }));
        const hardReservedByProductId = await this.getActiveHardReservationsByProductIds(
          itemsBase.map((item) => item.id),
        );
        const items = this.attachAvailableStock(itemsBase, hardReservedByProductId);
        return { items, total: Number(count) };
      }

      const baseWhere: Prisma.ProductWhereInput = { isActive: true, showOnStore: true };
      if (groupId) {
        baseWhere.OR = [{ sku: { startsWith: groupId + "." } }, { sku: groupId }];
      }

      const [total, rows] = await Promise.all([
        this.prisma.product.count({ where: baseWhere }),
        this.prisma.product.findMany({
          where: baseWhere,
          orderBy: { name: "asc" },
          skip: pagination.offset,
          take: pagination.limit,
          select: {
            id: true,
            sku: true,
            name: true,
            unit: true,
            basePrice: true,
            stock: true,
            showOnStore: true,
            characteristics: true,
          },
        }),
      ]);
      const enriched = await this.enrichWithPrimaryImage(rows);
      const itemsBase = enriched.map((item) => ({
        ...item,
        characteristics: parseCharacteristicsJson(
          (item as { characteristics?: Prisma.JsonValue | null }).characteristics ?? null,
        ),
      }));
      const hardReservedByProductId = await this.getActiveHardReservationsByProductIds(
        itemsBase.map((item) => item.id),
      );
      const items = this.attachAvailableStock(itemsBase, hardReservedByProductId);
      return { items, total };
    }

    const { searchPattern, normalizedPattern } = this.buildSearchConditions(search!);
    const skuPrefixCond = groupId ? this.skuGroupSql(groupId) : Prisma.empty;
    const subCond = subTrim && groupId ? subFacetMatchSql : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        sku: string;
        name: string;
        unit: string;
        basePrice: number;
        stock: number;
        showOnStore: boolean;
        characteristics: Prisma.JsonValue | null;
      }>
    >`
      SELECT id, sku, name, unit, "basePrice", stock, "showOnStore", characteristics
      FROM "Product"
      WHERE "isActive" = true AND "showOnStore" = true
        ${skuPrefixCond}
        ${subCond}
        AND (
          sku ILIKE ${searchPattern}
          OR name ILIKE ${searchPattern}
          OR REPLACE(REPLACE(sku, '.', ''), ' ', '') ILIKE ${normalizedPattern}
        )
      ORDER BY name
      LIMIT ${pagination.limit} OFFSET ${pagination.offset}
    `;
    const [{ count }] = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::int AS count
      FROM "Product"
      WHERE "isActive" = true AND "showOnStore" = true
        ${skuPrefixCond}
        ${subCond}
        AND (
          sku ILIKE ${searchPattern}
          OR name ILIKE ${searchPattern}
          OR REPLACE(REPLACE(sku, '.', ''), ' ', '') ILIKE ${normalizedPattern}
        )
    `;
    const enriched = await this.enrichWithPrimaryImage(rows);
    const itemsBase = enriched.map((item) => ({
      ...item,
      characteristics: parseCharacteristicsJson(
        (item as { characteristics?: Prisma.JsonValue | null }).characteristics ?? null,
      ),
    }));
    const hardReservedByProductId = await this.getActiveHardReservationsByProductIds(
      itemsBase.map((item) => item.id),
    );
    const items = this.attachAvailableStock(itemsBase, hardReservedByProductId);
    return { items, total: Number(count) };
  }

  public async setInactive(id: string): Promise<boolean> {
    const result = await this.prisma.product.updateMany({
      where: { id },
      data: { isActive: false },
    });
    return result.count > 0;
  }

  public async setActive(id: string): Promise<boolean> {
    const result = await this.prisma.product.updateMany({
      where: { id },
      data: { isActive: true },
    });
    return result.count > 0;
  }

  public async updateShowOnStore(id: string, showOnStore: boolean): Promise<boolean> {
    const result = await this.prisma.product.updateMany({
      where: { id },
      data: { showOnStore },
    });
    return result.count > 0;
  }

  public async updateCharacteristics(
    id: string,
    characteristics: Prisma.InputJsonValue | null,
  ): Promise<boolean> {
    const result = await this.prisma.product.updateMany({
      where: { id },
      data: {
        characteristics: characteristics === null ? Prisma.JsonNull : characteristics,
      },
    });
    return result.count > 0;
  }

  public async updateWarehouseStocksForProduct(
    productId: string,
    rows: WarehouseStockUpdateInput[],
  ): Promise<boolean> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) return false;
    const normalized = rows
      .map((r) => ({
        warehouseId: r.warehouseId.trim(),
        qty: Math.max(0, Math.floor(Number(r.qty))),
      }))
      .filter((r) => r.warehouseId.length > 0);
    const deduped = new Map<string, number>();
    for (const row of normalized) deduped.set(row.warehouseId, row.qty);
    const items = Array.from(deduped.entries()).map(([warehouseId, qty]) => ({ warehouseId, qty }));

    await this.prisma.$transaction(async (tx) => {
      for (const row of items) {
        await tx.productWarehouseStock.upsert({
          where: {
            productId_warehouseId: { productId, warehouseId: row.warehouseId },
          },
          create: {
            productId,
            warehouseId: row.warehouseId,
            qty: row.qty,
          },
          update: {
            qty: row.qty,
          },
        });
      }
      const allWarehouseRows = await tx.productWarehouseStock.findMany({
        where: { productId },
        select: { qty: true },
      });
      const total = allWarehouseRows.reduce((sum, r) => sum + r.qty, 0);
      await tx.product.update({
        where: { id: productId },
        data: { stock: total },
      });
    });
    return true;
  }

  public async listCatalog(
    search: string | undefined,
    pagination: Pagination,
  ): Promise<ProductListResultWithStockByWarehouse> {
    const hasSearch = search && search.trim().length > 0;
    let rows: Array<{
      id: string;
      sku: string;
      name: string;
      unit: string;
      basePrice: number;
      stock: number;
      showOnStore: boolean;
      characteristics?: Prisma.JsonValue | null;
      isActive?: boolean;
    }>;
    let total: number;
    if (!hasSearch) {
      const where: Prisma.ProductWhereInput = { isActive: true };
      const [totalCount, rowsResult] = await Promise.all([
        this.prisma.product.count({ where }),
        this.prisma.product.findMany({
          where,
          orderBy: { name: "asc" },
          skip: pagination.offset,
          take: pagination.limit,
          select: {
            id: true,
            sku: true,
            name: true,
            unit: true,
            basePrice: true,
            stock: true,
            showOnStore: true,
            characteristics: true,
          },
        }),
      ]);
      rows = rowsResult;
      total = totalCount;
    } else {
      const { searchPattern, normalizedPattern } = this.buildSearchConditions(search!);
      // Include inactive products in search so existing deactivated SKUs are visible and can be reactivated
      const rowsResult = await this.prisma.$queryRaw<
        Array<{
          id: string;
          sku: string;
          name: string;
          unit: string;
          basePrice: number;
          stock: number;
          showOnStore: boolean;
          isActive: boolean;
          characteristics: Prisma.JsonValue | null;
        }>
      >`
        SELECT id, sku, name, unit, "basePrice", stock, "showOnStore", "isActive", characteristics
        FROM "Product"
        WHERE (
          sku ILIKE ${searchPattern}
          OR name ILIKE ${searchPattern}
          OR REPLACE(REPLACE(sku, '.', ''), ' ', '') ILIKE ${normalizedPattern}
        )
        ORDER BY "isActive" DESC, name
        LIMIT ${pagination.limit} OFFSET ${pagination.offset}
      `;
      const [{ count }] = await this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::int AS count
        FROM "Product"
        WHERE (
          sku ILIKE ${searchPattern}
          OR name ILIKE ${searchPattern}
          OR REPLACE(REPLACE(sku, '.', ''), ' ', '') ILIKE ${normalizedPattern}
        )
      `;
      rows = rowsResult;
      total = Number(count);
    }
    const itemsWithImages = await this.enrichWithPrimaryImage(rows);
    const productIds = itemsWithImages.map((i) => i.id);
    const stockByWarehouseMap = await this.getStocksByWarehouseForProductIds(productIds);
    const itemsBase = itemsWithImages.map((item) => ({
      ...item,
      characteristics: parseCharacteristicsJson(
        (item as { characteristics?: Prisma.JsonValue | null }).characteristics ?? null,
      ),
      stockByWarehouse: stockByWarehouseMap.get(item.id) ?? [],
    }));
    const hardReservedByProductId = await this.getActiveHardReservationsByProductIds(
      itemsBase.map((item) => item.id),
    );
    const items: ProductListItemWithStockByWarehouse[] = this.attachAvailableStock(
      itemsBase,
      hardReservedByProductId,
    );
    return { items, total };
  }

  /** All products (включая неактивные): фото в Drive должны цепляться к SKU независимо от витрины. */
  public async listAllForImageSync(): Promise<
    Array<{ id: string; sku: string; skuNormalized: string }>
  > {
    const { normalizeArticle } = await import("./article-normalizer");
    const rows = await this.prisma.product.findMany({
      select: { id: true, sku: true },
    });
    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      skuNormalized: normalizeArticle(r.sku),
    }));
  }
}
