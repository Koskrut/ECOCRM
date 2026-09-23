import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import {
  CreateCannedResponseDto,
  UpdateCannedResponseDto,
} from "../integrations/shared/inbox-actions.dto";
import { CannedResponsesService } from "./canned-responses.service";

void CreateCannedResponseDto;
void UpdateCannedResponseDto;

@Controller("canned-responses")
@Roles(UserRole.MANAGER, UserRole.LEAD, UserRole.ADMIN)
export class CannedResponsesController {
  constructor(
    @Inject(CannedResponsesService) private readonly canned: CannedResponsesService,
  ) {}

  @Get()
  list() {
    return this.canned.list();
  }

  @Post()
  @Roles(UserRole.LEAD, UserRole.ADMIN)
  create(@Body() dto: CreateCannedResponseDto, @Req() req: Request & { user?: AuthUser }) {
    return this.canned.create(dto, req.user);
  }

  @Patch(":id")
  @Roles(UserRole.LEAD, UserRole.ADMIN)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateCannedResponseDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.canned.update(id, dto, req.user);
  }

  @Delete(":id")
  @Roles(UserRole.LEAD, UserRole.ADMIN)
  remove(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.canned.remove(id, req.user);
  }
}
