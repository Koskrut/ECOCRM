import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { withAuditSource } from "../../audit/audit-context";
import { sanitizeMetaError } from "./meta-audience.normalize";
import { MetaAudiencesService } from "./meta-audiences.service";

@Injectable()
export class MetaAudiencesCron {
  private readonly logger = new Logger(MetaAudiencesCron.name);

  constructor(@Inject(MetaAudiencesService) private readonly audiences: MetaAudiencesService) {}

  /** Replace the four CRM audiences in Meta once a day at 03:25 Kyiv. */
  @Cron("25 3 * * *", { timeZone: "Europe/Kyiv" })
  async daily() {
    if (process.env.CRON_ENABLED !== "true") return;
    return withAuditSource("cron", "cron:meta-audiences", async () => {
      try {
        await this.audiences.sync(false);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(sanitizeMetaError(message));
      }
    });
  }
}
