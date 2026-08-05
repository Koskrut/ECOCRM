/**
 * Repair BOM components mis-imported as PKG:* (metal platforms, screws labeled as packaging).
 *
 * Usage (dry-run default):
 *   DATABASE_URL=... npx ts-node --transpile-only apps/backend/scripts/repair-false-pkg-bom-parts.ts
 *   DATABASE_URL=... npx ts-node --transpile-only apps/backend/scripts/repair-false-pkg-bom-parts.ts --apply
 */
import { PrismaClient, ProductKind } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  inferArticleSkuFromFalsePkg,
  looksLikeComponentSku,
  looksLikePackagingName,
} from "../src/production-planning/bom-part.util";

const APPLY = process.argv.includes("--apply");

type RepairLog = {
  falsePkgSku: string;
  targetSku: string;
  action: "relink" | "rename" | "create";
  bomLinesRelinked: number;
  snapshotLinesRemapped: number;
};

function isFalseMetalPkg(sku: string, name: string): boolean {
  if (!sku.trim().toUpperCase().startsWith("PKG:")) return false;
  if (looksLikePackagingName(name) || looksLikePackagingName(sku.slice(4))) return false;
  const inferred = inferArticleSkuFromFalsePkg(sku, name);
  return inferred != null && looksLikeComponentSku(inferred);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const candidates = await prisma.product.findMany({
      where: {
        sku: { startsWith: "PKG:", mode: "insensitive" },
        kind: ProductKind.PART,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        _count: { select: { bomComponents: true, snapshotLines: true } },
      },
    });

    const toRepair = candidates.filter((p) => isFalseMetalPkg(p.sku, p.name));
    console.log(
      JSON.stringify({
        mode: APPLY ? "apply" : "dry-run",
        candidateCount: candidates.length,
        repairCount: toRepair.length,
        samples: toRepair.slice(0, 10).map((p) => ({
          sku: p.sku,
          name: p.name,
          bomLinks: p._count.bomComponents,
        })),
      }),
    );

    const logs: RepairLog[] = [];
    let totalBomRelinked = 0;
    let totalSnapshotRemapped = 0;
    let orphansVoided = 0;

    for (const falsePkg of toRepair) {
      const targetSku = inferArticleSkuFromFalsePkg(falsePkg.sku, falsePkg.name)!;
      let target = await prisma.product.findUnique({ where: { sku: targetSku } });
      let action: RepairLog["action"] = "relink";

      if (!target && APPLY) {
        target = await prisma.product.update({
          where: { id: falsePkg.id },
          data: {
            sku: targetSku,
            name: falsePkg.name.trim() || targetSku,
            showOnStore: false,
            kind: ProductKind.PART,
          },
        });
        action = "rename";
      } else if (!target) {
        action = "rename";
      }

      const bomLines = await prisma.kitBomLine.findMany({
        where: { componentProductId: falsePkg.id },
        select: { id: true, bomId: true },
      });

      let bomRelinked = 0;
      let snapshotRemapped = 0;

      if (APPLY && target && action === "relink" && target.id !== falsePkg.id) {
        for (const line of bomLines) {
          const duplicate = await prisma.kitBomLine.findFirst({
            where: { bomId: line.bomId, componentProductId: target.id },
          });
          if (duplicate) {
            await prisma.kitBomLine.delete({ where: { id: line.id } });
          } else {
            await prisma.kitBomLine.update({
              where: { id: line.id },
              data: { componentProductId: target.id },
            });
          }
          bomRelinked += 1;
        }

        const snapLines = await prisma.inventorySnapshotLine.findMany({
          where: { productId: falsePkg.id },
          select: { id: true },
        });
        for (const sl of snapLines) {
          await prisma.inventorySnapshotLine.update({
            where: { id: sl.id },
            data: { productId: target.id, skuRaw: targetSku },
          });
          snapshotRemapped += 1;
        }

        const remainingLinks = await prisma.kitBomLine.count({
          where: { componentProductId: falsePkg.id },
        });
        const remainingSnaps = await prisma.inventorySnapshotLine.count({
          where: { productId: falsePkg.id },
        });
        if (remainingLinks === 0 && remainingSnaps === 0) {
          await prisma.product.delete({ where: { id: falsePkg.id } });
          orphansVoided += 1;
        }
      } else if (APPLY && target && action === "rename") {
        bomRelinked = bomLines.length;
        snapshotRemapped = await prisma.inventorySnapshotLine.count({
          where: { productId: falsePkg.id },
        });
        if (snapshotRemapped > 0) {
          await prisma.inventorySnapshotLine.updateMany({
            where: { productId: target.id },
            data: { skuRaw: targetSku },
          });
        }
      } else {
        bomRelinked = bomLines.length;
        snapshotRemapped = await prisma.inventorySnapshotLine.count({
          where: { productId: falsePkg.id },
        });
      }

      totalBomRelinked += bomRelinked;
      totalSnapshotRemapped += snapshotRemapped;
      logs.push({
        falsePkgSku: falsePkg.sku,
        targetSku,
        action,
        bomLinesRelinked: bomRelinked,
        snapshotLinesRemapped: snapshotRemapped,
      });
    }

    console.log(
      JSON.stringify({
        totalBomRelinked,
        totalSnapshotRemapped,
        orphansVoided,
        anchorSamples: logs.filter((l) =>
          ["pkg:mg-pf-cadcam-mu", "pkg:mg-ha-4030"].includes(l.falsePkgSku.toLowerCase()),
        ),
        logSample: logs.slice(0, 20),
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
