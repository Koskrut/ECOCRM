import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { Public } from "../../auth/public.decorator";
import { Roles } from "../../auth/roles.decorator";
import { verifyMetaSignatureSha256 } from "../../leads/leads-meta-webhook.utils";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";
import { MetaMessagingService } from "./meta-messaging.service";
import type { MetaMessagingWebhookBody } from "./meta-messaging.types";

@Controller("integrations/meta")
@RequireModule(ModuleIds.IntegrationsMetaMessaging)
export class MetaMessagingController {
  constructor(@Inject(MetaMessagingService) private readonly metaMessaging: MetaMessagingService) {}

  @Public()
  @Get("webhook")
  async webhookVerify(
    @Query("hub.mode") hubMode: string | undefined,
    @Query("hub.verify_token") hubVerifyToken: string | undefined,
    @Query("hub.challenge") hubChallenge: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    const challenge = await this.metaMessaging.metaWebhookVerifySubscribe(
      hubMode,
      hubVerifyToken,
      hubChallenge,
    );
    res.status(200).type("text/plain").send(challenge);
  }

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhookInbound(
    @Body() body: MetaMessagingWebhookBody,
    @Headers("x-hub-signature-256") signature256: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const appSecret =
      process.env.META_APP_SECRET?.trim() || process.env.META_MESSAGING_APP_SECRET?.trim();
    if (appSecret) {
      const ok = verifyMetaSignatureSha256(req.rawBody, signature256, appSecret);
      if (!ok) {
        return { ok: false, error: "Invalid signature" };
      }
    }

    return this.metaMessaging.handleInboundWebhook(body);
  }
}
