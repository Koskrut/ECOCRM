import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Request, Response } from "express";
import type { AuthUser } from "../auth/auth.types";
import { Public } from "../auth/public.decorator";
import { Roles } from "../auth/roles.decorator";
import { LeadsService } from "./leads.service";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { UpdateLeadStatusDto } from "./dto/update-lead-status.dto";
import { ConvertLeadDto } from "./dto/convert-lead.dto";
import { ListLeadsQueryDto } from "./dto/list-leads-query.dto";
import { MetaIngestDto } from "./dto/meta-ingest.dto";
import { AddNoteDto } from "./dto/add-note.dto";

@Controller("leads")
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  /** Meta Lead Ads webhook: GET verification (hub.* query params). */
  @Public()
  @Get("meta/ingest")
  async metaWebhookVerify(
    @Query("hub.mode") hubMode: string | undefined,
    @Query("hub.verify_token") hubVerifyToken: string | undefined,
    @Query("hub.challenge") hubChallenge: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    const challenge = await this.leads.metaWebhookVerifySubscribe(
      hubMode,
      hubVerifyToken,
      hubChallenge,
    );
    res.status(200).type("text/plain").send(challenge);
  }

  /** Meta Lead Ads webhook: POST notifications (signed with META_APP_SECRET when set). */
  @Public()
  @Post("meta/ingest")
  @HttpCode(200)
  metaIngest(
    @Body() body: MetaIngestDto,
    @Headers("x-hub-signature-256") signature256: string | undefined,
    @Req() req: Request & { user?: AuthUser; rawBody?: Buffer },
  ) {
    return this.leads.metaIngest(body as unknown as Record<string, unknown>, {
      rawBody: req.rawBody,
      signatureHeader: signature256,
    });
  }

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

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  remove(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.leads.remove(id, req.user);
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

  @Post(":id/note")
  addNote(
    @Param("id") id: string,
    @Body() dto: AddNoteDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.leads.addNote(id, dto, req.user);
  }
}

