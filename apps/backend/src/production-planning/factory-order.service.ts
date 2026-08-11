import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from "@nestjs/common";
import {
  FactoryOrderStatus,
  InventorySnapshotStatus,
  ProductKind,
} from "@prisma/client";
import * as XLSX from "xlsx";
import { PrismaService } from "../prisma/prisma.service";
import { kyivDayBounds } from "../crm-timezone";
import { constrainsKitCapacity } from "./bom-part.util";
import { mixKitDemand, uncoveredKitDemand } from "./demand-mix.util";
import { ForecastService } from "./forecast.service";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningSettingsService } from "./planning-settings.service";
import {
  canApproveFactoryOrder,
  canAssignFactoryExternalCode,
  canEditFactoryOrder,
} from "./factory-order-draft.util";
import { assertFreshSnapshot, evaluateSnapshotFreshness } from "./snapshot-freshness.util";

export type FactoryRecommendationLine = {
  partProductId: string;
  sku: string;
  name: string;
  grossRequirement: number;
  onHand: number;
  openPoQty: number;
  safetyStock: number;
  netRequirement: number;
  suggestedQty: number;
};

@Injectable()
export class FactoryOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlanningSettingsService,
    private readonly forecast: ForecastService,
    private readonly calculations: PlanningCalculationService,
  ) {}

  list(limit = 20) {
    return this.prisma.factoryOrder.findMany({
      take: Math.min(100, Math.max(1, limit)),
      orderBy: { orderedAt: "desc" },
      include: {
        _count: { select: { lines: true } },
        lines: {
          include: { partProduct: { select: { id: true, sku: true, name: true } } },
        },
      },
    });
  }

  async get(id: string) {
    const order = await this.prisma.factoryOrder.findUnique({
      where: { id },
      include: {
        lines: {
          include: { partProduct: { select: { id: true, sku: true, name: true } } },
          orderBy: { qtyOrdered: "desc" },
        },
      },
    });
    if (!order) throw new NotFoundException("Factory order not found");
    return order;
  }

  async getRecommendations(): Promise<{
    freshness: ReturnType<typeof evaluateSnapshotFreshness>;
    dueAt: Date;
    leadTimeDays: number;
    recommendations: FactoryRecommendationLine[];
  }> {
    const settings = await this.settings.getSettings();
    const posted = await this.prisma.inventorySnapshot.findFirst({
      where: { status: InventorySnapshotStatus.POSTED },
      orderBy: { postedAt: "desc" },
    });
    const freshness = evaluateSnapshotFreshness(posted, settings.snapshotMaxAgeDays);
    assertFreshSnapshot(freshness);

    const forecast90 = await this.forecast.getForecastMap(90);
    const demand = await this.calculations.getDemandByProduct();
    const kitIds = new Set([...forecast90.keys(), ...demand.keys()]);

    const partGross = new Map<string, number>();
    const weeklyByPart = new Map<string, number>();

    for (const kitId of kitIds) {
      const hard = demand.get(kitId)?.hard ?? 0;
      const soft = demand.get(kitId)?.soft ?? 0;
      const forecast = forecast90.get(kitId) ?? 0;
      const mixedNeed = mixKitDemand(settings.demandMix, hard, forecast, soft);
      const stockKits = (await this.calculations.getAvailability(kitId)).available;
      // Explode only kits still uncovered by finished stock over the 90d horizon.
      const kitDemand = uncoveredKitDemand(mixedNeed, stockKits);
      if (kitDemand <= 0) continue;

      const bom = await this.prisma.kitBom.findFirst({
        where: { kitProductId: kitId, isActive: true },
        include: {
          lines: { include: { component: { select: { sku: true, name: true } } } },
        },
        orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }],
      });
      if (!bom) continue;

      for (const line of bom.lines) {
        if (!constrainsKitCapacity({ sku: line.component?.sku, name: line.component?.name })) continue;
        const per = line.qtyPerKit.toNumber();
        const scrap = line.scrapPct?.toNumber() ?? 0;
        const gross = kitDemand * per * (1 + scrap / 100);
        partGross.set(line.componentProductId, (partGross.get(line.componentProductId) ?? 0) + gross);
        weeklyByPart.set(
          line.componentProductId,
          (weeklyByPart.get(line.componentProductId) ?? 0) + (kitDemand / (90 / 7)) * per * (1 + scrap / 100),
        );
      }
    }

    const openPo = await this.getOpenPoQtyByPart();
    const productIds = [...partGross.keys()];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, sku: true, name: true, kind: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const recommendations: FactoryRecommendationLine[] = [];
    for (const [partId, gross] of partGross.entries()) {
      const product = byId.get(partId);
      if (!product || product.kind === ProductKind.KIT) continue;
      const availability = await this.calculations.getAvailability(partId);
      const onHand = availability.available;
      const openPoQty = openPo.get(partId) ?? 0;
      const weekly = weeklyByPart.get(partId) ?? 0;
      const safetyStock = Math.round(weekly * settings.safetyStockWeeks);
      const net = Math.ceil(gross + safetyStock - onHand - openPoQty);
      if (net <= 0) continue;
      recommendations.push({
        partProductId: partId,
        sku: product.sku,
        name: product.name,
        grossRequirement: Math.ceil(gross),
        onHand,
        openPoQty,
        safetyStock,
        netRequirement: net,
        suggestedQty: net,
      });
    }

    recommendations.sort((a, b) => b.suggestedQty - a.suggestedQty);
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + settings.factoryLeadTimeDays);

    return {
      freshness,
      dueAt,
      leadTimeDays: settings.factoryLeadTimeDays,
      recommendations,
    };
  }

  async createFromRecommendations(
    lines?: Array<{ partProductId: string; qtyOrdered: number }>,
    note?: string,
    dueAtIso?: string,
  ) {
    const rec = await this.getRecommendations();
    const source =
      lines && lines.length > 0
        ? lines
        : rec.recommendations.map((r) => ({
            partProductId: r.partProductId,
            qtyOrdered: r.suggestedQty,
          }));
    const normalized = source
      .map((l) => ({
        partProductId: l.partProductId,
        qtyOrdered: Math.max(0, Math.round(l.qtyOrdered)),
      }))
      .filter((l) => l.qtyOrdered > 0 && l.partProductId);
    if (normalized.length === 0) {
      throw new BadRequestException("No factory order lines to create");
    }

    const partIds = [...new Set(normalized.map((l) => l.partProductId))];
    const parts = await this.prisma.product.findMany({
      where: { id: { in: partIds }, kind: { not: ProductKind.KIT } },
      select: { id: true },
    });
    if (parts.length !== partIds.length) {
      throw new BadRequestException("One or more partProductId values are invalid or are kits");
    }

    const order = await this.prisma.factoryOrder.create({
      data: {
        dueAt: dueAtIso ? parseDueDate(dueAtIso) : rec.dueAt,
        status: FactoryOrderStatus.DRAFT,
        note: note ?? null,
        lines: {
          create: normalized.map((l) => ({
            partProductId: l.partProductId,
            qtyOrdered: l.qtyOrdered,
            qtyReceived: 0,
          })),
        },
      },
      include: {
        lines: {
          include: { partProduct: { select: { id: true, sku: true, name: true } } },
        },
      },
    });
    return order;
  }

  async updateLines(id: string, lines: Array<{ partProductId: string; qtyOrdered: number }>) {
    const order = await this.get(id);
    if (!canEditFactoryOrder(order.status)) {
      throw new BadRequestException("Only DRAFT factory orders can be edited");
    }

    const nextQty = new Map(order.lines.map((l) => [l.partProductId, l.qtyOrdered]));
    for (const line of lines) {
      if (!nextQty.has(line.partProductId)) continue;
      nextQty.set(line.partProductId, Math.max(0, Math.round(line.qtyOrdered)));
    }
    if ([...nextQty.values()].every((qty) => qty <= 0)) {
      throw new BadRequestException("Factory order must keep at least one line");
    }

    const ops = [];
    for (const existing of order.lines) {
      const qty = nextQty.get(existing.partProductId) ?? existing.qtyOrdered;
      if (qty <= 0) {
        ops.push(this.prisma.factoryOrderLine.delete({ where: { id: existing.id } }));
      } else if (qty !== existing.qtyOrdered) {
        ops.push(
          this.prisma.factoryOrderLine.update({
            where: { id: existing.id },
            data: { qtyOrdered: qty },
          }),
        );
      }
    }
    if (ops.length > 0) await this.prisma.$transaction(ops);
    return this.get(id);
  }

  async approve(id: string, approvedById: string) {
    const order = await this.get(id);
    if (!canApproveFactoryOrder(order.status)) {
      throw new BadRequestException("Only DRAFT factory orders can be approved");
    }
    const remaining = order.lines.filter((l) => l.qtyOrdered > 0);
    if (remaining.length === 0) {
      throw new BadRequestException("Cannot approve a factory order with no lines");
    }
    return this.prisma.factoryOrder.update({
      where: { id },
      data: {
        status: FactoryOrderStatus.OPEN,
        approvedAt: new Date(),
        approvedById,
      },
      include: {
        lines: {
          include: { partProduct: { select: { id: true, sku: true, name: true } } },
          orderBy: { qtyOrdered: "desc" },
        },
      },
    });
  }

  async updateExternalCode(id: string, externalCode: string) {
    const order = await this.get(id);
    if (!canAssignFactoryExternalCode(order.status)) {
      throw new BadRequestException("1C order code can be set only after approval");
    }
    const trimmed = externalCode.trim();
    return this.prisma.factoryOrder.update({
      where: { id },
      data: { externalCode: trimmed.length > 0 ? trimmed : null },
      include: {
        lines: {
          include: { partProduct: { select: { id: true, sku: true, name: true } } },
          orderBy: { qtyOrdered: "desc" },
        },
      },
    });
  }

  async updateStatus(id: string, status: FactoryOrderStatus) {
    await this.get(id);
    return this.prisma.factoryOrder.update({
      where: { id },
      data: { status },
      include: {
        lines: {
          include: { partProduct: { select: { id: true, sku: true, name: true } } },
        },
      },
    });
  }

  async updateDueAt(id: string, dueAtIso: string) {
    const order = await this.get(id);
    if (order.status === FactoryOrderStatus.CLOSED || order.status === FactoryOrderStatus.CANCELLED) {
      throw new BadRequestException("Cannot reschedule a closed or cancelled order");
    }
    const dueAt = parseDueDate(dueAtIso);
    return this.prisma.factoryOrder.update({
      where: { id },
      data: { dueAt },
      include: {
        lines: {
          include: { partProduct: { select: { id: true, sku: true, name: true } } },
        },
      },
    });
  }

  async updateReceived(
    id: string,
    lines: Array<{ partProductId: string; qtyReceived: number }>,
  ) {
    const order = await this.get(id);
    for (const line of lines) {
      const existing = order.lines.find((l) => l.partProductId === line.partProductId);
      if (!existing) continue;
      await this.prisma.factoryOrderLine.update({
        where: { id: existing.id },
        data: { qtyReceived: Math.max(0, Math.round(line.qtyReceived)) },
      });
    }
    const refreshed = await this.get(id);
    const allReceived = refreshed.lines.every((l) => l.qtyReceived >= l.qtyOrdered);
    const anyReceived = refreshed.lines.some((l) => l.qtyReceived > 0);
    const nextStatus = allReceived
      ? FactoryOrderStatus.CLOSED
      : anyReceived
        ? FactoryOrderStatus.PARTIAL
        : refreshed.status;
    if (nextStatus !== refreshed.status) {
      return this.prisma.factoryOrder.update({
        where: { id },
        data: { status: nextStatus },
        include: {
          lines: {
            include: { partProduct: { select: { id: true, sku: true, name: true } } },
          },
        },
      });
    }
    return refreshed;
  }

  async exportExcel(id: string): Promise<StreamableFile> {
    const order = await this.get(id);
    const rows = order.lines.map((l) => ({
      sku: l.partProduct.sku,
      name: l.partProduct.name,
      qtyOrdered: l.qtyOrdered,
      qtyReceived: l.qtyReceived,
      dueAt: order.dueAt.toISOString().slice(0, 10),
      status: order.status,
      externalCode: order.externalCode,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "FactoryOrder");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new StreamableFile(buffer, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename="factory-order-${order.id.slice(0, 8)}.xlsx"`,
    });
  }

  private async getOpenPoQtyByPart(): Promise<Map<string, number>> {
    const open = await this.prisma.factoryOrderLine.findMany({
      where: {
        factoryOrder: {
          status: { in: [FactoryOrderStatus.OPEN, FactoryOrderStatus.PARTIAL, FactoryOrderStatus.DRAFT] },
        },
      },
      select: { partProductId: true, qtyOrdered: true, qtyReceived: true },
    });
    const map = new Map<string, number>();
    for (const line of open) {
      const remaining = Math.max(0, line.qtyOrdered - line.qtyReceived);
      map.set(line.partProductId, (map.get(line.partProductId) ?? 0) + remaining);
    }
    return map;
  }
}

function parseDueDate(iso: string): Date {
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return kyivDayBounds(trimmed).to;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException("Invalid dueAt date");
  }
  return d;
}
