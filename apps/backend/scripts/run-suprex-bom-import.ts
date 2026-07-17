import * as fs from "fs";
import * as XLSX from "xlsx";
import { PrismaClient, ProductKind } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { BomImportService } from "../src/production-planning/bom-import.service";
import { BomService } from "../src/production-planning/bom.service";

async function main() {
  const catalogPath = process.argv[2];
  const bomPath = process.argv[3];
  if (!catalogPath || !bomPath) {
    throw new Error("Usage: node run-suprex-bom.js <catalog.xlsx> <bom.xlsx>");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const ref = XLSX.read(fs.readFileSync(catalogPath), { type: "buffer" });
    const sheet = ref.Sheets["Оригінал_плоско"] || ref.Sheets[ref.SheetNames[0]];
    const flat = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    let seeded = 0;
    for (const row of flat as Array<Record<string, unknown>>) {
      const sku = String(row["Артикул"] || row.sku || "").trim();
      const name = String(row["Название"] || row.name || sku).trim();
      if (!sku || sku === "Артикул") continue;
      const price = Number(row["Цена"] || row.price || 0) || 0;
      await prisma.product.upsert({
        where: { sku },
        create: {
          sku,
          name,
          unit: "pcs",
          basePrice: price,
          stock: 0,
          kind: ProductKind.OTHER,
          isActive: true,
          showOnStore: true,
        },
        update: { name, basePrice: price, isActive: true },
      });
      seeded += 1;
    }
    console.log(JSON.stringify({ seeded }));

    const importer = new BomImportService(prisma as never, new BomService(prisma as never));
    const result = await importer.importFile(fs.readFileSync(bomPath));
    console.log(
      JSON.stringify({
        format: result.format,
        parsedRowCount: result.parsedRowCount,
        importedKitCount: result.importedKitCount,
        importedLineCount: result.importedLineCount,
        createdKitCount: result.createdKitCount,
        createdPartCount: result.createdPartCount,
        skippedKitCount: result.skippedKitCount,
        unresolvedKits: result.unresolvedKitSku.length,
        unresolvedComponents: result.unresolvedComponentSku.length,
        rowErrors: result.rowErrors.length,
        errorSample: result.rowErrors.slice(0, 15),
        skippedSample: (result.skippedKits || []).slice(0, 10),
        createdKitsSample: (result.createdKits || []).slice(0, 15),
      }),
    );
    console.log(
      JSON.stringify({
        activeBoms: await prisma.kitBom.count({ where: { isActive: true } }),
        kits: await prisma.product.count({ where: { kind: ProductKind.KIT } }),
        parts: await prisma.product.count({ where: { kind: ProductKind.PART } }),
      }),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
