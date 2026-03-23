import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ProductKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type BomLineInput = {
  componentProductId: string;
  qtyPerKit: number;
  scrapPct?: number | null;
  sortOrder?: number;
};

@Injectable()
export class BomService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveBom(kitProductId: string) {
    const bom = await this.prisma.kitBom.findFirst({
      where: { kitProductId, isActive: true },
      orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }],
      include: {
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { component: { select: { id: true, sku: true, name: true, kind: true } } },
        },
        kitProduct: { select: { id: true, sku: true, name: true, kind: true } },
      },
    });
    if (!bom) throw new NotFoundException("Active BOM not found for kit");
    return bom;
  }

  async upsertNewRevision(kitProductId: string, lines: BomLineInput[]) {
    if (lines.length === 0) throw new BadRequestException("BOM must contain at least one line");
    const kit = await this.prisma.product.findUnique({ where: { id: kitProductId } });
    if (!kit) throw new NotFoundException("Kit product not found");
    if (kit.kind !== ProductKind.KIT) {
      await this.prisma.product.update({
        where: { id: kitProductId },
        data: { kind: ProductKind.KIT },
      });
    }

    const ids = new Set<string>();
    for (const line of lines) {
      if (!line.componentProductId) throw new BadRequestException("componentProductId is required");
      if (line.qtyPerKit <= 0) throw new BadRequestException("qtyPerKit must be > 0");
      if (ids.has(line.componentProductId)) {
        throw new BadRequestException("Duplicate componentProductId in BOM lines");
      }
      ids.add(line.componentProductId);
    }

    const components = await this.prisma.product.findMany({
      where: { id: { in: Array.from(ids) } },
      select: { id: true, kind: true },
    });
    if (components.length !== ids.size) {
      throw new BadRequestException("Some component products do not exist");
    }

    for (const c of components) {
      if (c.kind === ProductKind.OTHER) {
        await this.prisma.product.update({
          where: { id: c.id },
          data: { kind: ProductKind.PART },
        });
      }
    }

    const lastRevision = await this.prisma.kitBom.findFirst({
      where: { kitProductId },
      orderBy: { revision: "desc" },
      select: { revision: true },
    });
    const nextRevision = (lastRevision?.revision ?? 0) + 1;

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.kitBom.updateMany({
        where: { kitProductId, isActive: true },
        data: { isActive: false },
      });
      const bom = await tx.kitBom.create({
        data: {
          kitProductId,
          revision: nextRevision,
          isActive: true,
          lines: {
            create: lines.map((line, idx) => ({
              componentProductId: line.componentProductId,
              qtyPerKit: line.qtyPerKit,
              scrapPct: line.scrapPct ?? null,
              sortOrder: line.sortOrder ?? idx,
            })),
          },
        },
      });
      return bom;
    });

    return this.getActiveBom(created.kitProductId);
  }
}

