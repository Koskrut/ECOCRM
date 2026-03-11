import { Injectable } from "@nestjs/common";
import { ProductImageSource as PrismaSource } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ProductImage } from "./product-image.entity";

type Row = {
  id: string;
  productId: string;
  source: PrismaSource;
  fileId: string;
  fileName: string;
  url: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toEntity(row: Row): ProductImage {
  return {
    id: row.id,
    productId: row.productId,
    source: row.source as ProductImage["source"],
    fileId: row.fileId,
    fileName: row.fileName,
    url: row.url,
    sortOrder: row.sortOrder,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type UpsertProductImageInput = {
  productId: string;
  source: "google_drive";
  fileId: string;
  fileName: string;
  url: string;
  sortOrder?: number;
  isPrimary?: boolean;
};

@Injectable()
export class ProductImageStore {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ProductImage | null> {
    const row = await this.prisma.productImage.findUnique({
      where: { id },
    });
    return row ? toEntity(row as Row) : null;
  }

  async findByProductId(productId: string): Promise<ProductImage[]> {
    const rows = await this.prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return (rows as Row[]).map(toEntity);
  }

  async findPrimaryByProductId(productId: string): Promise<ProductImage | null> {
    const row = await this.prisma.productImage.findFirst({
      where: { productId, isPrimary: true },
    });
    return row ? toEntity(row as Row) : null;
  }

  async upsert(input: UpsertProductImageInput): Promise<ProductImage> {
    const existing = await this.prisma.productImage.findUnique({
      where: {
        productId_source_fileId: {
          productId: input.productId,
          source: "google_drive" as PrismaSource,
          fileId: input.fileId,
        },
      },
    });

    const data = {
      fileName: input.fileName,
      url: input.url,
      sortOrder: input.sortOrder ?? 0,
      isPrimary: input.isPrimary ?? false,
    };

    if (existing) {
      const row = await this.prisma.productImage.update({
        where: { id: existing.id },
        data,
      });
      return toEntity(row as Row);
    }

    const row = await this.prisma.productImage.create({
      data: {
        productId: input.productId,
        source: "google_drive" as PrismaSource,
        fileId: input.fileId,
        fileName: input.fileName,
        url: input.url,
        sortOrder: input.sortOrder ?? 0,
        isPrimary: input.isPrimary ?? false,
      },
    });
    return toEntity(row as Row);
  }

  /** Set one image as primary and clear primary flag from others for this product. */
  async setPrimary(imageId: string): Promise<void> {
    const img = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!img) return;
    await this.prisma.$transaction([
      this.prisma.productImage.updateMany({
        where: { productId: img.productId },
        data: { isPrimary: false },
      }),
      this.prisma.productImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      }),
      this.prisma.product.update({
        where: { id: img.productId },
        data: { primaryImageId: imageId },
      }),
    ]);
  }

  /** Check if product has any primary image. */
  async productHasPrimary(productId: string): Promise<boolean> {
    const count = await this.prisma.productImage.count({
      where: { productId, isPrimary: true },
    });
    return count > 0;
  }

  /** Get primary image id for many products (map productId -> imageId or url). */
  async getPrimaryImageIdsByProductIds(
    productIds: string[],
  ): Promise<Map<string, { imageId: string; url: string }>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.prisma.productImage.findMany({
      where: { productId: { in: productIds }, isPrimary: true },
      select: { id: true, productId: true, url: true },
    });
    const map = new Map<string, { imageId: string; url: string }>();
    for (const r of rows) {
      map.set(r.productId, { imageId: r.id, url: r.url });
    }
    return map;
  }
}
