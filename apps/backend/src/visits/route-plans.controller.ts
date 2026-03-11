import { Body, Controller, Get, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { RoutePlansService } from "./route-plans.service";

@Controller("route-plans")
export class RoutePlansController {
  constructor(private readonly routePlans: RoutePlansService) {}

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

