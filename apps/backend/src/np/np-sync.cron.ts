import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ModuleStateService } from "../modules/module-state.service";
import { ModuleIds } from "../modules/module-ids";
import { NpSyncService } from "./np-sync.service";

@Injectable()
export class NpSyncCron {
  private readonly logger = new Logger(NpSyncCron.name);

  constructor(
    @Inject(NpSyncService) private readonly sync: NpSyncService,
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
  ) {}

  // каждый день в 03:10 — міста + відділення/поштомати
  @Cron("10 3 * * *")
  async run() {
    if (process.env.NP_CRON_DISABLED === "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.NovaPoshta);
      if (!ok) return;
    }
    try {
      const r = await this.sync.syncAll();
      this.logger.log(`NP sync done: ${JSON.stringify(r)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`NP sync failed: ${msg}`);
    }
  }

  // раз на тиждень (неділя 04:00) — вулиці по всіх містах
  @Cron("0 4 * * 0")
  async runStreets() {
    if (process.env.NP_CRON_DISABLED === "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.NovaPoshta);
      if (!ok) return;
    }
    try {
      this.logger.log("NP streets sync starting (full)");
      await this.sync.syncStreetsForAllCities(undefined);
      this.logger.log("NP streets sync done");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`NP streets sync failed: ${msg}`);
    }
  }
}
