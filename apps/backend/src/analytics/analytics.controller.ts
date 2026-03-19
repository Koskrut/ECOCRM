import {
  Controller,
  Get,
  ForbiddenException,
  InternalServerErrorException,
  Query,
  Req,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import {
  AnalyticsService,
  type AnalyticsMapPeriod,
  type AnalyticsMapRegionRow,
} from "./analytics.service";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * GET /analytics/map?period=week|month
   * Returns per-region: clientsCount, salesTotal, managerId, managerName.
   * Admin only.
   */
  @Get("map")
  async getMap(
    @Query("period") periodRaw?: string,
    @Req() req?: Request & { user?: AuthUser },
  ): Promise<AnalyticsMapRegionRow[]> {
    const actor = req?.user;
    if (actor?.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Analytics map is available only for ADMIN");
    }
    const period: AnalyticsMapPeriod =
      periodRaw === "week" || periodRaw === "month" ? periodRaw : "month";
    try {
      return await this.analytics.getMapStats(period, actor);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }
}
