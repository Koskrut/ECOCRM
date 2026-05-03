import { BadRequestException, Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles.decorator";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";
import type { RingostatConfig } from "../../settings/settings.service";
import { SettingsService } from "../../settings/settings.service";
import { RingostatBackfillDto } from "../../settings/dto/ringostat-backfill.dto";
import { RingostatReconcileDto } from "../../settings/dto/ringostat-reconcile.dto";
import { RingostatRekeyUniqueidDto } from "../../settings/dto/ringostat-rekey-uniqueid.dto";
import { RingostatRunAllDto } from "../../settings/dto/ringostat-run-all.dto";
import { RingostatWeeklyRunDto } from "../../settings/dto/ringostat-weekly-run.dto";
import { RingostatLeadsRetrofitDto } from "../../settings/dto/ringostat-leads-retrofit.dto";
import { RingostatBackfillService } from "./ringostat-backfill.service";
import { RingostatReconcileService } from "./ringostat-reconcile.service";
import { RingostatRekeyUniqueidService } from "./ringostat-rekey-uniqueid.service";
import { RingostatRecordingsRefreshService } from "./ringostat-recordings-refresh.service";
import { RingostatLeadsRetrofitService } from "./ringostat-leads-retrofit.service";

/** Admin routes under `/settings/ringostat*` (also served by `crm-module-ringostat` when split). */
@Controller("settings")
@RequireModule(ModuleIds.Ringostat)
export class RingostatSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly ringostatBackfill: RingostatBackfillService,
    private readonly ringostatReconcile: RingostatReconcileService,
    private readonly ringostatRekeyUniqueid: RingostatRekeyUniqueidService,
    private readonly ringostatRecordingsRefresh: RingostatRecordingsRefreshService,
    private readonly ringostatLeadsRetrofit: RingostatLeadsRetrofitService,
  ) {}

  @Get("ringostat")
  @Roles(UserRole.ADMIN)
  getRingostatConfig() {
    return this.settings.getRingostatConfig();
  }

  @Patch("ringostat")
  @Roles(UserRole.ADMIN)
  setRingostatConfig(@Body() body: Partial<RingostatConfig>) {
    return this.settings.setRingostatConfig(body);
  }

  @Post("ringostat/backfill")
  @Roles(UserRole.ADMIN)
  runRingostatBackfill(@Body() body: RingostatBackfillDto) {
    return this.ringostatBackfill.backfill(body.from, body.to);
  }

  @Post("ringostat/reconcile")
  @Roles(UserRole.ADMIN)
  runRingostatReconcile(@Body() body: RingostatReconcileDto) {
    return this.ringostatReconcile.reconcile(body);
  }

  @Post("ringostat/rekey-uniqueid")
  @Roles(UserRole.ADMIN)
  runRingostatRekeyUniqueid(@Body() body: RingostatRekeyUniqueidDto) {
    return this.ringostatRekeyUniqueid.rekey(body);
  }

  @Post("ringostat/weekly-run")
  @Roles(UserRole.ADMIN)
  async runRingostatWeeklyRun(@Body() body: RingostatWeeklyRunDto) {
    const dryRun = body.dryRun !== false;
    const limit = body.limit;
    const rekey = await this.ringostatRekeyUniqueid.rekey({
      from: body.from,
      to: body.to,
      dryRun,
      limit,
    });
    const reconcile = await this.ringostatReconcile.reconcile({
      from: body.from,
      to: body.to,
      dryRun,
      limit,
    });
    const recordings = await this.ringostatRecordingsRefresh.refresh({
      from: body.from,
      to: body.to,
      dryRun,
      limit,
    });
    return { rekey, reconcile, recordings };
  }

  @Post("ringostat/run-all")
  @Roles(UserRole.ADMIN)
  async runRingostatRunAll(@Body() body: RingostatRunAllDto) {
    const dryRun = body.dryRun !== false;
    const limit = body.limit;
    const chunkDays = Math.max(1, Math.min(body.chunkDays ?? 7, 31));

    const from = new Date(body.from);
    const to = new Date(body.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException("Invalid from/to date");
    }
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException("from must be before to");
    }

    const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60_000);
    const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);
    const fmt = (d: Date) => d.toISOString();

    const overlapMinutes = 20;

    const chunks: Array<{
      from: string;
      to: string;
      rekey: Awaited<ReturnType<RingostatRekeyUniqueidService["rekey"]>>;
      reconcile: Awaited<ReturnType<RingostatReconcileService["reconcile"]>>;
      recordings: Awaited<ReturnType<RingostatRecordingsRefreshService["refresh"]>>;
    }> = [];

    let cur = from;
    while (cur.getTime() < to.getTime()) {
      const chunkTo = addDays(cur, chunkDays);
      const rawTo = chunkTo.getTime() > to.getTime() ? to : chunkTo;
      const windowFrom = cur;
      const windowTo = rawTo;

      const runFrom = fmt(windowFrom);
      const runTo = fmt(windowTo);

      const rekey = await this.ringostatRekeyUniqueid.rekey({ from: runFrom, to: runTo, dryRun, limit });
      const reconcile = await this.ringostatReconcile.reconcile({ from: runFrom, to: runTo, dryRun, limit });
      const recordings = await this.ringostatRecordingsRefresh.refresh({
        from: runFrom,
        to: runTo,
        dryRun,
        limit,
      });

      chunks.push({ from: runFrom, to: runTo, rekey, reconcile, recordings });

      cur = addMinutes(windowTo, -overlapMinutes);
      if (cur.getTime() <= windowFrom.getTime()) {
        cur = windowTo;
      }
    }

    const sum = <T extends keyof (typeof chunks)[number]>(k: T, field: string) =>
      chunks.reduce((acc, c) => acc + Number((c[k] as Record<string, unknown>)[field] ?? 0), 0);

    return {
      dryRun,
      chunkDays,
      from: body.from,
      to: body.to,
      chunks: chunks.length,
      totals: {
        rekey: {
          scanned: sum("rekey", "scanned"),
          matched: sum("rekey", "matched"),
          merged: sum("rekey", "merged"),
          skipped: sum("rekey", "skipped"),
        },
        reconcile: {
          scanned: sum("reconcile", "scanned"),
          fixable: sum("reconcile", "fixable"),
          updated: sum("reconcile", "updated"),
          skipped: sum("reconcile", "skipped"),
        },
        recordings: {
          fetched: sum("recordings", "fetched"),
          candidates: sum("recordings", "candidates"),
          updated: sum("recordings", "updated"),
          skipped: sum("recordings", "skipped"),
        },
      },
      lastChunks: chunks.slice(-20),
    };
  }

  @Post("ringostat/leads/retrofit")
  @Roles(UserRole.ADMIN)
  runRingostatLeadsRetrofit(@Body() body: RingostatLeadsRetrofitDto) {
    return this.ringostatLeadsRetrofit.retrofit(body);
  }
}
