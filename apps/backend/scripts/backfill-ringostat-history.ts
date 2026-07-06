/**
 * One-off: import Ringostat /calls/list for a date range (UTC calendar days).
 * Same chunking/overlap as POST settings/ringostat/backfill.
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/backfill-ringostat-history.ts 2026-03-01 2026-03-31
 *
 * DATABASE_URL: export in shell, or apps/backend/.env, apps/.env, or monorepo root .env
 * (e.g. /opt/crm/.env). Ringostat token: IntegrationSetting or RINGOSTAT_API_TOKEN.
 *
 * Docker: if DATABASE_URL uses host `postgres` (Compose service name), that hostname resolves
 * only inside the stack network. Either run inside the backend container, e.g.:
 *   docker compose -f docker-compose.prod.yml exec backend npx ts-node scripts/backfill-ringostat-history.ts 2026-03-01 2026-04-03
 * or temporarily use a host-reachable URL (e.g. postgresql://crm:PASSWORD@127.0.0.1:5432/crm).
 */

import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { runRingostatBackfillChunks } from "../src/integrations/ringostat/ringostat-backfill.chunks";
import { fetchRingostatCallsList } from "../src/integrations/ringostat/ringostat-calls-list";
import {
  RINGOSTAT_PROVIDER,
  RingostatIngestService,
} from "../src/integrations/ringostat/ringostat-ingest.service";
import { PhoneEntityLookupService } from "../src/common/phone-entity-lookup.service";
import type { PrismaService } from "../src/prisma/prisma.service";

function loadEnvFiles(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  const candidates = [
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", "..", ".env"),
    path.join(__dirname, "..", "..", "..", ".env"),
  ];
  for (const p of candidates) {
    dotenv.config({ path: p });
    if (process.env.DATABASE_URL?.trim()) return;
  }
}

loadEnvFiles();

function printDbConnectionHint(err: unknown): void {
  const text = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  const looksLikeDnsOrTcp =
    /\bEAI_AGAIN\b/i.test(text) ||
    /\bgetaddrinfo\b/i.test(text) ||
    /\bECONNREFUSED\b/i.test(text) ||
    /\bENOTFOUND\b/i.test(text);
  if (!looksLikeDnsOrTcp) return;
  const url = process.env.DATABASE_URL ?? "";
  const usesPostgresHost = /@postgres[:/]/i.test(url) || /:\/\/postgres\//i.test(url);
  console.error(
    "\n---\n" +
      "Database connection failed from this process. If DATABASE_URL points at hostname " +
      "`postgres`, run this script inside the backend container (same network as Postgres), " +
      "or change the host to 127.0.0.1 when Postgres publishes port 5432 on the host.\n" +
      (usesPostgresHost
        ? "Your DATABASE_URL appears to use the `postgres` service host (typical in Docker Compose).\n"
        : "") +
      "Example: docker compose -f docker-compose.prod.yml exec backend npx ts-node scripts/backfill-ringostat-history.ts <from> <to>\n" +
      "---\n",
  );
}

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
    throw new Error(
      "DATABASE_URL is not set. Export it, or add it to apps/backend/.env or the repo root .env " +
        "(e.g. /opt/crm/.env), then run again from apps/backend.",
    );
  }

  const { start: from } = utcDayBounds(fromArg);
  const { end: to } = utcDayBounds(toArg);
  if (from.getTime() > to.getTime()) {
    throw new Error("from date must be on or before to date");
  }

  const pool = new Pool({ connectionString });
  // @prisma/adapter-pg may bundle its own @types/pg; root `pg` Pool is fine at runtime (see PrismaService).
  const adapter = new PrismaPg(pool as any);
  const prisma = new PrismaClient({ adapter });
  const phoneLookup = new PhoneEntityLookupService(prisma as unknown as PrismaService);
  const { MissedCallQueueService } = require("../src/manual-calling/missed-call-queue.service");
  // RingostatIngestService is typed for Nest DI (PrismaService); script uses a plain PrismaClient + adapter.
  const ingest = new RingostatIngestService(
    prisma as unknown as PrismaService,
    phoneLookup,
    new MissedCallQueueService(),
  );

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
  printDbConnectionHint(e);
  console.error(e);
  process.exit(1);
});
