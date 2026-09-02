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
  canEditFactoryOrderLines,
  canEditLineDueAt,
} from "./factory-order-draft.util";
import {
  countOverdueLines,
  effectiveLineDueAt,
  factoryLineTrackingStatus,
  nearestOpenLineDueYmd,
} from "./factory-order-tracking.util";
import { assertFreshSnapshot, evaluateSnapshotFreshness } from "./snapshot-freshness.util";
import { abcRank, assignParetoClasses, maxParetoClass, type ParetoClass } from "./kit-portfolio.util";

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
  parentParetoClass: ParetoClass;
};

export type FactoryLineInput = {
  partProductId: string;
  qtyOrdered: number;
  dueAt?: string | null;
};

@Injectable()
export class FactoryOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlanningSettingsService,
    private readonly forecast: ForecastService,
    private readonly calculations: PlanningCalculationService,
  ) {}

  private orderInclude() {
    return {
      lines: {
        include: { partProduct: { select: { id: true, sku: true, name: true } } },
        orderBy: { qtyOrdered: "desc" as const },
      },
    };
  }

  async list(limit = 20) {
    const orders = await this.prisma.factoryOrder.findMany({
      take: Math.min(100, Math.max(1, limit)),
      orderBy: { orderedAt: "desc" },
      include: {
        _count: { select: { lines: true } },
        lines: {
          include: { partProduct: { select: { id: true, sku: true, name: true } } },
        },
      },
    });
    return orders.map((order) => ({
      ...order,
      overdueLineCount: countOverdueLines(order.lines, order.dueAt),
      nearestLineDueYmd: nearestOpenLineDueYmd(order.lines, order.dueAt),
    }));
  }

  async get(id: string) {
    const order = await this.prisma.factoryOrder.findUnique({
      where: { id },
      include: this.orderInclude(),
    });
    if (!order) throw new NotFoundException("Factory order not found");
    return {
      ...order,
      overdueLineCount: countOverdueLines(order.lines, order.dueAt),
      nearestLineDueYmd: nearestOpenLineDueYmd(order.lines, order.dueAt),
      lines: order.lines.map((l) => ({
        ...l,
        effectiveDueAt: effectiveLineDueAt(l.dueAt, order.dueAt).toISOString(),
        trackingStatus: factoryLineTrackingStatus({
          qtyOrdered: l.qtyOrdered,
          qtyReceived: l.qtyReceived,
          effectiveDueAt: effectiveLineDueAt(l.dueAt, order.dueAt),
        }),
      })),
    };
  }

  /** Open/partial lines with overdue / due-soon tracking for the make tab. */
  async getTracking(overdueOnly = false) {
    const orders = await this.prisma.factoryOrder.findMany({
      where: {
        status: { in: [FactoryOrderStatus.OPEN, FactoryOrderStatus.PARTIAL] },
      },
      include: {
        lines: {
          include: { partProduct: { select: { id: true, sku: true, name: true } } },
        },
      },
      orderBy: { dueAt: "asc" },
      take: 100,
    });
    const rows: Array<{
      orderId: string;
      externalCode: string | null;
      orderStatus: string;
      lineId: string;
      partProductId: string;
      sku: string;
      name: string;
      qtyOrdered: number;
      qtyReceived: number;
      dueAt: string;
      trackingStatus: string;
    }> = [];
    for (const order of orders) {
      for (const line of order.lines) {
        if (line.qtyReceived >= line.qtyOrdered) continue;
        const effective = effectiveLineDueAt(line.dueAt, order.dueAt);
        const trackingStatus = factoryLineTrackingStatus({
          qtyOrdered: line.qtyOrdered,
          qtyReceived: line.qtyReceived,
          effectiveDueAt: effective,
        });
        if (overdueOnly && trackingStatus !== "overdue") continue;
        if (!overdueOnly && trackingStatus === "on_track") continue;
        rows.push({
          orderId: order.id,
          externalCode: order.externalCode,
          orderStatus: order.status,
          lineId: line.id,
          partProductId: line.partProductId,
          sku: line.partProduct.sku,
          name: line.partProduct.name,
          qtyOrdered: line.qtyOrdered,
          qtyReceived: line.qtyReceived,
          dueAt: effective.toISOString(),
          trackingStatus,
        });
      }
    }
    rows.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return { rows };
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
    const parentClassByPart = new Map<string, ParetoClass[]>();

    const kitIdList = [...kitIds];
    const revenueRows = await this.prisma.orderItem.findMany({
      where: {
        productId: { in: kitIdList },
        order: { orderStage: { notIn: ["CANCELED", "REFUSED"] } },
      },
      select: { productId: true, qty: true, price: true },
      take: 50_000,
    });
    const revenueByKit = new Map<string, number>();
    for (const row of revenueRows) {
      if (!row.productId) continue;
      revenueByKit.set(
        row.productId,
        (revenueByKit.get(row.productId) ?? 0) + row.price * row.qty,
      );
    }
    const kitPareto = new Map(
      assignParetoClasses(
        kitIdList.map((id) => ({ productId: id, revenue: revenueByKit.get(id) ?? 0 })),
      ).map((r) => [r.productId, r.paretoClass]),
    );

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
      const kitClass = kitPareto.get(kitId) ?? "C";

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
        const parents = parentClassByPart.get(line.componentProductId) ?? [];
        parents.push(kitClass);
        parentClassByPart.set(line.componentProductId, parents);
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
        parentParetoClass: maxParetoClass(parentClassByPart.get(partId) ?? ["C"]),
      });
    }

    recommendations.sort(
      (a, b) =>
        abcRank(a.parentParetoClass) - abcRank(b.parentParetoClass) ||
        b.suggestedQty - a.suggestedQty,
    );
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
    lines?: Array<{ partProductId: string; qtyOrdered: number; dueAt?: string | null }>,
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
            dueAt: null as string | null,
          }));
    const orderDueAt = dueAtIso ? parseDueDate(dueAtIso) : rec.dueAt;
    const normalized = source
      .map((l) => ({
        partProductId: l.partProductId,
        qtyOrdered: Math.max(0, Math.round(l.qtyOrdered)),
        dueAt: l.dueAt != null && String(l.dueAt).trim() !== "" ? parseDueDate(String(l.dueAt)) : orderDueAt,
      }))
      .filter((l) => l.qtyOrdered > 0 && l.partProductId);
    if (normalized.length === 0) {
      throw new BadRequestException("No factory order lines to create");
    }

    const partIds = [...new Set(normalized.map((l) => l.partProductId))];
    if (partIds.length !== normalized.length) {
      throw new BadRequestException("Duplicate partProductId in factory order lines");
    }
    const parts = await this.prisma.product.findMany({
      where: { id: { in: partIds }, kind: { not: ProductKind.KIT } },
      select: { id: true },
    });
    if (parts.length !== partIds.length) {
      throw new BadRequestException("One or more partProductId values are invalid or are kits");
    }

    const order = await this.prisma.factoryOrder.create({
      data: {
        dueAt: orderDueAt,
        status: FactoryOrderStatus.DRAFT,
        note: note ?? null,
        lines: {
          create: normalized.map((l) => ({
            partProductId: l.partProductId,
            qtyOrdered: l.qtyOrdered,
            qtyReceived: 0,
            dueAt: l.dueAt,
          })),
        },
      },
      include: this.orderInclude(),
    });
    return this.get(order.id);
  }

  /**
   * Replace-semantics upsert for DRAFT: payload is the full set of lines.
   * Missing existing lines are deleted; new partProductIds are created.
   */
  async updateLines(id: string, lines: FactoryLineInput[]) {
    const order = await this.getRaw(id);
    if (!canEditFactoryOrderLines(order.status)) {
      throw new BadRequestException("Only DRAFT factory orders can be edited");
    }

    const normalized = lines
      .map((l) => ({
        partProductId: l.partProductId,
        qtyOrdered: Math.max(0, Math.round(l.qtyOrdered)),
        dueAt:
          l.dueAt === null
            ? null
            : l.dueAt != null && String(l.dueAt).trim() !== ""
              ? parseDueDate(String(l.dueAt))
              : undefined,
      }))
      .filter((l) => l.partProductId);

    const byPart = new Map<string, { qtyOrdered: number; dueAt?: Date | null }>();
    for (const l of normalized) {
      if (byPart.has(l.partProductId)) {
        throw new BadRequestException("Duplicate partProductId in factory order lines");
      }
      if (l.qtyOrdered > 0) {
        byPart.set(l.partProductId, { qtyOrdered: l.qtyOrdered, dueAt: l.dueAt });
      }
    }
    if (byPart.size === 0) {
      throw new BadRequestException("Factory order must keep at least one line");
    }

    const partIds = [...byPart.keys()];
    const parts = await this.prisma.product.findMany({
      where: { id: { in: partIds }, kind: { not: ProductKind.KIT } },
      select: { id: true },
    });
    if (parts.length !== partIds.length) {
      throw new BadRequestException("One or more partProductId values are invalid or are kits");
    }

    const existingByPart = new Map(order.lines.map((l) => [l.partProductId, l]));
    const ops = [];

    for (const [partProductId, next] of byPart) {
      const existing = existingByPart.get(partProductId);
      if (existing) {
        const data: { qtyOrdered: number; dueAt?: Date | null } = { qtyOrdered: next.qtyOrdered };
        if (next.dueAt !== undefined) data.dueAt = next.dueAt;
        ops.push(
          this.prisma.factoryOrderLine.update({
            where: { id: existing.id },
            data,
          }),
        );
      } else {
        ops.push(
          this.prisma.factoryOrderLine.create({
            data: {
              factoryOrderId: id,
              partProductId,
              qtyOrdered: next.qtyOrdered,
              qtyReceived: 0,
              dueAt: next.dueAt === undefined ? order.dueAt : next.dueAt,
            },
          }),
        );
      }
    }
    for (const existing of order.lines) {
      if (!byPart.has(existing.partProductId)) {
        ops.push(this.prisma.factoryOrderLine.delete({ where: { id: existing.id } }));
      }
    }
    if (ops.length > 0) await this.prisma.$transaction(ops);
    return this.get(id);
  }

  async addLine(
    id: string,
    input: { partProductId: string; qtyOrdered: number; dueAt?: string | null },
  ) {
    const order = await this.getRaw(id);
    if (!canEditFactoryOrderLines(order.status)) {
      throw new BadRequestException("Only DRAFT factory orders can add lines");
    }
    const qtyOrdered = Math.max(0, Math.round(input.qtyOrdered));
    if (qtyOrdered <= 0) throw new BadRequestException("qtyOrdered must be > 0");

    const existing = order.lines.find((l) => l.partProductId === input.partProductId);
    if (existing) {
      const dueAt =
        input.dueAt != null && String(input.dueAt).trim() !== ""
          ? parseDueDate(String(input.dueAt))
          : undefined;
      await this.prisma.factoryOrderLine.update({
        where: { id: existing.id },
        data: {
          qtyOrdered: existing.qtyOrdered + qtyOrdered,
          ...(dueAt !== undefined ? { dueAt } : {}),
        },
      });
      return this.get(id);
    }

    const part = await this.prisma.product.findFirst({
      where: { id: input.partProductId, kind: { not: ProductKind.KIT } },
      select: { id: true },
    });
    if (!part) throw new BadRequestException("partProductId is invalid or is a kit");

    const dueAt =
      input.dueAt != null && String(input.dueAt).trim() !== ""
        ? parseDueDate(String(input.dueAt))
        : order.dueAt;

    await this.prisma.factoryOrderLine.create({
      data: {
        factoryOrderId: id,
        partProductId: input.partProductId,
        qtyOrdered,
        qtyReceived: 0,
        dueAt,
      },
    });
    return this.get(id);
  }

  async deleteLine(id: string, lineId: string) {
    const order = await this.getRaw(id);
    if (!canEditFactoryOrderLines(order.status)) {
      throw new BadRequestException("Only DRAFT factory orders can remove lines");
    }
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException("Factory order line not found");
    if (order.lines.length <= 1) {
      throw new BadRequestException("Factory order must keep at least one line");
    }
    await this.prisma.factoryOrderLine.delete({ where: { id: lineId } });
    return this.get(id);
  }

  async deleteOrder(id: string) {
    const order = await this.getRaw(id);
    if (order.status !== FactoryOrderStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT factory orders can be deleted");
    }
    const hasReceipts = order.lines.some((l) => l.qtyReceived > 0);
    if (hasReceipts) {
      throw new BadRequestException("Cannot delete a factory order with receipts");
    }
    await this.prisma.factoryOrder.delete({ where: { id } });
    return { deleted: true, id };
  }

  async updateLine(
    id: string,
    lineId: string,
    patch: { qtyOrdered?: number; dueAt?: string | null },
  ) {
    const order = await this.getRaw(id);
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException("Factory order line not found");

    const data: { qtyOrdered?: number; dueAt?: Date | null } = {};

    if (patch.qtyOrdered != null) {
      if (!canEditFactoryOrderLines(order.status)) {
        throw new BadRequestException("Only DRAFT factory orders can change qty");
      }
      const qty = Math.max(0, Math.round(patch.qtyOrdered));
      if (qty <= 0) throw new BadRequestException("qtyOrdered must be > 0");
      data.qtyOrdered = qty;
    }

    if (patch.dueAt !== undefined) {
      if (!canEditLineDueAt(order.status)) {
        throw new BadRequestException("Cannot edit line dueAt for this order status");
      }
      data.dueAt =
        patch.dueAt == null || String(patch.dueAt).trim() === ""
          ? null
          : parseDueDate(String(patch.dueAt));
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("No fields to update");
    }

    await this.prisma.factoryOrderLine.update({ where: { id: lineId }, data });
    return this.get(id);
  }

  async updateLineDueAt(id: string, lineId: string, dueAtIso: string) {
    return this.updateLine(id, lineId, { dueAt: dueAtIso });
  }

  private async getRaw(id: string) {
    const order = await this.prisma.factoryOrder.findUnique({
      where: { id },
      include: this.orderInclude(),
    });
    if (!order) throw new NotFoundException("Factory order not found");
    return order;
  }

  async approve(id: string, approvedById: string) {
    const order = await this.getRaw(id);
    if (!canApproveFactoryOrder(order.status)) {
      throw new BadRequestException("Only DRAFT factory orders can be approved");
    }
    const remaining = order.lines.filter((l) => l.qtyOrdered > 0);
    if (remaining.length === 0) {
      throw new BadRequestException("Cannot approve a factory order with no lines");
    }
    await this.prisma.factoryOrder.update({
      where: { id },
      data: {
        status: FactoryOrderStatus.OPEN,
        approvedAt: new Date(),
        approvedById,
      },
    });
    return this.get(id);
  }

  async updateExternalCode(id: string, externalCode: string) {
    const order = await this.getRaw(id);
    if (!canAssignFactoryExternalCode(order.status)) {
      throw new BadRequestException("1C order code can be set only after approval");
    }
    const trimmed = externalCode.trim();
    await this.prisma.factoryOrder.update({
      where: { id },
      data: { externalCode: trimmed.length > 0 ? trimmed : null },
    });
    return this.get(id);
  }

  async updateStatus(id: string, status: FactoryOrderStatus) {
    await this.getRaw(id);
    await this.prisma.factoryOrder.update({
      where: { id },
      data: { status },
    });
    return this.get(id);
  }

  async updateDueAt(id: string, dueAtIso: string) {
    const order = await this.getRaw(id);
    if (order.status === FactoryOrderStatus.CLOSED || order.status === FactoryOrderStatus.CANCELLED) {
      throw new BadRequestException("Cannot reschedule a closed or cancelled order");
    }
    const dueAt = parseDueDate(dueAtIso);
    await this.prisma.factoryOrder.update({
      where: { id },
      data: { dueAt },
    });
    return this.get(id);
  }

  async updateReceived(
    id: string,
    lines: Array<{ partProductId: string; qtyReceived: number }>,
  ) {
    const order = await this.getRaw(id);
    if (
      order.status !== FactoryOrderStatus.OPEN &&
      order.status !== FactoryOrderStatus.PARTIAL &&
      order.status !== FactoryOrderStatus.CLOSED
    ) {
      throw new BadRequestException("Can only record receipts on approved factory orders");
    }
    for (const line of lines) {
      const existing = order.lines.find((l) => l.partProductId === line.partProductId);
      if (!existing) continue;
      await this.prisma.factoryOrderLine.update({
        where: { id: existing.id },
        data: { qtyReceived: Math.max(0, Math.round(line.qtyReceived)) },
      });
    }
    const refreshed = await this.getRaw(id);
    const allReceived = refreshed.lines.every((l) => l.qtyReceived >= l.qtyOrdered);
    const anyReceived = refreshed.lines.some((l) => l.qtyReceived > 0);
    const nextStatus = allReceived
      ? FactoryOrderStatus.CLOSED
      : anyReceived
        ? FactoryOrderStatus.PARTIAL
        : refreshed.status === FactoryOrderStatus.CLOSED
          ? FactoryOrderStatus.OPEN
          : refreshed.status;
    if (nextStatus !== refreshed.status) {
      await this.prisma.factoryOrder.update({
        where: { id },
        data: { status: nextStatus },
      });
    }
    return this.get(id);
  }

  async exportExcel(id: string): Promise<StreamableFile> {
    const order = await this.getRaw(id);
    const rows = order.lines.map((l) => ({
      sku: l.partProduct.sku,
      name: l.partProduct.name,
      qtyOrdered: l.qtyOrdered,
      qtyReceived: l.qtyReceived,
      lineDueAt: effectiveLineDueAt(l.dueAt, order.dueAt).toISOString().slice(0, 10),
      orderDueAt: order.dueAt.toISOString().slice(0, 10),
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
