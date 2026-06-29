import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { EndPresenceDto, HeartbeatDto } from "./dto/heartbeat.dto";
import { extractClientIp } from "./ip-geo.util";
import { PresenceService } from "./presence.service";

@Controller("presence")
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Post("heartbeat")
  async heartbeat(
    @Body() body: HeartbeatDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const user = req.user!;
    const ip = extractClientIp(req);
    const userAgent = req.headers?.["user-agent"] as string | undefined;
    return this.presence.heartbeat(
      user,
      body.platform,
      { lat: body.lat, lng: body.lng },
      { ip, userAgent },
      { appState: body.appState, trackingMode: body.trackingMode },
    );
  }

  @Post("end")
  async end(@Body() body: EndPresenceDto, @Req() req: Request & { user?: AuthUser }) {
    const user = req.user!;
    return this.presence.end(user, body.platform);
  }

  @Get("overview")
  @Roles(UserRole.ADMIN)
  async overview(@Query("date") date?: string) {
    return this.presence.getOverview(date);
  }

  @Get("users/:id/sessions")
  @Roles(UserRole.ADMIN)
  async userSessions(
    @Param("id") id: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const result = await this.presence.getUserSessions(id, from, to);
    if (!result) {
      throw new NotFoundException("User not found");
    }
    return result;
  }
}
