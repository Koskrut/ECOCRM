import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { resolveAuditRetentionDays } from "./audit-payload";

const BATCH_SIZE = 5_000;

@Injectable()
export class AuditRetentionCron {
  private readonly logger = new Logger(AuditRetentionCron.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Daily 03:40 Europe/Kyiv — drop AuditLog rows older than retention window. */
  @Cron("40 3 * * *", { timeZone: "Europe/Kyiv" })
  async purgeOld(): Promise<void> {
    if (process.env.CRON_ENABLED !== "true") return;

    const days = resolveAuditRetentionDays(process.env.AUDIT_LOG_RETENTION_DAYS);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let deleted = 0;

    try {
      for (;;) {
        const old = await this.prisma.auditLog.findMany({
          where: { createdAt: { lt: cutoff } },
          select: { id: true },
          take: BATCH_SIZE,
        });
        if (old.length === 0) break;
        const result = await this.prisma.auditLog.deleteMany({
          where: { id: { in: old.map((row) => row.id) } },
        });
        deleted += result.count;
        if (old.length < BATCH_SIZE) break;
      }
      if (deleted > 0) {
        this.logger.log(`AuditLog retention: deleted ${deleted} rows older than ${days}d`);
      }
    } catch (e) {
      this.logger.error(
        `AuditLog retention failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
