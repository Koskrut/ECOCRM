import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import {
  DashboardService,
  type DashboardPeriod,
  type DashboardStats,
} from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * GET /dashboard/stats?period=week|month
   * Returns: kpi, ordersByStatus, leadsByStatus, leadsBySource, revenueByDay
   */
  @Get("stats")
  getStats(
    @Query("period") periodRaw?: string,
    @Req() req?: Request & { user?: AuthUser },
  ): Promise<DashboardStats> {
    const period: DashboardPeriod =
      periodRaw === "week" || periodRaw === "month" ? periodRaw : "month";
    return this.dashboard.getStats(period, req?.user);
  }
}
