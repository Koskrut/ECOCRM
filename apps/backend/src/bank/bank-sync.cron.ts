import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { withRetryOnConnectionClosed } from "../prisma/db-retry";
import { PrismaService } from "../prisma/prisma.service";
import { BankSyncService } from "./bank-sync.service";

@Injectable()
export class BankSyncCron {
  private readonly logger = new Logger(BankSyncCron.name);

  constructor(
    private readonly sync: BankSyncService,
    private readonly prisma: PrismaService,
  ) {}

  /** Working hours 08:00–20:00: every 2 minutes */
  @Cron("*/2 8-20 * * *")
  async runDay() {
    await this.run();
  }

  /** Night 00:00–07:59 and 21:00–23:59: every 15 minutes */
  @Cron("*/15 0-7,21-23 * * *")
  async runNight() {
    await this.run();
  }

  private async run() {
    if (process.env.CRON_ENABLED !== "true") return;
    try {
      const r = await withRetryOnConnectionClosed(() => this.sync.syncAll(), {
        onBeforeRetry: async () => {
          await this.prisma.$disconnect();
          await this.prisma.$connect();
        },
      });
      this.logger.log(`Bank sync done: accounts=${r.accounts}, imported=${r.transactionsImported}, matched=${r.matched}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Bank sync failed: ${msg}`);
    }
  }
}
