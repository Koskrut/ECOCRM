import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import {
  defaultTemplateForProfile,
  defaultThresholds,
  filterEnabledItems,
  mergeTemplateItems,
  parseGlobalConfigStored,
  parseUserOverrideStored,
  resolveEffectiveTemplate,
  validateTemplateItems,
  validateThresholds,
} from "./day-plan.template-config";
import type {
  DayPlanGlobalConfigStored,
  DayPlanGlobalSettingsPayload,
  DayPlanProfile,
  DayPlanSettingsProfilePayload,
  DayPlanTemplate,
  DayPlanTemplateItem,
  DayPlanThresholds,
  DayPlanUserOverrideStored,
  DayPlanUserSettingsPayload,
} from "./day-plan.types";

const GLOBAL_SETTING_ID = "day_plan_templates";

@Injectable()
export class DayPlanSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getGlobalConfig(): Promise<DayPlanGlobalSettingsPayload> {
    const stored = await this.loadGlobalStored();
    const thresholds = stored?.thresholds ?? defaultThresholds();
    return {
      thresholds,
      office: this.buildProfilePayload("office", stored),
      field: this.buildProfilePayload("field", stored),
    };
  }

  async setGlobalConfig(body: {
    thresholds?: DayPlanThresholds;
    office?: { items?: Partial<DayPlanTemplateItem>[] };
    field?: { items?: Partial<DayPlanTemplateItem>[] };
    resetOffice?: boolean;
    resetField?: boolean;
  }): Promise<DayPlanGlobalSettingsPayload> {
    const current = (await this.loadGlobalStored()) ?? {};
    const next: DayPlanGlobalConfigStored = { ...current };

    if (body.thresholds) {
      validateThresholds(body.thresholds);
      next.thresholds = body.thresholds;
    }

    if (body.resetOffice) {
      delete next.office;
    } else if (body.office?.items) {
      const merged = mergeTemplateItems(
        defaultTemplateForProfile("office").items,
        body.office.items,
      );
      validateTemplateItems("office", merged);
      next.office = { items: body.office.items };
    }

    if (body.resetField) {
      delete next.field;
    } else if (body.field?.items) {
      const merged = mergeTemplateItems(
        defaultTemplateForProfile("field").items,
        body.field.items,
      );
      validateTemplateItems("field", merged);
      next.field = { items: body.field.items };
    }

    await this.prisma.systemSetting.upsert({
      where: { id: GLOBAL_SETTING_ID },
      create: { id: GLOBAL_SETTING_ID, value: next as Prisma.InputJsonValue },
      update: { value: next as Prisma.InputJsonValue },
    });

    return this.getGlobalConfig();
  }

  async getUserOverride(userId: string, actor: AuthUser): Promise<DayPlanUserSettingsPayload> {
    await this.assertCanEditUser(actor, userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const profile = await this.resolveProfile(userId);
    const globalStored = await this.loadGlobalStored();
    const overrideRow = await this.prisma.userDayPlanOverride.findUnique({
      where: { userId },
    });
    const userOverride = overrideRow
      ? {
          items: (overrideRow.items as Partial<DayPlanTemplateItem>[]) ?? [],
          thresholds: overrideRow.thresholds as DayPlanThresholds | undefined,
        }
      : null;

    const globalAll = mergeTemplateItems(
      defaultTemplateForProfile(profile).items,
      globalStored?.[profile]?.items ?? [],
    );

    const mergedItems = userOverride?.items?.length
      ? mergeTemplateItems(globalAll, userOverride.items)
      : globalAll;

    const effective = resolveEffectiveTemplate({
      profile,
      globalConfig: globalStored,
      userOverride,
    });

    return {
      userId: user.id,
      fullName: user.fullName,
      profile,
      hasCustomOverride: overrideRow != null,
      thresholds: effective.thresholds,
      globalBase: filterEnabledItems(globalAll),
      items: mergedItems,
      effective: effective.template.items,
      overrides: userOverride?.items ?? [],
    };
  }

  async setUserOverride(
    userId: string,
    body: {
      items?: Partial<DayPlanTemplateItem>[];
      thresholds?: DayPlanThresholds | null;
    },
    actor: AuthUser,
  ): Promise<DayPlanUserSettingsPayload> {
    await this.assertCanEditUser(actor, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException("User not found");

    const profile = await this.resolveProfile(userId);
    const globalStored = await this.loadGlobalStored();
    const globalAll = mergeTemplateItems(
      defaultTemplateForProfile(profile).items,
      globalStored?.[profile]?.items ?? [],
    );

    if (!body.items?.length) {
      throw new BadRequestException("items are required");
    }

    const merged = mergeTemplateItems(globalAll, body.items);
    validateTemplateItems(profile, merged);

    const stored: DayPlanUserOverrideStored = {
      items: body.items,
      ...(body.thresholds ? { thresholds: body.thresholds } : {}),
    };
    if (body.thresholds) {
      validateThresholds(body.thresholds);
    }

    await this.prisma.userDayPlanOverride.upsert({
      where: { userId },
      create: {
        userId,
        items: stored.items as Prisma.InputJsonValue,
        thresholds: stored.thresholds as Prisma.InputJsonValue | undefined,
        updatedById: actor.id,
      },
      update: {
        items: stored.items as Prisma.InputJsonValue,
        thresholds: stored.thresholds as Prisma.InputJsonValue | undefined,
        updatedById: actor.id,
      },
    });

    return this.getUserOverride(userId, actor);
  }

  async deleteUserOverride(userId: string, actor: AuthUser): Promise<DayPlanUserSettingsPayload> {
    await this.assertCanEditUser(actor, userId);
    await this.prisma.userDayPlanOverride.deleteMany({ where: { userId } });
    return this.getUserOverride(userId, actor);
  }

  async listUserIdsWithOverrides(actor: AuthUser): Promise<{ userIds: string[] }> {
    const where = await this.overrideVisibilityWhere(actor);
    const rows = await this.prisma.userDayPlanOverride.findMany({
      where,
      select: { userId: true },
    });
    return { userIds: rows.map((r) => r.userId) };
  }

  async getEffectiveTemplateForUser(userId: string): Promise<{
    template: DayPlanTemplate;
    thresholds: DayPlanThresholds;
  }> {
    const profile = await this.resolveProfile(userId);
    const globalStored = await this.loadGlobalStored();
    const overrideRow = await this.prisma.userDayPlanOverride.findUnique({
      where: { userId },
    });
    const userOverride: DayPlanUserOverrideStored | null = overrideRow
      ? {
          items: (overrideRow.items as Partial<DayPlanTemplateItem>[]) ?? [],
          thresholds: (overrideRow.thresholds as DayPlanThresholds | null) ?? undefined,
        }
      : null;

    return resolveEffectiveTemplate({
      profile,
      globalConfig: globalStored,
      userOverride,
    });
  }

  private buildProfilePayload(
    profile: DayPlanProfile,
    stored: DayPlanGlobalConfigStored | null,
  ): DayPlanSettingsProfilePayload {
    const defaults = defaultTemplateForProfile(profile).items;
    const overrides = stored?.[profile]?.items ?? [];
    const items = mergeTemplateItems(defaults, overrides);
    const effective = filterEnabledItems(items);
    return { profile, items, effective, overrides };
  }

  private async loadGlobalStored(): Promise<DayPlanGlobalConfigStored | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: GLOBAL_SETTING_ID },
      select: { value: true },
    });
    return parseGlobalConfigStored(row?.value);
  }

  private async resolveProfile(userId: string): Promise<DayPlanProfile> {
    const fp = await this.prisma.userFieldProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });
    return fp ? "field" : "office";
  }

  private async assertCanEditUser(actor: AuthUser, targetUserId: string): Promise<void> {
    if (actor.role === UserRole.ADMIN) return;
    if (actor.role === UserRole.LEAD) {
      if (targetUserId === actor.id) return;
      const member = await this.prisma.user.findFirst({
        where: { id: targetUserId, leadId: actor.id },
        select: { id: true },
      });
      if (member) return;
      throw new ForbiddenException("You can only manage day plans for your team");
    }
    throw new ForbiddenException("Access denied");
  }

  private async overrideVisibilityWhere(actor: AuthUser): Promise<Prisma.UserDayPlanOverrideWhereInput> {
    if (actor.role === UserRole.ADMIN) return {};
    if (actor.role === UserRole.LEAD) {
      const team = await this.prisma.user.findMany({
        where: { OR: [{ id: actor.id }, { leadId: actor.id }] },
        select: { id: true },
      });
      return { userId: { in: team.map((t) => t.id) } };
    }
    return { userId: actor.id };
  }
}
