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
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.routePlans.getRouteMetrics(date, req.user, {
      traffic: traffic === "1",
      ownerId,
    });
  }

  @Post("metrics/preview")
  async previewMetrics(
    @Query("date") date: string,
    @Query("traffic") traffic: string | undefined,
    @Query("ownerId") ownerId: string | undefined,
    @Body() body: { visitIds?: string[] },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const visitIds = Array.isArray(body?.visitIds) ? body.visitIds : [];
    return this.routePlans.previewRouteMetrics(date, visitIds, req.user, {
      traffic: traffic === "1",
      ownerId,
    });
  }

  @Post("optimize")
  async optimize(
    @Query("date") date: string,
    @Query("traffic") traffic: string | undefined,
    @Query("ownerId") ownerId: string | undefined,
    @Body() body: { visitIds?: string[] },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const visitIds = Array.isArray(body?.visitIds) ? body.visitIds : [];
    return this.routePlans.optimizeRouteOrder(date, visitIds, req.user, {
      traffic: traffic === "1",
      ownerId,
    });
  }

  @Get("metrics/fact")
  async getFactMetrics(
    @Query("date") date: string,
    @Query("traffic") traffic: string | undefined,
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.routePlans.getFactRouteMetrics(date, req.user, {
      traffic: traffic === "1",
      ownerId,
    });
  }

  @Get("geometry")
  async getGeometry(
    @Query("date") date: string,
    @Query("kind") kind: string,
    @Query("traffic") traffic: string | undefined,
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const k =
      kind === "fact_visits" || kind === "fact_gps" || kind === "planned"
        ? kind
        : "planned";
    return this.routePlans.getRouteGeometry(date, k, req.user, {
      traffic: traffic === "1",
      ownerId,
    });
  }

  @Get("geometry/bundle")
  async getGeometryBundle(
    @Query("date") date: string,
    @Query("traffic") traffic: string | undefined,
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.routePlans.getRouteGeometryBundle(date, req.user, {
      traffic: traffic === "1",
      ownerId,
    });
  }

  @Post("geometry/preview")
  async previewGeometry(
    @Query("date") date: string,
    @Query("traffic") traffic: string | undefined,
    @Query("ownerId") ownerId: string | undefined,
    @Body() body: { visitIds?: string[] },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const visitIds = Array.isArray(body?.visitIds) ? body.visitIds : [];
    return this.routePlans.previewPlannedGeometry(date, visitIds, req.user, {
      traffic: traffic === "1",
      ownerId,
    });
  }

  @Get("navigation")
  async getNavigation(
    @Query("date") date: string,
    @Query("mode") mode: string,
    @Query("visitId") visitId: string | undefined,
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const m = mode === "multi" ? "multi" : "single";
    return this.routePlans.getNavigationUrl(date, m, visitId, req.user, ownerId);
  }

  @Post("confirm")
  async confirmForDay(
    @Query("date") date: string,
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const plan = await this.routePlans.confirmForDay(date, req.user, ownerId);
    return { plan };
  }

  @Get()
  async getForDay(
    @Query("date") date: string,
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const plan = await this.routePlans.getForDay(date, req.user, ownerId);
    return plan ? { plan } : { plan: null };
  }

  @Put()
  async upsertForDay(
    @Query("date") date: string,
    @Query("ownerId") ownerId: string | undefined,
    @Body() body: { visitIds: string[] },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const visitIds = Array.isArray(body?.visitIds) ? body.visitIds : [];
    const plan = await this.routePlans.upsertForDay(date, visitIds, req.user, ownerId);
    return { plan };
  }
}

