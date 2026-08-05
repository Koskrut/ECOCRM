/**
 * Smoke: sales XLS upload → post → MRP run → forecast view.
 *
 * Usage (from apps/backend, crm-postgres-dev on :5432):
 *   DATABASE_URL="postgresql://crm:localdev_postgres_crm_2026@127.0.0.1:5432/crm" \
 *     npx ts-node scripts/mrp-sales-smoke.ts
 */

import "dotenv/config";
import * as path from "path";
import { config } from "dotenv";
import { NestFactory } from "@nestjs/core";
import {
  InventorySnapshotStatus,
  PlanningRunMode,
  ProductKind,
  SalesHistoryUploadStatus,
} from "@prisma/client";
import * as XLSX from "xlsx";
import { Module } from "@nestjs/common";
import { PrismaModule } from "../src/prisma/prisma.module";
import { ProductionPlanningModule } from "../src/production-planning/production-planning.module";
import { SystemModule } from "../src/system/system.module";
import { DemandForecastService } from "../src/production-planning/demand-forecast.service";
import { PlanningRunService } from "../src/production-planning/planning-run.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { SalesHistoryService } from "../src/production-planning/sales-history.service";

@Module({
  imports: [PrismaModule, SystemModule, ProductionPlanningModule],
})
class MrpSmokeModule {}

const rootEnv = path.resolve(process.cwd(), "../../.env");
config({ path: rootEnv });

function ensureDatabaseUrlForHost() {
  const u = process.env.DATABASE_URL;
  if (!u) return;
  if (u.includes("@postgres:") || u.includes("@postgres/")) {
    process.env.DATABASE_URL = u
      .replace(/@postgres:/, "@localhost:")
      .replace(/@postgres\//, "@localhost/");
  }
}

function buildSalesXlsxBuffer(sku: string, months: Array<[string, number]>): Buffer {
  const header = ["SKU", ...months.map(([m]) => m)];
  const row = [sku, ...months.map(([, q]) => q)];
  const ws = XLSX.utils.aoa_to_sheet([header, row]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sales");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function ensureFixtures(prisma: PrismaService, adminId: string) {
  const kit = await prisma.product.update({
    where: { sku: "SKU-001" },
    data: { kind: ProductKind.KIT, isActive: true },
  });
  await prisma.product.update({
    where: { sku: "SKU-002" },
    data: { kind: ProductKind.PART, isActive: true },
  });

  for (const productId of [kit.id]) {
    await prisma.planningProductParams.upsert({
      where: { productId },
      create: { productId, safetyStock: 0, isPlanned: true },
      update: { isPlanned: true },
    });
  }

  const postedSnapshot = await prisma.inventorySnapshot.findFirst({
    where: { status: InventorySnapshotStatus.POSTED },
    orderBy: { postedAt: "desc" },
  });
  if (!postedSnapshot) {
    await prisma.inventorySnapshot.create({
      data: {
        status: InventorySnapshotStatus.POSTED,
        importedById: adminId,
        postedById: adminId,
        postedAt: new Date(),
        note: "mrp-sales-smoke fixture",
        lines: {
          create: [{ productId: kit.id, skuRaw: kit.sku, qty: 10 }],
        },
      },
    });
  }

  return kit;
}

async function main() {
  ensureDatabaseUrlForHost();
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(MrpSmokeModule, {
    logger: ["error", "warn"],
  });

  const prisma = app.get(PrismaService);
  const salesHistory = app.get(SalesHistoryService);
  const planningRun = app.get(PlanningRunService);
  const demandForecast = app.get(DemandForecastService);

  try {
    const admin = await prisma.user.findFirst({
      where: { email: "admin@ecocrm.local" },
      select: { id: true },
    });
    if (!admin) throw new Error("admin@ecocrm.local not found — run seed:admin first");

    const kit = await ensureFixtures(prisma, admin.id);
    console.log("Fixtures OK:", kit.sku, kit.kind);

    const months: Array<[string, number]> = [
      ["2026-03", 30],
      ["2026-04", 30],
      ["2026-05", 30],
      ["2026-06", 30],
    ];
    const buffer = buildSalesXlsxBuffer(kit.sku, months);

    const uploaded = await salesHistory.upload({
      buffer,
      importedById: admin.id,
      note: "mrp-sales-smoke",
    });
    console.log("Upload:", {
      id: uploaded.upload.id,
      format: uploaded.format,
      resolvedRows: uploaded.resolvedRows,
      unresolvedSku: uploaded.unresolvedSku,
    });
    if (uploaded.resolvedRows === 0) {
      throw new Error("No sales rows resolved to products");
    }

    const posted = await salesHistory.post(uploaded.upload.id, admin.id);
    console.log("Posted sales upload:", posted?.id, posted?.status);
    if (posted?.status !== SalesHistoryUploadStatus.POSTED) {
      throw new Error("Sales upload was not POSTED");
    }

    const forecastBeforeRun = await demandForecast.getMrpForecastView();
    const kitForecast = forecastBeforeRun.rows.find((r) => r.sku === kit.sku);
    console.log("Forecast row:", {
      sku: kitForecast?.sku,
      avgMonthlySold: kitForecast?.avgMonthlySold,
      forecastDemand: kitForecast?.forecastDemand,
      monthlyHistory: kitForecast?.monthlyHistory,
      salesFreshness: forecastBeforeRun.salesFreshness,
    });
    if (!kitForecast || kitForecast.avgMonthlySold <= 0) {
      throw new Error("Expected avgMonthlySold > 0 from POSTED sales");
    }

    const run = await planningRun.runAndPersist(PlanningRunMode.FULL);
    console.log("MRP run:", {
      id: run.id,
      lineCount: run.lines.length,
      summary: run.summary,
      salesUploadId: (run as { salesFreshness?: unknown }).salesFreshness,
      stale: run.stale,
    });

    const kitLine = run.lines.find((l) => l.sku === kit.sku);
    if (kitLine) {
      console.log("MRP line for kit:", {
        lineType: kitLine.lineType,
        qty: kitLine.qty,
        coverDays: kitLine.coverDays,
        reason: kitLine.reason,
      });
    }

    console.log("\n✓ mrp-sales-smoke passed");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n✗ mrp-sales-smoke failed:", err);
  process.exit(1);
});
