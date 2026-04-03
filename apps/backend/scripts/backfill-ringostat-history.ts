/**
 * One-off: import Ringostat /calls/list for a date range (UTC calendar days).
 * Same chunking/overlap as POST settings/ringostat/backfill.
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/backfill-ringostat-history.ts 2026-03-01 2026-03-31
 *
 * Requires DATABASE_URL and Ringostat API token (IntegrationSetting or RINGOSTAT_API_TOKEN).
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { runRingostatBackfillChunks } from "../src/integrations/ringostat/ringostat-backfill.chunks";
import { fetchRingostatCallsList } from "../src/integrations/ringostat/ringostat-calls-list";
import {
  RINGOSTAT_PROVIDER,
  RingostatIngestService,
} from "../src/integrations/ringostat/ringostat-ingest.service";

type RingostatStoredConfig = {
  projectId?: string;
  apiBaseUrl?: string;
  pollingEndpoint?: string;
};

function utcDayBounds(ymd: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) {
    throw new Error(`Expected YYYY-MM-DD, got: ${ymd}`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const start = new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo, d, 23, 59, 59, 999));
  return { start, end };
}

async function main() {
  const fromArg = process.argv[2];
  const toArg = process.argv[3];
  if (!fromArg || !toArg) {
    console.error("Usage: npx ts-node scripts/backfill-ringostat-history.ts <from-YYYY-MM-DD> <to-YYYY-MM-DD>");
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const { start: from } = utcDayBounds(fromArg);
  const { end: to } = utcDayBounds(toArg);
  if (from.getTime() > to.getTime()) {
    throw new Error("from date must be on or before to date");
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const ingest = new RingostatIngestService(prisma);

  try {
    const setting = await prisma.integrationSetting.findFirst({
      where: { provider: RINGOSTAT_PROVIDER },
    });
    const apiToken = setting?.apiToken ?? process.env.RINGOSTAT_API_TOKEN ?? null;
    if (!apiToken) {
      throw new Error("Ringostat API token missing (settings or RINGOSTAT_API_TOKEN)");
    }

    const cfg = (setting?.config ?? null) as RingostatStoredConfig | null;
    const listCfg = {
      apiToken,
      apiBaseUrl: cfg?.apiBaseUrl,
      pollingEndpoint: cfg?.pollingEndpoint,
      projectId: cfg?.projectId,
    };

    console.log(`Backfill ${from.toISOString()} .. ${to.toISOString()} (UTC)`);

    const { chunks, totalEvents } = await runRingostatBackfillChunks(from, to, {
      fetchChunk: async (chunkFrom, chunkTo) => {
        const res = await fetchRingostatCallsList(listCfg, chunkFrom, chunkTo);
        if (!res.ok) {
          throw new Error(`Ringostat HTTP ${res.status}: ${res.bodySnippet}`);
        }
        return res.events;
      },
      ingestEvents: async (events) => {
        await ingest.ingestFromApi(events);
      },
    });

    console.log(`Done. chunks=${chunks}, events=${totalEvents}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
