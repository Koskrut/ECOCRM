import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { exportUnitPrice } from "../../orders/order-line-total.utils";
import { PrismaService } from "../../prisma/prisma.service";
import { officeToolsCreateAcc } from "./office-tools-client";
import { OfficeToolsConfigService } from "./office-tools-config.service";
import { OfficeToolsContactService } from "./office-tools-contact.service";
import { OFFICE_TOOLS_ENTITY } from "./office-tools.constants";
import {
  buildAccCreateBody,
  buildAccDetails,
  kyivDateString,
  toInt,
} from "./office-tools.util";

@Injectable()
export class OfficeToolsOrderService {
  private readonly logger = new Logger(OfficeToolsOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OfficeToolsConfigService,
    private readonly contactsOt: OfficeToolsContactService,
  ) {}

  async sendOrder(orderId: string, options?: { exportDate?: Date }): Promise<{ chid: number; docid: number }> {
    const cfg = await this.config.requireActiveConfig();

    const existingLink = await this.prisma.officeToolsLink.findUnique({
      where: {
        entityType_entityId: {
          entityType: OFFICE_TOOLS_ENTITY.ORDER,
          entityId: orderId,
        },
      },
    });
    if (existingLink?.externalId && !existingLink.lastError) {
      const docid = toInt(existingLink.externalId);
      const chid = toInt((existingLink.meta as { chid?: number } | null)?.chid);
      if (docid != null) {
        this.logger.log(`Order ${orderId} already sent to Office Tools as docid=${docid}`);
        return { chid: chid ?? docid, docid };
      }
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: true,
        contact: true,
        warehouse: true,
        items: {
          include: {
            product: { select: { id: true, sku: true, externalCode: true } },
            serials: { select: { serial: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const contact = order.contact ?? order.client;
    if (!contact) throw new BadRequestException("Order has no contact for Office Tools");

    const { compId } = await this.contactsOt.ensureContactLinked(contact.id);

    let stockId = cfg.stockId ?? 1;
    if (order.warehouseId) {
      const whLink = await this.prisma.officeToolsLink.findUnique({
        where: {
          entityType_entityId: {
            entityType: OFFICE_TOOLS_ENTITY.WAREHOUSE,
            entityId: order.warehouseId,
          },
        },
      });
      const linkedStock = whLink ? toInt(whLink.externalId) : null;
      if (linkedStock != null) stockId = linkedStock;
    }

    const missing: string[] = [];
    const lines: Array<{ prodId: number; qty: number; price: number; serials: string[] }> = [];
    for (const item of order.items) {
      const productId = item.productId;
      let prodId: number | null = null;
      if (productId) {
        const link = await this.prisma.officeToolsLink.findUnique({
          where: {
            entityType_entityId: {
              entityType: OFFICE_TOOLS_ENTITY.PRODUCT,
              entityId: productId,
            },
          },
        });
        prodId = link ? toInt(link.externalId) : null;
        if (prodId == null && item.product?.externalCode) {
          const n = toInt(item.product.externalCode);
          if (n != null) prodId = n;
        }
      }
      if (prodId == null) {
        missing.push(item.product?.sku ?? item.productNameSnapshot ?? item.id);
        continue;
      }
      lines.push({
        prodId,
        qty: item.qty,
        price: exportUnitPrice(item),
        serials: item.serials.map((s) => s.serial),
      });
    }
    if (missing.length) {
      throw new BadRequestException(
        `Office Tools: немає ProdID для позицій: ${missing.join(", ")}`,
      );
    }
    if (!lines.length) {
      throw new BadRequestException("Order has no lines for Office Tools");
    }

    const docDate = kyivDateString(options?.exportDate ?? new Date());
    const body = buildAccCreateBody({
      docDate,
      stockId,
      compId,
      codeId1: cfg.codeId1 ?? 60,
      empId: cfg.empId ?? 1,
      currId: cfg.currId ?? 980,
      notes: order.comment?.trim() || `CRM ${order.orderNumber}`,
      managerId: cfg.managerId ?? 1,
      details: buildAccDetails({ lines }),
    });

    const result = await officeToolsCreateAcc(this.config.requestContext(cfg), body);
    const docid = toInt(result.docid);
    const chid = toInt(result.chid);
    if (docid == null) {
      throw new BadRequestException("Office Tools acc/create returned no docid");
    }

    await this.prisma.officeToolsLink.upsert({
      where: {
        entityType_entityId: {
          entityType: OFFICE_TOOLS_ENTITY.ORDER,
          entityId: orderId,
        },
      },
      create: {
        entityType: OFFICE_TOOLS_ENTITY.ORDER,
        entityId: orderId,
        externalId: String(docid),
        meta: { chid, docid },
        lastError: null,
        lastSyncedAt: new Date(),
      },
      update: {
        externalId: String(docid),
        meta: { chid, docid },
        lastError: null,
        lastSyncedAt: new Date(),
      },
    });

    this.logger.log(`Sent order ${orderId} to Office Tools docid=${docid} chid=${chid}`);
    return { chid: chid ?? docid, docid };
  }
}
