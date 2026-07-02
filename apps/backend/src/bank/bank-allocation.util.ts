import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

/** Advisory lock key for serializing bank payment matching across processes. */
export const BANK_MATCH_ADVISORY_LOCK_KEY = 8723401;

export const BANK_ALLOCATION_EPSILON = 0.01;

type AllocatablePayment = {
  amount: { toString(): string } | number;
  status?: string;
};

export function sumBankTransactionAllocations(
  payments: AllocatablePayment[],
  status: string = "COMPLETED",
): number {
  return payments
    .filter((p) => p.status === status)
    .reduce((sum, p) => sum + Number(p.amount), 0);
}

export function allocationExceedsTransaction(
  allocatedTotal: number,
  additionalAmount: number,
  transactionAmount: number,
  epsilon: number = BANK_ALLOCATION_EPSILON,
): boolean {
  return allocatedTotal + additionalAmount > transactionAmount + epsilon;
}

export async function lockBankTransactionForUpdate(
  tx: Prisma.TransactionClient,
  bankTransactionId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "BankTransaction" WHERE id = ${bankTransactionId} FOR UPDATE`,
  );
}

export async function withBankMatchAdvisoryLock<T>(
  prisma: Pick<PrismaClient, "$executeRaw">,
  fn: () => Promise<T>,
): Promise<T> {
  await prisma.$executeRaw(
    Prisma.sql`SELECT pg_advisory_lock(${BANK_MATCH_ADVISORY_LOCK_KEY})`,
  );
  try {
    return await fn();
  } finally {
    await prisma.$executeRaw(
      Prisma.sql`SELECT pg_advisory_unlock(${BANK_MATCH_ADVISORY_LOCK_KEY})`,
    );
  }
}
