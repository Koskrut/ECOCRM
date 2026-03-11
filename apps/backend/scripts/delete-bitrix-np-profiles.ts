/**
 * Delete all shipping profiles created from Bitrix with label "Нова Пошта (Bitrix)".
 * Use before re-running Bitrix import so new profiles are created with updated validation
 * (no phone "Y", no empty/checkbox-only data).
 *
 * Usage (from apps/backend):
 *   npm run bitrix:delete-np-profiles
 *   npx ts-node scripts/delete-bitrix-np-profiles.ts
 */

import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

const LABEL = "Нова Пошта (Bitrix)";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "error", "warn"],
  });
  const prisma = app.get(PrismaService);

  const result = await prisma.contactShippingProfile.deleteMany({
    where: { label: LABEL },
  });

  console.log(`Deleted ${result.count} shipping profile(s) with label "${LABEL}".`);
  console.log("You can now run Bitrix import to recreate profiles with updated rules: npm run bitrix:import");

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
