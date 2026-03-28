/**
 * Import product characteristics from workbook sheet `Товари_для_заповнення` into `Product.characteristics`.
 *
 * Usage (from apps/backend, DATABASE_URL set):
 *   npx ts-node scripts/import-product-characteristics-xlsx.ts /path/to/cursor_characteristics_fill_pack.xlsx
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/** Columns that are not stored inside the JSON blob. */
const BASE_COLS = new Set(["sku", "name", "price", "category_name", "subcategory_name"]);

function normalizeCell(v: unknown): unknown {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error(
      "Usage: npx ts-node scripts/import-product-characteristics-xlsx.ts <path-to.xlsx>",
    );
    process.exit(1);
  }
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets["Товари_для_заповнення"];
  if (!ws) {
    console.error('Sheet "Товари_для_заповнення" not found');
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  let updated = 0;
  let missingSku = 0;
  let emptySpecs = 0;

  for (const row of rows) {
    const sku = String(row.sku ?? "").trim();
    if (!sku) continue;
    const ch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (BASE_COLS.has(k)) continue;
      const val = normalizeCell(v);
      if (val === undefined) continue;
      ch[k] = val;
    }
    if (Object.keys(ch).length === 0) {
      emptySpecs++;
      continue;
    }
    const p = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
    if (!p) {
      missingSku++;
      continue;
    }
    await prisma.product.update({
      where: { sku },
      data: { characteristics: ch as Prisma.InputJsonValue },
    });
    updated++;
  }

  console.log(JSON.stringify({ updated, missingSku, emptySpecsRows: emptySpecs }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
