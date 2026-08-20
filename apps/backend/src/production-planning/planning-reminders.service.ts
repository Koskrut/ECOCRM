import { Injectable, Logger, Optional } from "@nestjs/common";
import { FactoryOrderStatus, PackingListStatus, UserRole } from "@prisma/client";
import { instantToKyivYmd, kyivDayBounds, todayYmdKyiv } from "../crm-timezone";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  countOverdueLines,
  effectiveLineDueAt,
  factoryLineTrackingStatus,
} from "./factory-order-tracking.util";

export type PlanningDueReminderItem = {
  id: string;
  kind: "factory" | "packing";
  dueAt: string;
  status: string;
  label: string;
  isOverdue: boolean;
  lineCount: number;
  totalQty: number;
  overdueLineCount?: number;
  overdueSkus?: string[];
};

@Injectable()
export class PlanningRemindersService {
  private readonly logger = new Logger(PlanningRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async getDueReminders(): Promise<PlanningDueReminderItem[]> {
    const todayYmd = todayYmdKyiv();
    const { to: endOfToday } = kyivDayBounds(todayYmd);

    const [factoryOrders, packingLists] = await Promise.all([
      this.prisma.factoryOrder.findMany({
        where: {
          status: { in: [FactoryOrderStatus.DRAFT, FactoryOrderStatus.OPEN, FactoryOrderStatus.PARTIAL] },
          OR: [
            { dueAt: { lte: endOfToday } },
            { lines: { some: { dueAt: { lte: endOfToday } } } },
          ],
        },
        orderBy: { dueAt: "asc" },
        take: 30,
        include: {
          lines: {
            select: {
              qtyOrdered: true,
              qtyReceived: true,
              dueAt: true,
              partProduct: { select: { sku: true } },
            },
          },
        },
      }),
      this.prisma.packingList.findMany({
        where: {
          cycleEnd: { lte: endOfToday },
          status: PackingListStatus.APPROVED,
        },
        orderBy: { cycleEnd: "asc" },
        take: 30,
        include: {
          lines: { select: { qtyApproved: true } },
        },
      }),
    ]);

    const items: PlanningDueReminderItem[] = [];

    for (const order of factoryOrders) {
      const overdueLineCount = countOverdueLines(order.lines, order.dueAt, todayYmd);
      const overdueSkus = order.lines
        .filter(
          (l) =>
            factoryLineTrackingStatus({
              qtyOrdered: l.qtyOrdered,
              qtyReceived: l.qtyReceived,
              effectiveDueAt: effectiveLineDueAt(l.dueAt, order.dueAt),
              todayYmd,
            }) === "overdue",
        )
        .map((l) => l.partProduct.sku)
        .slice(0, 3);
      const nearestOpen = order.lines
        .filter((l) => l.qtyReceived < l.qtyOrdered)
        .map((l) => instantToKyivYmd(effectiveLineDueAt(l.dueAt, order.dueAt)))
        .sort()[0];
      const dueYmd = nearestOpen ?? instantToKyivYmd(order.dueAt);
      const isOverdue = overdueLineCount > 0 || dueYmd < todayYmd;
      items.push({
        id: order.id,
        kind: "factory",
        dueAt: order.dueAt.toISOString(),
        status: order.status,
        label: order.externalCode
          ? `Замовлення на завод ${order.externalCode}`
          : "Замовлення на завод",
        isOverdue,
        lineCount: order.lines.length,
        totalQty: order.lines.reduce((s, l) => s + l.qtyOrdered, 0),
        overdueLineCount,
        overdueSkus,
      });
    }

    for (const list of packingLists) {
      const dueYmd = instantToKyivYmd(list.cycleEnd);
      items.push({
        id: list.id,
        kind: "packing",
        dueAt: list.cycleEnd.toISOString(),
        status: list.status,
        label: "Список упаковки",
        isOverdue: dueYmd < todayYmd,
        lineCount: list.lines.length,
        totalQty: list.lines.reduce((s, l) => s + l.qtyApproved, 0),
      });
    }

    items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return items;
  }

  /** Send in-app/push reminders for factory orders and packing lists due today (once per entity per day). */
  async sendDueReminders(): Promise<{ notified: number; skipped: number }> {
    if (!this.notifications) {
      return { notified: 0, skipped: 0 };
    }

    const todayYmd = todayYmdKyiv();
    const { from: dayStart, to: endOfToday } = kyivDayBounds(todayYmd);

    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [UserRole.ADMIN, UserRole.LEAD, UserRole.WAREHOUSE] },
      },
      select: { id: true },
    });
    if (recipients.length === 0) {
      return { notified: 0, skipped: 0 };
    }

    const [factoryOrders, packingLists] = await Promise.all([
      this.prisma.factoryOrder.findMany({
        where: {
          status: { in: [FactoryOrderStatus.DRAFT, FactoryOrderStatus.OPEN, FactoryOrderStatus.PARTIAL] },
          OR: [
            { dueAt: { lte: endOfToday } },
            { lines: { some: { dueAt: { lte: endOfToday } } } },
          ],
        },
        include: {
          lines: {
            select: {
              qtyOrdered: true,
              qtyReceived: true,
              dueAt: true,
              partProduct: { select: { sku: true } },
            },
          },
        },
      }),
      this.prisma.packingList.findMany({
        where: {
          cycleEnd: { lte: endOfToday },
          status: PackingListStatus.APPROVED,
        },
        include: { lines: { select: { qtyApproved: true } } },
      }),
    ]);

    const factoryIds = factoryOrders.map((o) => o.id);
    const packingIds = packingLists.map((l) => l.id);

    const [sentFactory, sentPacking] = await Promise.all([
      factoryIds.length
        ? this.prisma.userNotification.findMany({
            where: {
              type: "PLANNING_FACTORY_DUE",
              entityType: "FACTORY_ORDER",
              entityId: { in: factoryIds },
              createdAt: { gte: dayStart },
            },
            select: { entityId: true },
          })
        : [],
      packingIds.length
        ? this.prisma.userNotification.findMany({
            where: {
              type: "PLANNING_PACKING_DUE",
              entityType: "PACKING_LIST",
              entityId: { in: packingIds },
              createdAt: { gte: dayStart },
            },
            select: { entityId: true },
          })
        : [],
    ]);

    const sentFactoryIds = new Set(
      sentFactory.map((n) => n.entityId).filter((id): id is string => id != null),
    );
    const sentPackingIds = new Set(
      sentPacking.map((n) => n.entityId).filter((id): id is string => id != null),
    );

    let notified = 0;
    let skipped = 0;

    for (const order of factoryOrders) {
      if (sentFactoryIds.has(order.id)) {
        skipped += 1;
        continue;
      }
      const overdueLineCount = countOverdueLines(order.lines, order.dueAt, todayYmd);
      const overdueSkus = order.lines
        .filter(
          (l) =>
            factoryLineTrackingStatus({
              qtyOrdered: l.qtyOrdered,
              qtyReceived: l.qtyReceived,
              effectiveDueAt: effectiveLineDueAt(l.dueAt, order.dueAt),
              todayYmd,
            }) === "overdue",
        )
        .map((l) => l.partProduct.sku)
        .slice(0, 3);
      const dueYmd = instantToKyivYmd(order.dueAt);
      const isOverdue = overdueLineCount > 0 || dueYmd < todayYmd;
      const qty = order.lines.reduce((s, l) => s + l.qtyOrdered, 0);
      const skuHint = overdueSkus.length > 0 ? `: ${overdueSkus.join(", ")}` : "";
      const overdueHint =
        overdueLineCount > 0 ? ` ${overdueLineCount} поз. прострочено${skuHint}.` : "";
      const title = isOverdue ? "Прострочене замовлення на завод" : "Термін замовлення на завод";
      const body = isOverdue
        ? `Замовлення (${order.lines.length} поз., ${qty} шт) прострочене.${overdueHint} Підтвердіть надходження або перенесіть термін.`
        : `Сьогодні термін замовлення на завод (${order.lines.length} поз., ${qty} шт). Підтвердіть надходження або перенесіть термін.`;

      for (const user of recipients) {
        await this.notifications.notifyPlanningFactoryDue({
          userId: user.id,
          orderId: order.id,
          title,
          body,
          dueYmd,
          isOverdue,
        });
        notified += 1;
      }
    }

    for (const list of packingLists) {
      if (sentPackingIds.has(list.id)) {
        skipped += 1;
        continue;
      }
      const dueYmd = instantToKyivYmd(list.cycleEnd);
      const isOverdue = dueYmd < todayYmd;
      const qty = list.lines.reduce((s, l) => s + l.qtyApproved, 0);
      const title = isOverdue ? "Прострочена упаковка" : "Термін упаковки комплектів";
      const body = isOverdue
        ? `Список упаковки (${list.lines.length} поз., ${qty} шт) прострочений з ${dueYmd}. Позначте виконаним або перенесіть термін.`
        : `Сьогодні термін упаковки (${list.lines.length} поз., ${qty} шт). Позначте виконаним або перенесіть термін.`;

      for (const user of recipients) {
        await this.notifications.notifyPlanningPackingDue({
          userId: user.id,
          packingListId: list.id,
          title,
          body,
          dueYmd,
          isOverdue,
        });
        notified += 1;
      }
    }

    if (notified > 0) {
      this.logger.log(`Planning due reminders sent: ${notified} (skipped entities ${skipped})`);
    }

    return { notified, skipped };
  }
}
