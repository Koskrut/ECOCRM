import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class FieldFuelService {
  constructor(private readonly prisma: PrismaService) {}

  parseUtcDay(dateStr: string): Date {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Invalid date");
    }
    return date;
  }

  async getOrCreateDay(actor: AuthUser | undefined, dateStr: string) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const ownerId = actor.id;
    const date = this.parseUtcDay(dateStr);

    const dayShift = await this.prisma.fieldShift.findFirst({
      where: { ownerId, date },
      orderBy: { startedAt: "desc" },
    });

    const plannedKm = dayShift?.plannedDistanceKm ?? null;

    const profile =
      (await this.prisma.userFieldProfile.findUnique({ where: { userId: ownerId } })) ??
      (await this.prisma.userFieldProfile.create({
        data: { userId: ownerId },
      }));

    let report = await this.prisma.fuelDayReport.findUnique({
      where: { ownerId_date: { ownerId, date } },
    });

    if (!report) {
      const { litersEstimated, amountEstimated } = this.estimateFuel(plannedKm, profile);
      report = await this.prisma.fuelDayReport.create({
        data: {
          ownerId,
          date,
          shiftId: dayShift?.id ?? undefined,
          plannedKm: plannedKm ?? undefined,
          litersEstimated,
          amountEstimated: amountEstimated ?? undefined,
        },
      });
    }

    return { report, profile };
  }

  private estimateFuel(
    plannedKm: number | null,
    profile: { fuelLitersPer100km: number; fuelPricePerLiter: Prisma.Decimal | null },
  ): { litersEstimated: number | null; amountEstimated: Prisma.Decimal | null } {
    if (plannedKm == null || !Number.isFinite(plannedKm)) {
      return { litersEstimated: null, amountEstimated: null };
    }
    const liters = (plannedKm * profile.fuelLitersPer100km) / 100;
    if (!Number.isFinite(liters)) {
      return { litersEstimated: null, amountEstimated: null };
    }
    const litersRounded = Math.round(liters * 1000) / 1000;
    if (!profile.fuelPricePerLiter) {
      return { litersEstimated: litersRounded, amountEstimated: null };
    }
    const amount = new Prisma.Decimal(litersRounded).mul(profile.fuelPricePerLiter);
    return { litersEstimated: litersRounded, amountEstimated: amount };
  }

  async recalculate(actor: AuthUser | undefined, dateStr: string) {
    if (!actor) throw new BadRequestException("User is required");
    const ownerId = actor.id;
    const date = this.parseUtcDay(dateStr);

    const dayShift = await this.prisma.fieldShift.findFirst({
      where: { ownerId, date },
      orderBy: { startedAt: "desc" },
    });
    const plannedKm = dayShift?.plannedDistanceKm ?? null;

    const profile =
      (await this.prisma.userFieldProfile.findUnique({ where: { userId: ownerId } })) ??
      (await this.prisma.userFieldProfile.create({
        data: { userId: ownerId },
      }));

    const { litersEstimated, amountEstimated } = this.estimateFuel(plannedKm, profile);

    const report = await this.prisma.fuelDayReport.upsert({
      where: { ownerId_date: { ownerId, date } },
      create: {
        ownerId,
        date,
        shiftId: dayShift?.id ?? undefined,
        plannedKm: plannedKm ?? undefined,
        litersEstimated: litersEstimated ?? undefined,
        amountEstimated: amountEstimated ?? undefined,
      },
      update: {
        shiftId: dayShift?.id ?? undefined,
        plannedKm: plannedKm ?? undefined,
        litersEstimated: litersEstimated ?? undefined,
        amountEstimated: amountEstimated ?? undefined,
      },
    });

    return { report, profile };
  }

  async getProfile(actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    return (
      (await this.prisma.userFieldProfile.findUnique({ where: { userId: actor.id } })) ??
      (await this.prisma.userFieldProfile.create({
        data: { userId: actor.id },
      }))
    );
  }

  async updateProfile(
    actor: AuthUser | undefined,
    body: {
      fuelLitersPer100km?: number;
      fuelPricePerLiter?: number | null;
      vehicleLabel?: string | null;
      usePersonalCar?: boolean;
    },
  ) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const data: Prisma.UserFieldProfileUpdateInput = {};
    if (body.fuelLitersPer100km != null && Number.isFinite(body.fuelLitersPer100km)) {
      data.fuelLitersPer100km = body.fuelLitersPer100km;
    }
    if (body.fuelPricePerLiter !== undefined) {
      data.fuelPricePerLiter =
        body.fuelPricePerLiter == null
          ? null
          : new Prisma.Decimal(body.fuelPricePerLiter);
    }
    if (body.vehicleLabel !== undefined) {
      data.vehicleLabel = body.vehicleLabel;
    }
    if (body.usePersonalCar !== undefined) {
      data.usePersonalCar = body.usePersonalCar;
    }

    return this.prisma.userFieldProfile.upsert({
      where: { userId: actor.id },
      create: {
        userId: actor.id,
        fuelLitersPer100km: body.fuelLitersPer100km ?? undefined,
        fuelPricePerLiter:
          body.fuelPricePerLiter == null ? undefined : new Prisma.Decimal(body.fuelPricePerLiter),
        vehicleLabel: body.vehicleLabel ?? undefined,
        usePersonalCar: body.usePersonalCar ?? undefined,
      },
      update: data,
    });
  }
}
