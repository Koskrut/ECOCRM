import { BadRequestException, Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Public } from "../auth/public.decorator";
import { Roles } from "../auth/roles.decorator";
import { RingostatBackfillService } from "../integrations/ringostat/ringostat-backfill.service";
import { RingostatReconcileService } from "../integrations/ringostat/ringostat-reconcile.service";
import { RingostatRekeyUniqueidService } from "../integrations/ringostat/ringostat-rekey-uniqueid.service";
import { RingostatRecordingsRefreshService } from "../integrations/ringostat/ringostat-recordings-refresh.service";
import type {
  ExchangeRates,
  GoogleMapsConfig,
  GoogleSheetConfig,
  MetaLeadAdsConfig,
  StoreConfig,
  TelegramConfig,
} from "./settings.service";
import type { OutboundVoiceIntegrationConfig, RingostatConfig } from "./settings.service";
import { RingostatBackfillDto } from "./dto/ringostat-backfill.dto";
import { RingostatReconcileDto } from "./dto/ringostat-reconcile.dto";
import { RingostatRekeyUniqueidDto } from "./dto/ringostat-rekey-uniqueid.dto";
import { RingostatRunAllDto } from "./dto/ringostat-run-all.dto";
import { RingostatWeeklyRunDto } from "./dto/ringostat-weekly-run.dto";
import { SettingsService } from "./settings.service";

@Controller("settings")
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly ringostatBackfill: RingostatBackfillService,
    private readonly ringostatReconcile: RingostatReconcileService,
    private readonly ringostatRekeyUniqueid: RingostatRekeyUniqueidService,
    private readonly ringostatRecordingsRefresh: RingostatRecordingsRefreshService,
  ) {}

  @Get("exchange-rates")
  @Roles(UserRole.ADMIN)
  getExchangeRates() {
    return this.settings.getExchangeRates();
  }

  @Patch("exchange-rates")
  @Roles(UserRole.ADMIN)
  setExchangeRates(@Body() body: Partial<ExchangeRates>) {
    return this.settings.setExchangeRates(body);
  }

  @Get("meta-lead-ads")
  @Roles(UserRole.ADMIN)
  getMetaLeadAdsConfig() {
    return this.settings.getMetaLeadAdsConfig();
  }

  @Patch("meta-lead-ads")
  @Roles(UserRole.ADMIN)
  setMetaLeadAdsConfig(@Body() body: Partial<MetaLeadAdsConfig>) {
    return this.settings.setMetaLeadAdsConfig(body);
  }

  @Get("meta-lead-ads/public")
  @Public()
  getMetaLeadAdsPublicConfig() {
    return this.settings.getMetaLeadAdsPublicConfig();
  }

  @Get("google-maps")
  @Roles(UserRole.ADMIN)
  getGoogleMapsConfig() {
    return this.settings.getGoogleMapsConfig();
  }

  @Patch("google-maps")
  @Roles(UserRole.ADMIN)
  setGoogleMapsConfig(@Body() body: Partial<GoogleMapsConfig>) {
    return this.settings.setGoogleMapsConfig(body);
  }

  @Get("google-maps/public")
  getGoogleMapsPublicConfig() {
    return this.settings.getGoogleMapsPublicConfig();
  }

  @Get("google-sheet")
  @Roles(UserRole.ADMIN)
  getGoogleSheetConfig() {
    return this.settings.getGoogleSheetConfig();
  }

  @Patch("google-sheet")
  @Roles(UserRole.ADMIN)
  setGoogleSheetConfig(@Body() body: Partial<GoogleSheetConfig>) {
    return this.settings.setGoogleSheetConfig(body);
  }

  @Get("telegram")
  @Roles(UserRole.ADMIN)
  getTelegramConfig() {
    return this.settings.getTelegramConfig();
  }

  @Patch("telegram")
  @Roles(UserRole.ADMIN)
  setTelegramConfig(@Body() body: Partial<TelegramConfig>) {
    return this.settings.setTelegramConfig(body);
  }

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

  /** Historical import from Ringostat /calls/list (chunked, overlapping windows; upsert by external id). */
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

  /**
   * Repairs historical rows created with synthetic externalId (when /calls/list didn't return uniqueid),
   * by merging duplicates and re-keying to stable uniqueid.
   */
  @Post("ringostat/rekey-uniqueid")
  @Roles(UserRole.ADMIN)
  runRingostatRekeyUniqueid(@Body() body: RingostatRekeyUniqueidDto) {
    return this.ringostatRekeyUniqueid.rekey(body);
  }

  /**
   * Weekly maintenance run: merge legacy↔calls/list duplicates, reconcile legs+manager,
   * then refresh recordingUrl for calls that have has_recording=1 in Ringostat.
   */
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

  /**
   * Run ringostat weekly-run over a whole period in chunks.
   * This provides "one command" execution while keeping merges safe and debuggable.
   */
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

    // Small overlap to avoid boundary misses for ±10min match in rekey.
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

      // Run step by step so a failure pinpoints the chunk.
      const rekey = await this.ringostatRekeyUniqueid.rekey({ from: runFrom, to: runTo, dryRun, limit });
      const reconcile = await this.ringostatReconcile.reconcile({ from: runFrom, to: runTo, dryRun, limit });
      const recordings = await this.ringostatRecordingsRefresh.refresh({ from: runFrom, to: runTo, dryRun, limit });

      chunks.push({ from: runFrom, to: runTo, rekey, reconcile, recordings });

      // advance with overlap
      cur = addMinutes(windowTo, -overlapMinutes);
      if (cur.getTime() <= windowFrom.getTime()) {
        // safety
        cur = windowTo;
      }
    }

    const sum = <T extends keyof (typeof chunks)[number]>(k: T, field: string) =>
      chunks.reduce((acc, c) => acc + Number((c[k] as any)[field] ?? 0), 0);

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
      // Return last 20 chunk reports only (response size bound).
      lastChunks: chunks.slice(-20),
    };
  }

  @Get("outbound-voice")
  @Roles(UserRole.ADMIN)
  getOutboundVoiceIntegrationConfig() {
    return this.settings.getOutboundVoiceIntegrationConfig();
  }

  @Patch("outbound-voice")
  @Roles(UserRole.ADMIN)
  setOutboundVoiceIntegrationConfig(
    @Body()
    body: Partial<OutboundVoiceIntegrationConfig> & {
      isEnabled?: boolean;
      webhookSecret?: string;
      apiToken?: string;
    },
  ) {
    return this.settings.setOutboundVoiceIntegrationConfig(body);
  }

  @Get("store")
  @Roles(UserRole.ADMIN)
  getStoreConfig() {
    return this.settings.getStoreConfig();
  }

  @Patch("store")
  @Roles(UserRole.ADMIN)
  setStoreConfig(@Body() body: Partial<StoreConfig>) {
    return this.settings.setStoreConfig(body);
  }

  @Get("org-chart")
  @Roles(UserRole.ADMIN)
  getOrgChartStructure() {
    return this.settings.getOrgChartStructure();
  }

  @Patch("org-chart")
  @Roles(UserRole.ADMIN)
  setOrgChartStructure(
    @Body()
    body: {
      assignments?: Record<string, string | null>;
      extraSlots?: string[];
      regions?: Record<string, string[]>;
    }
  ) {
    return this.settings.setOrgChartStructure(body);
  }
}
