import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { NpSyncService } from "./np-sync.service";

@Injectable()
export class NpSyncCron {
  private readonly logger = new Logger(NpSyncCron.name);

  constructor(private readonly sync: NpSyncService) {}

  // каждый день в 03:10
  @Cron("10 3 * * *")
  async run() {
    try {
      const r = await this.sync.syncAll();
      this.logger.log(`NP sync done: ${JSON.stringify(r)}`);
    } catch (e: any) {
      this.logger.error(`NP sync failed: ${e?.message || e}`);
    }
  }
}
