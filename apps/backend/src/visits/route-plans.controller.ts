import { Body, Controller, Get, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { RoutePlansService } from "./route-plans.service";

@Controller("route-plans")
@RequireModule(ModuleIds.Visits)
export class RoutePlansController {
  constructor(private readonly routePlans: RoutePlansService) {}

  @Get("metrics")
  async getMetrics(
    @Query("date") date: string,
    @Query("traffic") traffic: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.routePlans.getRouteMetrics(date, req.user, { traffic: traffic === "1" });
  }

  @Post("metrics/preview")
  async previewMetrics(
    @Query("date") date: string,
    @Query("traffic") traffic: string | undefined,
    @Body() body: { visitIds?: string[] },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const visitIds = Array.isArray(body?.visitIds) ? body.visitIds : [];
    return this.routePlans.previewRouteMetrics(date, visitIds, req.user, { traffic: traffic === "1" });
  }

  @Post("optimize")
  async optimize(
    @Query("date") date: string,
    @Query("traffic") traffic: string | undefined,
    @Body() body: { visitIds?: string[] },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const visitIds = Array.isArray(body?.visitIds) ? body.visitIds : [];
    return this.routePlans.optimizeRouteOrder(date, visitIds, req.user, { traffic: traffic === "1" });
  }

  @Get("metrics/fact")
  async getFactMetrics(
    @Query("date") date: string,
    @Query("traffic") traffic: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.routePlans.getFactRouteMetrics(date, req.user, { traffic: traffic === "1" });
  }

  @Get("navigation")
  async getNavigation(
    @Query("date") date: string,
    @Query("mode") mode: string,
    @Query("visitId") visitId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const m = mode === "multi" ? "multi" : "single";
    return this.routePlans.getNavigationUrl(date, m, visitId, req.user);
  }

  @Get()
  async getForDay(
    @Query("date") date: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const plan = await this.routePlans.getForDay(date, req.user);
    return plan ? { plan } : { plan: null };
  }

  @Put()
  async upsertForDay(
    @Query("date") date: string,
    @Body() body: { visitIds: string[] },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const visitIds = Array.isArray(body?.visitIds) ? body.visitIds : [];
    const plan = await this.routePlans.upsertForDay(date, visitIds, req.user);
    return { plan };
  }
}

