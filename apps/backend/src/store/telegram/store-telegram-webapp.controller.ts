import { Body, Controller, Post } from "@nestjs/common";
import { StoreTelegramWebAppService } from "./store-telegram-webapp.service";

@Controller("store/telegram")
export class StoreTelegramWebAppController {
  constructor(private readonly webapp: StoreTelegramWebAppService) {}

  /** Exchange Mini App initData for a short-lived store Telegram session. */
  @Post("webapp-session")
  createSession(@Body() body: { initData?: string }) {
    return this.webapp.createSession(body?.initData ?? "");
  }
}
