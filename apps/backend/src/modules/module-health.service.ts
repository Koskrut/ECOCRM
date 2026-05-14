import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ModuleIds, type ModuleId } from "./module-ids";

/** Env var → upstream base URL for health probes (GET /system/version). */
export const MODULE_UPSTREAM_ENV: Partial<Record<ModuleId, string>> = {
  [ModuleIds.ManualCalling]: "OUTBOUND_UPSTREAM_URL",
  [ModuleIds.VoiceOutbound]: "OUTBOUND_UPSTREAM_URL",
  [ModuleIds.Finance]: "FINANCE_UPSTREAM_URL",
  [ModuleIds.ProductionPlanning]: "PLANNING_UPSTREAM_URL",
  [ModuleIds.NovaPoshta]: "NP_UPSTREAM_URL",
  [ModuleIds.GoogleSheet]: "GOOGLE_SHEET_UPSTREAM_URL",
  [ModuleIds.Bitrix]: "BITRIX_UPSTREAM_URL",
  [ModuleIds.Ringostat]: "RINGOSTAT_UPSTREAM_URL",
};

const log = new Logger("ModuleHealthService");

@Injectable()
export class ModuleHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly cache = new Map<ModuleId, { ok: boolean; at: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;

  onModuleInit(): void {
    const ttl = Number(process.env.MODULE_HEALTH_TTL_MS ?? 30_000);
    void this.refreshAll();
    if (Number.isFinite(ttl) && ttl >= 5_000) {
      this.timer = setInterval(() => void this.refreshAll(), ttl);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Whether upstream for `id` responded OK on last probe (false if never probed / failed). */
  isUpstreamOk(id: ModuleId): boolean {
    return this.cache.get(id)?.ok ?? false;
  }

  private async refreshAll(): Promise<void> {
    const entries = Object.entries(MODULE_UPSTREAM_ENV) as [ModuleId, string][];
    const jobs = entries.map(async ([moduleId, envKey]) => {
      const base = process.env[envKey]?.trim();
      if (!base) {
        this.cache.delete(moduleId);
        return;
      }
      const url = `${base.replace(/\/$/, "")}/system/version`;
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 1_000);
      try {
        const res = await fetch(url, { signal: ac.signal, headers: { Accept: "application/json" } });
        const ok = res.ok;
        this.cache.set(moduleId, { ok, at: Date.now() });
        if (!ok) {
          log.warn(`health ${moduleId}: HTTP ${res.status} from ${url}`);
        }
      } catch (e) {
        this.cache.set(moduleId, { ok: false, at: Date.now() });
        log.warn(`health ${moduleId}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        clearTimeout(t);
      }
    });
    await Promise.allSettled(jobs);
  }
}
