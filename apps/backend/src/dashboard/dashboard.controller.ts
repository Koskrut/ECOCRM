import {
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Param,
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
import { EmployeeDailyActivityService } from "./employee-daily-activity.service";
import { ManagerDashboardService } from "./manager-dashboard.service";
import type {
  EmployeeDailyActivityPayload,
  EmployeeTimelinePayload,
} from "./employee-daily-activity.types";
import type {
  ManagerInboxResponse,
  ManagerScorecardResponse,
} from "./manager-dashboard.types";

@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly dashboardV2: DashboardV2Service,
    private readonly managerDashboard: ManagerDashboardService,
    private readonly employeeDailyActivity: EmployeeDailyActivityService,
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
   * GET /dashboard/manager-inbox?period=week|month
   * Action-first inbox for the manager desk: attention tiles, grouped tasks,
   * lead pipeline counts and hot leads. Self-scoped for MANAGER.
   */
  @Get("manager-inbox")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  async getManagerInbox(
    @Query("period") periodRaw?: string,
    @Req() req?: Request & { user?: AuthUser },
  ): Promise<ManagerInboxResponse> {
    if (!req?.user) {
      throw new InternalServerErrorException("Missing user");
    }
    try {
      return await this.managerDashboard.getInbox(req.user, { period: periodRaw });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  /**
   * GET /dashboard/manager-scorecard?period=week|month&compare=true
   * Activity + outcome metrics for the manager, with optional prior-period compare.
   */
  @Get("manager-scorecard")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  async getManagerScorecard(
    @Query("period") periodRaw?: string,
    @Query("compare") compareRaw?: string,
    @Req() req?: Request & { user?: AuthUser },
  ): Promise<ManagerScorecardResponse> {
    if (!req?.user) {
      throw new InternalServerErrorException("Missing user");
    }
    try {
      return await this.managerDashboard.getScorecard(req.user, {
        period: periodRaw,
        compare: compareRaw === "true" || compareRaw === "1",
      });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("employee-daily-activity")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  async getEmployeeDailyActivity(
    @Query("date") dateRaw: string | undefined,
    @Query("leadId") leadId: string | undefined,
    @Query("sort") sortRaw: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<EmployeeDailyActivityPayload> {
    if (!req.user) {
      throw new InternalServerErrorException("Missing user");
    }
    try {
      return await this.employeeDailyActivity.getSummary(req.user, {
        dateRaw,
        leadId,
        sortRaw,
      });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("employee-daily-activity/:userId/timeline")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  async getEmployeeDailyActivityTimeline(
    @Param("userId") userId: string,
    @Query("date") dateRaw: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<EmployeeTimelinePayload> {
    if (!req.user) {
      throw new InternalServerErrorException("Missing user");
    }
    try {
      return await this.employeeDailyActivity.getTimeline(req.user, userId, dateRaw);
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
