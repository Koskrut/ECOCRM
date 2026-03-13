import type { PrismaClient } from "@prisma/client";

/** Prisma client or transaction client (both have orderTtn). */
type PrismaWithOrderTtn = Pick<PrismaClient, "orderTtn">;

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
    where: { orderId, documentNumber: trimmed },
    select: { id: true },
  });
  if (existing) return;

  await prisma.orderTtn.create({
    data: {
      orderId,
      carrier: "NOVA_POSHTA",
      documentNumber: trimmed,
    },
  });
}
