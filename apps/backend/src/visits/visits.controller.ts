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
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { VisitsService } from "./visits.service";
import type { LocationSource, VisitStatus } from "@prisma/client";
import type { VisitGpsPayloadInput } from "./visit-gps.verification";

function coerceNumber(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function extractVisitGpsFromBody(body: Record<string, unknown>): VisitGpsPayloadInput | undefined {
  const has =
    body.lat != null ||
    body.lng != null ||
    body.accuracyM != null ||
    (typeof body.clientRecordedAt === "string" && body.clientRecordedAt.length > 0) ||
    (typeof body.permissionState === "string" && body.permissionState.length > 0) ||
    (typeof body.locationProvider === "string" && body.locationProvider.length > 0);
  if (!has) return undefined;
  return {
    lat: coerceNumber(body.lat),
    lng: coerceNumber(body.lng),
    accuracyM: coerceNumber(body.accuracyM),
    clientRecordedAt: typeof body.clientRecordedAt === "string" ? body.clientRecordedAt : undefined,
    permissionState: typeof body.permissionState === "string" ? body.permissionState : undefined,
    locationProvider: typeof body.locationProvider === "string" ? body.locationProvider : undefined,
  };
}

@Controller("visits")
@RequireModule(ModuleIds.Visits)
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
        purpose: body.purpose != null ? String(body.purpose) : null,
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

  @Get("history")
  async getHistory(
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("ownerId") ownerId: string | undefined,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.visits.listHistory(
      {
        from,
        to,
        ownerId,
        page: page != null ? Number(page) : undefined,
        pageSize: pageSize != null ? Number(pageSize) : undefined,
      },
      req.user,
    );
  }

  @Get(":id")
  async getOne(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.visits.getById(id, req.user);
  }

  @Post(":id/start")
  async start(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    return this.visits.startVisit(id, req.user, extractVisitGpsFromBody(body ?? {}));
  }

  @Post(":id/complete")
  async complete(
    @Param("id") id: string,
    @Body()
    body: {
      outcome: string;
      resultNote: string;
      nextActionAt?: string;
      nextActionNote?: string;
      lat?: number;
      lng?: number;
      accuracyM?: number;
      clientRecordedAt?: string;
      permissionState?: string;
      locationProvider?: string;
    },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const bodyRecord = body as unknown as Record<string, unknown>;
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
      extractVisitGpsFromBody(bodyRecord),
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
        purpose: body.purpose !== undefined ? (body.purpose as string | null) : undefined,
      },
      req.user,
    );
  }
}

