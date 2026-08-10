/**
 * One-shot cleanup of ACTIVE MaterialReservation rows that disagree with orderStage.
 *
 * Use after deploying reservation-policy fixes (NP/Bitrix stage writes) or after
 * a Bitrix migration that left shipped/canceled orders with ACTIVE HARD reserves.
 *
 * Usage (from apps/backend or container WORKDIR that has this script):
 *   npm run reconcile:reservations
 *
 * Production container (flat /app layout):
 *   docker compose -f compose.base.yml -f compose.client.yml --env-file .env \
 *     exec backend npm run reconcile:reservations
 */

import { OrderStage, PrismaClient, ReservationStatus } from "@prisma/client";

const CONSUME_STAGES: OrderStage[] = [
  OrderStage.SHIPPED,
  OrderStage.AWAITING_RECEIPT,
  OrderStage.RECEIVED,
  OrderStage.COMPLETED,
];

const RELEASE_STAGES: OrderStage[] = [
  OrderStage.CANCELED,
  OrderStage.REFUSED,
  OrderStage.RETURN_IN_PROGRESS,
  OrderStage.FULLY_RETURNED,
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const consumed = await prisma.materialReservation.updateMany({
      where: {
        status: ReservationStatus.ACTIVE,
        order: { orderStage: { in: CONSUME_STAGES } },
      },
      data: { status: ReservationStatus.CONSUMED },
    });

    const released = await prisma.materialReservation.updateMany({
      where: {
        status: ReservationStatus.ACTIVE,
        order: { orderStage: { in: RELEASE_STAGES } },
      },
      data: { status: ReservationStatus.RELEASED },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          consumed: consumed.count,
          released: released.count,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
