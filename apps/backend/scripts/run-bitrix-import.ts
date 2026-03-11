/**
 * Bitrix initial import: read from Bitrix MySQL and upsert into ECOCRM.
 *
 * Usage (from apps/backend):
 *   npm run bitrix:import
 *   npx ts-node scripts/run-bitrix-import.ts
 *
 * Env: BITRIX_MYSQL_HOST, BITRIX_MYSQL_USER, BITRIX_MYSQL_PASSWORD, BITRIX_MYSQL_DATABASE
 */

import "dotenv/config";
import { NestFactory } from "@nestjs/core";
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
