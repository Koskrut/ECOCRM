import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Public } from "../../auth/public.decorator";
import { Roles } from "../../auth/roles.decorator";
import { SettingsService } from "../../settings/settings.service";
import { TelegramService } from "./telegram.service";
import type { TelegramUpdate } from "./telegram.types";
import { SkipModuleGating } from "../../modules/gating/skip-module-gating.decorator";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";

const WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token";

@Controller("integrations/telegram")
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    @Inject(TelegramService) private readonly telegramService: TelegramService,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  @Public()
  @SkipModuleGating()
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

    // Ack immediately; process in the background so Telegram does not retry
    // on slow DB/Bot API work (same pattern as the Bitrix webhook).
    setImmediate(() => {
      this.telegramService.handleInboundUpdate(body).catch((err) => {
        this.logger.error(
          `Background inbound update process error (update_id=${body?.update_id})`,
          err instanceof Error ? err.stack : String(err),
        );
      });
    });

    return { ok: true };
  }

  @Post("register-webhook")
  @Roles(UserRole.ADMIN)
  @RequireModule(ModuleIds.IntegrationsTelegram)
  registerWebhook() {
    return this.telegramService.registerWebhook();
  }

  @Get("webhook-info")
  @Roles(UserRole.ADMIN)
  @RequireModule(ModuleIds.IntegrationsTelegram)
  getWebhookInfo() {
    return this.telegramService.getWebhookInfo();
  }
}
