import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Public } from "../../auth/public.decorator";
import type { AuthUser } from "../../auth/auth.types";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";
import { PrismaService } from "../../prisma/prisma.service";
import { KyivstarFmcCallControlDto, KyivstarFmcOriginateDto } from "../../settings/dto/kyivstar-fmc-workspace.dto";
import { fetchKyivstarCallRecord } from "./kyivstar-fmc-api";
import { loadKyivstarFmcApiConfig } from "./kyivstar-fmc-config.util";
import { KYIVSTAR_FMC_PROVIDER, KyivstarFmcIngestService } from "./kyivstar-fmc-ingest.service";
import { KyivstarFmcWorkspaceService } from "./kyivstar-fmc-workspace.service";

/**
 * Kyivstar FMC posts call states to `{remote_url}/callstate` with `Authorization: Bearer <token>`.
 * @see https://fmc.kyivstar.ua/manual/genericfmcapi.yaml
 */
@Controller("integrations/kyivstar-fmc")
@RequireModule(ModuleIds.KyivstarFmc)
export class KyivstarFmcController {
  constructor(
    private readonly ingest: KyivstarFmcIngestService,
    private readonly prisma: PrismaService,
    private readonly workspaceService: KyivstarFmcWorkspaceService,
  ) {}

  @Public()
  @Post("callstate")
  @HttpCode(HttpStatus.OK)
  async callstate(
    @Headers("authorization") authorization: string | undefined,
    @Headers("Authorization") authorizationAlt: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    await this.ingest.handleCallStateWebhook(body, authorization ?? authorizationAlt);
    return { ok: true };
  }

  @Get("workspace")
  async workspace(@Req() req: Request & { user?: AuthUser }) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.workspaceService.getWorkspace(userId);
  }

  @Post("originate")
  async originate(
    @Req() req: Request & { user?: AuthUser },
    @Body() body: KyivstarFmcOriginateDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.workspaceService.originate(userId, body.destination);
  }

  @Post("callcontrol")
  @HttpCode(HttpStatus.OK)
  async callcontrol(
    @Req() req: Request & { user?: AuthUser },
    @Body() body: KyivstarFmcCallControlDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    await this.workspaceService.callControl(userId, body.callControlId, body.action);
    return { ok: true };
  }

  @Get("recordings")
  async recording(
    @Query("record_id") recordId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!recordId?.trim()) {
      res.status(400).json({ message: "record_id is required" });
      return;
    }

    const loaded = await loadKyivstarFmcApiConfig(this.prisma);
    if (!loaded) {
      throw new UnauthorizedException("Kyivstar FMC is not configured");
    }

    const result = await fetchKyivstarCallRecord(loaded.cfg, recordId.trim());
    if (!result.ok) {
      res.status(result.status).json({ message: result.bodySnippet.slice(0, 200) });
      return;
    }

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(result.body);
  }
}
