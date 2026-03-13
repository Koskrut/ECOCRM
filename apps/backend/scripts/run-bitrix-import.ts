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
import { execSync } from "child_process";
import { config } from "dotenv";
import { NestFactory } from "@nestjs/core";

// When run on host, load repo root .env and build DATABASE_URL if missing (CRM host with POSTGRES_PASSWORD)
const rootEnv = path.resolve(process.cwd(), "../../.env");
config({ path: rootEnv });
if (!process.env.DATABASE_URL && process.env.POSTGRES_PASSWORD) {
  process.env.DATABASE_URL = `postgresql://crm:${process.env.POSTGRES_PASSWORD}@localhost:5432/crm`;
}
if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Add to apps/backend/.env or repo root .env, e.g.:\n  DATABASE_URL=postgresql://crm:YOUR_PASSWORD@144.76.233.11:5432/crm"
  );
  process.exit(1);
}

// Regenerate Prisma client after env is loaded (so DATABASE_URL is set for prisma.config.ts)
execSync("npx prisma generate", { stdio: "inherit" });

import { AppModule } from "../src/app.module";
import { BitrixInitialImportService } from "../src/integrations/bitrix-sync/bitrix.initial-import.service";

/** When run on host (not in Docker), hostname "postgres" does not resolve — force localhost. Call immediately before creating Nest app. */
function ensureDatabaseUrlForHost() {
  const u = process.env.DATABASE_URL;
  if (!u) return;
  if (u.includes("@postgres:") || u.includes("@postgres/")) {
    process.env.DATABASE_URL = u.replace(/@postgres:/, "@localhost:").replace(/@postgres\//, "@localhost/");
  }
}

async function main() {
  ensureDatabaseUrlForHost();
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
