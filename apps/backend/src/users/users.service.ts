import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import {
  allocateUniqueUsername,
  normalizeUsername,
  usernameBaseFromEmail,
} from "../auth/username.util";
import { validatePersonalBonusTriplet } from "../payroll/payroll-accrual.util";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private userListInclude = {
    fieldProfile: {
      select: {
        fuelLitersPer100km: true,
        fuelPricePerLiter: true,
        vehicleLabel: true,
        usePersonalCar: true,
      },
    },
    payrollProfile: {
      select: {
        baseSalaryUah: true,
        amortizationUahPerKm: true,
        bonusThresholdUah: true,
        bonusPercentUpTo: true,
        bonusPercentAbove: true,
      },
    },
  } as const;

  private canActorAccessUser(actor: AuthUser | undefined, targetUserId: string, leadId: string | null) {
    if (!actor || actor.role === UserRole.ADMIN) return true;
    if (actor.id === targetUserId) return true;
    if (actor.role === UserRole.LEAD && leadId === actor.id) return true;
    return false;
  }

  async listUsers(actor?: AuthUser, scope?: string) {
    if (scope === "assignees") {
      return this.listAssignees();
    }
    const orderBy = { createdAt: "desc" as const };
    if (!actor || actor.role === UserRole.ADMIN) {
      return this.prisma.user.findMany({ orderBy, include: this.userListInclude });
    }
    if (actor.role === UserRole.LEAD) {
      return this.prisma.user.findMany({
        where: { OR: [{ id: actor.id }, { leadId: actor.id }] },
        orderBy,
        include: this.userListInclude,
      });
    }
    return this.prisma.user.findMany({
      where: { id: actor.id },
      orderBy,
      include: this.userListInclude,
    });
  }

  /** Active users for task assignee pickers — any authenticated user may assign to any colleague. */
  async listAssignees() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: [{ fullName: "asc" }, { createdAt: "desc" }],
      select: { id: true, fullName: true, email: true, role: true },
    });
  }

  async getUserById(id: string, actor?: AuthUser) {
    if (!id) throw new BadRequestException("id is required");
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: this.userListInclude,
    });
    if (!user) throw new NotFoundException("User not found");
    if (!this.canActorAccessUser(actor, user.id, user.leadId)) {
      throw new ForbiddenException("Access denied");
    }
    return user;
  }

  async createUser(payload: {
    email: string;
    username?: string;
    password?: string;
    passwordHash?: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    isActive?: boolean;
  }) {
    if (!payload?.email) throw new BadRequestException("email is required");

    // Временно без bcrypt: чтобы просто поднять проект.
    // Позже заменим на bcrypt/argon2.
    const passwordHashValue =
      payload.passwordHash ?? (payload.password ? `plain:${payload.password}` : "");

    const emailNorm = payload.email.trim().toLowerCase();
    const usernameTaken = async (candidate: string) =>
      Boolean(await this.prisma.user.findUnique({ where: { username: candidate } }));

    let username: string;
    if (payload.username?.trim()) {
      username = normalizeUsername(payload.username);
      if (await usernameTaken(username)) {
        throw new BadRequestException("username already taken");
      }
    } else {
      username = await allocateUniqueUsername(usernameTaken, usernameBaseFromEmail(emailNorm));
    }

    return this.prisma.user.create({
      data: {
        email: emailNorm,
        username,
        passwordHash: passwordHashValue,
        fullName: payload.fullName ?? "",
        role: (payload.role as UserRole) ?? undefined,
        isActive: payload.isActive ?? undefined,
      },
      include: this.userListInclude,
    });
  }

  async updateUser(
    id: string,
    payload: {
      email?: string;
      username?: string | null;
      password?: string;
      fullName?: string;
      firstName?: string;
      lastName?: string;
      isActive?: boolean;
      routeStartLat?: number | null;
      routeStartLng?: number | null;
      routeEndLat?: number | null;
      routeEndLng?: number | null;
      routeStartLabel?: string | null;
      routeEndLabel?: string | null;
      leadId?: string | null;
      fuelLitersPer100km?: number;
      fuelPricePerLiter?: number | null;
      vehicleLabel?: string | null;
      usePersonalCar?: boolean;
      baseSalaryUah?: number;
      amortizationUahPerKm?: number;
      bonusThresholdUah?: number | null;
      bonusPercentUpTo?: number | null;
      bonusPercentAbove?: number | null;
    },
  ) {
    if (!id) throw new BadRequestException("id is required");

    const data: Prisma.UserUpdateInput = {
      email: payload.email ?? undefined,
      fullName: payload.fullName ?? undefined,
    };

    if (payload.isActive !== undefined) {
      data.isActive = payload.isActive;
    }

    if (payload.username !== undefined) {
      if (payload.username === null || payload.username === "") {
        data.username = null;
      } else {
        const u = normalizeUsername(payload.username);
        const taken = await this.prisma.user.findFirst({
          where: { username: u, id: { not: id } },
        });
        if (taken) throw new BadRequestException("username already taken");
        data.username = u;
      }
    }

    if (payload.password !== undefined) {
      const p = payload.password.trim();
      if (p.length > 0) {
        data.passwordHash = `plain:${p}`;
      }
      // If password is an empty string, treat it as "not provided" to avoid wiping passwordHash.
    }

    const setCoord = (v: number | null | undefined) =>
      v === undefined ? undefined : v === null ? null : v;
    if (payload.routeStartLat !== undefined) data.routeStartLat = setCoord(payload.routeStartLat);
    if (payload.routeStartLng !== undefined) data.routeStartLng = setCoord(payload.routeStartLng);
    if (payload.routeEndLat !== undefined) data.routeEndLat = setCoord(payload.routeEndLat);
    if (payload.routeEndLng !== undefined) data.routeEndLng = setCoord(payload.routeEndLng);
    if (payload.routeStartLabel !== undefined) data.routeStartLabel = payload.routeStartLabel;
    if (payload.routeEndLabel !== undefined) data.routeEndLabel = payload.routeEndLabel;

    if (payload.leadId !== undefined) {
      if (payload.leadId === id) {
        throw new BadRequestException("leadId cannot be the same as user id");
      }
      if (payload.leadId) {
        const lead = await this.prisma.user.findUnique({
          where: { id: payload.leadId },
          select: { id: true, role: true },
        });
        if (!lead) throw new BadRequestException("Lead user not found");
        if (lead.role !== "LEAD" && lead.role !== "ADMIN") {
          throw new BadRequestException("leadId must reference a LEAD or ADMIN user");
        }
      }
      await this.settings.syncOrgChartForUserLeadChange(id, payload.leadId);
    }

    const dataPruned = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    ) as Prisma.UserUpdateInput;

    const hasFuelPayload =
      payload.fuelLitersPer100km !== undefined ||
      payload.fuelPricePerLiter !== undefined ||
      payload.vehicleLabel !== undefined ||
      payload.usePersonalCar !== undefined;

    if (hasFuelPayload) {
      if (
        payload.fuelLitersPer100km !== undefined &&
        (!Number.isFinite(payload.fuelLitersPer100km) || payload.fuelLitersPer100km <= 0)
      ) {
        throw new BadRequestException("fuelLitersPer100km must be a positive number");
      }
      const profileData: Prisma.UserFieldProfileUpdateInput = {};
      if (payload.fuelLitersPer100km !== undefined) {
        profileData.fuelLitersPer100km = payload.fuelLitersPer100km;
      }
      if (payload.fuelPricePerLiter !== undefined) {
        profileData.fuelPricePerLiter =
          payload.fuelPricePerLiter == null
            ? null
            : new Prisma.Decimal(payload.fuelPricePerLiter);
      }
      if (payload.vehicleLabel !== undefined) {
        profileData.vehicleLabel = payload.vehicleLabel;
      }
      if (payload.usePersonalCar !== undefined) {
        profileData.usePersonalCar = payload.usePersonalCar;
      }
      await this.prisma.userFieldProfile.upsert({
        where: { userId: id },
        create: {
          userId: id,
          fuelLitersPer100km: payload.fuelLitersPer100km ?? 8,
          fuelPricePerLiter:
            payload.fuelPricePerLiter == null
              ? undefined
              : new Prisma.Decimal(payload.fuelPricePerLiter),
          vehicleLabel: payload.vehicleLabel ?? undefined,
          usePersonalCar: payload.usePersonalCar ?? undefined,
        },
        update: profileData,
      });
    }

    const hasPayrollPayload =
      payload.baseSalaryUah !== undefined ||
      payload.amortizationUahPerKm !== undefined ||
      payload.bonusThresholdUah !== undefined ||
      payload.bonusPercentUpTo !== undefined ||
      payload.bonusPercentAbove !== undefined;

    if (hasPayrollPayload) {
      const existing = await this.prisma.userPayrollProfile.findUnique({ where: { userId: id } });
      const nextThreshold =
        payload.bonusThresholdUah !== undefined
          ? payload.bonusThresholdUah
          : existing?.bonusThresholdUah == null
            ? null
            : Number(existing.bonusThresholdUah);
      const nextUpTo =
        payload.bonusPercentUpTo !== undefined
          ? payload.bonusPercentUpTo
          : existing?.bonusPercentUpTo == null
            ? null
            : Number(existing.bonusPercentUpTo);
      const nextAbove =
        payload.bonusPercentAbove !== undefined
          ? payload.bonusPercentAbove
          : existing?.bonusPercentAbove == null
            ? null
            : Number(existing.bonusPercentAbove);

      const triplet = validatePersonalBonusTriplet({
        bonusThresholdUah: nextThreshold,
        bonusPercentUpTo: nextUpTo,
        bonusPercentAbove: nextAbove,
      });
      if (!triplet.ok) throw new BadRequestException(triplet.message);

      if (payload.baseSalaryUah !== undefined && (!(Number.isFinite(payload.baseSalaryUah) && payload.baseSalaryUah >= 0))) {
        throw new BadRequestException("baseSalaryUah must be a non-negative number");
      }
      if (
        payload.amortizationUahPerKm !== undefined &&
        (!(Number.isFinite(payload.amortizationUahPerKm) && payload.amortizationUahPerKm >= 0))
      ) {
        throw new BadRequestException("amortizationUahPerKm must be a non-negative number");
      }

      const payrollUpdate: Prisma.UserPayrollProfileUpdateInput = {};
      if (payload.baseSalaryUah !== undefined) {
        payrollUpdate.baseSalaryUah = new Prisma.Decimal(payload.baseSalaryUah);
      }
      if (payload.amortizationUahPerKm !== undefined) {
        payrollUpdate.amortizationUahPerKm = new Prisma.Decimal(payload.amortizationUahPerKm);
      }
      if (payload.bonusThresholdUah !== undefined) {
        payrollUpdate.bonusThresholdUah =
          payload.bonusThresholdUah == null ? null : new Prisma.Decimal(payload.bonusThresholdUah);
      }
      if (payload.bonusPercentUpTo !== undefined) {
        payrollUpdate.bonusPercentUpTo =
          payload.bonusPercentUpTo == null ? null : new Prisma.Decimal(payload.bonusPercentUpTo);
      }
      if (payload.bonusPercentAbove !== undefined) {
        payrollUpdate.bonusPercentAbove =
          payload.bonusPercentAbove == null ? null : new Prisma.Decimal(payload.bonusPercentAbove);
      }

      await this.prisma.userPayrollProfile.upsert({
        where: { userId: id },
        create: {
          userId: id,
          baseSalaryUah: new Prisma.Decimal(payload.baseSalaryUah ?? 0),
          amortizationUahPerKm: new Prisma.Decimal(payload.amortizationUahPerKm ?? 0),
          bonusThresholdUah:
            nextThreshold == null ? null : new Prisma.Decimal(nextThreshold),
          bonusPercentUpTo: nextUpTo == null ? null : new Prisma.Decimal(nextUpTo),
          bonusPercentAbove: nextAbove == null ? null : new Prisma.Decimal(nextAbove),
        },
        update: payrollUpdate,
      });
    }

    if (Object.keys(dataPruned).length === 0) {
      return this.prisma.user.findUniqueOrThrow({
        where: { id },
        include: this.userListInclude,
      });
    }
    return this.prisma.user.update({
      where: { id },
      data: dataPruned,
      include: this.userListInclude,
    });
  }

  async updateRole(id: string, role: string) {
    if (!id) throw new BadRequestException("id is required");
    if (!role) throw new BadRequestException("role is required");

    const r = role as UserRole;
    const user = await this.prisma.user.update({
      where: { id },
      data: { role: r },
    });
    await this.settings.syncOrgChartClearLeadSlotIfDemoted(id, r);
    return user;
  }

  async deleteUser(id: string) {
    if (!id) throw new BadRequestException("id is required");
    await this.settings.syncOrgChartRemoveUserFromAllSlots(id);
    return this.prisma.user.delete({ where: { id } });
  }
}
