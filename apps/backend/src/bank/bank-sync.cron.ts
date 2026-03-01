import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { BankSyncService } from "./bank-sync.service";

@Injectable()
export class BankSyncCron {
  private readonly logger = new Logger(BankSyncCron.name);

  constructor(private readonly sync: BankSyncService) {}

  @Cron("0 */4 * * *")
  async run() {
    try {
      const r = await this.sync.syncAll();
      this.logger.log(`Bank sync done: accounts=${r.accounts}, transactions=${r.transactions}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Bank sync failed: ${msg}`);
    }
  }
}
