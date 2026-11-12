import { Injectable, Logger } from "@nestjs/common";
import {
  LeadStatus,
  PaymentStatus,
  UserRole,
  VisitOutcome,
  VisitStatus,
} from "@prisma/client";
import { toUsd } from "../common/currency.util";
import { todayYmdKyiv } from "../crm-timezone";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { ExchangeRates } from "../settings/settings.service";
import { SettingsService } from "../settings/settings.service";
import type { ManagerDailyReportMetrics } from "./manager-daily-report.types";
import {
  buildDailyReportBody,
  buildDailyReportTitle,
  dayAndMonthBounds,
  emptyManagerDailyReportMetrics,
} from "./manager-daily-report.util";

function paymentToUsd(
  amountUsd: unknown,
  amount: unknown,
  currency: string | null | undefined,
  rates: ExchangeRates,
): number {
  if (amountUsd != null && amountUsd !== undefined) {
    const n = Number(amountUsd);
    if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  }
  const amt = Number(amount ?? 0);
  if (!Number.isFinite(amt)) return 0;
  return Math.round(toUsd(amt, currency, rates) * 100) / 100;
}

@Injectable()
export class ManagerDailyReportService {
  private readonly logger = new Logger(ManagerDailyReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  async sendDailyReports(dateRaw?: string): Promise<{ sent: number; skipped: number }> {
    const reportCfg = await this.settings.getTelegramDailyWorkReportConfig();
    if (!reportCfg.enabled) {
      return { sent: 0, skipped: 0 };
    }

    const dateYmd = dateRaw?.trim() || todayYmdKyiv();
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [UserRole.MANAGER, UserRole.LEAD] },
        telegramChatId: { not: null },
      },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    });
    if (recipients.length === 0) {
      return { sent: 0, skipped: 0 };
    }

    const leadIds =
      reportCfg.teamSummary
        ? recipients.filter((r) => r.role === UserRole.LEAD).map((r) => r.id)
        : [];
    const teamMembers =
      leadIds.length > 0
        ? await this.prisma.user.findMany({
            where: {
              isActive: true,
              leadId: { in: leadIds },
            },
            select: { id: true, fullName: true, leadId: true },
            orderBy: { fullName: "asc" },
          })
        : [];

    const userIds = Array.from(
      new Set([...recipients.map((r) => r.id), ...teamMembers.map((t) => t.id)]),
    );
    const metricsByUser = await this.collectMetrics(userIds, dateYmd);

    let sent = 0;
    let skipped = 0;
    const title = buildDailyReportTitle(dateYmd);

    for (const recipient of recipients) {
      const existing = await this.prisma.userNotification.findFirst({
        where: {
          userId: recipient.id,
          type: "DAILY_WORK_REPORT",
          entityId: dateYmd,
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const personal = metricsByUser.get(recipient.id) ?? emptyManagerDailyReportMetrics();
      const team =
        reportCfg.teamSummary && recipient.role === UserRole.LEAD
          ? teamMembers
              .filter((t) => t.leadId === recipient.id)
              .map((t) => ({
                fullName: t.fullName,
                metrics: metricsByUser.get(t.id) ?? emptyManagerDailyReportMetrics(),
              }))
          : [];

      const body = buildDailyReportBody({
        personal,
        team: team.length > 0 ? team : undefined,
      });

      const created = await this.notifications.create({
        userId: recipient.id,
        type: "DAILY_WORK_REPORT",
        title,
        body,
        entityType: "CALENDAR_DAY",
        entityId: dateYmd,
      });
      if (created) sent += 1;
      else skipped += 1;
    }

    this.logger.log(`Daily work reports for ${dateYmd}: sent=${sent} skipped=${skipped}`);
    return { sent, skipped };
  }

  async collectMetrics(
    userIds: string[],
    dateYmd: string,
  ): Promise<Map<string, ManagerDailyReportMetrics>> {
    const byUser = new Map<string, ManagerDailyReportMetrics>();
    for (const id of userIds) {
      byUser.set(id, emptyManagerDailyReportMetrics());
    }
    if (userIds.length === 0) return byUser;

    const { dayFrom, dayTo, monthFrom, monthTo } = dayAndMonthBounds(dateYmd);
    const rates = await this.settings.getExchangeRates();

    const [callGroups, visits, dayOrders, monthOrders, payments, leadsNew, leadsOpen] =
      await Promise.all([
        this.prisma.call.groupBy({
          by: ["managerUserId", "direction"],
          where: {
            startedAt: { gte: dayFrom, lte: dayTo },
            managerUserId: { in: userIds },
          },
          _count: { id: true },
        }),
        this.prisma.visit.findMany({
          where: {
            ownerId: { in: userIds },
            startsAt: { gte: dayFrom, lte: dayTo },
            status: { not: VisitStatus.CANCELED },
          },
          select: { ownerId: true, outcome: true },
        }),
        this.prisma.order.findMany({
          where: {
            ownerId: { in: userIds },
            createdAt: { gte: dayFrom, lte: dayTo },
          },
          select: { ownerId: true, totalAmount: true, currency: true },
        }),
        this.prisma.order.findMany({
          where: {
            ownerId: { in: userIds },
            createdAt: { gte: monthFrom, lte: monthTo },
          },
          select: { ownerId: true, totalAmount: true, currency: true },
        }),
        this.prisma.payment.findMany({
          where: {
            paidAt: { gte: dayFrom, lte: dayTo },
            status: PaymentStatus.COMPLETED,
            order: { ownerId: { in: userIds } },
          },
          select: {
            amount: true,
            amountUsd: true,
            currency: true,
            order: { select: { ownerId: true } },
          },
        }),
        this.prisma.lead.groupBy({
          by: ["ownerId"],
          where: {
            ownerId: { in: userIds },
            createdAt: { gte: dayFrom, lte: dayTo },
          },
          _count: { id: true },
        }),
        this.prisma.lead.groupBy({
          by: ["ownerId"],
          where: {
            ownerId: { in: userIds },
            status: { in: [LeadStatus.NEW, LeadStatus.IN_PROGRESS] },
          },
          _count: { id: true },
        }),
      ]);

    for (const g of callGroups) {
      const uid = g.managerUserId;
      if (!uid) continue;
      const row = byUser.get(uid);
      if (!row) continue;
      const dir = (g.direction || "").toUpperCase();
      if (dir === "INBOUND") row.callsInbound += g._count.id;
      else if (dir === "OUTBOUND") row.callsOutbound += g._count.id;
    }

    for (const visit of visits) {
      const row = byUser.get(visit.ownerId);
      if (!row) continue;
      row.visitsPlanned += 1;
      if (visit.outcome === VisitOutcome.SUCCESS) row.visitsSuccess += 1;
      if (visit.outcome === VisitOutcome.FAILED) row.visitsFailed += 1;
    }

    for (const order of dayOrders) {
      const row = byUser.get(order.ownerId);
      if (!row) continue;
      row.ordersCount += 1;
      row.ordersAmountUsd += toUsd(order.totalAmount, order.currency, rates);
    }

    for (const order of monthOrders) {
      const row = byUser.get(order.ownerId);
      if (!row) continue;
      row.monthSalesUsd += toUsd(order.totalAmount, order.currency, rates);
    }

    for (const payment of payments) {
      const uid = payment.order.ownerId;
      const row = byUser.get(uid);
      if (!row) continue;
      row.paymentsUsd += paymentToUsd(
        payment.amountUsd,
        payment.amount,
        payment.currency,
        rates,
      );
    }

    for (const g of leadsNew) {
      if (!g.ownerId) continue;
      const row = byUser.get(g.ownerId);
      if (row) row.leadsNew += g._count.id;
    }

    for (const g of leadsOpen) {
      if (!g.ownerId) continue;
      const row = byUser.get(g.ownerId);
      if (row) row.leadsOpen += g._count.id;
    }

    for (const row of byUser.values()) {
      row.ordersAmountUsd = Math.round(row.ordersAmountUsd * 100) / 100;
      row.monthSalesUsd = Math.round(row.monthSalesUsd * 100) / 100;
      row.paymentsUsd = Math.round(row.paymentsUsd * 100) / 100;
    }

    return byUser;
  }
}
