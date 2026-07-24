import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { buildOrderOverduePaymentsWhere } from "../orders/orders-attention.util";
import { buildTaskOverdueWhere } from "../tasks/tasks-attention.util";
import { buildStuckOrdersBaseWhere, filterStuckOrders } from "../orders/orders-attention.util";
import { resolvePresetPeriod } from "../analytics/utils/analytics-date.util";
import { LEAD_ATTENTION_PRESETS, buildLeadAttentionWhere } from "../leads/leads-attention.util";
import type { CollectorSignal } from "./risk.types";

@Injectable()
export class RiskCollectorsService {
  constructor(private readonly prisma: PrismaService) {}

  async collectAll(): Promise<CollectorSignal[]> {
    const [
      credit,
      health,
      cash,
      fx,
      inv,
      mfg,
      ship,
      field,
      team,
      qa,
      lead,
      sys,
    ] = await Promise.all([
      this.collectClientCredit(),
      this.collectClientHealth(),
      this.collectCashOps(),
      this.collectFx(),
      this.collectInv(),
      this.collectMfg(),
      this.collectShip(),
      this.collectField(),
      this.collectTeam(),
      this.collectQa(),
      this.collectLead(),
      this.collectSys(),
    ]);
    return [
      ...credit,
      ...health,
      ...cash,
      ...fx,
      ...inv,
      ...mfg,
      ...ship,
      ...field,
      ...team,
      ...qa,
      ...lead,
      ...sys,
    ];
  }

  async collectClientCredit(): Promise<CollectorSignal[]> {
    const now = new Date();
    const overdueWhere = buildOrderOverduePaymentsWhere({});
    const overdueOrders = await this.prisma.order.findMany({
      where: overdueWhere,
      select: {
        id: true,
        clientId: true,
        companyId: true,
        debtAmount: true,
        paymentDueDate: true,
        client: { select: { firstName: true, lastName: true } },
      },
      take: 200,
    });

    const signals: CollectorSignal[] = [];
    for (const o of overdueOrders) {
      const subjectId = o.clientId ?? o.companyId;
      if (!subjectId) continue;
      const daysPastDue = o.paymentDueDate
        ? Math.max(0, Math.floor((now.getTime() - o.paymentDueDate.getTime()) / 86400000))
        : 0;
      signals.push({
        domain: "CLIENT_CREDIT",
        signalCode: daysPastDue >= 30 ? "DEBT_AGED_30" : "DEBT_OVERDUE",
        severity: daysPastDue >= 30 ? "CRITICAL" : daysPastDue >= 15 ? "HIGH" : "WARNING",
        subjectType: o.clientId ? "CONTACT" : "COMPANY",
        subjectId,
        subjectLabel: o.client
          ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ")
          : undefined,
        payload: { orderId: o.id, debtAmount: Number(o.debtAmount ?? 0), daysPastDue },
      });
    }
    return signals;
  }

  async collectClientHealth(): Promise<CollectorSignal[]> {
    const cutoff90 = new Date();
    cutoff90.setDate(cutoff90.getDate() - 90);
    const contacts = await this.prisma.contact.findMany({
      where: {
        ordersAsClient: { some: { createdAt: { lt: cutoff90 } } },
        OR: [
          { ordersAsClient: { none: { createdAt: { gte: cutoff90 } } } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, updatedAt: true },
      take: 100,
    });
    return contacts.map((c) => ({
      domain: "CLIENT_HEALTH" as const,
      signalCode: "DORMANT_NO_ORDER_90",
      severity: "WARNING" as const,
      subjectType: "CONTACT" as const,
      subjectId: c.id,
      subjectLabel: [c.firstName, c.lastName].filter(Boolean).join(" "),
    }));
  }

  async collectCashOps(): Promise<CollectorSignal[]> {
    const [unmatched, needsReview] = await Promise.all([
      this.prisma.bankTransaction.count({
        where: { matchStatus: { in: ["UNMATCHED", "PARTIALLY_MATCHED"] } },
      }),
      this.prisma.bankTransaction.count({ where: { matchStatus: "NEEDS_REVIEW" } }),
    ]);
    const signals: CollectorSignal[] = [];
    if (unmatched > 0) {
      signals.push({
        domain: "CASH_OPS",
        signalCode: "BANK_UNMATCHED",
        severity: unmatched > 20 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "bank",
        payload: { count: unmatched },
      });
    }
    if (needsReview > 0) {
      signals.push({
        domain: "CASH_OPS",
        signalCode: "BANK_NEEDS_REVIEW",
        severity: needsReview > 10 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "bank",
        payload: { count: needsReview },
      });
    }
    const deltaLines = await this.prisma.receivablesSnapshotLine.count({
      where: { status: { in: ["DELTA_1C_MORE", "DELTA_CRM_MORE", "ONLY_1C", "ONLY_CRM"] } },
    });
    if (deltaLines > 0) {
      signals.push({
        domain: "CASH_OPS",
        signalCode: "RECV_DELTA",
        severity: deltaLines > 50 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "receivables",
        payload: { count: deltaLines },
      });
    }
    return signals;
  }

  async collectFx(): Promise<CollectorSignal[]> {
    const fxOrders = await this.prisma.order.count({
      where: { fxWriteOffAmount: { gt: 0 } },
    });
    if (fxOrders === 0) return [];
    return [
      {
        domain: "FX",
        signalCode: "FX_WRITE_OFF_PRESENT",
        severity: fxOrders > 10 ? "WARNING" : "INFO",
        subjectType: "SYSTEM",
        subjectId: "fx",
        payload: { count: fxOrders },
      },
    ];
  }

  async collectInv(): Promise<CollectorSignal[]> {
    const awaitingStock = await this.prisma.order.count({
      where: { orderStage: "AWAITING_STOCK" },
    });
    if (awaitingStock === 0) return [];
    return [
      {
        domain: "INV",
        signalCode: "ORDERS_AWAITING_STOCK",
        severity: awaitingStock > 15 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "inventory",
        payload: { count: awaitingStock },
      },
    ];
  }

  async collectMfg(): Promise<CollectorSignal[]> {
    const [openBatches, overdueFactory] = await Promise.all([
      this.prisma.productionBatch.count({ where: { status: { in: ["DRAFT", "IN_PROGRESS"] } } }),
      this.prisma.factoryOrder.count({
        where: { dueAt: { lt: new Date() }, status: { notIn: ["CLOSED", "CANCELLED"] } },
      }),
    ]);
    const signals: CollectorSignal[] = [];
    if (openBatches > 0) {
      signals.push({
        domain: "MFG",
        signalCode: "WIP_OPEN_BATCHES",
        severity: openBatches > 20 ? "HIGH" : "INFO",
        subjectType: "SYSTEM",
        subjectId: "production",
        payload: { count: openBatches },
      });
    }
    if (overdueFactory > 0) {
      signals.push({
        domain: "MFG",
        signalCode: "FACTORY_OVERDUE",
        severity: overdueFactory > 5 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "factory",
        payload: { count: overdueFactory },
      });
    }
    return signals;
  }

  async collectShip(): Promise<CollectorSignal[]> {
    const refused = await this.prisma.order.count({
      where: { orderStage: "REFUSED" },
    });
    const noTtnReady = await this.prisma.order.count({
      where: {
        orderStage: { in: ["READY_TO_SHIP", "CONFIRMED"] },
        deliveryMethod: "NOVA_POSHTA",
        ttns: { none: {} },
      },
    });
    const signals: CollectorSignal[] = [];
    if (refused > 0) {
      signals.push({
        domain: "SHIP",
        signalCode: "ORDERS_REFUSED",
        severity: refused > 10 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "shipping",
        payload: { count: refused },
      });
    }
    if (noTtnReady > 0) {
      signals.push({
        domain: "SHIP",
        signalCode: "MISSING_TTN",
        severity: noTtnReady > 5 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "shipping",
        payload: { count: noTtnReady },
      });
    }
    return signals;
  }

  async collectField(): Promise<CollectorSignal[]> {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const [outside, noFix] = await Promise.all([
      this.prisma.visit.count({
        where: { completeGpsVerification: "OUTSIDE_RADIUS", completedAt: { gte: since } },
      }),
      this.prisma.visit.count({
        where: { completeGpsVerification: "NO_FIX", completedAt: { gte: since } },
      }),
    ]);
    const signals: CollectorSignal[] = [];
    if (outside > 0) {
      signals.push({
        domain: "FIELD",
        signalCode: "GPS_OUTSIDE_RADIUS",
        severity: outside > 10 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "field",
        payload: { count: outside },
      });
    }
    if (noFix > 0) {
      signals.push({
        domain: "FIELD",
        signalCode: "GPS_NO_FIX",
        severity: noFix > 15 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "field",
        payload: { count: noFix },
      });
    }
    return signals;
  }

  async collectTeam(): Promise<CollectorSignal[]> {
    const period = resolvePresetPeriod("month");
    const overdueTaskWhere = buildTaskOverdueWhere({});
    const stuckBase = buildStuckOrdersBaseWhere(period, {});
    const [overdueTasks, stuckCandidates] = await Promise.all([
      this.prisma.task.count({ where: overdueTaskWhere }),
      this.prisma.order.findMany({
        where: stuckBase,
        select: { id: true, updatedAt: true, statusHistory: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
        take: 600,
      }),
    ]);
    const stuck = filterStuckOrders(stuckCandidates, new Date()).length;
    const signals: CollectorSignal[] = [];
    if (overdueTasks > 0) {
      signals.push({
        domain: "TEAM",
        signalCode: "OVERDUE_TASKS",
        severity: overdueTasks > 30 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "team",
        payload: { count: overdueTasks },
      });
    }
    if (stuck > 0) {
      signals.push({
        domain: "TEAM",
        signalCode: "STUCK_ORDERS",
        severity: stuck > 20 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "team",
        payload: { count: stuck },
      });
    }
    return signals;
  }

  async collectQa(): Promise<CollectorSignal[]> {
    const [returnsInProgress, scrap] = await Promise.all([
      this.prisma.orderReturn.count({ where: { status: { not: "CLOSED" } } }),
      this.prisma.productionBatch.aggregate({ _sum: { qtyScrap: true } }),
    ]);
    const signals: CollectorSignal[] = [];
    if (returnsInProgress > 0) {
      signals.push({
        domain: "QA",
        signalCode: "RETURNS_IN_PROGRESS",
        severity: returnsInProgress > 10 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "returns",
        payload: { count: returnsInProgress },
      });
    }
    const scrapQty = scrap._sum.qtyScrap ?? 0;
    if (scrapQty > 0) {
      signals.push({
        domain: "QA",
        signalCode: "WIP_SCRAP",
        severity: scrapQty > 50 ? "HIGH" : "INFO",
        subjectType: "SYSTEM",
        subjectId: "production",
        payload: { qtyScrap: scrapQty },
      });
    }
    return signals;
  }

  async collectLead(): Promise<CollectorSignal[]> {
    const preset = LEAD_ATTENTION_PRESETS[0];
    if (!preset) return [];
    const where = buildLeadAttentionWhere(preset, "month");
    const count = await this.prisma.lead.count({ where: where as Prisma.LeadWhereInput });
    if (count === 0) return [];
    return [
      {
        domain: "LEAD",
        signalCode: "LEADS_NEED_ATTENTION",
        severity: count > 30 ? "HIGH" : "WARNING",
        subjectType: "SYSTEM",
        subjectId: "leads",
        payload: { count, preset },
      },
    ];
  }

  async collectSys(): Promise<CollectorSignal[]> {
    const latestSnapshot = await this.prisma.inventorySnapshot.findFirst({
      orderBy: { importedAt: "desc" },
      select: { importedAt: true },
    });
    const signals: CollectorSignal[] = [];
    if (latestSnapshot?.importedAt) {
      const ageHours = (Date.now() - latestSnapshot.importedAt.getTime()) / 3600000;
      if (ageHours > 48) {
        signals.push({
          domain: "SYS",
          signalCode: "SNAPSHOT_STALE",
          severity: ageHours > 96 ? "CRITICAL" : "HIGH",
          subjectType: "SYSTEM",
          subjectId: "inventory-snapshot",
          payload: { ageHours: Math.round(ageHours) },
        });
      }
    } else {
      signals.push({
        domain: "SYS",
        signalCode: "SNAPSHOT_MISSING",
        severity: "HIGH",
        subjectType: "SYSTEM",
        subjectId: "inventory-snapshot",
      });
    }
    return signals;
  }
}
