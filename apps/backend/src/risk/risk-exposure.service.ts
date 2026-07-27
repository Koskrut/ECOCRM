import { BadRequestException, Injectable } from "@nestjs/common";
import type { CreditProfile, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_CREDIT_POLICY } from "./risk.constants";

export type ExposureResult = {
  contactId: string | null;
  companyId: string | null;
  creditLimit: number;
  utilizedExposure: number;
  bookUtilized: number;
  availableCredit: number;
  exposurePct: number;
  profile: CreditProfile | null;
};

@Injectable()
export class RiskExposureService {
  constructor(private readonly prisma: PrismaService) {}

  async computeExposure(input: {
    contactId?: string | null;
    companyId?: string | null;
    additionalAmount?: number;
    excludeOrderId?: string;
    persist?: boolean;
  }): Promise<ExposureResult> {
    const contactId = input.contactId ?? null;
    const companyId = input.companyId ?? null;
    const persist = input.persist ?? false;

    const profile = contactId
      ? await this.prisma.creditProfile.findUnique({ where: { contactId } })
      : companyId
        ? await this.prisma.creditProfile.findUnique({ where: { companyId } })
        : null;

    const openDebtWhere: Prisma.OrderWhereInput = {
      debtAmount: { gt: 0 },
      paymentType: "DEFERRED",
      OR: [{ orderStage: null }, { orderStage: { notIn: ["CANCELED", "REFUSED", "COMPLETED"] } }],
    };
    if (contactId) openDebtWhere.clientId = contactId;
    else if (companyId) openDebtWhere.companyId = companyId;

    const orders = await this.prisma.order.findMany({
      where: openDebtWhere,
      select: { id: true, debtAmount: true },
    });

    const bookUtilized = orders
      .filter((o) => o.id !== input.excludeOrderId)
      .reduce((sum, o) => sum + Number(o.debtAmount ?? 0), 0);
    const additional = input.additionalAmount ?? 0;
    const totalExposure = bookUtilized + additional;
    const creditLimit = profile ? Number(profile.creditLimit) : 0;
    const availableCredit = Math.max(0, creditLimit - totalExposure);
    const exposurePct =
      creditLimit > 0 ? Math.round((totalExposure / creditLimit) * 100) : totalExposure > 0 ? 100 : 0;

    if (profile && persist) {
      await this.prisma.creditProfile.update({
        where: { id: profile.id },
        data: {
          utilizedExposure: bookUtilized,
          availableCredit: Math.max(0, creditLimit - bookUtilized),
        },
      });
    }

    return {
      contactId,
      companyId,
      creditLimit,
      utilizedExposure: totalExposure,
      bookUtilized,
      availableCredit,
      exposurePct,
      profile,
    };
  }

  async ensureProfile(input: { contactId?: string | null; companyId?: string | null }) {
    const { contactId, companyId } = input;
    if (!contactId && !companyId) return null;
    if (contactId && companyId) {
      throw new BadRequestException("Credit profile must be linked to either contact or company, not both");
    }
    const existing = contactId
      ? await this.prisma.creditProfile.findUnique({ where: { contactId } })
      : await this.prisma.creditProfile.findUnique({ where: { companyId: companyId! } });
    if (existing) return existing;
    return this.prisma.creditProfile.create({
      data: {
        contactId: contactId ?? undefined,
        companyId: companyId ?? undefined,
        creditLimit: DEFAULT_CREDIT_POLICY.defaultCreditLimit,
        currency: DEFAULT_CREDIT_POLICY.defaultCurrency,
      },
    });
  }

  async updateProfile(
    id: string,
    data: {
      creditLimit?: number;
      currency?: string;
      riskClass?: string;
      status?: string;
      paymentTermsDays?: number;
      notes?: string | null;
    },
  ) {
    return this.prisma.creditProfile.update({
      where: { id },
      data: {
        creditLimit: data.creditLimit,
        currency: data.currency,
        riskClass: data.riskClass as never,
        status: data.status as never,
        paymentTermsDays: data.paymentTermsDays,
        notes: data.notes,
      },
    });
  }
}
