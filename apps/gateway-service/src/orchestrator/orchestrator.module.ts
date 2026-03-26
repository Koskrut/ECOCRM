import { Module } from "@nestjs/common";
import { OutboundCallOrchestratorService } from "./outbound-call-orchestrator.service";
import { LifecycleRunnerService } from "./lifecycle-runner.service";
import { OutcomeFinalizerService } from "./outcome-finalizer.service";
import { SessionsModule } from "../sessions/sessions.module";
import { CrmWebhooksModule } from "../crm-webhooks/crm-webhooks.module";
import { ProvidersModule } from "../providers/providers.module";

@Module({
  imports: [SessionsModule, CrmWebhooksModule, ProvidersModule],
  providers: [OutboundCallOrchestratorService, LifecycleRunnerService, OutcomeFinalizerService],
  exports: [OutboundCallOrchestratorService, OutcomeFinalizerService],
})
export class OrchestratorModule {}
