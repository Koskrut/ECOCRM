/**
 * Cleanup duplicates of system-generated missed-call callback tasks.
 *
 * Goal: remove task spam caused by non-idempotent ingest (Ringostat/Kyivstar).
 * After introducing Task.callId with upsert, new duplicates should stop.
 *
 * Strategy (safe / heuristic):
 * - Consider only OPEN/IN_PROGRESS tasks with title "Перезвонить"
 * - Consider only tasks created by system/integrations (createdById IS NULL)
 * - Group by: assigneeId + (contactId/companyId/leadId) + dueAt + body
 * - Keep the oldest task in each group, cancel the rest (soft cleanup)
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/cleanup-duplicate-missed-call-tasks.ts --dry-run
 *   npx ts-node scripts/cleanup-duplicate-missed-call-tasks.ts --apply
 */

import { PrismaClient } from "@prisma/client";

type Mode = "dry-run" | "apply";

function parseMode(argv: string[]): Mode {
  if (argv.includes("--apply")) return "apply";
  return "dry-run";
}

function keyFor(t: {
  assigneeId: string;
  contactId: string | null;
  companyId: string | null;
  leadId: string | null;
  dueAt: Date | null;
  body: string | null;
}): string {
  return [
    t.assigneeId,
    t.contactId ?? "",
    t.companyId ?? "",
    t.leadId ?? "",
    t.dueAt ? t.dueAt.toISOString() : "",
    t.body ?? "",
  ].join("|");
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.task.findMany({
      where: {
        title: "Перезвонить",
        createdById: null,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      select: {
        id: true,
        assigneeId: true,
        contactId: true,
        companyId: true,
        leadId: true,
        dueAt: true,
        body: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = keyFor(r);
      const prev = groups.get(k);
      if (prev) prev.push(r);
      else groups.set(k, [r]);
    }

    let groupsWithDupes = 0;
    let toCancel: string[] = [];
    for (const g of groups.values()) {
      if (g.length <= 1) continue;
      groupsWithDupes += 1;
      // keep first (oldest)
      toCancel.push(...g.slice(1).map((x) => x.id));
    }

    console.log(
      JSON.stringify(
        {
          mode,
          scanned: rows.length,
          groups: groups.size,
          groupsWithDupes,
          cancelCandidates: toCancel.length,
        },
        null,
        2,
      ),
    );

    if (mode === "dry-run") return;

    const chunkSize = 500;
    for (let i = 0; i < toCancel.length; i += chunkSize) {
      const chunk = toCancel.slice(i, i + chunkSize);
      await prisma.task.updateMany({
        where: { id: { in: chunk } },
        data: { status: "CANCELED" },
      });
      console.log(`Canceled ${Math.min(i + chunk.length, toCancel.length)}/${toCancel.length}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

