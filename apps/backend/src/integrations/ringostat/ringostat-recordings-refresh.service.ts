import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { fetchRingostatCallsList, type RingostatCallsListConfig } from "./ringostat-calls-list";
import { RINGOSTAT_PROVIDER } from "./ringostat-ingest.service";

type RingostatStoredConfig = {
  projectId?: string;
  apiBaseUrl?: string;
  pollingEndpoint?: string;
};

export type RingostatRecordingsRefreshParams = {
  from: string;
  to: string;
  dryRun?: boolean;
  limit?: number;
};

export type RingostatRecordingsRefreshReport = {
  dryRun: boolean;
  fetched: number;
  candidates: number;
  updated: number;
  skipped: number;
  from: string;
  to: string;
  limit: number;
  fieldsMode: "expanded" | "fallback";
};

@Injectable()
export class RingostatRecordingsRefreshService {
  private readonly logger = new Logger(RingostatRecordingsRefreshService.name);

  constructor(private readonly prisma: PrismaService) {}

  async refresh(params: RingostatRecordingsRefreshParams): Promise<RingostatRecordingsRefreshReport> {
    const dryRun = params.dryRun !== false;
    const limit = Math.max(1, Math.min(params.limit ?? 5000, 50_000));

    const from = new Date(params.from);
    const to = new Date(params.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException("Invalid from/to date");
    }
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException("from must be before to");
    }

    const setting = await this.prisma.integrationSetting.findFirst({
      where: { provider: RINGOSTAT_PROVIDER },
    });
    const apiToken = setting?.apiToken ?? process.env.RINGOSTAT_API_TOKEN ?? null;
    if (!apiToken) throw new BadRequestException("Ringostat API token is not configured");

    const cfg = (setting?.config ?? null) as RingostatStoredConfig | null;
    const listCfg: RingostatCallsListConfig = {
      apiToken,
      apiBaseUrl: cfg?.apiBaseUrl,
      pollingEndpoint: cfg?.pollingEndpoint,
      projectId: cfg?.projectId,
    };

    const res = await fetchRingostatCallsList(listCfg, from, to);
    if (!res.ok) {
      this.logger.error(`Ringostat recordings refresh HTTP ${res.status}: ${res.bodySnippet}`);
      throw new ServiceUnavailableException(
        `Ringostat API error ${res.status}: ${res.bodySnippet.slice(0, 200)}`,
      );
    }

    const events = res.events.slice(0, limit) as Array<Record<string, unknown>>;
    const fetched = events.length;

    const normalizeUrl = (v: unknown): string | null => {
      const s = String(v ?? "").trim();
      return s.length > 0 ? s : null;
    };
    const normalizeUniqueid = (v: unknown): string | null => {
      const s = String(v ?? "").trim();
      return s.length > 0 ? s : null;
    };

    let candidates = 0;
    let updated = 0;
    let skipped = 0;

    for (const e of events) {
      const uniqueid = normalizeUniqueid(e.uniqueid);
      if (!uniqueid) {
        skipped += 1;
        continue;
      }
      const hasRecording =
        e.has_recording === true || e.has_recording === 1 || e.has_recording === "1";
      if (!hasRecording) {
        skipped += 1;
        continue;
      }

      const url =
        normalizeUrl(e.recording_wav) ??
        normalizeUrl(e.recording) ??
        (typeof e.recording === "object" && e.recording !== null
          ? normalizeUrl((e.recording as { url?: unknown }).url)
          : null);

      if (!url) {
        skipped += 1;
        continue;
      }

      candidates += 1;

      if (dryRun) continue;

      // Do NOT rely on Call.externalId == uniqueid: after rekey merges externalId can remain ks1_*
      // while rawPayload.uniqueid is present. Update by rawPayload uniqueid instead.
      const affected = await this.prisma.call.updateMany({
        where: {
          provider: RINGOSTAT_PROVIDER,
          recordingUrl: null,
          rawPayload: {
            path: ["uniqueid"],
            equals: uniqueid,
          },
        },
        data: {
          recordingUrl: url,
          recordingStatus: "READY",
        },
      });
      updated += affected.count;
    }

    const report: RingostatRecordingsRefreshReport = {
      dryRun,
      fetched,
      candidates,
      updated,
      skipped,
      from: params.from,
      to: params.to,
      limit,
      fieldsMode: res.fieldsMode,
    };

    this.logger.log(
      `Ringostat recordings refresh ${dryRun ? "dry-run" : "apply"}: fetched=${fetched}, candidates=${candidates}, updated=${updated}, skipped=${skipped}, fieldsMode=${res.fieldsMode}`,
    );
    return report;
  }
}

