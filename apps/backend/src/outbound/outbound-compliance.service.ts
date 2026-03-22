import { Injectable, Logger } from "@nestjs/common";
import type { OutboundCampaign, Contact } from "@prisma/client";
import type { OutboundCampaignConfigJson } from "./outbound-campaign.config";

@Injectable()
export class OutboundComplianceService {
  private readonly logger = new Logger(OutboundComplianceService.name);

  parseCampaignConfig(campaign: OutboundCampaign): OutboundCampaignConfigJson {
    const raw = campaign.config;
    if (!raw || typeof raw !== "object") return {};
    return raw as OutboundCampaignConfigJson;
  }

  canCallContact(contact: Pick<Contact, "marketingCallOptOut">): boolean {
    if (contact.marketingCallOptOut) {
      this.logger.debug("Skip contact: marketingCallOptOut");
      return false;
    }
    return true;
  }

  /**
   * MVP quiet hours: compares current server local time HH:mm to [start, end] inclusive wrap (e.g. 21:00–09:00 overnight).
   * Assumption: timezone field in config is not applied until Phase 2; document in settings UI.
   */
  isWithinQuietHours(campaign: OutboundCampaign): boolean {
    const cfg = this.parseCampaignConfig(campaign);
    if (!cfg.quietHours?.start || !cfg.quietHours?.end) return false;

    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const start = this.parseHm(cfg.quietHours.start);
    const end = this.parseHm(cfg.quietHours.end);
    if (start == null || end == null) return false;

    if (start <= end) {
      return minutes >= start && minutes <= end;
    }
    /* overnight window e.g. 21:00–09:00 */
    return minutes >= start || minutes <= end;
  }

  private parseHm(s: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }
}
