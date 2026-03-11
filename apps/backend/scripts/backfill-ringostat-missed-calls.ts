/**
 * One-off script: normalize Ringostat call statuses so that all
 * "no answer" / "missed" variants become a unified "MISSED" status.
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/backfill-ringostat-missed-calls.ts
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
    const updated = await prisma.$executeRawUnsafe(
      `
      UPDATE "Call"
      SET status = 'MISSED'
      WHERE provider = $1
        AND status <> 'MISSED'
        AND (
          LOWER(status) LIKE '%noanswer%'
          OR LOWER(status) LIKE '%no answer%'
          OR LOWER(status) LIKE '%no_answer%'
          OR LOWER(status) LIKE '%not answered%'
          OR LOWER(status) LIKE '%missed%'
        )
      `,
      "RINGOSTAT",
    );

    console.log(`Backfill complete. Rows updated: ${updated}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

