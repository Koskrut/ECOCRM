/**
 * Backfill: set leadId/contactId/companyId on Activity records that are linked to a Call
 * (via callId) but have null leadId/contactId/companyId. The Call may have been linked
 * to a lead/contact when ingested; this script copies those links to the Activity
 * so the call appears in the lead/contact timeline.
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/backfill-timeline-call-activities.ts
 */

/* eslint-disable @typescript-eslint/no-var-requires */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Activities that have a call and (activity.leadId is null but call.leadId is set)
    // or same for contactId, companyId.
    const activities = await prisma.activity.findMany({
      where: { callId: { not: null } },
      select: {
        id: true,
        leadId: true,
        contactId: true,
        companyId: true,
        callId: true,
        call: { select: { leadId: true, contactId: true, companyId: true } },
      },
    });

    let updated = 0;
    for (const a of activities) {
      const call = a.call;
      if (!call) continue;

      const needLead = call.leadId != null && a.leadId !== call.leadId;
      const needContact = call.contactId != null && a.contactId !== call.contactId;
      const needCompany = call.companyId != null && a.companyId !== call.companyId;

      if (!needLead && !needContact && !needCompany) continue;

      await prisma.activity.update({
        where: { id: a.id },
        data: {
          ...(needLead && { leadId: call.leadId }),
          ...(needContact && { contactId: call.contactId }),
          ...(needCompany && { companyId: call.companyId }),
        },
      });
      updated++;
    }

    console.log(`Backfill complete. Activities updated: ${updated} of ${activities.length} call activities.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
