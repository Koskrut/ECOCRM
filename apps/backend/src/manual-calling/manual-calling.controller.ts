import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  BadRequestException,
} from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { CompleteSessionDto } from "./dto/complete-session.dto";
import { EnqueueQueueItemDto } from "./dto/enqueue-queue-item.dto";
import { StartSessionDto } from "./dto/start-session.dto";
import { ManualCallingService } from "./manual-calling.service";

@Controller("manual-calling")
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD)
export class ManualCallingController {
  constructor(private readonly manualCalling: ManualCallingService) {}

  @Get("queue")
  getQueue(@Req() req: Request & { user?: AuthUser }) {
    const user = this.requireUser(req);
    return this.manualCalling.getQueue(user);
  }

  @Get("playbook")
  getPlaybook() {
    return this.manualCalling.getPlaybook();
  }

  @Post("queue/items")
  enqueue(@Body() body: EnqueueQueueItemDto, @Req() req: Request & { user?: AuthUser }) {
    const user = this.requireUser(req);
    return this.manualCalling.enqueue(body, user);
  }

  @Post("queue/items/:id/claim")
  claim(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const user = this.requireUser(req);
    return this.manualCalling.claimQueueItem(id, user);
  }

  @Post("queue/items/:id/skip")
  skip(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const user = this.requireUser(req);
    return this.manualCalling.skipQueueItem(id, user);
  }

  @Post("sessions")
  startSession(@Body() body: StartSessionDto, @Req() req: Request & { user?: AuthUser }) {
    const user = this.requireUser(req);
    return this.manualCalling.startSession(body, user);
  }

  @Get("sessions/:id")
  getSession(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const user = this.requireUser(req);
    return this.manualCalling.getSession(id, user);
  }

  @Post("sessions/:id/complete")
  complete(
    @Param("id") id: string,
    @Body() body: CompleteSessionDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const user = this.requireUser(req);
    return this.manualCalling.completeSession(id, body, user);
  }

  private requireUser(req: Request & { user?: AuthUser }): AuthUser {
    if (!req.user) throw new BadRequestException("User is required");
    return req.user;
  }
}
