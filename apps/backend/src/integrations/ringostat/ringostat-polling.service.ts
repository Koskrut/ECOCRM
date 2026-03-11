import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { RINGOSTAT_PROVIDER, RingostatIngestService } from "./ringostat-ingest.service";

type RingostatPollingConfig = {
  usePolling?: boolean;
  pollingLookbackMinutes?: number;
  projectId?: string;
  apiBaseUrl?: string;
  pollingEndpoint?: string;
};

@Injectable()
export class RingostatPollingService {
  private readonly logger = new Logger(RingostatPollingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: RingostatIngestService,
  ) {}

  /**
   * Default: every 5 minutes. Точные интервалы можно будет настроить через конфиг.
   */
  @Cron("*/5 * * * *")
  async run(): Promise<void> {
    try {
      const setting = await this.prisma.integrationSetting.findFirst({
        where: { provider: RINGOSTAT_PROVIDER },
      });
      if (!setting?.isEnabled) return;

      const cfg = (setting.config ?? null) as RingostatPollingConfig | null;
      if (!cfg?.usePolling) return;

      const apiToken = setting.apiToken ?? process.env.RINGOSTAT_API_TOKEN ?? null;
      if (!apiToken) {
        this.logger.warn("Ringostat polling enabled but apiToken not configured");
        return;
      }

      const now = new Date();
      const lookbackMinutes = cfg.pollingLookbackMinutes ?? 10;

      const lastPollAt = setting.lastPollAt ?? new Date(now.getTime() - lookbackMinutes * 60_000);
      const from = new Date(lastPollAt.getTime() - lookbackMinutes * 60_000);
      const to = now;

      const baseUrl =
        (cfg.apiBaseUrl && cfg.apiBaseUrl.trim().length > 0
          ? cfg.apiBaseUrl
          : process.env.RINGOSTAT_API_URL) ?? "https://api.ringostat.net";
      const endpoint =
        (cfg.pollingEndpoint && cfg.pollingEndpoint.trim().length > 0
          ? cfg.pollingEndpoint
          : "/calls/list") ?? "/calls/list";

      const base = new URL(baseUrl);
      const isCallsList =
        endpoint === "/calls/list" || endpoint === "calls/list" || endpoint.endsWith("calls/list");
      const useLegacyBase = isCallsList;
      const pathSegment = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
      const url =
        useLegacyBase
          ? new URL(`/${pathSegment}`, base.origin)
          : base.pathname !== "/" && base.pathname !== ""
            ? new URL(`${base.pathname.replace(/\/$/, "")}/${pathSegment}`, base.origin)
            : new URL(endpoint, baseUrl);
      url.searchParams.set("auth", apiToken);
      url.searchParams.set("export_type", "json");
      const fmt = (d: Date) =>
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
      url.searchParams.set("from", fmt(from));
      url.searchParams.set("to", fmt(to));
      url.searchParams.set(
        "fields",
        "calldate,caller,dst,n_alias,disposition,billsec,recording,duration",
      );
      if (cfg.projectId && cfg.projectId.trim().length > 0) {
        url.searchParams.set("project_id", cfg.projectId.trim());
      }

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Auth-key": apiToken,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.error(
          `Ringostat polling HTTP ${res.status}: ${text.slice(0, 500)}`,
        );
        return;
      }

      const payload = (await res.json()) as unknown;
      const events =
        (Array.isArray(payload) && payload) ||
        (Array.isArray((payload as { results?: unknown[] }).results)
          ? (payload as { results: unknown[] }).results
          : []);

      if (events.length > 0) {
        await this.ingest.ingestFromApi(events);
      }

      await this.prisma.integrationSetting.update({
        where: { id: setting.id },
        data: { lastPollAt: now },
      });

      this.logger.log(
        `Ringostat polling done: events=${events.length}, window=${from.toISOString()}..${to.toISOString()}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Ringostat polling failed: ${msg}`);
    }
  }
}

