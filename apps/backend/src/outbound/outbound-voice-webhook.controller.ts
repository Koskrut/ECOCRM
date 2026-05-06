import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Post } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { OutboundVoiceWebhookDto } from "./dto/outbound-voice-webhook.dto";
import { OutboundVoiceWebhookService } from "./outbound-voice-webhook.service";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";

void OutboundVoiceWebhookDto;

const WEBHOOK_SECRET_HEADER = "x-outbound-voice-secret";

@Controller("integrations/outbound-voice")
@RequireModule(ModuleIds.ManualCalling)
export class OutboundVoiceWebhookController {
  constructor(
    @Inject(OutboundVoiceWebhookService)
    private readonly outboundVoiceWebhook: OutboundVoiceWebhookService,
  ) {}

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async postWebhook(
    @Headers(WEBHOOK_SECRET_HEADER) secretToken: string | undefined,
    @Body() body: OutboundVoiceWebhookDto,
  ): Promise<{ ok: true; duplicate?: boolean }> {
    return this.outboundVoiceWebhook.handleWebhook(secretToken, body);
  }
}
