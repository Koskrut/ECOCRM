import {
  Body,
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { DailyWorkPlanItemStatus, UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { DailyAgendaService } from "./daily-agenda.service";
import type { DailyAgendaPayload, SaveAgendaBody } from "./daily-agenda.types";

@Controller("work/daily-agenda")
@Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
export class DailyAgendaController {
  constructor(private readonly agenda: DailyAgendaService) {}

  @Get()
  async getAgenda(
    @Query("date") dateRaw: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<DailyAgendaPayload> {
    if (!req.user) throw new InternalServerErrorException("Missing user");
    return this.wrap(() => this.agenda.getAgenda(dateRaw, req.user!));
  }

  @Post("draft")
  async saveDraft(
    @Body() body: SaveAgendaBody,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<DailyAgendaPayload> {
    if (!req.user) throw new InternalServerErrorException("Missing user");
    return this.wrap(() => this.agenda.saveDraft(body, req.user!));
  }

  @Post("commit")
  async commitPlan(
    @Body() body: SaveAgendaBody,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<DailyAgendaPayload> {
    if (!req.user) throw new InternalServerErrorException("Missing user");
    return this.wrap(() => this.agenda.commitPlan(body, req.user!));
  }

  @Patch("items/:itemId")
  async patchItem(
    @Param("itemId") itemId: string,
    @Body() body: { status: DailyWorkPlanItemStatus },
    @Req() req: Request & { user?: AuthUser },
  ): Promise<DailyAgendaPayload> {
    if (!req.user) throw new InternalServerErrorException("Missing user");
    return this.wrap(() => this.agenda.patchItem(itemId, body.status, req.user!));
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }
}
