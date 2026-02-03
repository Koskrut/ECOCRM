import { PrismaClient, Prisma } from "@prisma/client";
import { Injectable } from "@nestjs/common";
import { Pagination } from "../common/pagination";
import { Product } from "./product.entity";

type ProductListItem = Pick<Product, "id" | "sku" | "name" | "unit" | "basePrice">;

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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ProductStore {
  constructor(private readonly prisma: PrismaClient) {}

  private toEntity(row: PrismaProduct): Product {
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      basePrice: row.basePrice,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? this.toEntity(row as PrismaProduct) : null;
  }

  public async findActiveById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findFirst({ where: { id, isActive: true } });
    return row ? this.toEntity(row as PrismaProduct) : null;
  }

  public async listActive(
    search: string | undefined,
    pagination: Pagination,
  ): Promise<ProductListResult> {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
    };

    if (search && search.trim().length > 0) {
      where.OR = [
        { sku: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
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
        },
      }),
    ]);

    return { items, total };
  }
}
