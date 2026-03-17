import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type OrderDocumentsUpdate = {
  invoiceNumber?: string;
  invoiceDate?: string;
  waybillNumber?: string;
  waybillDate?: string;
};

@Injectable()
export class GoogleSheetOrderDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Update order document fields (from 1C push). Only provided fields are updated.
   */
  async updateOrderDocuments(orderId: string, data: OrderDocumentsUpdate): Promise<{ ok: true }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const update: Record<string, unknown> = {};
    if (data.invoiceNumber !== undefined) update.invoiceNumber = data.invoiceNumber || null;
    if (data.invoiceDate !== undefined) {
      update.invoiceDate = data.invoiceDate ? new Date(data.invoiceDate) : null;
    }
    if (data.waybillNumber !== undefined) update.waybillNumber = data.waybillNumber || null;
    if (data.waybillDate !== undefined) {
      update.waybillDate = data.waybillDate ? new Date(data.waybillDate) : null;
    }

    if (Object.keys(update).length > 0) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: update as Record<string, unknown>,
      });
    }

    return { ok: true };
  }
}
