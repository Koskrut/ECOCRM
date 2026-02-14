// src/np/np-ttn.cron.ts
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { NpTtnService } from "./np-ttn.service";

@Injectable()
export class NpTtnCron {
  private readonly logger = new Logger(NpTtnCron.name);

  // каждые 5 минут
  @Cron("*/5 * * * *")
  async syncActiveTtns() {
    try {
      const res = await this.ttn.syncActiveTtns({ limit: 100 });
      this.logger.log(
        `NP TTN sync done: checked=${res.checked}, updatedOrders=${res.updatedOrders}, skipped=${res.skipped}`,
      );
    } catch (e: any) {
      this.logger.error(`NP TTN sync failed: ${e?.message || e}`);
    }
  }

  constructor(private readonly ttn: NpTtnService) {}
}
