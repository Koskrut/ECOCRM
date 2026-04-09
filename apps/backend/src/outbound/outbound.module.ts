import { Module } from "@nestjs/common";
import { TelegramModule } from "../integrations/telegram/telegram.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { SystemModule } from "../system/system.module";
import { OutboundController } from "./outbound.controller";
import { OutboundCampaignService } from "./outbound-campaign.service";
import { OutboundComplianceService } from "./outbound-compliance.service";
import { OutboundOrchestratorCron } from "./outbound-orchestrator.cron";
import { OutboundQueueService } from "./outbound-queue.service";
import { OutboundVoiceWebhookController } from "./outbound-voice-webhook.controller";
import { OutboundVoiceWebhookService } from "./outbound-voice-webhook.service";
import { OutboundWritebackService } from "./outbound-writeback.service";
import { CrmContextPackService } from "./crm-context-pack.service";
import { ScenarioRegistryService } from "./scenarios/scenario-registry.service";
import { StubVoiceRuntimeAdapter } from "./voice-runtime/stub-voice-runtime.adapter";
import { HttpOutboundVoiceAdapter } from "./voice-runtime/http-outbound-voice.adapter";
import { SelectingVoiceRuntimeAdapter } from "./voice-runtime/selecting-voice-runtime.adapter";
import { KyivstarOpenAiGatewayVoiceAdapter } from "./voice-runtime/kyivstar-openai-gateway-voice.adapter";
import { AiOutboundActionsService } from "./ai-outbound-actions.service";
import { OutboundCallLinkService } from "./outbound-call-link.service";
import { OutboundCallLinkReconcileService } from "./outbound-call-link-reconcile.service";
import { OutboundPostCallAnalysisService } from "./outbound-post-call-analysis.service";

@Module({
  imports: [PrismaModule, SettingsModule, TelegramModule, SystemModule],
  controllers: [OutboundController, OutboundVoiceWebhookController],
  providers: [
    ScenarioRegistryService,
    CrmContextPackService,
    OutboundComplianceService,
    OutboundWritebackService,
    OutboundCallLinkService,
    OutboundCallLinkReconcileService,
    OutboundPostCallAnalysisService,
    OutboundVoiceWebhookService,
    StubVoiceRuntimeAdapter,
    HttpOutboundVoiceAdapter,
    KyivstarOpenAiGatewayVoiceAdapter,
    AiOutboundActionsService,
    SelectingVoiceRuntimeAdapter,
    OutboundCampaignService,
    OutboundQueueService,
    OutboundOrchestratorCron,
  ],
  exports: [
    ScenarioRegistryService,
    CrmContextPackService,
    OutboundCampaignService,
    OutboundQueueService,
  ],
})
export class OutboundModule {}
