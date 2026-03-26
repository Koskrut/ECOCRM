import { Injectable } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import type { AppConfig } from "../config/configuration";
import { CONFIG } from "../config/config.module";

@Injectable()
export class CrmWebhookSignatureService {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  /** Header name from CRM callback contract; value is shared CRM_WEBHOOK_SECRET */
  resolveHeader(secretHeaderName: string): { name: string; value: string } {
    return { name: secretHeaderName, value: this.config.crmWebhookSecret };
  }
}
