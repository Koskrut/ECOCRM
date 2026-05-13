import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Resolves CRM entities by normalized phone digit keys (380… / 0… variants should be passed in).
 */
@Injectable()
export class PhoneEntityLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async findContactByNormalizedKeys(
    keys: string[],
  ): Promise<{ id: string; companyId: string | null } | null> {
    const uniq = [...new Set(keys.map((k) => k.replace(/\D/g, "")).filter(Boolean))];
    if (uniq.length === 0) return null;

    return this.prisma.contact.findFirst({
      where: {
        OR: uniq.flatMap((key) => [
          { phoneNormalized: key },
          { phones: { some: { phoneNormalized: key } } },
        ]),
      },
      select: { id: true, companyId: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Match company.phone digits against any of the given normalized keys. */
  async findCompanyIdByNormalizedKeys(keys: string[]): Promise<string | null> {
    const uniq = [...new Set(keys.map((k) => k.replace(/\D/g, "")).filter(Boolean))];
    if (uniq.length === 0) return null;

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT c.id
        FROM "Company" c
        WHERE c.phone IS NOT NULL
          AND regexp_replace(c.phone, '[^0-9]', '', 'g') IN (${Prisma.join(
            uniq.map((d) => Prisma.sql`${d}`),
          )})
        ORDER BY c."createdAt" DESC
        LIMIT 1
      `,
    );
    return rows[0]?.id ?? null;
  }
}
