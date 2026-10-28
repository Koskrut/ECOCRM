import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { signJwt } from "../../auth/jwt";
import { hashPassword } from "../../auth/password";
import {
  isTelegramAuthDateValid,
  parseTelegramWebAppInitData,
  verifyTelegramWebAppInitData,
} from "../../auth/telegram-widget";
import {
  getPhoneCandidatesForLookup,
  getPhoneNormalizedDigits,
} from "../../common/phone.utils";
import { ContactsService } from "../../contacts/contacts.service";
import { cartSessionId } from "../../integrations/telegram/telegram-client.constants";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import { StoreCartService } from "../cart/store-cart.service";
import type {
  StoreTelegramWebAppJwtPayload,
  StoreTelegramWebAppSession,
} from "./store-telegram-webapp.types";

/** Mini App browsing can last longer than a login-widget click. */
const WEBAPP_INIT_MAX_AGE_SECONDS = 60 * 60 * 24;
const WEBAPP_SESSION_TTL_SECONDS = 60 * 60 * 24;
const STORE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

@Injectable()
export class StoreTelegramWebAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly contacts: ContactsService,
    private readonly cart: StoreCartService,
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
        id: true,
        telegramChatId: true,
        phone: true,
        contactId: true,
        firstName: true,
        lastName: true,
      },
    });

    let phone = account?.phone ?? null;
    let contactId = account?.contactId ?? null;
    let firstName = account?.firstName ?? parsed.user.first_name ?? null;
    let lastName = account?.lastName ?? parsed.user.last_name ?? null;

    if (!contactId && phone) {
      const digits = getPhoneNormalizedDigits(phone);
      const candidates = digits ? getPhoneCandidatesForLookup(digits) : [];
      for (const candidate of candidates) {
        const row = await this.contacts.findContactByPhone(candidate);
        if (row) {
          contactId = row.id;
          break;
        }
      }
      if (contactId) {
        await this.prisma.telegramAccount.updateMany({
          where: { telegramUserId },
          data: { contactId, leadId: null },
        });
      }
    }

    if (contactId && !phone) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: contactId },
        select: { phone: true, firstName: true, lastName: true },
      });
      phone = contact?.phone ?? null;
      firstName = firstName || contact?.firstName || null;
      lastName = lastName || contact?.lastName || null;
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
      firstName,
      lastName,
    };

    const token = signJwt(payload as unknown as Record<string, unknown>, secret, {
      expiresInSeconds: WEBAPP_SESSION_TTL_SECONDS,
    });

    let storeToken: string | null = null;
    let customerId: string | null = null;

    if (contactId) {
      let customer = await this.prisma.customer.findUnique({
        where: { contactId },
        select: { id: true, contactId: true },
      });
      if (!customer) {
        customer = await this.prisma.customer.create({
          data: {
            contactId,
            email: null,
            passwordHash: hashPassword(randomBytes(24).toString("hex")),
          },
          select: { id: true, contactId: true },
        });
      }
      customerId = customer.id;
      storeToken = signJwt(
        { aud: "store", sub: customer.id, contactId: customer.contactId },
        secret,
        { expiresInSeconds: STORE_SESSION_TTL_SECONDS },
      );
      try {
        await this.cart.mergeCart(customer.id, sessionCartId);
      } catch {
        /* guest cart may be empty */
      }
    }

    return {
      token,
      storeToken,
      cartSessionId: sessionCartId,
      phone,
      firstName,
      lastName,
      contactId,
      customerId,
      loggedIn: Boolean(storeToken),
    };
  }
}
