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
import { instantToKyivYmd, kyivDayBounds } from "../crm-timezone";
import { constrainsKitCapacity, displayBottleneckSku, isNonInventoriedPackagingSku } from "./bom-part.util";
import { mixKitDemand, uncoveredKitDemand } from "./demand-mix.util";
import { ForecastService } from "./forecast.service";
import { packCycleEndUtc, packCycleStartUtc, resolvePackCycleStartUtc } from "./pack-cycle.util";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningSettingsService } from "./planning-settings.service";
import { filterPackableProposedLines } from "./planning-packable-lines.util";
import { assertFreshSnapshot, evaluateSnapshotFreshness } from "./snapshot-freshness.util";
import { MrpConfigService } from "./mrp-config.service";
import { DemandForecastService } from "./demand-forecast.service";
import { computeCoverTarget, computeKitPositionPlan, abcRank, assignParetoClasses } from "./kit-portfolio.util";
import type { ParetoClass } from "./kit-portfolio.util";

type BomPartLine = {
  componentProductId: string;
  qtyPerKit: number;
  scrapPct: number;
  sku: string;
};

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
    private readonly mrpConfig: MrpConfigService,
    private readonly demandForecast: DemandForecastService,
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
          include: { kitProduct: { select: { id: true, sku: true, name: true, kind: true } } },
          orderBy: [{ priority: "asc" }, { qtyApproved: "desc" }],
        },
        snapshot: { select: { id: true, postedAt: true, status: true } },
      },
    });
    if (!list) throw new NotFoundException("Packing list not found");
    return {
      ...list,
      lines: await this.enrichLines(list.lines),
    };
  }

  /** Attach live bottleneck / target pack hint for UI (no DB migration). */
  private async enrichLines<
    T extends {
      kitProductId: string;
      maxFromParts: number;
      hardNeed: number;
      forecastNeed: number;
      stockKits: number;
      qtyApproved: number;
      kitProduct?: { kind?: ProductKind };
    },
  >(lines: T[]) {
    const [settings, packDemand, horizon] = await Promise.all([
      this.settings.getSettings(),
      this.calculations.getPackDemandByProduct(),
      this.mrpConfig.getHorizon(),
    ]);
    const warnWeeks = Math.round((horizon.warnCoverDays / 7) * 10) / 10;
    const kitIds = lines
      .filter((l) => l.kitProduct?.kind !== ProductKind.PART)
      .map((l) => l.kitProductId);
    const forecastMap =
      kitIds.length > 0 ? await this.demandForecast.getDemandForecastMap(kitIds) : new Map();
    const capCache = new Map<
      string,
      Awaited<ReturnType<PlanningCalculationService["getKitCapacity"]>>
    >();
    return Promise.all(
      lines.map(async (line) => {
        const isPart = line.kitProduct?.kind === ProductKind.PART;
        let bottleneckSku: string | null = null;
        let bottleneckName: string | null = null;
        let cap: Awaited<ReturnType<PlanningCalculationService["getKitCapacity"]>> | undefined;
        let parts: Array<{
          sku: string;
          name: string;
          qtyPerKit: number;
          available: number;
          isBottleneck: boolean;
        }> = [];
        if (!isPart) {
          cap = capCache.get(line.kitProductId);
          if (!cap) {
            cap = await this.calculations.getKitCapacity(line.kitProductId);
            capCache.set(line.kitProductId, cap);
          }
          const bottleneck = cap.components.find(
            (c) => c.componentProductId === cap!.bottleneckComponentId,
          );
          bottleneckSku = bottleneck?.product
            ? displayBottleneckSku(bottleneck.product.sku, bottleneck.product.name)
            : null;
          bottleneckName = bottleneck?.product?.name ?? bottleneckSku;
          parts = cap.components
            .filter((c) => c.constrainsCapacity && c.product)
            .map((c) => ({
              sku: displayBottleneckSku(c.product!.sku, c.product!.name),
              name: c.product!.name,
              qtyPerKit: c.qtyPerKit,
              available: c.available,
              isBottleneck: c.componentProductId === cap!.bottleneckComponentId,
            }));
        }
        const packRow = packDemand.get(line.kitProductId);
        const hardNeed = packRow?.hard ?? line.hardNeed;
        const softNeed = packRow?.soft ?? 0;
        const mixedNeed = mixKitDemand(
          settings.demandMix,
          hardNeed,
          line.forecastNeed,
          softNeed,
        );
        const targetPack = uncoveredKitDemand(mixedNeed, line.stockKits);
        const partsBlocked = !isPart && targetPack > 0 && line.maxFromParts < targetPack;
        let coverTarget = 0;
        let targetStock = 0;
        let stockNow = line.stockKits;
        let canPackNow = 0;
        let toWork = 0;
        let suggestedFactoryPartQty = 0;
        if (!isPart) {
          const avgMonthlySold = forecastMap.get(line.kitProductId)?.avgMonthlySold ?? 0;
          const maxBuildNow = line.maxFromParts;
          const plan = computeKitPositionPlan({
            stockFinished: line.stockKits,
            maxBuildNow,
            weeklyPackNeed: targetPack,
            coverTarget: computeCoverTarget({ avgMonthlySold, warnWeeks }),
            alreadyInRequest: line.qtyApproved,
          });
          coverTarget = plan.coverTarget;
          targetStock = plan.targetStock;
          stockNow = plan.stockNow;
          canPackNow = plan.canPackNow;
          toWork = plan.toWork;
          if (toWork > 0 && cap) {
            const bottleneck = cap.components.find(
              (c) => c.componentProductId === cap!.bottleneckComponentId,
            );
            const qtyPerKit = bottleneck?.qtyPerKit ?? 0;
            const avail = bottleneck?.available ?? 0;
            suggestedFactoryPartQty = Math.max(
              1,
              Math.ceil(toWork * Math.max(0, qtyPerKit)) - Math.floor(avail),
            );
          }
        }
        return {
          ...line,
          bottleneckSku,
          bottleneckName,
          parts,
          targetPack,
          partsBlocked,
          coverTarget,
          targetStock,
          stockNow,
          canPackNow,
          toWork,
          suggestedFactoryPartQty,
        };
      }),
    );
  }

  /** Friday cron: keep an existing draft/approved list; do not overwrite. */
  async proposeForCurrentCycle(replaceDraft = false) {
    const cycleStart = packCycleStartUtc();
    const existing = await this.prisma.packingList.findFirst({
      where: {
        cycleStart,
        status: { in: [PackingListStatus.DRAFT, PackingListStatus.APPROVED] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing?.status === PackingListStatus.APPROVED) {
      return { skipped: true as const, reason: "already_approved", list: await this.get(existing.id) };
    }
    if (existing?.status === PackingListStatus.DRAFT && !replaceDraft) {
      return { skipped: true as const, reason: "draft_exists", list: await this.get(existing.id) };
    }
    return { skipped: false as const, ...(await this.propose()) };
  }

  async propose(cycleStartIso?: string) {
    const settings = await this.settings.getSettings();
    const posted = await this.prisma.inventorySnapshot.findFirst({
      where: { status: InventorySnapshotStatus.POSTED },
      orderBy: { postedAt: "desc" },
    });
    const freshness = evaluateSnapshotFreshness(posted, settings.snapshotMaxAgeDays);
    assertFreshSnapshot(freshness);

    let cycleStart: Date;
    try {
      cycleStart = resolvePackCycleStartUtc(cycleStartIso);
    } catch {
      throw new BadRequestException("Invalid cycleStart");
    }
    const cycleEnd = packCycleEndUtc(instantToKyivYmd(cycleStart), settings.packCycleDays);

    const forecastCycle = await this.forecast.getForecastMap(settings.packCycleDays);
    const demand = await this.calculations.getPackDemandByProduct();
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
      paretoClass: ParetoClass;
    };

    const revenueByKit = new Map<string, number>();
    const revenueRows = await this.prisma.orderItem.findMany({
      where: {
        productId: { in: kits.map((k) => k.id) },
        order: {
          orderStage: { notIn: ["CANCELED", "REFUSED"] },
        },
      },
      select: { productId: true, qty: true, price: true },
      take: 50_000,
    });
    for (const row of revenueRows) {
      if (!row.productId) continue;
      revenueByKit.set(
        row.productId,
        (revenueByKit.get(row.productId) ?? 0) + row.price * row.qty,
      );
    }
    const paretoById = new Map(
      assignParetoClasses(
        kits.map((k) => ({
          productId: k.id,
          revenue: revenueByKit.get(k.id) ?? 0,
        })),
      ).map((r) => [r.productId, r.paretoClass]),
    );

    const candidates: Candidate[] = [];
    for (const kit of kits) {
      const stock = await this.calculations.getAvailability(kit.id);
      const stockKits = stock.available;
      const hardNeed = demand.get(kit.id)?.hard ?? 0;
      const softNeed = demand.get(kit.id)?.soft ?? 0;
      const forecastNeed = forecastCycle.get(kit.id) ?? 0;
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
        paretoClass: paretoById.get(kit.id) ?? "C",
      });
    }

    candidates.sort(
      (a, b) =>
        a.priority - b.priority ||
        abcRank(a.paretoClass) - abcRank(b.paretoClass) ||
        b.targetPack - a.targetPack,
    );

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
    for (const c of soft) {
      if (remainingCap <= 0) break;
      const take = Math.min(c.targetPack, remainingCap);
      if (take <= 0) continue;
      allocated.set(c.kitProductId, (allocated.get(c.kitProductId) ?? 0) + take);
      remainingCap -= take;
    }

    const partStock = new Map<string, number>();
    const bomByKit = new Map<string, BomPartLine[]>();

    const lines: PackLineDraft[] = [];

    for (const c of candidates) {
      const desired = allocated.get(c.kitProductId) ?? 0;
      if (desired > 0) {
        const maxFromParts = await this.maxBuildFromParts(
          c.kitProductId,
          desired,
          partStock,
          bomByKit,
        );
        if (maxFromParts > 0 && maxFromParts >= settings.minPackLot) {
          await this.consumeParts(c.kitProductId, maxFromParts, partStock, bomByKit);
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
          continue;
        }
      }
      const canNow =
        desired > 0
          ? 0
          : await this.maxBuildFromParts(c.kitProductId, c.targetPack, partStock, bomByKit);
      if (canNow <= 0) {
        lines.push({
          kitProductId: c.kitProductId,
          qtySuggested: 0,
          qtyApproved: 0,
          maxFromParts: 0,
          priority: c.priority,
          hardNeed: c.hardNeed,
          forecastNeed: c.forecastNeed,
          stockKits: c.stockKits,
          targetPack: c.targetPack,
        });
      }
    }

    // Redistribute leftover capacity to kits that still have room vs target and parts.
    let used = lines.reduce((s, l) => s + l.qtyApproved, 0);
    let leftover = capacityLimit - used;
    if (leftover > 0) {
      for (const line of lines) {
        if (leftover <= 0) break;
        if (line.maxFromParts <= 0) continue;
        const roomToTarget = Math.max(0, line.targetPack - line.qtyApproved);
        if (roomToTarget <= 0) continue;
        const extraCap = await this.maxBuildFromParts(
          line.kitProductId,
          Math.min(roomToTarget, leftover),
          partStock,
          bomByKit,
        );
        if (extraCap <= 0) continue;
        await this.consumeParts(line.kitProductId, extraCap, partStock, bomByKit);
        line.qtyApproved += extraCap;
        line.qtySuggested += extraCap;
        line.maxFromParts += extraCap;
        leftover -= extraCap;
        used += extraCap;
      }
    }
    if (leftover > 0) {
      const inRequest = new Set(lines.filter((l) => l.qtyApproved > 0).map((l) => l.kitProductId));
      for (const c of candidates) {
        if (leftover <= 0) break;
        if (inRequest.has(c.kitProductId)) continue;
        const existing = lines.find((l) => l.kitProductId === c.kitProductId);
        const already = existing?.qtyApproved ?? 0;
        const room = c.targetPack - already;
        if (room <= 0) continue;
        const extraCap = await this.maxBuildFromParts(
          c.kitProductId,
          Math.min(room, leftover),
          partStock,
          bomByKit,
        );
        if (extraCap <= 0) continue;
        if (!existing && extraCap < settings.minPackLot) continue;
        await this.consumeParts(c.kitProductId, extraCap, partStock, bomByKit);
        if (existing) {
          existing.qtyApproved += extraCap;
          existing.qtySuggested += extraCap;
          existing.maxFromParts += extraCap;
        } else {
          lines.push({
            kitProductId: c.kitProductId,
            qtySuggested: extraCap,
            qtyApproved: extraCap,
            maxFromParts: extraCap,
            priority: c.priority,
            hardNeed: c.hardNeed,
            forecastNeed: c.forecastNeed,
            stockKits: c.stockKits,
            targetPack: c.targetPack,
          });
        }
        inRequest.add(c.kitProductId);
        leftover -= extraCap;
        used += extraCap;
      }
    }

    const partLines = await this.buildPartPackLines({
      settings,
      forecastCycle,
      demand,
      capacityLimit,
      usedCapacity: lines.reduce((s, l) => s + l.qtyApproved, 0),
    });
    lines.push(...partLines);

    const persisted = filterPackableProposedLines(lines);
    if (persisted.length === 0) {
      throw new BadRequestException(
        "No packing need this week — finished kits already cover orders and the weekly forecast",
      );
    }
    used = persisted.reduce((s, l) => s + l.qtyApproved, 0);

    const approvedSameCycle = await this.prisma.packingList.findFirst({
      where: { cycleStart, status: PackingListStatus.APPROVED },
      select: { id: true },
    });
    if (approvedSameCycle) {
      throw new BadRequestException("This week's packing list is already approved");
    }
    const draftSameCycle = await this.prisma.packingList.findFirst({
      where: { cycleStart, status: PackingListStatus.DRAFT },
      select: { id: true },
    });
    if (draftSameCycle) {
      await this.prisma.packingList.delete({ where: { id: draftSameCycle.id } });
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
          create: persisted.map((l) => ({
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
          include: { kitProduct: { select: { id: true, sku: true, name: true, kind: true } } },
          orderBy: [{ priority: "asc" }, { qtyApproved: "desc" }],
        },
      },
    });
    return {
      list: {
        ...created,
        lines: await this.enrichLines(created.lines),
      },
      freshness,
    };
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

    const updated = await this.prisma.packingList.update({
      where: { id },
      data: { capacityUsed },
      include: {
        lines: {
          include: { kitProduct: { select: { id: true, sku: true, name: true, kind: true } } },
          orderBy: [{ priority: "asc" }, { qtyApproved: "desc" }],
        },
      },
    });
    return { ...updated, lines: await this.enrichLines(updated.lines) };
  }

  /** Add or raise a kit on the Friday draft from the kit board. */
  async addOrSetKitQty(id: string, kitProductId: string, qtyApproved: number) {
    const list = await this.get(id);
    if (list.status !== PackingListStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT packing lists can be edited");
    }
    const kit = await this.prisma.product.findFirst({
      where: { id: kitProductId, kind: ProductKind.KIT, isActive: true },
      select: { id: true, sku: true },
    });
    if (!kit) throw new BadRequestException("kitProductId is invalid");

    const qty = Math.max(0, Math.round(qtyApproved));
    const capacity = await this.calculations.getKitCapacity(kitProductId);
    const maxFromParts = capacity.maxBuildNow;
    if (qty > maxFromParts) {
      throw new BadRequestException(
        `Qty for ${kit.sku} exceeds parts capacity (${maxFromParts})`,
      );
    }

    const existing = list.lines.find((l) => l.kitProductId === kitProductId);
    const otherUsed = list.lines
      .filter((l) => l.kitProductId !== kitProductId)
      .reduce((s, l) => s + l.qtyApproved, 0);
    if (otherUsed + qty > list.capacityLimit) {
      throw new BadRequestException(`Capacity exceeded: ${otherUsed + qty} > ${list.capacityLimit}`);
    }

    if (existing) {
      await this.prisma.packingListLine.update({
        where: { id: existing.id },
        data: { qtyApproved: qty, maxFromParts },
      });
    } else {
      const [demand, stock] = await Promise.all([
        this.calculations.getDemandByProduct(),
        this.calculations.getAvailability(kitProductId),
      ]);
      const hardNeed = demand.get(kitProductId)?.hard ?? 0;
      await this.prisma.packingListLine.create({
        data: {
          packingListId: id,
          kitProductId,
          qtySuggested: qty,
          qtyApproved: qty,
          maxFromParts,
          priority: hardNeed > stock.available ? 0 : 1,
          hardNeed,
          forecastNeed: 0,
          stockKits: stock.available,
        },
      });
    }

    const capacityUsed = otherUsed + qty;
    await this.prisma.packingList.update({
      where: { id },
      data: { capacityUsed },
    });
    return this.get(id);
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
    await this.assertApprovedQtyFeasible(list.lines);

    const approved = await this.prisma.packingList.update({
      where: { id },
      data: {
        status: PackingListStatus.APPROVED,
        approvedAt: new Date(),
        approvedById,
      },
      include: {
        lines: {
          include: { kitProduct: { select: { id: true, sku: true, name: true, kind: true } } },
        },
      },
    });
    return { ...approved, lines: await this.enrichLines(approved.lines) };
  }

  async markDone(id: string) {
    const list = await this.get(id);
    if (list.status !== PackingListStatus.APPROVED) {
      throw new BadRequestException("Only APPROVED packing lists can be marked DONE");
    }
    const done = await this.prisma.packingList.update({
      where: { id },
      data: { status: PackingListStatus.DONE },
      include: {
        lines: {
          include: { kitProduct: { select: { id: true, sku: true, name: true, kind: true } } },
        },
      },
    });
    return { ...done, lines: await this.enrichLines(done.lines) };
  }

  async updateCycleEnd(id: string, cycleEndIso: string) {
    const list = await this.get(id);
    if (list.status === PackingListStatus.DONE) {
      throw new BadRequestException("Cannot reschedule a completed packing list");
    }
    const cycleEnd = parseCycleEndDate(cycleEndIso);
    if (cycleEnd.getTime() < list.cycleStart.getTime()) {
      throw new BadRequestException("cycleEnd must be on or after cycleStart");
    }
    const updated = await this.prisma.packingList.update({
      where: { id },
      data: { cycleEnd },
      include: {
        lines: {
          include: { kitProduct: { select: { id: true, sku: true, name: true, kind: true } } },
        },
      },
    });
    return { ...updated, lines: await this.enrichLines(updated.lines) };
  }

  async deleteList(id: string) {
    const list = await this.get(id);
    if (list.status === PackingListStatus.DONE) {
      throw new BadRequestException("Completed packing lists cannot be deleted");
    }
    await this.prisma.packingList.delete({ where: { id } });
    return { deleted: true, id };
  }

  async deleteLine(id: string, lineId: string) {
    const list = await this.get(id);
    if (list.status !== PackingListStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT packing lists can remove lines");
    }
    const line = list.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException("Packing list line not found");
    await this.prisma.packingListLine.delete({ where: { id: lineId } });
    const remaining = list.lines.filter((l) => l.id !== lineId);
    const capacityUsed = remaining.reduce((s, l) => s + l.qtyApproved, 0);
    await this.prisma.packingList.update({
      where: { id },
      data: { capacityUsed },
    });
    return this.get(id);
  }

  async reopen(id: string) {
    const list = await this.get(id);
    if (list.status !== PackingListStatus.APPROVED) {
      throw new BadRequestException("Only APPROVED packing lists can be reopened");
    }
    const reopened = await this.prisma.packingList.update({
      where: { id },
      data: {
        status: PackingListStatus.DRAFT,
        approvedAt: null,
        approvedById: null,
      },
      include: {
        lines: {
          include: { kitProduct: { select: { id: true, sku: true, name: true, kind: true } } },
          orderBy: [{ priority: "asc" }, { qtyApproved: "desc" }],
        },
      },
    });
    return { ...reopened, lines: await this.enrichLines(reopened.lines) };
  }

  private async buildPartPackLines(input: {
    settings: Awaited<ReturnType<PlanningSettingsService["getSettings"]>>;
    forecastCycle: Map<string, number>;
    demand: Map<string, { hard: number; soft: number }>;
    capacityLimit: number;
    usedCapacity: number;
  }): Promise<PackLineDraft[]> {
    const unplannedIds = new Set(
      (
        await this.prisma.planningProductParams.findMany({
          where: { isPlanned: false },
          select: { productId: true },
        })
      ).map((p) => p.productId),
    );

    const parts = await this.prisma.product.findMany({
      where: {
        kind: ProductKind.PART,
        isActive: true,
        id: { notIn: [...unplannedIds] },
      },
      select: { id: true, sku: true },
    });
    const packableParts = parts.filter((p) => !isNonInventoriedPackagingSku(p.sku));
    if (packableParts.length === 0) return [];

    const packReadyByPart = await this.calculations.getPackReadyByProduct(
      packableParts.map((p) => p.id),
    );

    type PartCandidate = {
      productId: string;
      forecastNeed: number;
      hardNeed: number;
      stockOnHand: number;
      packReady: number;
      targetPack: number;
      priority: number;
      qtyNow: number;
    };

    const candidates: PartCandidate[] = [];
    for (const part of packableParts) {
      const packReady = packReadyByPart.get(part.id) ?? 0;
      if (packReady <= 0) continue;

      const stock = await this.calculations.getAvailability(part.id);
      const hardNeed = input.demand.get(part.id)?.hard ?? 0;
      const softNeed = input.demand.get(part.id)?.soft ?? 0;
      const forecastNeed = input.forecastCycle.get(part.id) ?? 0;
      const mixedNeed = mixKitDemand(
        input.settings.demandMix,
        hardNeed,
        forecastNeed,
        softNeed,
      );
      const demandPack = uncoveredKitDemand(mixedNeed, stock.available);
      const targetPack = demandPack > 0 ? demandPack : packReady;
      const qtyNow = Math.min(packReady, targetPack);
      if (qtyNow <= 0) continue;

      candidates.push({
        productId: part.id,
        forecastNeed,
        hardNeed,
        stockOnHand: stock.available,
        packReady,
        targetPack,
        priority: hardNeed > stock.available ? 0 : 1,
        qtyNow,
      });
    }

    candidates.sort((a, b) => a.priority - b.priority || b.targetPack - a.targetPack);

    let remainingCap = Math.max(0, input.capacityLimit - input.usedCapacity);
    const allocated = new Map<string, number>();

    for (const c of candidates.filter((x) => x.priority === 0)) {
      if (remainingCap <= 0) break;
      const take = Math.min(c.qtyNow, remainingCap);
      if (take <= 0) continue;
      allocated.set(c.productId, take);
      remainingCap -= take;
    }

    const soft = candidates.filter((x) => x.priority === 1);
    const softTotal = soft.reduce((s, x) => s + x.qtyNow, 0);
    if (remainingCap > 0 && softTotal > 0) {
      for (const c of soft) {
        const share = Math.floor((c.qtyNow / softTotal) * remainingCap);
        if (share <= 0) continue;
        allocated.set(
          c.productId,
          Math.min(c.qtyNow, (allocated.get(c.productId) ?? 0) + share),
        );
      }
      const used = [...allocated.values()].reduce((a, b) => a + b, 0);
      let residual = input.capacityLimit - input.usedCapacity - used;
      for (const c of soft) {
        if (residual <= 0) break;
        const cur = allocated.get(c.productId) ?? 0;
        const room = c.qtyNow - cur;
        if (room <= 0) continue;
        const add = Math.min(room, residual);
        allocated.set(c.productId, cur + add);
        residual -= add;
      }
    }

    const lines: PackLineDraft[] = [];
    for (const c of candidates) {
      const qtyApproved = allocated.get(c.productId) ?? 0;
      if (qtyApproved <= 0) continue;
      lines.push({
        kitProductId: c.productId,
        qtySuggested: qtyApproved,
        qtyApproved,
        maxFromParts: c.packReady,
        priority: c.priority,
        hardNeed: c.hardNeed,
        forecastNeed: c.forecastNeed,
        stockKits: c.stockOnHand,
        targetPack: c.targetPack,
      });
    }
    return lines;
  }

  private async loadInventoriableBom(
    kitProductId: string,
    bomByKit: Map<string, BomPartLine[]>,
  ): Promise<BomPartLine[]> {
    const cached = bomByKit.get(kitProductId);
    if (cached) return cached;
    const row = await this.prisma.kitBom.findFirst({
      where: { kitProductId, isActive: true },
      include: {
        lines: { include: { component: { select: { sku: true, name: true } } } },
      },
      orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }],
    });
    const bom =
      row?.lines
        .filter((l) => constrainsKitCapacity({ sku: l.component?.sku, name: l.component?.name }))
        .map((l) => ({
          componentProductId: l.componentProductId,
          qtyPerKit: l.qtyPerKit.toNumber(),
          scrapPct: l.scrapPct?.toNumber() ?? 0,
          sku: l.component?.sku ?? "",
        })) ?? [];
    bomByKit.set(kitProductId, bom);
    return bom;
  }

  private async maxBuildFromParts(
    kitProductId: string,
    desired: number,
    partStock: Map<string, number>,
    bomByKit: Map<string, BomPartLine[]>,
  ): Promise<number> {
    const bom = await this.loadInventoriableBom(kitProductId, bomByKit);
    if (bom.length === 0) return 0;
    const ratios: number[] = [];
    for (const line of bom) {
      let avail = partStock.get(line.componentProductId);
      if (avail == null) {
        avail = (await this.calculations.getAvailability(line.componentProductId)).available;
        partStock.set(line.componentProductId, avail);
      }
      ratios.push(
        line.qtyPerKit > 0
          ? Math.floor(avail / (line.qtyPerKit * (1 + line.scrapPct / 100)))
          : 0,
      );
    }
    return Math.min(desired, ...ratios);
  }

  private async consumeParts(
    kitProductId: string,
    qty: number,
    partStock: Map<string, number>,
    bomByKit: Map<string, BomPartLine[]>,
  ): Promise<void> {
    const bom = await this.loadInventoriableBom(kitProductId, bomByKit);
    for (const line of bom) {
      const prev = partStock.get(line.componentProductId) ?? 0;
      const effectiveQtyPerKit = line.qtyPerKit * (1 + line.scrapPct / 100);
      partStock.set(line.componentProductId, Math.max(0, prev - qty * effectiveQtyPerKit));
    }
  }

  private async assertApprovedQtyFeasible(
    lines: Array<{
      kitProductId: string;
      qtyApproved: number;
      maxFromParts: number;
      kitProduct: { sku: string; kind: ProductKind };
    }>,
  ): Promise<void> {
    const partStock = new Map<string, number>();
    const bomByKit = new Map<string, BomPartLine[]>();
    for (const line of lines) {
      if (line.qtyApproved <= 0) continue;
      if (line.kitProduct.kind === ProductKind.PART) {
        if (line.qtyApproved > line.maxFromParts) {
          throw new BadRequestException(
            `Not enough WIP for ${line.kitProduct.sku}: can pack ${line.maxFromParts}, listed ${line.qtyApproved}`,
          );
        }
        continue;
      }
      const max = await this.maxBuildFromParts(
        line.kitProductId,
        line.qtyApproved,
        partStock,
        bomByKit,
      );
      if (max < line.qtyApproved) {
        throw new BadRequestException(
          `Not enough parts for ${line.kitProduct.sku}: can pack ${max}, listed ${line.qtyApproved}`,
        );
      }
      await this.consumeParts(line.kitProductId, line.qtyApproved, partStock, bomByKit);
    }
  }

  async exportExcel(id: string): Promise<StreamableFile> {
    const list = await this.get(id);
    const rows = list.lines.map((l) => ({
      kitSku: l.kitProduct.sku,
      kitName: l.kitProduct.name,
      parts: (l.parts ?? [])
        .map((p) => `${p.name || p.sku} x${p.qtyPerKit} (stock ${p.available})`)
        .join("; "),
      need: l.targetPack,
      canAssemble: l.maxFromParts,
      inRequest: l.qtyApproved,
      missingPart: l.bottleneckName ?? l.bottleneckSku ?? "",
      why: l.priority === 0 ? "orders" : "stock",
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

function parseCycleEndDate(iso: string): Date {
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return kyivDayBounds(trimmed).to;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException("Invalid cycleEnd date");
  }
  return d;
}
