/**
 * Bitrix initial import: read from Bitrix MySQL and upsert into ECOCRM.
 *
 * Usage (from apps/backend):
 *   npm run bitrix:import
 *   npx ts-node scripts/run-bitrix-import.ts
 *
 * Env: DATABASE_URL (or POSTGRES_PASSWORD in repo root .env when running on CRM host),
 *      BITRIX_MYSQL_* for Bitrix source.
 */

import "dotenv/config";
import * as path from "path";
import { config } from "dotenv";
import { NestFactory } from "@nestjs/core";

// When run on host, load repo root .env and build DATABASE_URL if missing (CRM host with POSTGRES_PASSWORD)
const rootEnv = path.resolve(process.cwd(), "../../.env");
config({ path: rootEnv });
if (!process.env.DATABASE_URL && process.env.POSTGRES_PASSWORD) {
  process.env.DATABASE_URL = `postgresql://crm:${process.env.POSTGRES_PASSWORD}@127.0.0.1:5432/crm`;
}
if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Add to apps/backend/.env or repo root .env, e.g.:\n  DATABASE_URL=postgresql://crm:YOUR_PASSWORD@144.76.233.11:5432/crm"
  );
  process.exit(1);
}
import { AppModule } from "../src/app.module";
import { BitrixInitialImportService } from "../src/integrations/bitrix-sync/bitrix.initial-import.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "error", "warn"],
  });
  const importService = app.get(BitrixInitialImportService);

  try {
    console.log("Bitrix initial import started…");
    const stats = await importService.runFullImport();
    console.log("Bitrix initial import finished:", stats);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
