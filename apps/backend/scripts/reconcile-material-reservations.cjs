/**
 * Production-safe one-shot reconcile (plain Node, no ts-node).
 * See reconcile-material-reservations.ts for the same logic in TypeScript.
 *
 * Usage:
 *   npm run reconcile:reservations
 */

const { PrismaClient, OrderStage, ReservationStatus } = require("@prisma/client");

const CONSUME_STAGES = [
  OrderStage.SHIPPED,
  OrderStage.AWAITING_RECEIPT,
  OrderStage.RECEIVED,
  OrderStage.COMPLETED,
];

const RELEASE_STAGES = [
  OrderStage.CANCELED,
  OrderStage.REFUSED,
  OrderStage.RETURN_IN_PROGRESS,
  OrderStage.FULLY_RETURNED,
];

async function main() {
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
