import { Injectable, NotFoundException } from "@nestjs/common";
import { PayerAliasSource, PaymentMatchDecision, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  isSharedOrGatewayCounterparty,
  normalizeCounterpartyName,
} from "./match-engine.utils";

export type LearnAliasInput = {
  contactId?: string | null;
  companyId?: string | null;
  counterpartyIban?: string | null;
  counterpartyName?: string | null;
  source?: PayerAliasSource;
};

/**
 * After deploy, purge gateway/transit aliases only (not all PayerAlias rows):
 *
 *   DELETE FROM "PayerAlias"
 *   WHERE "counterpartyNameNormalized" ILIKE '%транз%'
 *      OR "counterpartyIban" = 'UA293052990000029023866100110';
 */
@Injectable()
export class PayerAliasService {
  constructor(private readonly prisma: PrismaService) {}

  async learnFromAllocation(input: LearnAliasInput): Promise<void> {
    const contactId = input.contactId ?? null;
    const companyId = input.companyId ?? null;
    if (!contactId && !companyId) return;

    const iban = input.counterpartyIban?.replace(/\s+/g, "").toUpperCase() || null;
    const nameNorm = normalizeCounterpartyName(input.counterpartyName) || null;
    if (!iban && !nameNorm) return;

    // Never bind a client to a shared/transit IBAN or gateway counterparty name.
    if (isSharedOrGatewayCounterparty(input.counterpartyName, iban)) {
      return;
    }
    if (iban) {
      const distinctContacts = await this.countDistinctContactsForIban(iban);
      if (isSharedOrGatewayCounterparty(input.counterpartyName, iban, distinctContacts)) {
        return;
      }
    }

    const source = input.source ?? PayerAliasSource.LEARNED;

    if (iban) {
      const existing = await this.prisma.payerAlias.findUnique({
        where: { counterpartyIban: iban },
      });
      if (existing) {
        const sameClient =
          (contactId != null && existing.contactId === contactId) ||
          (companyId != null && existing.companyId === companyId);
        const unassigned = !existing.contactId && !existing.companyId;
        // Do not silently overwrite a different learned/manual client mapping.
        if (sameClient || unassigned) {
          await this.prisma.payerAlias.update({
            where: { id: existing.id },
            data: {
              ...(unassigned ? { contactId, companyId } : {}),
              counterpartyNameNormalized: nameNorm ?? existing.counterpartyNameNormalized,
              hitCount: { increment: 1 },
              lastSeenAt: new Date(),
              source: existing.source === PayerAliasSource.MANUAL ? PayerAliasSource.MANUAL : source,
            },
          });
        }
      } else {
        await this.prisma.payerAlias.create({
          data: {
            contactId,
            companyId,
            counterpartyIban: iban,
            counterpartyNameNormalized: nameNorm,
            source,
            hitCount: 1,
            lastSeenAt: new Date(),
          },
        });
      }
    }

    if (nameNorm) {
      const existingName = await this.prisma.payerAlias.findFirst({
        where: {
          counterpartyNameNormalized: nameNorm,
          counterpartyIban: null,
          OR: [
            ...(contactId ? [{ contactId }] : []),
            ...(companyId ? [{ companyId }] : []),
          ],
        },
      });
      if (existingName) {
        await this.prisma.payerAlias.update({
          where: { id: existingName.id },
          data: {
            hitCount: { increment: 1 },
            lastSeenAt: new Date(),
          },
        });
      } else if (!iban) {
        // Only create a name-only row when there is no IBAN (IBAN row already stores name).
        await this.prisma.payerAlias.create({
          data: {
            contactId,
            companyId,
            counterpartyIban: null,
            counterpartyNameNormalized: nameNorm,
            source,
            hitCount: 1,
            lastSeenAt: new Date(),
          },
        });
      }
    }
  }

  async list(params: { q?: string; page: number; pageSize: number }) {
    const where: Prisma.PayerAliasWhereInput = {};
    const q = params.q?.trim();
    if (q) {
      where.OR = [
        { counterpartyIban: { contains: q, mode: "insensitive" } },
        { counterpartyNameNormalized: { contains: q.toLowerCase() } },
        { contact: { lastName: { contains: q, mode: "insensitive" } } },
        { company: { name: { contains: q, mode: "insensitive" } } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.payerAlias.findMany({
        where,
        orderBy: [{ hitCount: "desc" }, { lastSeenAt: "desc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
          company: { select: { id: true, name: true, edrpou: true } },
        },
      }),
      this.prisma.payerAlias.count({ where }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async delete(id: string): Promise<{ ok: true }> {
    const row = await this.prisma.payerAlias.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Payer alias not found");
    await this.prisma.payerAlias.delete({ where: { id } });
    return { ok: true };
  }

  async writeAudit(input: {
    bankTransactionId: string;
    paymentIds: string[];
    decision: PaymentMatchDecision;
    reasons?: unknown;
    score?: number | null;
    matchReason?: string | null;
    createdByUserId?: string | null;
  }): Promise<void> {
    await this.prisma.paymentMatchAudit.create({
      data: {
        bankTransactionId: input.bankTransactionId,
        paymentIds: input.paymentIds,
        decision: input.decision,
        reasons: input.reasons as Prisma.InputJsonValue | undefined,
        score: input.score ?? null,
        matchReason: input.matchReason ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
    });
  }

  /** Distinct contact/client ids that already received COMPLETED payments from this IBAN. */
  private async countDistinctContactsForIban(iban: string): Promise<number> {
    const hist = await this.prisma.payment.findMany({
      where: {
        status: "COMPLETED",
        bankTransaction: { counterpartyIban: { equals: iban, mode: "insensitive" } },
      },
      select: {
        order: { select: { contactId: true, clientId: true } },
      },
      take: 100,
      orderBy: { paidAt: "desc" },
    });
    const ids = new Set<string>();
    for (const p of hist) {
      const id = p.order?.contactId ?? p.order?.clientId;
      if (id) ids.add(id);
    }
    return ids.size;
  }
}
