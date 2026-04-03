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
import {
  DashboardService,
  type DashboardPeriod,
  type DailyTeamActivityPayload,
  type DashboardStats,
} from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * GET /dashboard/daily-team-activity?date=YYYY-MM-DD
   * Calendar day in UTC. Per-user: calls, visits, orders, payments (USD by order owner).
   */
  @Get("daily-team-activity")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  async getDailyTeamActivity(
    @Query("date") dateRaw: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<DailyTeamActivityPayload> {
    if (!req.user) {
      throw new InternalServerErrorException("Missing user");
    }
    try {
      return await this.dashboard.getDailyTeamActivity(dateRaw, req.user);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  /**
   * GET /dashboard/stats?period=week|month
   * Returns: kpi, ordersByStage, leadsByStatus, leadsBySource, revenueByDay
   */
  @Get("stats")
  async getStats(
    @Query("period") periodRaw?: string,
    @Req() req?: Request & { user?: AuthUser },
  ): Promise<DashboardStats> {
    const period: DashboardPeriod =
      periodRaw === "week" || periodRaw === "month" ? periodRaw : "month";
    try {
      return await this.dashboard.getStats(period, req?.user);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }
}
