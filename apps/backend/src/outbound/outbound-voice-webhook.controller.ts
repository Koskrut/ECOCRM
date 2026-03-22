import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import type { OutboundVoiceWebhookDto } from "./dto/outbound-voice-webhook.dto";
import { OutboundVoiceWebhookService } from "./outbound-voice-webhook.service";

const WEBHOOK_SECRET_HEADER = "x-outbound-voice-secret";

@Controller("integrations/outbound-voice")
export class OutboundVoiceWebhookController {
  constructor(private readonly outboundVoiceWebhook: OutboundVoiceWebhookService) {}

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
