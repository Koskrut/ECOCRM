import type { PrismaClient } from "@prisma/client";

/** Prisma client or transaction client for TTN + shipment compatibility. */
type PrismaWithOrderTtn = Pick<PrismaClient, "orderTtn" | "shipment" | "order">;

/**
 * Ensure an OrderTtn record exists for the order with the given document number (from Bitrix UF_CRM_TTN_NUMBER).
 * If one already exists with this documentNumber for the order, no-op. Otherwise creates it with carrier NOVA_POSHTA.
 */
export async function ensureOrderTtnFromBitrix(
  prisma: PrismaWithOrderTtn,
  orderId: string,
  documentNumber: string,
): Promise<void> {
  const trimmed = documentNumber.trim();
  if (!trimmed) return;

  const existing = await prisma.orderTtn.findFirst({
    where: {
      documentNumber: trimmed,
      OR: [{ orderId }, { shipment: { orderId } }],
    },
    select: { id: true },
  });
  if (existing) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, contactId: true, clientId: true },
  });
  if (!order) return;

  let shipment = await prisma.shipment.findFirst({
    where: { orderId, status: { not: "CANCELED" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!shipment) {
    shipment = await prisma.shipment.create({
      data: {
        orderId,
        contactId: order.contactId ?? order.clientId ?? null,
        carrier: "NOVA_POSHTA",
        status: "DRAFT",
      },
      select: { id: true },
    });
  }

  await prisma.orderTtn.create({
    data: {
      orderId,
      shipmentId: shipment.id,
      carrier: "NOVA_POSHTA",
      documentNumber: trimmed,
    },
  });
}
