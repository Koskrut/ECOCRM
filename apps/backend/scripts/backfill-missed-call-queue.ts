/**
 * One-off: enqueue recent inbound MISSED calls into CallQueueItem.
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/backfill-missed-call-queue.ts
 *   npx ts-node scripts/backfill-missed-call-queue.ts --days=14
 */

/* eslint-disable @typescript-eslint/no-var-requires */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const { MissedCallQueueService } = require("../src/manual-calling/missed-call-queue.service");
const { isConversation } = require("../src/manual-calling/call-conversation.util");

function parseDaysArg(): number {
  const arg = process.argv.find((a: string) => a.startsWith("--days="));
  if (!arg) return 7;
  const n = Number(arg.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

function talkSecFromMeta(meta: unknown, durationSec: number | null): number | null {
  if (meta && typeof meta === "object" && "talkSec" in (meta as object)) {
    const v = (meta as { talkSec?: unknown }).talkSec;
    if (typeof v === "number") return v;
  }
  return durationSec;
}

async function hasLaterConversation(
  prisma: InstanceType<typeof PrismaClient>,
  params: {
    contactId: string | null;
    leadId: string | null;
    after: Date;
  },
): Promise<boolean> {
  const or = [];
  if (params.contactId) or.push({ contactId: params.contactId });
  if (params.leadId) or.push({ leadId: params.leadId });
  if (or.length === 0) return false;

  const later = await prisma.call.findMany({
    where: {
      startedAt: { gt: params.after },
      OR: or,
    },
    select: { status: true, durationSec: true, meta: true },
    take: 50,
    orderBy: { startedAt: "asc" },
  });

  return later.some((c: { status: string; durationSec: number | null; meta: unknown }) =>
    isConversation(c.status, talkSecFromMeta(c.meta, c.durationSec), c.durationSec),
  );
}

async function main() {
  const days = parseDaysArg();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const queue = new MissedCallQueueService();

  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const missed = await prisma.call.findMany({
      where: {
        startedAt: { gte: since },
        direction: { equals: "INBOUND", mode: "insensitive" },
        status: { equals: "MISSED", mode: "insensitive" },
        managerUserId: { not: null },
        OR: [{ contactId: { not: null } }, { leadId: { not: null } }],
      },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        startedAt: true,
        managerUserId: true,
        contactId: true,
        leadId: true,
        companyId: true,
      },
    });

    let enqueued = 0;
    let skippedResolved = 0;
    let skippedExisting = 0;

    for (const call of missed) {
      if (!call.managerUserId) continue;

      const resolved = await hasLaterConversation(prisma, {
        contactId: call.contactId,
        leadId: call.leadId,
        after: call.startedAt,
      });
      if (resolved) {
        skippedResolved++;
        continue;
      }

      const existing = await prisma.callQueueItem.findFirst({
        where: {
          callId: call.id,
        },
        select: { id: true },
      });
      if (existing) {
        skippedExisting++;
        continue;
      }

      await prisma.$transaction(async (tx: unknown) => {
        await queue.enqueueFromMissedCall(tx, {
          callId: call.id,
          assigneeId: call.managerUserId!,
          contactId: call.contactId,
          leadId: call.leadId,
          companyId: call.companyId,
        });
      });
      enqueued++;
    }

    console.log(
      `Backfill complete (last ${days} days). missed=${missed.length} enqueued=${enqueued} skippedResolved=${skippedResolved} skippedExisting=${skippedExisting}`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
