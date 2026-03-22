import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Structured context for voice/LLM providers — JSON-serializable. */
export type CrmContextPack = Record<string, unknown>;

const MAX_LEAD_ANSWERS = 30;
const MAX_ORDERS_SUMMARY = 15;
const TOP_PRODUCTS_LIMIT = 8;

@Injectable()
export class CrmContextPackService {
  constructor(private readonly prisma: PrismaService) {}

  async buildForLead(leadId: string): Promise<CrmContextPack> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            phoneNormalized: true,
            city: true,
            region: true,
          },
        },
        answers: { take: MAX_LEAD_ANSWERS, orderBy: { createdAt: "asc" } },
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");

    const displayName =
      lead.fullName?.trim() ||
      [lead.lastName, lead.firstName].filter(Boolean).join(" ").trim() ||
      lead.name?.trim() ||
      lead.phone ||
      "Невідомо";

    return {
      "lead.id": lead.id,
      "lead.displayName": displayName,
      "lead.phone": lead.phone ?? lead.phoneNormalized ?? "",
      "lead.status": lead.status,
      "lead.source": lead.source,
      "lead.channel": lead.channel,
      "lead.message": lead.message ?? "",
      "lead.comment": lead.comment ?? "",
      "lead.city": lead.city ?? "",
      "lead.companyName": lead.companyName ?? lead.company?.name ?? "",
      "lead.ownerName": lead.owner?.fullName ?? "",
      "lead.ownerId": lead.ownerId ?? null,
      "company.name": lead.company?.name ?? "",
      "company.id": lead.companyId,
      "contact.id": lead.contactId ?? null,
      "lead.answers": lead.answers.map((a) => ({ key: a.key, value: a.value })),
    };
  }

  async buildForDormantContact(
    contactId: string,
    opts?: { orderHistoryLimit?: number },
  ): Promise<CrmContextPack> {
    const limit = opts?.orderHistoryLimit ?? MAX_ORDERS_SUMMARY;
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");

    const orders = await this.prisma.order.findMany({
      where: { clientId: contactId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        totalAmount: true,
        currency: true,
        items: {
          take: 20,
          select: {
            qty: true,
            productNameSnapshot: true,
            product: { select: { name: true, sku: true } },
          },
        },
      },
    });

    let lastOrderDate: Date | null = null;
    const productCounts = new Map<string, number>();
    let sumTotals = 0;
    let nTotals = 0;

    for (const o of orders) {
      if (!lastOrderDate) lastOrderDate = o.createdAt;
      sumTotals += o.totalAmount;
      nTotals += 1;
      for (const it of o.items) {
        const label = it.product?.name ?? it.productNameSnapshot ?? it.product?.sku ?? "unknown";
        productCounts.set(label, (productCounts.get(label) ?? 0) + it.qty);
      }
    }

    const topProducts = [...productCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_PRODUCTS_LIMIT)
      .map(([name, qty]) => ({ name, qty }));

    const displayName = [contact.lastName, contact.firstName].filter(Boolean).join(" ").trim();

    return {
      "contact.id": contact.id,
      "contact.displayName": displayName,
      "contact.phone": contact.phone,
      "contact.phoneNormalized": contact.phoneNormalized ?? "",
      "contact.city": contact.city ?? "",
      "contact.region": contact.region ?? "",
      "contact.marketingCallOptOut": contact.marketingCallOptOut,
      "contact.ownerName": contact.owner?.fullName ?? "",
      "contact.ownerId": contact.ownerId ?? null,
      "company.name": contact.company?.name ?? "",
      "company.id": contact.companyId,
      "orders.lastOrderDate": lastOrderDate?.toISOString() ?? null,
      "orders.orderCount": orders.length,
      "orders.avgOrderTotal": nTotals > 0 ? Math.round((sumTotals / nTotals) * 100) / 100 : 0,
      "orders.topProductCategories": topProducts,
      "orders.recentOrderNumbers": orders.slice(0, 5).map((o) => o.orderNumber),
    };
  }
}
