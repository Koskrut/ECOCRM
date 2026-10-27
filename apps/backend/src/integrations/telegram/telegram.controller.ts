import { timingSafeEqual } from "crypto";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
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

function webhookSecretMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

@Controller("integrations/telegram")
export class TelegramController {
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
    if (!webhookSecretMatches(secretToken, expected)) {
      throw new UnauthorizedException("Invalid webhook secret");
    }

    // Hold the response until the update is stored and handled. A 5xx makes
    // Telegram redeliver; returning 200 first drops the update on a crash.
    await this.telegramService.handleInboundUpdate(body);
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
