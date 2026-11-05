import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
import { readCatalogHandoff, usableCatalogPhone } from "./store-catalog-handoff";
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
  private readonly logger = new Logger(StoreTelegramWebAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly contacts: ContactsService,
    private readonly cart: StoreCartService,
  ) {}

  async createSession(initData: string, tgAuth?: string | null): Promise<StoreTelegramWebAppSession> {
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
    let account = await this.prisma.telegramAccount.findUnique({
      where: { telegramUserId },
      select: {
        id: true,
        telegramChatId: true,
        phone: true,
        contactId: true,
        leadId: true,
        firstName: true,
        lastName: true,
      },
    });

    // First Mini App open before any bot inbound — still create a row so later links stick.
    if (!account) {
      const accountSelect = {
        id: true,
        telegramChatId: true,
        phone: true,
        contactId: true,
        leadId: true,
        firstName: true,
        lastName: true,
      } as const;
      try {
        account = await this.prisma.telegramAccount.create({
          data: {
            telegramUserId,
            telegramChatId: telegramUserId,
            firstName: parsed.user.first_name ?? null,
            lastName: parsed.user.last_name ?? null,
            username: parsed.user.username ?? null,
          },
          select: accountSelect,
        });
      } catch {
        account = await this.prisma.telegramAccount.findUnique({
          where: { telegramUserId },
          select: accountSelect,
        });
      }
    }

    const handoff = readCatalogHandoff(tgAuth);
    if (handoff && handoff.sub === telegramUserId && account) {
      const patch: { phone?: string; contactId?: string; leadId?: null } = {};
      const handoffPhone = usableCatalogPhone(handoff.phone);
      // A placeholder already stored on the account must not block the CRM phone.
      if (handoffPhone && !usableCatalogPhone(account.phone)) {
        account = { ...account, phone: handoffPhone };
        patch.phone = handoffPhone;
      }
      if (!account.contactId && handoff.contactId) {
        account = { ...account, contactId: handoff.contactId };
        patch.contactId = handoff.contactId;
        patch.leadId = null;
      }
      if (!account.firstName && handoff.firstName) {
        account = { ...account, firstName: handoff.firstName };
      }
      if (!account.lastName && handoff.lastName) {
        account = { ...account, lastName: handoff.lastName };
      }
      if (Object.keys(patch).length > 0) {
        await this.prisma.telegramAccount
          .updateMany({ where: { telegramUserId }, data: patch })
          .catch(() => undefined);
      }
    }

    const identity = await this.resolveStoreIdentity({
      telegramUserId,
      account,
      telegramFirstName: parsed.user.first_name ?? null,
      telegramLastName: parsed.user.last_name ?? null,
    });
    const phone = identity.phone;
    const contactId = identity.contactId;
    const firstName = identity.firstName;
    const lastName = identity.lastName;
    const region = identity.region;

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
      region,
    };

    const token = signJwt(payload as unknown as Record<string, unknown>, secret, {
      expiresInSeconds: WEBAPP_SESSION_TTL_SECONDS,
    });

    let storeToken: string | null = null;
    let customerId: string | null = null;

    if (contactId) {
      try {
        let customer = await this.prisma.customer.findUnique({
          where: { contactId },
          select: { id: true, contactId: true },
        });
        if (!customer) {
          try {
            customer = await this.prisma.customer.create({
              data: {
                contactId,
                email: null,
                passwordHash: hashPassword(randomBytes(24).toString("hex")),
              },
              select: { id: true, contactId: true },
            });
          } catch {
            customer = await this.prisma.customer.findUnique({
              where: { contactId },
              select: { id: true, contactId: true },
            });
          }
        }
        if (customer) {
          customerId = customer.id;
          storeToken = signJwt(
            { aud: "store", sub: customer.id, contactId: customer.contactId },
            secret,
            { expiresInSeconds: STORE_SESSION_TTL_SECONDS },
          );
          try {
            // Keep the shared tg: cart. Pull leftovers off the customer cart if an older login moved them.
            await this.cart.unifyTelegramCart(customer.id, sessionCartId);
          } catch {
            /* cart tables may be empty */
          }
        }
      } catch (err) {
        this.logger.warn(
          `store login for contact ${contactId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      token,
      storeToken,
      cartSessionId: sessionCartId,
      phone,
      firstName,
      lastName,
      region,
      contactId,
      customerId,
      loggedIn: Boolean(storeToken),
    };
  }

  /**
   * Cart already follows `tg:{userId}`. Cabinet login needs a finished CRM contact
   * (bot link or shared phone). A new phone stays a draft until onboarding writes
   * the real name, role and region — the store does not create a second card.
   */
  private async resolveStoreIdentity(params: {
    telegramUserId: string;
    account: {
      telegramChatId: string;
      phone: string | null;
      contactId: string | null;
      leadId: string | null;
      firstName: string | null;
      lastName: string | null;
    } | null;
    telegramFirstName: string | null;
    telegramLastName: string | null;
  }): Promise<{
    phone: string | null;
    contactId: string | null;
    firstName: string | null;
    lastName: string | null;
    region: string | null;
  }> {
    const { telegramUserId, account } = params;
    let phone = account?.phone ?? null;
    let contactId = account?.contactId ?? null;
    let firstName = account?.firstName ?? params.telegramFirstName;
    let lastName = account?.lastName ?? params.telegramLastName;
    let leadId = account?.leadId ?? null;
    let region: string | null = null;

    const chatIds = [account?.telegramChatId, telegramUserId].filter(
      (id, idx, arr): id is string => Boolean(id) && arr.indexOf(id) === idx,
    );
    if (!contactId) {
      for (const chatId of chatIds) {
        try {
          const conv = await this.prisma.conversation.findUnique({
            where: { telegramChatId: chatId },
            select: { contactId: true, leadId: true },
          });
          if (conv?.contactId) {
            contactId = conv.contactId;
            break;
          }
          if (!leadId && conv?.leadId) leadId = conv.leadId;
        } catch {
          /* conversation lookup is best-effort */
        }
      }
    }

    try {
      const bot = await this.prisma.telegramBotSession.findUnique({
        where: { telegramUserId },
        select: { payload: true },
      });
      const payload = (bot?.payload ?? null) as {
        onboardingContactId?: string;
        onboardingFirstName?: string;
        onboardingLastName?: string;
        region?: string;
      } | null;
      if (!contactId && payload?.onboardingContactId) contactId = payload.onboardingContactId;
      if (payload?.onboardingFirstName) firstName = firstName || payload.onboardingFirstName;
      if (payload?.onboardingLastName) lastName = lastName || payload.onboardingLastName;
      if (payload?.region?.trim()) region = payload.region.trim();
    } catch {
      /* session table is optional for login */
    }

    if (leadId) {
      try {
        const lead = await this.prisma.lead.findUnique({
          where: { id: leadId },
          select: {
            contactId: true,
            phone: true,
            firstName: true,
            lastName: true,
            region: true,
          },
        });
        if (lead) {
          if (!contactId && lead.contactId) contactId = lead.contactId;
          phone = phone ?? lead.phone ?? null;
          firstName = firstName || lead.firstName || null;
          lastName = lastName || lead.lastName || null;
          region = region ?? lead.region ?? null;
        }
      } catch {
        /* ignore */
      }
    }

    phone = usableCatalogPhone(phone);
    if (!contactId && phone) {
      contactId = await this.findContactIdByPhone(phone);
    }

    if (!contactId && phone) {
      try {
        const digits = getPhoneNormalizedDigits(phone);
        const candidates = digits ? getPhoneCandidatesForLookup(digits) : [];
        if (candidates.length > 0) {
          const lead = await this.prisma.lead.findFirst({
            where: { phoneNormalized: { in: candidates } },
            select: {
              id: true,
              contactId: true,
              phone: true,
              firstName: true,
              lastName: true,
              region: true,
            },
            orderBy: { createdAt: "desc" },
          });
          if (lead) {
            leadId = lead.id;
            if (lead.contactId) contactId = lead.contactId;
            phone = phone ?? lead.phone ?? null;
            firstName = firstName || lead.firstName || null;
            lastName = lastName || lead.lastName || null;
            region = region ?? lead.region ?? null;
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (contactId) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: contactId },
        select: { phone: true, firstName: true, lastName: true, region: true },
      });
      if (contact) {
        phone = usableCatalogPhone(contact.phone) ?? usableCatalogPhone(phone) ?? contact.phone ?? phone;
        firstName = contact.firstName?.trim() || firstName;
        lastName = contact.lastName?.trim() || lastName;
        region = contact.region?.trim() || region;
      } else {
        contactId = null;
      }
    }

    // A new phone is a draft until the bot collects name, role and region.
    // Role can be saved mid-wizard; placeholder name without a region still stays out.
    const draftProfile = firstName === "Клієнт" && lastName === "Telegram" && !region?.trim();
    const loginContactId = draftProfile ? null : contactId;

    if (contactId && contactId !== account?.contactId) {
      await this.prisma.telegramAccount.updateMany({
        where: { telegramUserId },
        data: { contactId, leadId: null, ...(phone ? { phone } : {}) },
      });
    }

    return {
      phone,
      contactId: loginContactId,
      firstName: draftProfile ? null : firstName,
      lastName: draftProfile ? null : lastName,
      region: draftProfile ? null : region,
    };
  }

  private async findContactIdByPhone(phone: string): Promise<string | null> {
    const digits = getPhoneNormalizedDigits(phone);
    const candidates = digits ? getPhoneCandidatesForLookup(digits) : [];
    for (const candidate of candidates) {
      try {
        const row = await this.contacts.findContactByPhone(candidate);
        if (row?.id) return row.id;
      } catch {
        /* ignore */
      }
    }
    const last9 = (digits ?? "").replace(/\D/g, "").slice(-9);
    if (last9.length !== 9) return null;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT c.id
          FROM "Contact" c
          LEFT JOIN "ContactPhone" p ON p."contactId" = c.id
          WHERE right(regexp_replace(COALESCE(c."phoneNormalized", ''), '[^0-9]', '', 'g'), 9) = ${last9}
             OR right(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g'), 9) = ${last9}
             OR right(regexp_replace(COALESCE(p."phoneNormalized", ''), '[^0-9]', '', 'g'), 9) = ${last9}
          ORDER BY c."createdAt" DESC
          LIMIT 1
        `,
      );
      if (rows[0]?.id) return rows[0].id;
    } catch {
      /* raw lookup is a fallback */
    }
    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT ct.id
          FROM "Company" co
          JOIN "Contact" ct ON ct."companyId" = co.id
          WHERE right(regexp_replace(COALESCE(co.phone, ''), '[^0-9]', '', 'g'), 9) = ${last9}
          ORDER BY ct."isPrimary" DESC, ct."createdAt" ASC
          LIMIT 1
        `,
      );
      return rows[0]?.id ?? null;
    } catch {
      return null;
    }
  }

}
