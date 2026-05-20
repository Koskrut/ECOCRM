import {
  BadRequestException,
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
import { FuelCompensationStatus } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { FieldFuelService } from "./field-fuel.service";
import { FieldShiftsService } from "./field-shifts.service";

@Controller("field")
@RequireModule(ModuleIds.Visits)
export class FieldController {
  constructor(
    private readonly shifts: FieldShiftsService,
    private readonly fuel: FieldFuelService,
  ) {}

  @Get("shifts/active")
  async activeShift(@Req() req: Request & { user?: AuthUser }) {
    const shift = await this.shifts.getActive(req.user);
    return { shift };
  }

  @Post("shifts/start")
  async startShift(
    @Body() body: { plannedDistanceKm?: number | null; trackingEnabled?: boolean },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const plannedDistanceKm =
      body?.plannedDistanceKm != null ? Number(body.plannedDistanceKm) : undefined;
    const shift = await this.shifts.start(req.user, {
      plannedDistanceKm:
        plannedDistanceKm != null && Number.isFinite(plannedDistanceKm) ? plannedDistanceKm : null,
      trackingEnabled: typeof body?.trackingEnabled === "boolean" ? body.trackingEnabled : undefined,
    });
    return { shift };
  }

  @Post("shifts/:id/end")
  async endShift(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const shift = await this.shifts.end(req.user, id);
    return { shift };
  }

  @Post("shifts/:id/samples")
  async samples(
    @Param("id") id: string,
    @Body()
    body: {
      items: { lat: number; lng: number; accuracyM?: number | null; clientRecordedAt: string }[];
    },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const items = Array.isArray(body?.items) ? body.items : [];
    return this.shifts.appendSamples(req.user, id, items);
  }

  @Get("fuel/day")
  async fuelDay(
    @Query("date") date: string,
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!date) {
      throw new BadRequestException("date is required");
    }
    return this.fuel.getOrCreateDay(req.user, date, ownerId);
  }

  @Post("fuel/day/recalculate")
  async fuelRecalculate(
    @Query("date") date: string,
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!date) {
      throw new BadRequestException("date is required");
    }
    if (!req.user) throw new BadRequestException("User is required");
    const targetId = ownerId
      ? await this.fuel.resolveOwnerId(req.user, ownerId)
      : req.user.id;
    if (targetId === req.user.id) {
      return this.fuel.recalculate(req.user, date);
    }
    return this.fuel.recalculateForOwner(targetId, date);
  }

  @Patch("fuel/day")
  async fuelPatchDay(
    @Query("date") date: string,
    @Body()
    body: { compensationStatus?: FuelCompensationStatus; managerNote?: string | null },
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!date) {
      throw new BadRequestException("date is required");
    }
    return this.fuel.patchDay(req.user, date, body);
  }

  @Get("fuel/range")
  async fuelRange(
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!from || !to) {
      throw new BadRequestException("from and to are required");
    }
    return this.fuel.getRange(req.user, from, to, ownerId);
  }

  @Get("fuel/export")
  async fuelExport(
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("format") format: string | undefined,
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!from || !to) {
      throw new BadRequestException("from and to are required");
    }
    const fmt = format === "xlsx" ? "xlsx" : "csv";
    return this.fuel.exportReport(req.user, from, to, fmt, ownerId);
  }

  @Get("profile")
  async getProfile(@Req() req: Request & { user?: AuthUser }) {
    const profile = await this.fuel.getProfile(req.user);
    return { profile };
  }

  @Patch("profile")
  async patchProfile(
    @Body()
    body: {
      fuelLitersPer100km?: number;
      fuelPricePerLiter?: number | null;
      vehicleLabel?: string | null;
      usePersonalCar?: boolean;
    },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const profile = await this.fuel.updateProfile(req.user, body);
    return { profile };
  }
}
