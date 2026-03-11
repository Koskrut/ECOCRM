/**
 * One-off: print distinct status values for Ringostat calls (to debug missed-call mapping).
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/inspect-ringostat-call-statuses.ts
 */

/* eslint-disable @typescript-eslint/no-var-requires */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const calls = await prisma.call.findMany({
      where: { provider: "RINGOSTAT" },
      select: { status: true, rawPayload: true },
      take: 500,
    });

    const byStatus: Record<string, number> = {};
    for (const c of calls) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    }
    console.log("Ringostat Call status counts:", JSON.stringify(byStatus, null, 2));

    const withDisposition = calls.filter((c) => {
      const p = c.rawPayload as Record<string, unknown>;
      return p && (p.disposition != null || p.status != null);
    });
    if (withDisposition.length > 0) {
      const sample = withDisposition[0].rawPayload as Record<string, unknown>;
      console.log(
        "Sample rawPayload keys (disposition/status):",
        sample?.disposition,
        sample?.status,
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
