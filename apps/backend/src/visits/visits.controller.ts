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
import { VisitsService } from "./visits.service";
import type { LocationSource, VisitStatus } from "@prisma/client";

@Controller("visits")
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Post()
  async create(
    @Body() body: Record<string, unknown>,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.visits.create(
      {
        contactId: (body.contactId as string) ?? null,
        companyId: (body.companyId as string) ?? null,
        title: (body.title as string) ?? null,
        phone: (body.phone as string) ?? null,
        addressText: body.addressText != null ? String(body.addressText) : null,
        lat: typeof body.lat === "number" ? body.lat : body.lat != null ? Number(body.lat) : null,
        lng: typeof body.lng === "number" ? body.lng : body.lng != null ? Number(body.lng) : null,
      },
      req.user,
    );
  }

  @Get("backlog")
  async getBacklog(@Req() req: Request & { user?: AuthUser }) {
    // date query param зарезервирован на будущее, сейчас не используется
    return this.visits.getBacklog(req.user);
  }

  @Get("day")
  async getDay(
    @Query("date") date: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const items = await this.visits.getDay(date, req.user);
    return { items };
  }

  @Post(":id/start")
  async start(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.visits.startVisit(id, req.user);
  }

  @Post(":id/complete")
  async complete(
    @Param("id") id: string,
    @Body() body: { outcome: string; resultNote: string; nextActionAt?: string; nextActionNote?: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const nextActionAt =
      typeof body.nextActionAt === "string" && body.nextActionAt
        ? new Date(body.nextActionAt)
        : undefined;
    return this.visits.completeVisit(
      id,
      {
        outcome: body.outcome,
        resultNote: body.resultNote,
        nextActionAt: nextActionAt ?? undefined,
        nextActionNote: body.nextActionNote ?? undefined,
      },
      req.user,
    );
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const status = body.status as VisitStatus | undefined;
    const locationSource = body.locationSource as LocationSource | undefined;

    const startsAt =
      typeof body.startsAt === "string" && body.startsAt
        ? new Date(body.startsAt)
        : undefined;
    const endsAt =
      typeof body.endsAt === "string" && body.endsAt
        ? new Date(body.endsAt)
        : undefined;

    return this.visits.update(
      id,
      {
        title: (body.title as string) ?? undefined,
        phone: (body.phone as string) ?? undefined,
        addressText: body.addressText !== undefined ? (body.addressText as string | null) : undefined,
        lat: body.lat !== undefined ? (typeof body.lat === "number" ? body.lat : Number(body.lat)) : undefined,
        lng: body.lng !== undefined ? (typeof body.lng === "number" ? body.lng : Number(body.lng)) : undefined,
        locationSource,
        status,
        startsAt,
        endsAt,
        durationMin:
          body.durationMin !== undefined
            ? typeof body.durationMin === "number"
              ? body.durationMin
              : Number(body.durationMin)
            : undefined,
        note: body.note !== undefined ? (body.note as string | null) : undefined,
      },
      req.user,
    );
  }
}

