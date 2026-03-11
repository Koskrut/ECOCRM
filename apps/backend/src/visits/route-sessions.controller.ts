import { Controller, Get, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { RouteSessionsService } from "./route-sessions.service";

@Controller("route-sessions")
export class RouteSessionsController {
  constructor(private readonly routeSessions: RouteSessionsService) {}

  @Get()
  async get(
    @Query("date") date: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const state = await this.routeSessions.get(date, req.user);
    return state ?? { session: null, currentVisit: null, routePlan: null };
  }

  @Post("start")
  async start(
    @Query("date") date: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.routeSessions.start(date, req.user);
  }

  @Post("stop")
  async stop(
    @Query("date") date: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const state = await this.routeSessions.stop(date, req.user);
    return state ?? { session: null, currentVisit: null, routePlan: null };
  }

  @Post("next")
  async next(
    @Query("date") date: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.routeSessions.next(date, req.user);
  }
}
