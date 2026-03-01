import type { Prisma } from "@prisma/client";
import { Injectable } from "@nestjs/common";
import type { Pagination } from "../common/pagination";
import type { Product } from "./product.entity";
import { PrismaService } from "../prisma/prisma.service";

type ProductListItem = Pick<Product, "id" | "sku" | "name" | "unit" | "basePrice" | "stock">;

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
  constructor(private readonly prisma: PrismaService) {}

  private toEntity(row: PrismaProduct): Product {
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      basePrice: row.basePrice,
      stock: row.stock,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? this.toEntity(row as PrismaProduct) : null;
  }

  public async findBySku(sku: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { sku: sku.trim() } });
    return row ? this.toEntity(row as PrismaProduct) : null;
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
    return row ? this.toEntity(row as PrismaProduct) : null;
  }

  /** Normalize SKU for search: remove dots and spaces so "01.021" matches "01021". */
  private buildSearchConditions(search: string) {
    const trimmed = search.trim();
    const normalized = trimmed.replace(/[.\s]/g, "");
    return { searchPattern: `%${trimmed}%`, normalizedPattern: `%${normalized}%` };
  }

  public async listActive(
    search: string | undefined,
    pagination: Pagination,
  ): Promise<ProductListResult> {
    const hasSearch = search && search.trim().length > 0;
    if (!hasSearch) {
      const where: Prisma.ProductWhereInput = { isActive: true };
      const [total, items] = await this.prisma.$transaction([
        this.prisma.product.count({ where }),
        this.prisma.product.findMany({
          where,
          orderBy: { name: "asc" },
          skip: pagination.offset,
          take: pagination.limit,
          select: { id: true, sku: true, name: true, unit: true, basePrice: true, stock: true },
        }),
      ]);
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
    return { items: rows, total: Number(count) };
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
      const [total, items] = await this.prisma.$transaction([
        this.prisma.product.count({ where }),
        this.prisma.product.findMany({
          where,
          orderBy: { name: "asc" },
          skip: pagination.offset,
          take: pagination.limit,
          select: { id: true, sku: true, name: true, unit: true, basePrice: true, stock: true },
        }),
      ]);
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
    return { items: rows, total: Number(count) };
  }
}
