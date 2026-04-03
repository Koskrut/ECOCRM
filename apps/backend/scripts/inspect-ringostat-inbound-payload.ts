/**
 * One-off: compare Call.from/to for recent INBOUND Ringostat rows vs rawPayload fields
 * (outbound_number vs E164/caller) to debug wrong customer phone mapping.
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/inspect-ringostat-inbound-payload.ts
 *
 * DATABASE_URL: already exported in the shell, or in apps/backend/.env, or repo root .env
 * (e.g. /opt/crm/.env). In Docker: `docker compose exec backend env DATABASE_URL=...` or
 * run inside the container where env is injected.
 */

/* eslint-disable @typescript-eslint/no-var-requires */

const path = require("path");
const dotenv = require("dotenv");

function loadEnvFiles(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  const candidates = [
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", "..", ".env"),
  ];
  for (const p of candidates) {
    dotenv.config({ path: p });
    if (process.env.DATABASE_URL?.trim()) return;
  }
}

loadEnvFiles();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

function getVal(raw: Record<string, unknown>, key: string): unknown {
  const v = raw[key];
  if (v !== undefined && v !== null) return v;
  const nested = raw["additional_call_data"];
  if (typeof nested === "object" && nested !== null && key in (nested as object)) {
    return (nested as Record<string, unknown>)[key];
  }
  return undefined;
}

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Options:\n" +
        "  export DATABASE_URL='postgresql://...'\n" +
        "  or create apps/backend/.env or <repo>/.env with DATABASE_URL=...\n" +
        "  or run this script inside your backend Docker container (where DB env is set).",
    );
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const calls = await prisma.call.findMany({
      where: { provider: "RINGOSTAT", direction: "INBOUND" },
      orderBy: { startedAt: "desc" },
      take: 8,
      select: {
        id: true,
        startedAt: true,
        from: true,
        to: true,
        fromNormalized: true,
        toNormalized: true,
        rawPayload: true,
      },
    });

    if (calls.length === 0) {
      console.log("No INBOUND RINGOSTAT calls found.");
      return;
    }

    console.log(`Found ${calls.length} recent INBOUND RINGOSTAT call(s).\n`);

    for (const c of calls) {
      const p = (c.rawPayload ?? {}) as Record<string, unknown>;
      const on = String(getVal(p, "outbound_number") ?? "").trim();
      const e164 = String(getVal(p, "E164") ?? "").trim();
      const caller = String(getVal(p, "caller") ?? "").trim();
      const cw = String(getVal(p, "connected_with") ?? "").trim();
      const dst = String(getVal(p, "dst") ?? "").trim();
      const src = String(getVal(p, "src") ?? "").trim();

      // Same priority as extractPhonesAndExtension src chain (first wins)
      const chain = [
        ["src", src],
        ["from", String(getVal(p, "from") ?? "").trim()],
        ["caller", caller],
        ["outbound_number", on],
        ["E164", e164],
        ["connected_with", cw],
        ["userfield", String(getVal(p, "userfield") ?? "").trim()],
      ] as const;
      const firstSrc = chain.find(([, v]) => v.length > 0);

      console.log("---");
      console.log("id:", c.id);
      console.log("startedAt:", c.startedAt?.toISOString?.() ?? c.startedAt);
      console.log("Call.from (stored customer):", c.from);
      console.log("Call.to   (stored manager side):", c.to);
      console.log("raw: first non-empty in src chain:", firstSrc ? `${firstSrc[0]}=${firstSrc[1]}` : "(none)");
      console.log("raw: outbound_number:", on || "(empty)");
      console.log("raw: E164:", e164 || "(empty)");
      console.log("raw: caller:", caller.slice(0, 80) + (caller.length > 80 ? "…" : "") || "(empty)");
      console.log("raw: connected_with:", cw || "(empty)");
      console.log("raw: dst:", dst || "(empty)");

      const digits = (s: string) => s.replace(/\D/g, "");
      const fromDigits = digits(c.from ?? "");
      const onDigits = digits(on);
      const clientDigits = digits(e164 || cw || caller);
      if (on && fromDigits && onDigits && fromDigits === onDigits) {
        console.log(">>> NOTE: Call.from matches outbound_number digits (likely wrong customer if outbound_number is pool/line).");
      }
      if (clientDigits && fromDigits && clientDigits !== fromDigits && (e164 || cw)) {
        console.log(">>> NOTE: E164/connected_with digits differ from Call.from — check src chain order (outbound_number may win).");
      }
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
