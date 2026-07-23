import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ModuleIds } from "../modules/module-ids";
import { ModuleStateService } from "../modules/module-state.service";
import { RiskService } from "./risk.service";

@Injectable()
export class RiskCron {
  private readonly logger = new Logger(RiskCron.name);

  constructor(
    private readonly risk: RiskService,
    private readonly modules: ModuleStateService,
  ) {}

  @Cron("0 2 * * *", { timeZone: "Europe/Kyiv" })
  async nightlyRecompute() {
    const ok = await this.modules.isEffective(ModuleIds.RiskManagement);
    if (!ok) return;
    try {
      const result = await this.risk.recomputeAll();
      this.logger.log(`Risk recompute: ${result.signalCount} signals, ${result.scoreCount} scores`);
    } catch (e) {
      this.logger.error(`Risk recompute failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
