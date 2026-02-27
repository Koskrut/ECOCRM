import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { LeadsService } from "./leads.service";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { UpdateLeadStatusDto } from "./dto/update-lead-status.dto";
import { ConvertLeadDto } from "./dto/convert-lead.dto";
import { ListLeadsQueryDto } from "./dto/list-leads-query.dto";

@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  create(@Body() dto: CreateLeadDto, @Req() req: Request & { user?: AuthUser }) {
    return this.leads.create(dto, req.user);
  }

  @Get()
  list(@Query() q: ListLeadsQueryDto, @Req() req: Request & { user?: AuthUser }) {
    return this.leads.list(q, req.user);
  }

  @Get(":id")
  get(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.leads.getById(id, req.user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateLeadDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.leads.update(id, dto, req.user);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateLeadStatusDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.leads.updateStatus(id, dto, req.user);
  }

  @Post(":id/convert")
  convert(
    @Param("id") id: string,
    @Body() dto: ConvertLeadDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.leads.convert(id, dto, req.user);
  }

  @Get(":id/suggest-contact")
  suggestContact(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.leads.suggestContact(id, req.user);
  }
}

