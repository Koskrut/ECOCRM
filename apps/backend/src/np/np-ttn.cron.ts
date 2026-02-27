import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { NpTtnService } from "./np-ttn.service";

@Injectable()
export class NpTtnCron {
  private readonly logger = new Logger(NpTtnCron.name);

  constructor(@Inject(NpTtnService) private readonly ttn: NpTtnService) {}

  @Cron("*/5 * * * *")
  async syncActiveTtns() {
    try {
      const res = await this.ttn.syncActiveTtns({ limit: 100 });
      this.logger.log(
        `NP TTN sync done: checked=${res.checked}, updatedOrders=${res.updatedOrders}, skipped=${res.skipped}`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`NP TTN sync failed: ${msg}`);
    }
  }
}
