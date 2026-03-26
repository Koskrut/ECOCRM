import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { BearerAuthGuard } from "../common/guards/bearer-auth.guard";
import { CreateOutboundCallDto } from "./dto/create-outbound-call.dto";
import { SessionRegistryService } from "../sessions/session-registry.service";
import { OutboundCallOrchestratorService } from "../orchestrator/outbound-call-orchestrator.service";
import { extractMockOutcome } from "../mock/mock-outcome.util";
import { normalizeCreateOutboundCallDto } from "./normalize-create-outbound-call";

export type CreateOutboundCallResponse = {
  accepted: true;
  provider: "mock" | "kyivstar_openai";
  externalSessionId: string;
  providerSessionId: string | null;
  status: "queued" | "starting";
  /** CRM adapter compatibility — same as externalSessionId */
  session_id: string;
};

@Controller("v1/outbound")
@UseGuards(BearerAuthGuard)
export class OutboundCallsController {
  constructor(
    private readonly registry: SessionRegistryService,
    private readonly orchestrator: OutboundCallOrchestratorService,
  ) {}

  @Post("calls")
  @HttpCode(200)
  async createCall(@Body() body: CreateOutboundCallDto): Promise<CreateOutboundCallResponse> {
    const normalized = normalizeCreateOutboundCallDto(body);
    const mockOutcome = extractMockOutcome(normalized.context, normalized.crmContext);
    const providerLabel = this.orchestrator.providerLabel();
    const session = this.registry.createSession({
      attemptId: normalized.attemptId,
      campaignId: normalized.campaignId,
      scenarioCode: normalized.scenarioCode,
      scenarioVersion: normalized.scenarioVersion,
      scenarioKey: normalized.scenarioKey,
      phone: normalized.phone,
      phoneNormalized: normalized.phoneNormalized ?? null,
      leadId: normalized.leadId ?? null,
      contactId: normalized.contactId ?? null,
      companyId: normalized.companyId ?? null,
      mockOutcome,
      providerLabel,
      webhookUrl: normalized.callback?.webhookUrl ?? null,
      webhookSecretHeader: normalized.callback?.webhookSecretHeader ?? "x-outbound-voice-secret",
      context: { ...normalized.context, crmContext: normalized.crmContext },
    });

    const res: CreateOutboundCallResponse = {
      accepted: true,
      provider: providerLabel,
      externalSessionId: session.externalSessionId,
      providerSessionId: session.providerSessionId,
      status: "queued",
      session_id: session.externalSessionId,
    };

    this.orchestrator.enqueueFlow(this.registry.get(session.externalSessionId)!);
    return res;
  }
}
