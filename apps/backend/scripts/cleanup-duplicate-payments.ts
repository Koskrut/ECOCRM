/**
 * Cleanup duplicate finance records created before idempotent import/allocation.
 *
 * Targets:
 * 1. Duplicate COMPLETED cash payments (same orderId+amount+currency+paidAt ±1 min, no bank tx)
 * 2. Duplicate BankTransaction rows (same bankAccountId+externalId, keep canonical dedupKey)
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/cleanup-duplicate-payments.ts --dry-run
 *   npx ts-node scripts/cleanup-duplicate-payments.ts --apply
 *
 * Optional cron (finance sidecar):
 *   0 3 * * 0 cd /app && npx ts-node scripts/cleanup-duplicate-payments.ts --apply
 */

import { PrismaClient, PaymentStatus } from "@prisma/client";

const CASH_DEDUP_WINDOW_MS = 60_000;

type Mode = "dry-run" | "apply";

function parseMode(argv: string[]): Mode {
  if (argv.includes("--apply")) return "apply";
  return "dry-run";
}

function cashGroupKey(p: {
  orderId: string;
  amount: { toString(): string };
  currency: string;
  paidAt: Date;
}): string {
  const bucket = Math.floor(p.paidAt.getTime() / CASH_DEDUP_WINDOW_MS);
  return [p.orderId, p.amount.toString(), p.currency, String(bucket)].join("|");
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const cashRows = await prisma.payment.findMany({
      where: {
        status: PaymentStatus.COMPLETED,
        bankTransactionId: null,
        sourceType: "CASH",
      },
      select: {
        id: true,
        orderId: true,
        amount: true,
        currency: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const cashGroups = new Map<string, typeof cashRows>();
    for (const row of cashRows) {
      const key = cashGroupKey(row);
      const prev = cashGroups.get(key);
      if (prev) prev.push(row);
      else cashGroups.set(key, [row]);
    }

    const cashToDelete: string[] = [];
    for (const group of cashGroups.values()) {
      if (group.length <= 1) continue;
      const [, ...dupes] = group;
      cashToDelete.push(...dupes.map((d) => d.id));
    }

    const bankRows = await prisma.bankTransaction.findMany({
      where: { externalId: { not: null } },
      select: {
        id: true,
        bankAccountId: true,
        externalId: true,
        dedupKey: true,
        createdAt: true,
        payments: { select: { id: true }, take: 1 },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const bankGroups = new Map<string, typeof bankRows>();
    for (const row of bankRows) {
      const key = `${row.bankAccountId}|${row.externalId}`;
      const prev = bankGroups.get(key);
      if (prev) prev.push(row);
      else bankGroups.set(key, [row]);
    }

    const bankToDelete: string[] = [];
    for (const group of bankGroups.values()) {
      if (group.length <= 1) continue;
      const keep =
        group.find((g) => g.payments.length > 0) ??
        group.find((g) => g.dedupKey.startsWith("p24-ref:") || g.dedupKey.startsWith("p24-tech:")) ??
        group[0];
      for (const row of group) {
        if (row.id !== keep.id) bankToDelete.push(row.id);
      }
    }

    console.log(`Mode: ${mode}`);
    console.log(`Duplicate cash payments to remove: ${cashToDelete.length}`);
    console.log(`Duplicate bank transactions to remove: ${bankToDelete.length}`);

    if (mode === "apply") {
      if (cashToDelete.length) {
        await prisma.payment.deleteMany({ where: { id: { in: cashToDelete } } });
      }
      if (bankToDelete.length) {
        await prisma.bankTransaction.deleteMany({ where: { id: { in: bankToDelete } } });
      }
      console.log("Cleanup applied.");
    } else {
      console.log("Dry run — pass --apply to delete duplicates.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
