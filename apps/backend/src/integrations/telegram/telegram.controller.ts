import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { Public } from "../../auth/public.decorator";
import { SettingsService } from "../../settings/settings.service";
import { TelegramService } from "./telegram.service";
import type { TelegramUpdate } from "./telegram.types";

const WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token";

@Controller("integrations/telegram")
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly settings: SettingsService,
  ) {}

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers(WEBHOOK_SECRET_HEADER) secretToken: string | undefined,
    @Body() body: TelegramUpdate,
  ): Promise<{ ok: true }> {
    const { webhookSecret } = await this.settings.getTelegramSecrets();
    const expected = webhookSecret ?? process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expected || secretToken !== expected) {
      throw new UnauthorizedException("Invalid webhook secret");
    }

    await this.telegramService.handleInboundUpdate(body);
    return { ok: true };
  }
}
