import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from "@nestjs/common";
import {
  InventorySnapshotStatus,
  PackingListStatus,
  ProductKind,
} from "@prisma/client";
import * as XLSX from "xlsx";
import { PrismaService } from "../prisma/prisma.service";
import { mixKitDemand, uncoveredKitDemand } from "./demand-mix.util";
import { ForecastService } from "./forecast.service";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningSettingsService } from "./planning-settings.service";
import { assertFreshSnapshot, evaluateSnapshotFreshness } from "./snapshot-freshness.util";

type PackLineDraft = {
  kitProductId: string;
  qtySuggested: number;
  qtyApproved: number;
  maxFromParts: number;
  priority: number;
  hardNeed: number;
  forecastNeed: number;
  stockKits: number;
  targetPack: number;
};

@Injectable()
export class PackingListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlanningSettingsService,
    private readonly forecast: ForecastService,
    private readonly calculations: PlanningCalculationService,
  ) {}

  list(limit = 20) {
    return this.prisma.packingList.findMany({
      take: Math.min(100, Math.max(1, limit)),
      orderBy: { cycleStart: "desc" },
      include: {
        _count: { select: { lines: true } },
        snapshot: { select: { id: true, postedAt: true } },
      },
    });
  }

  async get(id: string) {
    const list = await this.prisma.packingList.findUnique({
      where: { id },
      include: {
        lines: {
          include: { kitProduct: { select: { id: true, sku: true, name: true } } },
          orderBy: [{ priority: "asc" }, { qtyApproved: "desc" }],
        },
        snapshot: { select: { id: true, postedAt: true, status: true } },
      },
    });
    if (!list) throw new NotFoundException("Packing list not found");
    return list;
  }

  async propose(cycleStartIso?: string) {
    const settings = await this.settings.getSettings();
    const posted = await this.prisma.inventorySnapshot.findFirst({
      where: { status: InventorySnapshotStatus.POSTED },
      orderBy: { postedAt: "desc" },
    });
    const freshness = evaluateSnapshotFreshness(posted, settings.snapshotMaxAgeDays);
    assertFreshSnapshot(freshness);

    const cycleStart = cycleStartIso ? startOfDay(new Date(cycleStartIso)) : startOfDay(new Date());
    if (Number.isNaN(cycleStart.getTime())) throw new BadRequestException("Invalid cycleStart");
    const cycleEnd = new Date(cycleStart);
    cycleEnd.setDate(cycleEnd.getDate() + settings.packCycleDays);

    const forecast14 = await this.forecast.getForecastMap(14);
    const demand = await this.calculations.getDemandByProduct();
    const kits = await this.prisma.product.findMany({
      where: { kind: ProductKind.KIT, isActive: true },
      select: { id: true },
    });

    type Candidate = {
      kitProductId: string;
      forecastNeed: number;
      hardNeed: number;
      softNeed: number;
      stockKits: number;
      targetPack: number;
      priority: number;
    };

    const candidates: Candidate[] = [];
    for (const kit of kits) {
      const stock = await this.calculations.getAvailability(kit.id);
      const stockKits = stock.available;
      const hardNeed = demand.get(kit.id)?.hard ?? 0;
      const softNeed = demand.get(kit.id)?.soft ?? 0;
      const forecastNeed = forecast14.get(kit.id) ?? 0;
      const mixedNeed = mixKitDemand(settings.demandMix, hardNeed, forecastNeed, softNeed);
      const targetPack = uncoveredKitDemand(mixedNeed, stockKits);
      if (targetPack <= 0) continue;
      candidates.push({
        kitProductId: kit.id,
        forecastNeed,
        hardNeed,
        softNeed,
        stockKits,
        targetPack,
        priority: hardNeed > stockKits ? 0 : 1,
      });
    }

    candidates.sort((a, b) => a.priority - b.priority || b.targetPack - a.targetPack);

    const capacityLimit = settings.packCapacityPerCycle;
    let remainingCap = capacityLimit;
    const allocated = new Map<string, number>();

    for (const c of candidates.filter((x) => x.priority === 0)) {
      if (remainingCap <= 0) break;
      const take = Math.min(c.targetPack, remainingCap);
      allocated.set(c.kitProductId, take);
      remainingCap -= take;
    }

    const soft = candidates.filter((x) => x.priority === 1 && x.targetPack > 0);
    const softTotal = soft.reduce((s, x) => s + x.targetPack, 0);
    if (remainingCap > 0 && softTotal > 0) {
      for (const c of soft) {
        const share = Math.floor((c.targetPack / softTotal) * remainingCap);
        if (share <= 0) continue;
        allocated.set(c.kitProductId, Math.min(c.targetPack, (allocated.get(c.kitProductId) ?? 0) + share));
      }
      const used = [...allocated.values()].reduce((a, b) => a + b, 0);
      let residual = capacityLimit - used;
      for (const c of soft) {
        if (residual <= 0) break;
        const cur = allocated.get(c.kitProductId) ?? 0;
        const room = c.targetPack - cur;
        if (room <= 0) continue;
        const add = Math.min(room, residual);
        allocated.set(c.kitProductId, cur + add);
        residual -= add;
      }
    }

    const partStock = new Map<string, number>();
    const bomByKit = new Map<
      string,
      Array<{ componentProductId: string; qtyPerKit: number }>
    >();

    const loadBom = async (kitProductId: string) => {
      let bom = bomByKit.get(kitProductId);
      if (bom) return bom;
      const row = await this.prisma.kitBom.findFirst({
        where: { kitProductId, isActive: true },
        include: { lines: true },
        orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }],
      });
      bom =
        row?.lines.map((l) => ({
          componentProductId: l.componentProductId,
          qtyPerKit: l.qtyPerKit.toNumber(),
        })) ?? [];
      bomByKit.set(kitProductId, bom);
      return bom;
    };

    const maxBuildFromParts = async (kitProductId: string, desired: number) => {
      const bom = await loadBom(kitProductId);
      if (bom.length === 0) return 0;
      const ratios: number[] = [];
      for (const line of bom) {
        let avail = partStock.get(line.componentProductId);
        if (avail == null) {
          avail = (await this.calculations.getAvailability(line.componentProductId)).available;
          partStock.set(line.componentProductId, avail);
        }
        ratios.push(line.qtyPerKit > 0 ? Math.floor(avail / line.qtyPerKit) : 0);
      }
      return Math.min(desired, ...ratios);
    };

    const consumeParts = async (kitProductId: string, qty: number) => {
      const bom = await loadBom(kitProductId);
      for (const line of bom) {
        const prev = partStock.get(line.componentProductId) ?? 0;
        partStock.set(line.componentProductId, Math.max(0, prev - qty * line.qtyPerKit));
      }
    };

    const lines: PackLineDraft[] = [];

    for (const c of candidates) {
      const desired = allocated.get(c.kitProductId) ?? 0;
      if (desired <= 0) continue;
      const maxFromParts = await maxBuildFromParts(c.kitProductId, desired);
      if (maxFromParts > 0) await consumeParts(c.kitProductId, maxFromParts);
      lines.push({
        kitProductId: c.kitProductId,
        qtySuggested: maxFromParts,
        qtyApproved: maxFromParts,
        maxFromParts,
        priority: c.priority,
        hardNeed: c.hardNeed,
        forecastNeed: c.forecastNeed,
        stockKits: c.stockKits,
        targetPack: c.targetPack,
      });
    }

    // Redistribute leftover capacity to kits that still have room vs target and parts.
    let used = lines.reduce((s, l) => s + l.qtyApproved, 0);
    let leftover = capacityLimit - used;
    if (leftover > 0) {
      for (const line of lines) {
        if (leftover <= 0) break;
        const roomToTarget = Math.max(0, line.targetPack - line.qtyApproved);
        if (roomToTarget <= 0) continue;
        const extraCap = await maxBuildFromParts(line.kitProductId, Math.min(roomToTarget, leftover));
        if (extraCap <= 0) continue;
        await consumeParts(line.kitProductId, extraCap);
        line.qtyApproved += extraCap;
        line.qtySuggested += extraCap;
        line.maxFromParts += extraCap;
        leftover -= extraCap;
        used += extraCap;
      }
    }

    const created = await this.prisma.packingList.create({
      data: {
        cycleStart,
        cycleEnd,
        status: PackingListStatus.DRAFT,
        capacityUsed: used,
        capacityLimit,
        snapshotId: posted!.id,
        lines: {
          create: lines.map((l) => ({
            kitProductId: l.kitProductId,
            qtySuggested: l.qtySuggested,
            qtyApproved: l.qtyApproved,
            maxFromParts: l.maxFromParts,
            priority: l.priority,
            hardNeed: l.hardNeed,
            forecastNeed: l.forecastNeed,
            stockKits: l.stockKits,
          })),
        },
      },
      include: {
        lines: {
          include: { kitProduct: { select: { id: true, sku: true, name: true } } },
          orderBy: [{ priority: "asc" }, { qtyApproved: "desc" }],
        },
      },
    });
    return { list: created, freshness };
  }

  async updateLines(
    id: string,
    lines: Array<{ kitProductId: string; qtyApproved: number }>,
  ) {
    const list = await this.get(id);
    if (list.status !== PackingListStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT packing lists can be edited");
    }

    const nextQty = new Map(list.lines.map((l) => [l.kitProductId, l.qtyApproved]));
    for (const line of lines) {
      const existing = list.lines.find((l) => l.kitProductId === line.kitProductId);
      if (!existing) continue;
      const qty = Math.max(0, Math.round(line.qtyApproved));
      if (qty > existing.maxFromParts) {
        throw new BadRequestException(
          `Qty for ${existing.kitProduct.sku} exceeds parts capacity (${existing.maxFromParts})`,
        );
      }
      nextQty.set(line.kitProductId, qty);
    }

    const capacityUsed = [...nextQty.values()].reduce((a, b) => a + b, 0);
    if (capacityUsed > list.capacityLimit) {
      throw new BadRequestException(
        `Capacity exceeded: ${capacityUsed} > ${list.capacityLimit}`,
      );
    }

    await this.prisma.$transaction(
      list.lines.map((existing) =>
        this.prisma.packingListLine.update({
          where: { id: existing.id },
          data: { qtyApproved: nextQty.get(existing.kitProductId) ?? existing.qtyApproved },
        }),
      ),
    );

    return this.prisma.packingList.update({
      where: { id },
      data: { capacityUsed },
      include: {
        lines: {
          include: { kitProduct: { select: { id: true, sku: true, name: true } } },
          orderBy: [{ priority: "asc" }, { qtyApproved: "desc" }],
        },
      },
    });
  }

  async approve(id: string, approvedById: string) {
    const list = await this.get(id);
    if (list.status !== PackingListStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT packing lists can be approved");
    }
    if (list.capacityUsed > list.capacityLimit) {
      throw new BadRequestException("Capacity used exceeds limit");
    }
    const settings = await this.settings.getSettings();
    const posted = await this.prisma.inventorySnapshot.findFirst({
      where: { status: InventorySnapshotStatus.POSTED },
      orderBy: { postedAt: "desc" },
    });
    assertFreshSnapshot(evaluateSnapshotFreshness(posted, settings.snapshotMaxAgeDays));

    return this.prisma.packingList.update({
      where: { id },
      data: {
        status: PackingListStatus.APPROVED,
        approvedAt: new Date(),
        approvedById,
      },
      include: {
        lines: {
          include: { kitProduct: { select: { id: true, sku: true, name: true } } },
        },
      },
    });
  }

  async markDone(id: string) {
    const list = await this.get(id);
    if (list.status !== PackingListStatus.APPROVED) {
      throw new BadRequestException("Only APPROVED packing lists can be marked DONE");
    }
    return this.prisma.packingList.update({
      where: { id },
      data: { status: PackingListStatus.DONE },
      include: {
        lines: {
          include: { kitProduct: { select: { id: true, sku: true, name: true } } },
        },
      },
    });
  }

  async exportExcel(id: string): Promise<StreamableFile> {
    const list = await this.get(id);
    const rows = list.lines.map((l) => ({
      sku: l.kitProduct.sku,
      name: l.kitProduct.name,
      qtySuggested: l.qtySuggested,
      qtyApproved: l.qtyApproved,
      maxFromParts: l.maxFromParts,
      hardNeed: l.hardNeed,
      forecastNeed: l.forecastNeed,
      stockKits: l.stockKits,
      priority: l.priority,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "PackingList");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const date = list.cycleStart.toISOString().slice(0, 10);
    return new StreamableFile(buffer, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename="packing-list-${date}.xlsx"`,
    });
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
