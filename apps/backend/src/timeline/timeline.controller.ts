/* eslint-disable @typescript-eslint/consistent-type-imports -- DTO classes must be concrete for ValidationPipe metadata */
import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { CanonicalTimelineService } from "./canonical-timeline.service";
import { TimelineParamsDto } from "./dto/timeline-params.dto";
import { TimelineQueryDto } from "./dto/timeline-query.dto";

@Controller("timeline")
export class TimelineController {
  constructor(private readonly timeline: CanonicalTimelineService) {}

  @Get(":entityType/:entityId")
  async list(
    @Param() params: TimelineParamsDto,
    @Query() query: TimelineQueryDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.timeline.list(
      {
        entityType: params.entityType,
        entityId: params.entityId,
        limit: query.resolveLimit(),
        cursor: query.cursor,
        sources: query.source,
        kinds: query.kind,
      },
      req.user,
    );
  }
}
