import { Injectable, NotFoundException } from "@nestjs/common";
import { ProductKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { KitPortfolioService } from "./kit-portfolio.service";
import type { ParetoClass, XyzClass, XyzReason, XyzSource } from "./kit-portfolio.util";

export type ProductParamsRow = {
  productId: string;
  sku: string;
  name: string;
  kind: ProductKind;
  safetyStock: number;
  productionLeadDays: number;
  packLeadDays: number | null;
  isPlanned: boolean;
  monthlyForecastOverride: number | null;
  demandMode: "AUTO" | "MANUAL";
  paretoClass: ParetoClass | null;
  xyzClass: XyzClass | null;
  xyzReason: XyzReason | null;
  xyzSource: XyzSource | null;
  demandCv: number | null;
};

export type ProductParamsPatch = {
  safetyStock?: number;
  productionLeadDays?: number;
  packLeadDays?: number | null;
  isPlanned?: boolean;
  monthlyForecastOverride?: number | null;
};

@Injectable()
export class PlanningProductParamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitPortfolio: KitPortfolioService,
  ) {}

  async list(opts?: { kind?: ProductKind; q?: string }): Promise<ProductParamsRow[]> {
    const kindFilter = opts?.kind
      ? { kind: opts.kind }
      : { kind: { in: [ProductKind.KIT, ProductKind.PART] as ProductKind[] } };
    const q = opts?.q?.trim().toLowerCase();

    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        ...kindFilter,
        ...(q
          ? {
              OR: [
                { sku: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        sku: true,
        name: true,
        kind: true,
        planningParams: true,
      },
      orderBy: [{ kind: "asc" }, { sku: "asc" }],
      take: 2000,
    });

    let classByKit = new Map<
      string,
      {
        paretoClass: ParetoClass;
        xyzClass: XyzClass | null;
        xyzReason: XyzReason;
        xyzSource: XyzSource | null;
        demandCv: number | null;
      }
    >();
    try {
      const board = await this.kitPortfolio.getBoard();
      classByKit = new Map(
        board.kits.map((k) => [
          k.productId,
          {
            paretoClass: k.paretoClass,
            xyzClass: k.xyzClass,
            xyzReason: k.xyzReason,
            xyzSource: k.xyzSource,
            demandCv: k.demandCv,
          },
        ]),
      );
    } catch {
      // Board may fail without snapshot; params table still useful.
    }

    return products.map((p) => {
      const params = p.planningParams;
      const cls = classByKit.get(p.id);
      const override = params?.monthlyForecastOverride ?? null;
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        kind: p.kind,
        safetyStock: params?.safetyStock ?? 0,
        productionLeadDays: params?.productionLeadDays ?? 90,
        packLeadDays: params?.packLeadDays ?? null,
        isPlanned: params?.isPlanned ?? true,
        monthlyForecastOverride: override,
        demandMode: override != null && Number.isFinite(override) ? "MANUAL" : "AUTO",
        paretoClass: cls?.paretoClass ?? null,
        xyzClass: cls?.xyzClass ?? null,
        xyzReason: cls?.xyzReason ?? null,
        xyzSource: cls?.xyzSource ?? null,
        demandCv: cls?.demandCv ?? null,
      };
    });
  }

  async patch(productId: string, body: ProductParamsPatch): Promise<ProductParamsRow> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true },
      select: { id: true },
    });
    if (!product) throw new NotFoundException("Product not found");

    const data: {
      safetyStock?: number;
      productionLeadDays?: number;
      packLeadDays?: number | null;
      isPlanned?: boolean;
      monthlyForecastOverride?: number | null;
    } = {};
    if (body.safetyStock != null) data.safetyStock = Math.max(0, Math.round(body.safetyStock));
    if (body.productionLeadDays != null) {
      data.productionLeadDays = Math.max(1, Math.round(body.productionLeadDays));
    }
    if (body.packLeadDays !== undefined) {
      data.packLeadDays =
        body.packLeadDays == null ? null : Math.max(0, Math.round(body.packLeadDays));
    }
    if (body.isPlanned != null) data.isPlanned = Boolean(body.isPlanned);
    if (body.monthlyForecastOverride !== undefined) {
      data.monthlyForecastOverride =
        body.monthlyForecastOverride == null
          ? null
          : Math.max(0, Number(body.monthlyForecastOverride));
    }

    await this.prisma.planningProductParams.upsert({
      where: { productId },
      create: {
        productId,
        safetyStock: data.safetyStock ?? 0,
        productionLeadDays: data.productionLeadDays ?? 90,
        packLeadDays: data.packLeadDays ?? null,
        isPlanned: data.isPlanned ?? true,
        monthlyForecastOverride: data.monthlyForecastOverride ?? null,
      },
      update: data,
    });

    const updated = await this.prisma.product.findFirstOrThrow({
      where: { id: productId },
      select: {
        id: true,
        sku: true,
        name: true,
        kind: true,
        planningParams: true,
      },
    });
    const params = updated.planningParams;
    const override = params?.monthlyForecastOverride ?? null;
    return {
      productId: updated.id,
      sku: updated.sku,
      name: updated.name,
      kind: updated.kind,
      safetyStock: params?.safetyStock ?? 0,
      productionLeadDays: params?.productionLeadDays ?? 90,
      packLeadDays: params?.packLeadDays ?? null,
      isPlanned: params?.isPlanned ?? true,
      monthlyForecastOverride: override,
      demandMode: override != null && Number.isFinite(override) ? "MANUAL" : "AUTO",
      paretoClass: null,
      xyzClass: null,
      xyzReason: null,
      xyzSource: null,
      demandCv: null,
    };
  }
}
