import { Prisma } from "@prisma/client";
import { Injectable } from "@nestjs/common";
import type { Pagination } from "../common/pagination";
import type { Product } from "./product.entity";
import { PrismaService } from "../prisma/prisma.service";
import { ProductImageStore } from "./product-image.store";

type ProductListItem = Pick<
  Product,
  "id" | "sku" | "name" | "unit" | "basePrice" | "stock" | "primaryImageUrl" | "primaryImageId"
>;

type ProductListResult = {
  items: ProductListItem[];
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
  createdAt: Date;
  updatedAt: Date;
};

export type StockUpdateEntry = { sku: string; stock: number; name?: string; basePrice?: number };

export type BulkStockUpdateResult = {
  updated: number;
  created: number;
  notFound: string[];
};

@Injectable()
export class ProductStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productImageStore: ProductImageStore,
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

  public async bulkUpdateStocks(entries: StockUpdateEntry[]): Promise<BulkStockUpdateResult> {
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
      const result = await this.prisma.product.updateMany({
        where: { sku: skuTrim },
        data: updateData,
      });
      if (result.count > 0) {
        updated++;
      } else {
        try {
          const name = entryName?.trim() || skuTrim;
          const basePrice = entryPrice !== undefined && entryPrice !== null && !Number.isNaN(entryPrice)
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
    }
    return { updated, created, notFound };
  }

  public async findActiveById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findFirst({ where: { id, isActive: true } });
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

  public async listActive(
    search: string | undefined,
    category: string | undefined,
    pagination: Pagination,
  ): Promise<ProductListResult> {
    const groupId = this.normalizeCategory(category);
    const hasSearch = search && search.trim().length > 0;

    const baseWhere: Prisma.ProductWhereInput = { isActive: true };
    if (groupId) {
      baseWhere.sku = { startsWith: groupId + "." };
    }

    if (!hasSearch) {
      const [total, rows] = await Promise.all([
        this.prisma.product.count({ where: baseWhere }),
        this.prisma.product.findMany({
          where: baseWhere,
          orderBy: { name: "asc" },
          skip: pagination.offset,
          take: pagination.limit,
          select: { id: true, sku: true, name: true, unit: true, basePrice: true, stock: true },
        }),
      ]);
      const items = await this.enrichWithPrimaryImage(rows);
      return { items, total };
    }

    const { searchPattern, normalizedPattern } = this.buildSearchConditions(search!);
    const skuPrefixCond = groupId
      ? Prisma.sql`AND (sku LIKE ${groupId + ".%"} OR sku = ${groupId})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; sku: string; name: string; unit: string; basePrice: number; stock: number }>
    >`
      SELECT id, sku, name, unit, "basePrice", stock
      FROM "Product"
      WHERE "isActive" = true
        ${skuPrefixCond}
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
      WHERE "isActive" = true
        ${skuPrefixCond}
        AND (
          sku ILIKE ${searchPattern}
          OR name ILIKE ${searchPattern}
          OR REPLACE(REPLACE(sku, '.', ''), ' ', '') ILIKE ${normalizedPattern}
        )
    `;
    const items = await this.enrichWithPrimaryImage(rows);
    return { items, total: Number(count) };
  }

  public async setInactive(id: string): Promise<boolean> {
    const result = await this.prisma.product.updateMany({
      where: { id },
      data: { isActive: false },
    });
    return result.count > 0;
  }

  public async listCatalog(
    search: string | undefined,
    pagination: Pagination,
  ): Promise<ProductListResult> {
    const hasSearch = search && search.trim().length > 0;
    if (!hasSearch) {
      const where: Prisma.ProductWhereInput = { isActive: true };
      const [total, rows] = await Promise.all([
        this.prisma.product.count({ where }),
        this.prisma.product.findMany({
          where,
          orderBy: { name: "asc" },
          skip: pagination.offset,
          take: pagination.limit,
          select: { id: true, sku: true, name: true, unit: true, basePrice: true, stock: true },
        }),
      ]);
      const items = await this.enrichWithPrimaryImage(rows);
      return { items, total };
    }

    const { searchPattern, normalizedPattern } = this.buildSearchConditions(search!);
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; sku: string; name: string; unit: string; basePrice: number; stock: number }>
    >`
      SELECT id, sku, name, unit, "basePrice", stock
      FROM "Product"
      WHERE "isActive" = true
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
      WHERE "isActive" = true
        AND (
          sku ILIKE ${searchPattern}
          OR name ILIKE ${searchPattern}
          OR REPLACE(REPLACE(sku, '.', ''), ' ', '') ILIKE ${normalizedPattern}
        )
    `;
    const items = await this.enrichWithPrimaryImage(rows);
    return { items, total: Number(count) };
  }

  /** All active products with id, sku, skuNormalized for sync matching. */
  public async listAllForImageSync(): Promise<
    Array<{ id: string; sku: string; skuNormalized: string }>
  > {
    const { normalizeArticle } = await import("./article-normalizer");
    const rows = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, sku: true },
    });
    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      skuNormalized: normalizeArticle(r.sku),
    }));
  }
}
