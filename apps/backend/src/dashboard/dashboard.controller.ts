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
import { DashboardV2Service } from "./dashboard-v2.service";
import type { DashboardV2Response } from "./dashboard-v2.types";

@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly dashboardV2: DashboardV2Service,
  ) {}

  /**
   * GET /dashboard/daily-team-activity?date=YYYY-MM-DD
   * Calendar day in Europe/Kyiv. Per-user: calls, visits, orders, payments (USD by order owner).
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
   * GET /dashboard/v2?period=week|month&activityDate=YYYY-MM-DD&compare=true&managerId=
   * Role-aware command center: sales, team pulse, my work, quality, attention.
   */
  @Get("v2")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  async getV2(
    @Query("period") periodRaw?: string,
    @Query("activityDate") activityDate?: string,
    @Query("compare") compareRaw?: string,
    @Query("managerId") managerId?: string,
    @Req() req?: Request & { user?: AuthUser },
  ): Promise<DashboardV2Response> {
    if (!req?.user) {
      throw new InternalServerErrorException("Missing user");
    }
    try {
      return await this.dashboardV2.getV2(req.user, {
        period: periodRaw,
        activityDate,
        compare: compareRaw === "true" || compareRaw === "1",
        managerId,
      });
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
