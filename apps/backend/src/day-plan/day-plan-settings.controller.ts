import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  InternalServerErrorException,
  Param,
  Patch,
  Req,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { DayPlanSettingsService } from "./day-plan.settings.service";
import type {
  DayPlanGlobalSettingsPayload,
  DayPlanTemplateItem,
  DayPlanThresholds,
  DayPlanUserSettingsPayload,
} from "./day-plan.types";

type UpdateGlobalBody = {
  thresholds?: DayPlanThresholds;
  office?: { items?: Partial<DayPlanTemplateItem>[] };
  field?: { items?: Partial<DayPlanTemplateItem>[] };
  resetOffice?: boolean;
  resetField?: boolean;
};

type UpdateUserBody = {
  items?: Partial<DayPlanTemplateItem>[];
  thresholds?: DayPlanThresholds | null;
};

@Controller("settings/day-plan")
export class DayPlanSettingsController {
  constructor(private readonly settings: DayPlanSettingsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getGlobal(
    @Req() req: Request & { user?: AuthUser },
  ): Promise<DayPlanGlobalSettingsPayload> {
    return this.wrap(() => this.settings.getGlobalConfig());
  }

  @Patch()
  @Roles(UserRole.ADMIN)
  async setGlobal(
    @Body() body: UpdateGlobalBody,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<DayPlanGlobalSettingsPayload> {
    void req;
    return this.wrap(() => this.settings.setGlobalConfig(body));
  }

  @Get("users-with-overrides")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async listUsersWithOverrides(@Req() req: Request & { user?: AuthUser }) {
    const actor = req.user;
    if (!actor) throw new InternalServerErrorException("Missing user");
    return this.wrap(() => this.settings.listUserIdsWithOverrides(actor));
  }

  @Get("users/:userId")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getUser(
    @Param("userId") userId: string,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<DayPlanUserSettingsPayload> {
    const actor = req.user;
    if (!actor) throw new InternalServerErrorException("Missing user");
    return this.wrap(() => this.settings.getUserOverride(userId, actor));
  }

  @Patch("users/:userId")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async setUser(
    @Param("userId") userId: string,
    @Body() body: UpdateUserBody,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<DayPlanUserSettingsPayload> {
    const actor = req.user;
    if (!actor) throw new InternalServerErrorException("Missing user");
    return this.wrap(() => this.settings.setUserOverride(userId, body, actor));
  }

  @Delete("users/:userId")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async deleteUser(
    @Param("userId") userId: string,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<DayPlanUserSettingsPayload> {
    const actor = req.user;
    if (!actor) throw new InternalServerErrorException("Missing user");
    return this.wrap(() => this.settings.deleteUserOverride(userId, actor));
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }
}
