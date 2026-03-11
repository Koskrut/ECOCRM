import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { ContactsService } from "../../contacts/contacts.service";
import { TelegramService } from "../../integrations/telegram/telegram.service";
import { PrismaService } from "../../prisma/prisma.service";
import { signJwt } from "../../auth/jwt";
import { hashPassword, verifyPassword, needsRehash } from "../../auth/password";
import type { StoreLoginDto } from "./dto/store-login.dto";
import type { StoreRegisterDto } from "./dto/store-register.dto";

function normalizePhone(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/** Returns candidate normalized strings for contact lookup (e.g. 0994444815 and 380994444815). */
function getPhoneCandidatesForLookup(phoneNorm: string): string[] {
  const candidates = new Set<string>();
  candidates.add(phoneNorm);
  if (phoneNorm.length === 10 && phoneNorm.startsWith("0")) {
    candidates.add("38" + phoneNorm);
  }
  if (phoneNorm.length === 9 && phoneNorm.startsWith("9")) {
    candidates.add("0" + phoneNorm);
    candidates.add("380" + phoneNorm);
  }
  if (phoneNorm.length === 12 && phoneNorm.startsWith("380")) {
    candidates.add("0" + phoneNorm.slice(3));
  }
  return Array.from(candidates);
}

const RESET_CODE_TTL_MINUTES = 15;
const RESET_CODE_LENGTH = 6;

export type StoreAuthResponse = {
  token: string;
  customer: {
    customerId: string;
    contactId: string;
  };
};

export type StoreLoginFailure = {
  ok: false;
  message: string;
  __debug: {
    phoneNorm: string;
    candidates: string[];
    tried: Array<{ candidate: string; contactId: string | null; customerId: string | null; passwordOk: boolean }>;
    rawPhone?: string;
  };
};

@Injectable()
export class StoreAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contactsService: ContactsService,
    private readonly telegram: TelegramService,
  ) {}

  async register(dto: StoreRegisterDto): Promise<StoreAuthResponse> {
    const phoneNorm = normalizePhone(dto.phone);
    if (!phoneNorm || phoneNorm.length < 5) {
      throw new ConflictException("Invalid phone number");
    }

    const phoneCandidates = getPhoneCandidatesForLookup(phoneNorm);
    let contact: { id: string } | null = null;
    for (const candidate of phoneCandidates) {
      contact = await this.contactsService.findContactByPhone(candidate);
      if (contact) break;
    }
    const [firstName, ...lastParts] = (dto.firstName ?? "").trim().split(/\s+/);
    const lastName = (dto.lastName ?? lastParts.join(" ")).trim() || firstName || "—";
    const email = dto.email?.trim() || null;

    if (!contact) {
      contact = await this.contactsService.create(
        {
          firstName: firstName || "—",
          lastName: lastName || "—",
          phone: dto.phone.trim(),
          email,
        },
        undefined,
      ) as { id: string };
    } else {
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: {
          firstName: firstName || "—",
          lastName: lastName || "—",
          email,
        },
      });
    }

    const existingCustomer = await this.prisma.customer.findUnique({
      where: { contactId: contact.id },
    });
    if (existingCustomer) {
      throw new ConflictException("An account already exists for this phone number");
    }

    const customer = await this.prisma.customer.create({
      data: {
        contactId: contact.id,
        email: dto.email?.trim() || null,
        passwordHash: hashPassword(dto.password),
      },
    });

    const token = this.buildToken(customer.id, customer.contactId);
    return {
      token,
      customer: { customerId: customer.id, contactId: customer.contactId },
    };
  }

  async login(dto: StoreLoginDto): Promise<StoreAuthResponse | StoreLoginFailure> {
    const rawPhone = typeof dto.phone === "string" ? dto.phone.trim() : "";
    const phoneNorm = normalizePhone(rawPhone);
    if (!phoneNorm) {
      return {
        ok: false,
        message: "Invalid phone or password",
        __debug: { phoneNorm: "", candidates: [], tried: [], rawPhone: String(dto.phone ?? "") },
      };
    }
    const password = (dto.password ?? "").trim();

    const phoneCandidates = getPhoneCandidatesForLookup(phoneNorm);
    const seenCustomerIds = new Set<string>();
    let matchedCustomer: { id: string; contactId: string; passwordHash: string } | null = null;
    const tried: { candidate: string; contactId: string | null; customerId: string | null; passwordOk: boolean }[] = [];
    for (const candidate of phoneCandidates) {
      const c = await this.contactsService.findContactByPhone(candidate);
      if (!c) continue;
      const cust = await this.prisma.customer.findUnique({
        where: { contactId: c.id },
      });
      if (!cust || seenCustomerIds.has(cust.id)) continue;
      seenCustomerIds.add(cust.id);
      const passwordOk = verifyPassword(password, cust.passwordHash);
      tried.push({ candidate, contactId: c.id, customerId: cust.id, passwordOk });
      if (passwordOk) {
        matchedCustomer = cust;
        break;
      }
    }
    if (!matchedCustomer) {
      const debug = { phoneNorm, candidates: phoneCandidates, tried };
      return { ok: false, message: "Invalid phone or password", __debug: debug };
    }
    const customer = matchedCustomer;

    if (needsRehash(customer.passwordHash)) {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: { passwordHash: hashPassword(dto.password) },
      });
    }

    const token = this.buildToken(customer.id, customer.contactId);
    return {
      token,
      customer: { customerId: customer.id, contactId: customer.contactId },
    };
  }

  private buildToken(customerId: string, contactId: string): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");
    return signJwt(
      {
        sub: customerId,
        contactId,
        aud: "store",
      },
      secret,
      { expiresInSeconds: 60 * 60 * 24 * 7 },
    );
  }

  async requestPasswordReset(phone: string): Promise<{ sentVia: "telegram"; message: string }> {
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm || phoneNorm.length < 5) {
      throw new BadRequestException("Введіть коректний номер телефону");
    }

    const phoneCandidates = getPhoneCandidatesForLookup(phoneNorm);
    let contact: { id: string } | null = null;
    let customer: { id: string } | null = null;
    for (const candidate of phoneCandidates) {
      const c = await this.contactsService.findContactByPhone(candidate);
      if (!c) continue;
      const cust = await this.prisma.customer.findUnique({
        where: { contactId: c.id },
        select: { id: true },
      });
      if (cust) {
        contact = c;
        customer = cust;
        break;
      }
      if (!contact) contact = c;
    }
    if (!contact) {
      throw new BadRequestException("Номер не знайдено. Зареєструйтеся або зверніться до менеджера.");
    }

    if (!customer) {
      let telegramChatIdForNew: string | null =
        (await this.prisma.telegramAccount.findFirst({
          where: { contactId: contact.id },
          select: { telegramChatId: true },
        }))?.telegramChatId ?? null;
      if (!telegramChatIdForNew) {
        const conv = await this.prisma.conversation.findFirst({
          where: { contactId: contact.id },
          select: { telegramChatId: true },
        });
        telegramChatIdForNew = conv?.telegramChatId ?? null;
      }
      if (!telegramChatIdForNew) {
        const contactData = await this.prisma.contact.findUnique({
          where: { id: contact.id },
          select: { phoneNormalized: true, phones: { select: { phoneNormalized: true } } },
        });
        const contactNormals = new Set<string>();
        if (contactData?.phoneNormalized) contactNormals.add(contactData.phoneNormalized);
        contactData?.phones?.forEach((p) => {
          if (p.phoneNormalized) contactNormals.add(p.phoneNormalized);
        });
        if (contactNormals.size > 0) {
          const accountsWithPhone = await this.prisma.telegramAccount.findMany({
            where: { phone: { not: null } },
            select: { phone: true, telegramChatId: true },
          });
          const byPhone = accountsWithPhone.find(
            (a) => a.phone && contactNormals.has(normalizePhone(a.phone)),
          );
          if (byPhone?.telegramChatId) telegramChatIdForNew = byPhone.telegramChatId;
        }
      }
      if (telegramChatIdForNew) {
        customer = await this.prisma.customer.create({
          data: {
            contactId: contact.id,
            email: null,
            passwordHash: hashPassword(randomBytes(24).toString("hex")),
          },
        });
      } else {
        throw new BadRequestException(
          "У магазині немає акаунту з цим номером. Зареєструйтеся або зверніться до менеджера.",
        );
      }
    }

    let telegramChatId: string | null =
      (await this.prisma.telegramAccount.findFirst({
        where: { contactId: contact.id },
        select: { telegramChatId: true },
      }))?.telegramChatId ?? null;

    if (!telegramChatId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { contactId: contact.id },
        select: { telegramChatId: true },
      });
      telegramChatId = conversation?.telegramChatId ?? null;
    }

    if (!telegramChatId) {
      const contactData = await this.prisma.contact.findUnique({
        where: { id: contact.id },
        select: { phoneNormalized: true, phones: { select: { phoneNormalized: true } } },
      });
      const contactNormals = new Set<string>();
      if (contactData?.phoneNormalized) contactNormals.add(contactData.phoneNormalized);
      contactData?.phones?.forEach((p) => {
        if (p.phoneNormalized) contactNormals.add(p.phoneNormalized);
      });
      if (contactNormals.size > 0) {
        const accountsWithPhone = await this.prisma.telegramAccount.findMany({
          where: { phone: { not: null } },
          select: { phone: true, telegramChatId: true },
        });
        const byPhone = accountsWithPhone.find(
          (a) => a.phone && contactNormals.has(normalizePhone(a.phone)),
        );
        if (byPhone?.telegramChatId) telegramChatId = byPhone.telegramChatId;
      }
    }

    if (!telegramChatId) {
      throw new BadRequestException("До цього контакту не привʼязано Telegram. Зверніться до менеджера магазину.");
    }

    const code = randomBytes(3).readUIntBE(0, 3) % 1_000_000;
    const codeStr = code.toString().padStart(RESET_CODE_LENGTH, "0");
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000);

    await this.prisma.storePasswordResetCode.deleteMany({ where: { customerId: customer.id } });
    await this.prisma.storePasswordResetCode.create({
      data: { customerId: customer.id, code: codeStr, expiresAt },
    });

    try {
      await this.telegram.sendMessageToChat(
        telegramChatId,
        `Код для скидання пароля: ${codeStr}\nДійсний ${RESET_CODE_TTL_MINUTES} хв.`,
      );
    } catch {
      throw new BadRequestException("Не вдалося надіслати код у Telegram. Спробуйте пізніше або зверніться до менеджера.");
    }

    return {
      sentVia: "telegram",
      message: "Код надіслано в Telegram.",
    };
  }

  async confirmPasswordReset(phone: string, code: string, newPassword: string): Promise<{ ok: true }> {
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm) throw new BadRequestException("Введіть номер телефону");
    if (!code?.trim()) throw new BadRequestException("Введіть код");
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException("Пароль має бути не менше 6 символів");
    }

    const phoneCandidates = getPhoneCandidatesForLookup(phoneNorm);
    const customerIdsByPhone = new Set<string>();
    for (const candidate of phoneCandidates) {
      const c = await this.contactsService.findContactByPhone(candidate);
      if (!c) continue;
      const cust = await this.prisma.customer.findUnique({
        where: { contactId: c.id },
        select: { id: true },
      });
      if (cust) customerIdsByPhone.add(cust.id);
    }
    if (customerIdsByPhone.size === 0) throw new UnauthorizedException("Невірний або прострочений код");

    const now = new Date();
    const row = await this.prisma.storePasswordResetCode.findFirst({
      where: {
        customerId: { in: Array.from(customerIdsByPhone) },
        code: code.trim(),
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      include: { customer: true },
    });
    if (!row) throw new UnauthorizedException("Невірний або прострочений код");

    await this.prisma.storePasswordResetCode.deleteMany({ where: { customerId: row.customerId } });
    await this.prisma.customer.update({
      where: { id: row.customerId },
      data: { passwordHash: hashPassword(newPassword) },
    });

    return { ok: true };
  }
}
