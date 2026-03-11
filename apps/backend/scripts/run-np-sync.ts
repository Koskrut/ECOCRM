/**
 * Запуск синку НП зараз: міста + відділення/поштомати + вулиці.
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/run-np-sync.ts
 *   npx ts-node scripts/run-np-sync.ts --streets-only        # вулиці для перших 500 міст
 *   npx ts-node scripts/run-np-sync.ts --streets-only --full # повний синк вулиць по всіх містах
 */

import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { NpSyncService } from "../src/np/np-sync.service";

const STREETS_LIMIT = 500;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "error", "warn"],
  });
  const sync = app.get(NpSyncService);

  const streetsOnly = process.argv.includes("--streets-only");
  const fullStreets = process.argv.includes("--full");

  try {
    if (!streetsOnly) {
      console.log("NP sync: cities + warehouses…");
      await sync.syncAll();
      console.log("NP sync: cities + warehouses done.");
    }
    const limit = fullStreets ? undefined : STREETS_LIMIT;
    console.log(limit == null ? "NP sync: streets (full, all cities)…" : `NP sync: streets (limit=${limit})…`);
    await sync.syncStreetsForAllCities(limit);
    console.log("NP sync: streets done.");
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
