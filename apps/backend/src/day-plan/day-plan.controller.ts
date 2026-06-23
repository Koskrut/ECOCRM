import {
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Query,
  Req,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { DayPlanService } from "./day-plan.service";
import type { DayPlanPayload } from "./day-plan.types";

@Controller("work/day-plan")
@Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
export class DayPlanController {
  constructor(private readonly dayPlan: DayPlanService) {}

  /**
   * GET /work/day-plan?date=YYYY-MM-DD&userId=
   * Calendar day in Europe/Kyiv. Defaults to actor's plan.
   */
  @Get()
  async getDayPlan(
    @Query("date") dateRaw: string | undefined,
    @Query("userId") userId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<DayPlanPayload> {
    if (!req.user) {
      throw new InternalServerErrorException("Missing user");
    }
    try {
      return await this.dayPlan.getDayPlan(dateRaw, req.user, userId);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }
}
