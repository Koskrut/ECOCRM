import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { signJwt } from "../../auth/jwt";
import {
  isTelegramAuthDateValid,
  parseTelegramWebAppInitData,
  verifyTelegramWebAppInitData,
} from "../../auth/telegram-widget";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import { cartSessionId } from "../../integrations/telegram/telegram-client.constants";
import type {
  StoreTelegramWebAppJwtPayload,
  StoreTelegramWebAppSession,
} from "./store-telegram-webapp.types";

/** Mini App browsing can last longer than a login-widget click. */
const WEBAPP_INIT_MAX_AGE_SECONDS = 60 * 60 * 24;
const WEBAPP_SESSION_TTL_SECONDS = 60 * 60 * 24;

@Injectable()
export class StoreTelegramWebAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async createSession(initData: string): Promise<StoreTelegramWebAppSession> {
    const raw = (initData ?? "").trim();
    if (!raw) throw new BadRequestException("initData required");

    const secrets = await this.settings.getTelegramSecrets();
    if (!secrets.botToken) throw new UnauthorizedException("Telegram bot is not configured");

    if (!verifyTelegramWebAppInitData(raw, secrets.botToken)) {
      throw new UnauthorizedException("Invalid Telegram initData");
    }

    const parsed = parseTelegramWebAppInitData(raw);
    if (!parsed?.user?.id) throw new UnauthorizedException("Telegram user missing");
    if (!isTelegramAuthDateValid(parsed.authDate, WEBAPP_INIT_MAX_AGE_SECONDS)) {
      throw new UnauthorizedException("Telegram initData expired");
    }

    const telegramUserId = String(parsed.user.id);
    const account = await this.prisma.telegramAccount.findUnique({
      where: { telegramUserId },
      select: {
        telegramChatId: true,
        phone: true,
        contactId: true,
        firstName: true,
        lastName: true,
      },
    });

    let phone = account?.phone ?? null;
    let contactId = account?.contactId ?? null;
    if (!phone && contactId) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: contactId },
        select: { phone: true },
      });
      phone = contact?.phone ?? null;
    }

    const chatId = account?.telegramChatId ?? telegramUserId;
    const sessionCartId = cartSessionId(telegramUserId);
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");

    const payload: StoreTelegramWebAppJwtPayload = {
      aud: "store_tg",
      sub: telegramUserId,
      cartSessionId: sessionCartId,
      chatId,
      phone,
      contactId,
      firstName: account?.firstName ?? parsed.user.first_name ?? null,
      lastName: account?.lastName ?? parsed.user.last_name ?? null,
    };

    const token = signJwt(payload as unknown as Record<string, unknown>, secret, {
      expiresInSeconds: WEBAPP_SESSION_TTL_SECONDS,
    });

    return {
      token,
      cartSessionId: sessionCartId,
      phone,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
      contactId,
    };
  }
}
