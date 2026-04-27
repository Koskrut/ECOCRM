import { BadRequestException, Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { CallsHistoryService } from "./calls-history.service";
import { ListCallsHistoryQueryDto } from "./dto/list-calls-history-query.dto";

@Controller("calls")
@RequireModule(ModuleIds.VoiceOutbound)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD)
export class CallsController {
  constructor(private readonly callsHistory: CallsHistoryService) {}

  @Get("history")
  listHistory(@Query() query: ListCallsHistoryQueryDto, @Req() req: Request & { user?: AuthUser }) {
    if (!req.user) throw new BadRequestException("User is required");
    return this.callsHistory.listHistory(query, req.user);
  }
}
