/**
 * One-off: fix "migration was modified after it was applied" by updating
 * the stored checksum in _prisma_migrations to match the current migration file.
 * Run from apps/backend: npx ts-node scripts/fix-migration-checksum.ts
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const MIGRATION_NAME = "20260228120000_add_product_stock_and_unique_sku";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const migrationPath = path.join(
    __dirname,
    "..",
    "prisma",
    "migrations",
    MIGRATION_NAME,
    "migration.sql",
  );
  const content = fs.readFileSync(migrationPath);
  const checksum = createHash("sha256").update(content).digest("hex");

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "_prisma_migrations" SET checksum = $1 WHERE migration_name = $2`,
    checksum,
    MIGRATION_NAME,
  );
  await prisma.$disconnect();

  console.log(`Updated checksum for ${MIGRATION_NAME} to ${checksum}. Rows updated: ${result}`);
  if (result === 0) {
    console.warn("No row was updated. Check that the migration name exists in _prisma_migrations.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
