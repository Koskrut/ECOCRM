import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { NotificationType } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("unreadOnly") unreadOnly?: string,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const user = req?.user;
    if (!user) {
      throw new BadRequestException("User is required");
    }
    return this.notifications.list(user.id, {
      page: page != null ? Number(page) : undefined,
      pageSize: pageSize != null ? Number(pageSize) : undefined,
      unreadOnly: unreadOnly === "true" || unreadOnly === "1",
    });
  }

  @Get("unread-count")
  unreadCount(@Req() req: Request & { user?: AuthUser }) {
    if (!req.user) {
      throw new BadRequestException("User is required");
    }
    return this.notifications.unreadCount(req.user.id).then((count) => ({ count }));
  }

  @Get("preferences")
  getPreferences(@Req() req: Request & { user?: AuthUser }) {
    if (!req.user) {
      throw new BadRequestException("User is required");
    }
    return this.notifications.getPreferences(req.user.id);
  }

  @Patch("preferences")
  updatePreferences(
    @Body() body: Record<string, unknown>,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) {
      throw new BadRequestException("User is required");
    }
    const typesRaw = body.types;
    const types = Array.isArray(typesRaw)
      ? typesRaw.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            type: String(r.type) as NotificationType,
            inApp: r.inApp !== undefined ? Boolean(r.inApp) : undefined,
            browser: r.browser !== undefined ? Boolean(r.browser) : undefined,
            telegram: r.telegram !== undefined ? Boolean(r.telegram) : undefined,
          };
        })
      : undefined;

    return this.notifications.updatePreferences(req.user.id, {
      teamNotificationsEnabled:
        body.teamNotificationsEnabled !== undefined
          ? Boolean(body.teamNotificationsEnabled)
          : undefined,
      types,
    });
  }

  @Patch(":id/read")
  markRead(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    if (!req.user) {
      throw new BadRequestException("User is required");
    }
    return this.notifications.markRead(req.user.id, id);
  }

  @Post("read-all")
  markAllRead(@Req() req: Request & { user?: AuthUser }) {
    if (!req.user) {
      throw new BadRequestException("User is required");
    }
    return this.notifications.markAllRead(req.user.id);
  }
}
