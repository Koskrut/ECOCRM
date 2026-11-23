import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import {
  accruePayrollMonth,
  kyivMonthBounds,
  parseMonthYm,
  type PayrollOrderInput,
  type PayrollPersonalRates,
} from "./payroll-accrual.util";
import type {
  PayrollBreakdownResponse,
  PayrollTeamResponse,
  PayrollUserRatesDto,
} from "./payroll.types";

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getMe(actor: AuthUser, monthRaw?: string): Promise<PayrollBreakdownResponse> {
    return this.getForUser(actor, actor.id, monthRaw);
  }

  async getForUser(
    actor: AuthUser,
    userId: string,
    monthRaw?: string,
  ): Promise<PayrollBreakdownResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        leadId: true,
        isActive: true,
        payrollProfile: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");
    this.assertCanView(actor, user);

    const month = parseMonthYm(monthRaw);
    const [companyRates, exchangeRates] = await Promise.all([
      this.settings.getPayrollCompanyRates(),
      this.settings.getExchangeRates(),
    ]);
    const personal = this.toPersonalRates(user.payrollProfile);
    const { orders, fuelDays } = await this.loadInputs(userId, month);

    const accrued = accruePayrollMonth({
      month,
      companyRates,
      personal,
      orders,
      fuelDays,
      rates: exchangeRates,
    });

    return {
      userId: user.id,
      fullName: user.fullName,
      rates: this.toRatesDto(personal),
      companyRates: { ...companyRates, source: "company" },
      ...accrued,
    };
  }

  async getTeam(actor: AuthUser, monthRaw?: string): Promise<PayrollTeamResponse> {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.LEAD) {
      throw new ForbiddenException("Only ADMIN or LEAD can view team payroll");
    }
    const month = parseMonthYm(monthRaw);
    const users = await this.prisma.user.findMany({
      where:
        actor.role === UserRole.ADMIN
          ? { isActive: true }
          : { isActive: true, OR: [{ id: actor.id }, { leadId: actor.id }] },
      select: {
        id: true,
        fullName: true,
        role: true,
        payrollProfile: true,
      },
      orderBy: { fullName: "asc" },
    });

    const [companyRates, exchangeRates] = await Promise.all([
      this.settings.getPayrollCompanyRates(),
      this.settings.getExchangeRates(),
    ]);

    const rows = [];
    for (const user of users) {
      const personal = this.toPersonalRates(user.payrollProfile);
      const { orders, fuelDays } = await this.loadInputs(user.id, month);
      const accrued = accruePayrollMonth({
        month,
        companyRates,
        personal,
        orders,
        fuelDays,
        rates: exchangeRates,
      });
      rows.push({
        userId: user.id,
        fullName: user.fullName,
        role: user.role,
        baseSalaryUah: accrued.baseSalaryUah,
        salesBaseUah: accrued.salesBaseUah,
        appliedPercent: accrued.appliedPercent,
        bonusUah: accrued.bonusUah,
        totalKm: accrued.totalKm,
        amortizationUah: accrued.amortizationUah,
        totalUah: accrued.totalUah,
        bonusSource: accrued.bonusRates.source,
      });
    }

    return { month, companyRates, rows };
  }

  private assertCanView(
    actor: AuthUser,
    target: { id: string; leadId: string | null },
  ) {
    if (actor.role === UserRole.ADMIN) return;
    if (actor.id === target.id) return;
    if (actor.role === UserRole.LEAD && target.leadId === actor.id) return;
    throw new ForbiddenException("You cannot view this payroll");
  }

  private toPersonalRates(
    profile: {
      baseSalaryUah: unknown;
      amortizationUahPerKm: unknown;
      bonusThresholdUah: unknown;
      bonusPercentUpTo: unknown;
      bonusPercentAbove: unknown;
    } | null,
  ): PayrollPersonalRates {
    if (!profile) {
      return {
        baseSalaryUah: 0,
        amortizationUahPerKm: 0,
        bonusThresholdUah: null,
        bonusPercentUpTo: null,
        bonusPercentAbove: null,
      };
    }
    return {
      baseSalaryUah: Number(profile.baseSalaryUah) || 0,
      amortizationUahPerKm: Number(profile.amortizationUahPerKm) || 0,
      bonusThresholdUah:
        profile.bonusThresholdUah == null ? null : Number(profile.bonusThresholdUah),
      bonusPercentUpTo:
        profile.bonusPercentUpTo == null ? null : Number(profile.bonusPercentUpTo),
      bonusPercentAbove:
        profile.bonusPercentAbove == null ? null : Number(profile.bonusPercentAbove),
    };
  }

  private toRatesDto(personal: PayrollPersonalRates): PayrollUserRatesDto {
    return {
      baseSalaryUah: personal.baseSalaryUah,
      amortizationUahPerKm: personal.amortizationUahPerKm,
      bonusThresholdUah: personal.bonusThresholdUah,
      bonusPercentUpTo: personal.bonusPercentUpTo,
      bonusPercentAbove: personal.bonusPercentAbove,
    };
  }

  private async loadInputs(userId: string, month: string): Promise<{
    orders: PayrollOrderInput[];
    fuelDays: Array<{
      date: Date;
      compensationKm: number | null;
      actualKm: number | null;
      compensationStatus: string;
    }>;
  }> {
    const { from, toExclusive } = kyivMonthBounds(month);

    // Orders with any COMPLETED payment in the month; util checks if close falls in month.
    const [orders, fuelDays] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          ownerId: userId,
          payments: {
            some: {
              status: "COMPLETED",
              paidAt: { gte: from, lt: toExclusive },
            },
          },
        },
        select: {
          id: true,
          orderNumber: true,
          ownerId: true,
          currency: true,
          totalAmount: true,
          returnAdjustmentAmount: true,
          fxWriteOffAmount: true,
          exchangeRate: true,
          orderStage: true,
          payments: {
            where: { status: "COMPLETED" },
            select: {
              amount: true,
              currency: true,
              amountUsd: true,
              paidAt: true,
              status: true,
            },
            orderBy: { paidAt: "asc" },
          },
        },
      }),
      this.prisma.fuelDayReport.findMany({
        where: {
          ownerId: userId,
          date: { gte: from, lt: toExclusive },
        },
        select: {
          date: true,
          compensationKm: true,
          actualKm: true,
          compensationStatus: true,
        },
      }),
    ]);

    const mapped: PayrollOrderInput[] = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      ownerId: o.ownerId,
      currency: o.currency,
      totalAmount: Number(o.totalAmount),
      returnAdjustmentAmount: Number(o.returnAdjustmentAmount ?? 0),
      fxWriteOffAmount: Number(o.fxWriteOffAmount ?? 0),
      exchangeRate: o.exchangeRate,
      orderStage: o.orderStage,
      payments: o.payments.map((p) => ({
        amount: Number(p.amount),
        currency: p.currency,
        amountUsd: p.amountUsd == null ? null : Number(p.amountUsd),
        paidAt: p.paidAt,
        status: p.status,
      })),
    }));

    return {
      orders: mapped,
      fuelDays: fuelDays.map((d) => ({
        date: d.date,
        compensationKm: d.compensationKm,
        actualKm: d.actualKm,
        compensationStatus: d.compensationStatus,
      })),
    };
  }
}

/** Parse optional decimal body fields for user payroll update. */
export function parseOptionalPayrollNumber(
  v: unknown,
  field: string,
): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new BadRequestException(`${field} must be a number`);
  }
  return n;
}
