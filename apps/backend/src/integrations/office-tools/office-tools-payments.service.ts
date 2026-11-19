import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PaymentSourceType, PaymentStatus, Prisma } from "@prisma/client";
import { PaymentsService } from "../../payments/payments.service";
import { PrismaService } from "../../prisma/prisma.service";
import { officeToolsListAllPages, officeToolsListCompRec } from "./office-tools-client";
import { OfficeToolsConfigService } from "./office-tools-config.service";
import { OFFICE_TOOLS_ENTITY, OFFICE_TOOLS_INTEGRATION } from "./office-tools.constants";
import type { OfficeToolsCompRec } from "./office-tools.types";
import { receiptImportKey, toFloat, toInt } from "./office-tools.util";

@Injectable()
export class OfficeToolsPaymentsService {
  private readonly logger = new Logger(OfficeToolsPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OfficeToolsConfigService,
    private readonly payments: PaymentsService,
  ) {}

  async syncCompRec(params?: { fromDate?: string }): Promise<{
    fetched: number;
    created: number;
    matched: number;
    unmatched: number;
  }> {
    const cfg = await this.config.requireActiveConfig();
    const syncState = await this.prisma.integrationSyncState.findUnique({
      where: {
        integration_entity: {
          integration: OFFICE_TOOLS_INTEGRATION,
          entity: "comprec",
        },
      },
    });
    const fromDate = params?.fromDate || syncState?.lastCursor || undefined;

    const filter: Record<string, unknown> = {};
    if (fromDate) {
      filter.DocDate = { ">=": fromDate };
    }

    const rows = await officeToolsListAllPages((offset, limit) =>
      officeToolsListCompRec(cfg.baseUrl, {
        SELECT: [],
        FILTER: filter as never,
        ORDER: { DocDate: "ASC" },
        LIMIT: limit,
        OFFSET: offset,
      }),
    );

    let created = 0;
    let matched = 0;
    let unmatched = 0;
    let maxDocDate = fromDate ?? null;

    for (const row of rows) {
      const importKey = receiptImportKey(row);
      const amount = toFloat(row.SumCC ?? row.SumMC);
      if (!Number.isFinite(amount) || amount === 0) continue;

      const docDate = row.DocDate ? new Date(`${row.DocDate}T12:00:00.000Z`) : null;
      if (row.DocDate && (!maxDocDate || row.DocDate > maxDocDate)) maxDocDate = row.DocDate;

      const existing = await this.prisma.officeToolsReceipt.findUnique({
        where: { importKey },
      });
      if (existing) {
        if (existing.status === "matched") matched += 1;
        else unmatched += 1;
        continue;
      }

      const contactId = await this.resolveContactId(row);
      const receipt = await this.prisma.officeToolsReceipt.create({
        data: {
          importKey,
          compId: toInt(row.CompID),
          code: row.Code != null ? String(row.Code) : null,
          contactId,
          docDate,
          amount: new Prisma.Decimal(amount),
          currency: "UAH",
          managerName: row.ManagerName ?? null,
          compName: row.CompName ?? null,
          raw: row as object,
          status: "unmatched",
        },
      });
      created += 1;

      if (contactId) {
        const orderId = await this.findUniqueOpenOrderMatch(contactId, amount);
        if (orderId) {
          await this.applyReceiptToOrder(receipt.id, orderId);
          matched += 1;
        } else {
          unmatched += 1;
        }
      } else {
        unmatched += 1;
      }
    }

    await this.prisma.integrationSyncState.upsert({
      where: {
        integration_entity: {
          integration: OFFICE_TOOLS_INTEGRATION,
          entity: "comprec",
        },
      },
      create: {
        integration: OFFICE_TOOLS_INTEGRATION,
        entity: "comprec",
        lastSyncAt: new Date(),
        lastRunAt: new Date(),
        lastCursor: maxDocDate,
        status: "ok",
      },
      update: {
        lastSyncAt: new Date(),
        lastRunAt: new Date(),
        lastCursor: maxDocDate,
        status: "ok",
        error: null,
      },
    });

    this.logger.log(
      `Office Tools comprec sync: fetched=${rows.length} created=${created} matched=${matched}`,
    );
    return { fetched: rows.length, created, matched, unmatched };
  }

  async listUnmatched(limit = 100) {
    return this.prisma.officeToolsReceipt.findMany({
      where: { status: "unmatched" },
      orderBy: [{ docDate: "desc" }, { createdAt: "desc" }],
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  async matchReceipt(receiptId: string, orderId: string) {
    const receipt = await this.prisma.officeToolsReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt) throw new NotFoundException("Receipt not found");
    if (receipt.status === "matched" && receipt.paymentId) {
      return receipt;
    }
    return this.applyReceiptToOrder(receiptId, orderId);
  }

  private async applyReceiptToOrder(receiptId: string, orderId: string) {
    const receipt = await this.prisma.officeToolsReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt) throw new NotFoundException("Receipt not found");
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        contactId: true,
        clientId: true,
        companyId: true,
        currency: true,
      },
    });
    if (!order) throw new NotFoundException("Order not found");

    const amount = Number(receipt.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Invalid receipt amount");
    }

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        contactId: order.contactId ?? order.clientId ?? receipt.contactId,
        companyId: order.companyId ?? null,
        sourceType: PaymentSourceType.OFFICE_TOOLS,
        amount: receipt.amount,
        currency: receipt.currency || order.currency || "UAH",
        paidAt: receipt.docDate ?? new Date(),
        status: PaymentStatus.COMPLETED,
        note: `Office Tools ${receipt.compName ?? ""}`.trim(),
        oneCImportKey: `office_tools:${receipt.importKey}`,
      },
    });

    const updated = await this.prisma.officeToolsReceipt.update({
      where: { id: receiptId },
      data: {
        orderId: order.id,
        paymentId: payment.id,
        status: "matched",
      },
    });

    await this.payments.recalcOrder(order.id);
    return updated;
  }

  private async resolveContactId(row: OfficeToolsCompRec): Promise<string | null> {
    const compId = toInt(row.CompID);
    if (compId != null) {
      const link = await this.prisma.officeToolsLink.findUnique({
        where: {
          entityType_externalId: {
            entityType: OFFICE_TOOLS_ENTITY.CONTACT,
            externalId: String(compId),
          },
        },
      });
      if (link) return link.entityId;
    }
    const code = row.Code != null ? String(row.Code).trim() : "";
    if (code) {
      const byCode = await this.prisma.contact.findFirst({
        where: { externalCode: code },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      if (byCode) return byCode.id;
    }
    return null;
  }

  private async findUniqueOpenOrderMatch(contactId: string, amount: number): Promise<string | null> {
    const orders = await this.prisma.order.findMany({
      where: {
        OR: [{ contactId }, { clientId: contactId }],
        debtAmount: { gt: 0 },
        orderStage: { notIn: ["CANCELED", "FULLY_RETURNED"] },
      },
      select: { id: true, debtAmount: true },
      take: 20,
    });
    const matches = orders.filter((o) => Math.abs(o.debtAmount - amount) < 0.01);
    return matches.length === 1 ? matches[0].id : null;
  }
}
