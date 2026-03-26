import { Module } from "@nestjs/common";
import { CrmWebhookClientService } from "./crm-webhook-client.service";
import { CrmWebhookSignatureService } from "./crm-webhook-signature.service";
import { DeliveryLogService } from "./delivery-log.service";

@Module({
  providers: [CrmWebhookClientService, CrmWebhookSignatureService, DeliveryLogService],
  exports: [CrmWebhookClientService, DeliveryLogService],
})
export class CrmWebhooksModule {}
