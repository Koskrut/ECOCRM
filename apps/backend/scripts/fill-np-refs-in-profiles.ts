/**
 * Find ContactShippingProfile with WAREHOUSE/POSTOMAT delivery but missing cityRef or warehouseRef,
 * resolve refs from NpCity/NpWarehouse cache (by cityName and warehouseNumber) and update profiles.
 *
 * Usage (from repo root or apps/backend):
 *   npx ts-node apps/backend/scripts/fill-np-refs-in-profiles.ts
 *   npx ts-node scripts/fill-np-refs-in-profiles.ts
 *
 * Test lookup (no Nest, no DB updates — minimal memory): check how city and warehouse are resolved:
 *   npx ts-node scripts/fill-np-refs-in-profiles.ts test "Київ" "Відділення №350 (до 30 кг): Харківське шосе, 190"
 *   npx ts-node scripts/fill-np-refs-in-profiles.ts test "Київ" "350"
 */

import "dotenv/config";
import type { PrismaClient } from "@prisma/client";

const WAREHOUSE_DELIVERY = ["WAREHOUSE", "POSTOMAT"] as const;

type NpCityRow = { ref: string; description: string } | null;
type NpWarehouseRow = { ref: string; number: string | null; description: string } | null;

/** Pick best city from candidates: exact name > "м. {name}" > "{name} " or "{name}," > first. */
function pickBestCityMatch(
  candidates: { ref: string; description: string }[],
  cityName: string,
): { ref: string; description: string } | null {
  if (candidates.length === 0) return null;
  const pref = "м. " + cityName;
  const exact = candidates.find((c) => c.description === cityName);
  if (exact) return exact;
  const withPrefix = candidates.find(
    (c) =>
      c.description === pref ||
      c.description.startsWith(pref + " ") ||
      c.description.startsWith(pref + ","),
  );
  if (withPrefix) return withPrefix;
  const startsName = candidates.find(
    (c) => c.description.startsWith(cityName + " ") || c.description.startsWith(cityName + ","),
  );
  if (startsName) return startsName;
  return candidates[0]!;
}

/** Resolve city ref: exact → "м. {name}" → best of contains (avoid "Київська обл." when searching "Київ"). */
async function resolveCityRef(
  prisma: PrismaClient,
  cityName: string,
): Promise<{ ref: string; description: string } | null> {
  const name = cityName.trim();
  if (!name) return null;
  const exact = (await prisma.npCity.findFirst({
    where: { isActive: true, description: name },
    select: { ref: true, description: true },
  })) as NpCityRow;
  if (exact) return exact;
  const withM = (await prisma.npCity.findFirst({
    where: { isActive: true, description: "м. " + name },
    select: { ref: true, description: true },
  })) as NpCityRow;
  if (withM) return withM;
  const candidates = (await prisma.npCity.findMany({
    where: { isActive: true, description: { contains: name, mode: "insensitive" } },
    select: { ref: true, description: true },
    take: 50,
  })) as { ref: string; description: string }[];
  return pickBestCityMatch(candidates, name);
}

function normalizeWarehouseNumber(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v).trim();
  const numberMatch = s.match(/№\s*(\d+)/i) ?? s.match(/(\d+)\s*\(/);
  if (numberMatch) return numberMatch[1]!;
  const digits = s.replace(/\D/g, "");
  return digits || s;
}

async function runTestLookup(prisma: PrismaClient, cityName: string, warehouseInput: string) {
  console.log("=== Test lookup (no DB updates) ===\n");
  console.log("Input: cityName =", JSON.stringify(cityName));
  console.log("       warehouse =", JSON.stringify(warehouseInput));
  const whNumNorm = normalizeWarehouseNumber(warehouseInput);
  console.log("       warehouseNumber (extracted) =", JSON.stringify(whNumNorm));
  console.log("");

  const cityExact = (await prisma.npCity.findFirst({
    where: { isActive: true, description: cityName },
    select: { ref: true, description: true },
  })) as NpCityRow;
  console.log("1) NpCity exact (description = cityName):", cityExact ?? "not found");

  const cityWithM = (await prisma.npCity.findFirst({
    where: { isActive: true, description: "м. " + cityName },
    select: { ref: true, description: true },
  })) as NpCityRow;
  console.log("2) NpCity exact (description = 'м. ' + cityName):", cityWithM ?? "not found");

  const cityResolved = await resolveCityRef(prisma, cityName);
  const cityRef: string | null = cityResolved?.ref ?? null;
  console.log("3) resolveCityRef (exact → м. X → best of contains):", cityResolved ?? "not found");

  if (!cityRef) {
    console.log("\nCity not found — cannot lookup warehouse.");
    return;
  }

  console.log("\n4) Using cityRef =", cityRef);
  const whByInput = (warehouseInput.trim()
    ? await prisma.npWarehouse.findFirst({
        where: { cityRef, isActive: true, number: warehouseInput.trim() },
        select: { ref: true, number: true, description: true },
      })
    : null) as NpWarehouseRow;
  console.log("5) NpWarehouse by number (number = warehouseInput):", whByInput ?? "not found");

  const whByNorm = (whNumNorm
    ? await prisma.npWarehouse.findFirst({
        where: { cityRef, isActive: true, number: whNumNorm },
        select: { ref: true, number: true, description: true },
      })
    : null) as NpWarehouseRow;
  console.log("6) NpWarehouse by number (number = extracted", JSON.stringify(whNumNorm), "):", whByNorm ?? "not found");

  const result = whByInput ?? whByNorm;
  console.log("\n=== Result ===");
  console.log("cityRef:", cityRef);
  console.log("warehouseRef:", result?.ref ?? "(not found)");
  if (result) console.log("warehouse description:", result.description);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "test") {
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    try {
      const cityName = args[1] ?? "Київ";
      const warehouseInput = args[2] ?? "350";
      await runTestLookup(prisma, cityName, warehouseInput);
    } finally {
      await prisma.$disconnect();
    }
    return;
  }

  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("../src/app.module");
  const { PrismaService } = await import("../src/prisma/prisma.service");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "error", "warn"],
  });
  const prisma = app.get(PrismaService);

  const profiles = await prisma.contactShippingProfile.findMany({
    where: {
      deliveryType: { in: [...WAREHOUSE_DELIVERY] },
      OR: [{ cityRef: null }, { warehouseRef: null }],
    },
    select: {
      id: true,
      contactId: true,
      label: true,
      cityRef: true,
      cityName: true,
      warehouseRef: true,
      warehouseNumber: true,
    },
    orderBy: { id: "asc" },
  });

  console.log(
    `Found ${profiles.length} profile(s) with WAREHOUSE/POSTOMAT and missing cityRef or warehouseRef.`,
  );

  let updated = 0;
  let resolvedCity = 0;
  let resolvedWarehouse = 0;
  const errors: string[] = [];

  for (const p of profiles) {
    let cityRef = p.cityRef;
    let warehouseRef = p.warehouseRef;
    const cityName = p.cityName != null ? String(p.cityName).trim() : "";
    const warehouseNumber = p.warehouseNumber != null ? String(p.warehouseNumber).trim() : "";
    const whNumNorm = normalizeWarehouseNumber(warehouseNumber);

    if (!cityRef && cityName) {
      const city = await resolveCityRef(prisma, cityName);
      if (city) {
        cityRef = city.ref;
        resolvedCity += 1;
      }
    }

    const hasWhNum = warehouseNumber.length > 0 || whNumNorm.length > 0;
    if (!warehouseRef && cityRef && hasWhNum) {
      let wh = warehouseNumber
        ? await prisma.npWarehouse.findFirst({
            where: { cityRef, isActive: true, number: warehouseNumber },
            select: { ref: true, number: true },
          })
        : null;
      if (!wh && whNumNorm) {
        wh = await prisma.npWarehouse.findFirst({
          where: { cityRef, isActive: true, number: whNumNorm },
          select: { ref: true, number: true },
        });
      }
      if (wh) {
        warehouseRef = wh.ref;
        resolvedWarehouse += 1;
      }
    }

    if (cityRef !== p.cityRef || warehouseRef !== p.warehouseRef) {
      try {
        await prisma.contactShippingProfile.update({
          where: { id: p.id },
          data: {
            ...(cityRef != null ? { cityRef } : {}),
            ...(warehouseRef != null ? { warehouseRef } : {}),
          },
        });
        updated += 1;
        console.log(
          `  Updated profile ${p.id} (contact ${p.contactId}): cityRef=${cityRef ?? "(unchanged)"} warehouseRef=${warehouseRef ?? "(unchanged)"}`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Profile ${p.id}: ${msg}`);
      }
    }
  }

  console.log("");
  console.log(`Done. Resolved cityRef: ${resolvedCity}, warehouseRef: ${resolvedWarehouse}.`);
  console.log(`Updated ${updated} profile(s).`);
  if (errors.length > 0) {
    console.error("Errors:", errors);
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
