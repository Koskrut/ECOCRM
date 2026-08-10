import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { FuelCompensationStatus } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { FieldFuelRefuelsService } from "./field-fuel-refuels.service";
import { FieldFuelService } from "./field-fuel.service";
import { FieldShiftsService } from "./field-shifts.service";

@Controller("field")
@RequireModule(ModuleIds.Visits)
export class FieldController {
  constructor(
    private readonly shifts: FieldShiftsService,
    private readonly fuel: FieldFuelService,
    private readonly refuels: FieldFuelRefuelsService,
  ) {}

  @Get("shifts/active")
  async activeShift(
    @Query("scope") scope: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (scope === "team") {
      return this.shifts.getActiveTeam(req.user);
    }
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

  @Get("shifts/:id/samples")
  async listSamples(
    @Param("id") id: string,
    @Query("since") since: string | undefined,
    @Query("limit") limit: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const parsedLimit = limit != null ? Number(limit) : undefined;
    return this.shifts.getSamples(req.user, id, {
      since,
      limit: parsedLimit,
    });
  }

  @Get("shifts/:id/track-geometry")
  async trackGeometry(
    @Param("id") id: string,
    @Query("traffic") traffic: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.shifts.getTrackGeometry(req.user, id, { traffic: traffic === "1" });
  }

  @Post("shifts/:id/samples")
  async samples(
    @Param("id") id: string,
    @Body()
    body: {
      items: {
        lat: number;
        lng: number;
        accuracyM?: number | null;
        clientRecordedAt: string;
        sampleId?: string | null;
        deviceId?: string | null;
        source?: string;
      }[];
      telemetry?: {
        nativeLastSeenAt?: string;
        lastGpsCapturedAt?: string;
        trackingHealthState?: string;
        deviceId?: string;
      };
    },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const items = Array.isArray(body?.items) ? body.items : [];
    return this.shifts.appendSamples(req.user, id, items, body?.telemetry);
  }

  @Post("shifts/:id/tracking-events")
  async trackingEvents(
    @Param("id") id: string,
    @Body()
    body: { type: string; reason?: string; clientRecordedAt: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.shifts.recordTrackingEvent(req.user, id, body);
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
    @Query("ownerId") ownerId: string | undefined,
    @Body()
    body: { compensationStatus?: FuelCompensationStatus; managerNote?: string | null },
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!date) {
      throw new BadRequestException("date is required");
    }
    return this.fuel.patchDay(req.user, date, body, ownerId);
  }

  @Get("fuel/pending")
  async fuelPending(
    @Query("from") from: string,
    @Query("to") to: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!from || !to) {
      throw new BadRequestException("from and to are required");
    }
    return this.fuel.getPending(req.user, from, to);
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

  @Get("fuel/refuels")
  async fuelRefuelsList(
    @Query("date") date: string,
    @Query("ownerId") ownerId: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!date) {
      throw new BadRequestException("date is required");
    }
    return this.refuels.listForDay(req.user, date, ownerId);
  }

  @Post("fuel/refuels")
  @UseInterceptors(FileInterceptor("file"))
  async fuelRefuelsCreate(
    @Query("date") date: string,
    @Query("ownerId") ownerId: string | undefined,
    @Body() body: { liters?: string; amount?: string },
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number },
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!date) {
      throw new BadRequestException("date is required");
    }
    const entry = await this.refuels.create(req.user, date, body, file, ownerId);
    return { item: entry };
  }

  @Delete("fuel/refuels/:id")
  async fuelRefuelsDelete(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.refuels.delete(req.user, id);
  }

  @Get("fuel/refuels/:id/receipt")
  async fuelRefuelReceipt(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
    @Res() res: Response,
  ): Promise<void> {
    await this.refuels.streamReceipt(req.user, id, res);
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
