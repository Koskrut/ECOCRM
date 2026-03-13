// apps/backend/src/contacts/contacts.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { signJwt } from "../auth/jwt";
import { hashPassword } from "../auth/password";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePagination } from "../common/pagination";
import {
  extractNpDataFromBitrixLegacyRaw,
  bitrixNpDataToProfilePayload,
} from "./bitrix-np-mapper";

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Нормализация телефона для проверки уникальности по всей базе (только цифры). */
  private normalizePhoneForUniqueness(phone: string): string {
    return String(phone ?? "").replace(/\D/g, "");
  }

  /** Варианты номера для проверки уникальности (0XX ↔ 380XX и т.д.). */
  private getPhoneCandidatesForUniqueness(phoneNorm: string): string[] {
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

  /** Проверяет, занят ли номер другим контактом (основной или доп.). При update передать excludeContactId. */
  private async isPhoneTakenByOtherContact(
    phoneNorm: string,
    excludeContactId?: string,
  ): Promise<boolean> {
    const candidates = this.getPhoneCandidatesForUniqueness(phoneNorm);
    for (const c of candidates) {
      const contactByPrimary = await this.prisma.contact.findUnique({
        where: { phoneNormalized: c },
        select: { id: true },
      });
      if (contactByPrimary && contactByPrimary.id !== excludeContactId) return true;
      const contactPhone = await this.prisma.contactPhone.findFirst({
        where: { phoneNormalized: c },
        select: { contactId: true },
      });
      if (contactPhone && contactPhone.contactId !== excludeContactId) return true;
    }
    return false;
  }

  private assertContactAccess(contact: { ownerId: string | null }, actor: AuthUser): void {
    // Legacy contacts may have ownerId = null. Allow MANAGER to access such contacts,
    // and enforce strict ownership only when ownerId is set.
    if (actor.role === UserRole.MANAGER && contact.ownerId && contact.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access contacts assigned to you");
    }
  }

  // ===== CREATE =====
  async create(
    data: {
      companyId?: string | null;
      firstName: string;
      lastName: string;
      middleName?: string | null;
      phone: string;
      email?: string | null;
      position?: string | null;
      address?: string | null;
      lat?: number | null;
      lng?: number | null;
      googlePlaceId?: string | null;
      ownerId?: string | null;
      isPrimary?: boolean;
      externalCode?: string | null;
      region?: string | null;
      addressInfo?: string | null;
      city?: string | null;
      clientType?: string | null;
    },
    actor?: AuthUser,
  ) {
    if (!data.firstName || !data.lastName) {
      throw new BadRequestException("firstName/lastName required");
    }
    if (!data.phone) throw new BadRequestException("phone required");

    const phoneNormalized = this.normalizePhoneForUniqueness(data.phone);
    if (!phoneNormalized) throw new BadRequestException("phone must contain digits");

    if (await this.isPhoneTakenByOtherContact(phoneNormalized)) {
      throw new ConflictException("Контакт з таким номером телефону вже існує");
    }

    const ownerId = data.ownerId !== undefined ? data.ownerId : (actor?.id ?? null);

    const contact = await this.prisma.contact.create({
      data: {
        ownerId,
        companyId: data.companyId ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        middleName: data.middleName ?? null,
        phone: data.phone,
        phoneNormalized,
        email: data.email ?? null,
        position: data.position ?? null,
        address: data.address ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        googlePlaceId: data.googlePlaceId ?? null,
        isPrimary: data.isPrimary ?? false,
        externalCode: data.externalCode ?? null,
        region: data.region ?? null,
        addressInfo: data.addressInfo ?? null,
        city: data.city ?? null,
        clientType: data.clientType ?? null,
      },
      include: { company: true, owner: true },
    });

    return this.mapToEntity(contact);
  }

  // ===== LIST =====
  async list(
    params: {
      page?: number;
      pageSize?: number;
      companyId?: string;
      ownerId?: string;
      hasPhone?: boolean;
      hasEmail?: boolean;
      region?: string;
      city?: string;
      clientType?: string;
      q?: string;
    },
    actor?: AuthUser,
  ) {
    const { page, pageSize, offset, limit } = normalizePagination({
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
    });

    const andParts: Prisma.ContactWhereInput[] = [];
    if (params.hasPhone === true) {
      andParts.push({ OR: [{ phone: { not: "" } }, { phones: { some: {} } }] });
    } else if (params.hasPhone === false) {
      andParts.push({ phone: "", phones: { none: {} } });
    }
    if (params.hasEmail === true) {
      andParts.push({ email: { not: null, not: "" } });
    } else if (params.hasEmail === false) {
      andParts.push({ OR: [{ email: null }, { email: "" }] });
    }
    if (actor?.role === UserRole.MANAGER) {
      andParts.push({ OR: [{ ownerId: actor.id }, { ownerId: null }] });
    }
    const search = params.q?.trim();
    if (search) {
      const phoneDigits = search.replace(/\D/g, "");
      const searchOr: Prisma.ContactWhereInput[] = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
      if (phoneDigits.length >= 5) {
        searchOr.push({ phoneNormalized: { contains: phoneDigits } });
        searchOr.push({ phones: { some: { phoneNormalized: { contains: phoneDigits } } } });
      }
      andParts.push({ OR: searchOr });
    }
    const where: Prisma.ContactWhereInput = {
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.ownerId ? { ownerId: params.ownerId } : {}),
      ...(params.region
        ? { region: { contains: params.region, mode: "insensitive" } }
        : {}),
      ...(params.city
        ? { city: { contains: params.city, mode: "insensitive" } }
        : {}),
      ...(params.clientType
        ? { clientType: { contains: params.clientType, mode: "insensitive" } }
        : {}),
      ...(andParts.length > 0 ? { AND: andParts } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { company: true, owner: true },
      }),
      this.prisma.contact.count({ where }),
    ]);

    const contactIds = items.map((c) => c.id);
    let hasCallTodayIds = new Set<string>();
    let hasMissedCallIds = new Set<string>();

    if (contactIds.length > 0) {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const callsToday = await this.prisma.call.groupBy({
        by: ["contactId"],
        where: {
          contactId: { in: contactIds },
          startedAt: {
            gte: startOfToday,
            lte: now,
          },
        },
        _count: { _all: true },
      });
      hasCallTodayIds = new Set(callsToday.map((c) => c.contactId as string));

      const missedCalls = await this.prisma.call.groupBy({
        by: ["contactId"],
        where: {
          contactId: { in: contactIds },
          status: "MISSED",
        },
        _count: { _all: true },
      });
      hasMissedCallIds = new Set(missedCalls.map((c) => c.contactId as string));
    }

    const mapped = items.map((c) => {
      const base = this.mapToEntity(c);
      return {
        ...base,
        hasCallToday: hasCallTodayIds.has(base.id),
        hasMissedCall: hasMissedCallIds.has(base.id),
      };
    });

    return {
      items: mapped,
      total,
      page,
      pageSize,
    };
  }

  // ===== GET ONE =====
  async getById(id: string, actor?: AuthUser) {
    const [contact, lastVisit, telegramAccount] = await Promise.all([
      this.prisma.contact.findUnique({
        where: { id },
        include: { company: true, owner: true, phones: true },
      }),
      this.prisma.visit.findFirst({
        where: { contactId: id },
        orderBy: { startsAt: "desc" },
      }),
      this.prisma.telegramAccount.findFirst({
        where: { contactId: id },
        select: {
          id: true,
          username: true,
          lastMessageAt: true,
          telegramChatId: true,
        },
      }),
    ]);
    if (!contact) throw new BadRequestException("contact not found");
    if (actor) this.assertContactAccess(contact, actor);

    const entity = this.mapToEntity(contact);
    let telegramConversationId: string | null = null;
    if (telegramAccount?.telegramChatId) {
      const conv = await this.prisma.conversation.findUnique({
        where: { telegramChatId: telegramAccount.telegramChatId },
        select: { id: true },
      });
      telegramConversationId = conv?.id ?? null;
    }

    return {
      ...entity,
      phones: (contact as { phones?: { id: string; phone: string; phoneNormalized: string; label: string | null }[] })
        .phones ?? [],
      lastVisitAt: lastVisit?.startsAt ?? null,
      telegramLinked: !!telegramAccount,
      telegramUsername: telegramAccount?.username ?? null,
      telegramLastMessageAt: telegramAccount?.lastMessageAt ?? null,
      telegramConversationId,
    };
  }

  /** Reset store (shop) password for contact: set temp password and return set-password token. */
  async resetStorePassword(
    contactId: string,
    actor?: AuthUser,
  ): Promise<{ tempPassword: string; setPasswordToken: string }> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new BadRequestException("contact not found");
    if (actor) this.assertContactAccess(contact, actor);

    const customer = await this.prisma.customer.findUnique({
      where: { contactId },
    });
    if (!customer) throw new NotFoundException("У контакта нет аккаунта в магазине");

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new BadRequestException("JWT not configured");

    const tempPassword = randomBytes(12).toString("hex");
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { passwordHash: hashPassword(tempPassword) },
    });

    const setPasswordToken = signJwt(
      { contactId, purpose: "set-password", sub: customer.id },
      secret,
      { expiresInSeconds: 60 * 60 * 24 },
    );

    return { tempPassword, setPasswordToken };
  }

  /** Find contact by any phone (primary or ContactPhone). For store checkout/register. */
  async findContactByPhone(phoneNormalized: string): Promise<{ id: string } | null> {
    const contact = await this.prisma.contact.findFirst({
      where: {
        OR: [
          { phoneNormalized },
          { phones: { some: { phoneNormalized } } },
        ],
      },
      select: { id: true },
    });
    return contact;
  }

  // ===== CONTACT PHONES (additional numbers) =====
  async addPhone(
    contactId: string,
    data: { phone: string; label?: string | null },
    actor?: AuthUser,
  ) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true, phoneNormalized: true },
    });
    if (!contact) throw new BadRequestException("contact not found");
    if (actor) this.assertContactAccess(contact, actor);

    const phoneNormalized = this.normalizePhoneForUniqueness(data.phone);
    if (!phoneNormalized) throw new BadRequestException("phone must contain digits");
    if (await this.isPhoneTakenByOtherContact(phoneNormalized, contactId)) {
      throw new ConflictException("Контакт з таким номером телефону вже існує");
    }
    if (contact.phoneNormalized === phoneNormalized) {
      throw new BadRequestException("This number is already the primary phone");
    }
    const sameContactHas = await this.prisma.contactPhone.findFirst({
      where: { contactId, phoneNormalized },
    });
    if (sameContactHas) throw new BadRequestException("This number is already added to this contact");

    const created = await this.prisma.contactPhone.create({
      data: {
        contactId,
        phone: data.phone.trim(),
        phoneNormalized,
        label: data.label?.trim() || null,
      },
    });
    return { id: created.id, phone: created.phone, phoneNormalized: created.phoneNormalized, label: created.label };
  }

  async deletePhone(contactId: string, phoneId: string, actor?: AuthUser) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new BadRequestException("contact not found");
    if (actor) this.assertContactAccess(contact, actor);

    const phone = await this.prisma.contactPhone.findFirst({
      where: { id: phoneId, contactId },
    });
    if (!phone) throw new BadRequestException("phone not found");
    await this.prisma.contactPhone.delete({ where: { id: phoneId } });
    return { ok: true };
  }

  /** Set a ContactPhone as primary: swap with current Contact.phone. */
  async setPrimaryPhone(contactId: string, phoneId: string, actor?: AuthUser) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: { phones: true },
    });
    if (!contact) throw new BadRequestException("contact not found");
    if (actor) this.assertContactAccess(contact, actor);

    const target = contact.phones.find((p) => p.id === phoneId);
    if (!target) throw new BadRequestException("phone not found on this contact");

    const currentPrimaryNormalized = contact.phoneNormalized;
    const currentPrimaryPhone = contact.phone;
    if (target.phoneNormalized === currentPrimaryNormalized) {
      return { ok: true };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.contactPhone.delete({ where: { id: phoneId } });
      await tx.contact.update({
        where: { id: contactId },
        data: { phone: target.phone, phoneNormalized: target.phoneNormalized },
      });
      if (currentPrimaryNormalized && currentPrimaryPhone) {
        await tx.contactPhone.create({
          data: {
            contactId,
            phone: currentPrimaryPhone,
            phoneNormalized: currentPrimaryNormalized,
            label: "осн.",
          },
        });
      }
    });
    return { ok: true };
  }

  // ===== UPDATE =====
  async update(
    id: string,
    data: Partial<{
      companyId: string | null;
      firstName: string;
      lastName: string;
      middleName: string | null;
      phone: string;
      email: string | null;
      position: string | null;
      address: string | null;
      lat: number | null;
      lng: number | null;
      googlePlaceId: string | null;
      ownerId: string | null;
      isPrimary: boolean;
      externalCode: string | null;
      region: string | null;
      addressInfo: string | null;
      city: string | null;
      clientType: string | null;
    }>,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.contact.findUnique({
      where: { id },
      select: { id: true, ownerId: true, phoneNormalized: true },
    });
    if (!existing) throw new BadRequestException("contact not found");
    if (actor) this.assertContactAccess(existing, actor);

    if (data.phone !== undefined) {
      const phoneNormalized = this.normalizePhoneForUniqueness(data.phone);
      if (phoneNormalized && (await this.isPhoneTakenByOtherContact(phoneNormalized, id))) {
        throw new ConflictException("Контакт з таким номером телефону вже існує");
      }
    }

    const updateData: Prisma.ContactUpdateInput = { ...data };
    if (data.phone !== undefined) {
      const normalized = this.normalizePhoneForUniqueness(data.phone);
      updateData.phoneNormalized = normalized || null;
    }

    const contact = await this.prisma.contact.update({
      where: { id },
      data: updateData,
      include: { company: true, owner: true },
    });

    return this.mapToEntity(contact);
  }

  // ==========================================================
  // NP SHIPPING PROFILES
  // ==========================================================

  // LIST profiles for contact (used by TtnModal)
  async listShippingProfiles(contactId: string, actor?: AuthUser) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new BadRequestException("contact not found");
    if (actor) this.assertContactAccess(contact, actor);

    const items = await this.prisma.contactShippingProfile.findMany({
      where: { contactId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });

    return {
      items: items.map((p) => ({
        id: p.id,
        label: p.label,
        isDefault: p.isDefault,

        recipientType: p.recipientType,
        deliveryType: p.deliveryType,

        firstName: p.firstName,
        lastName: p.lastName,
        middleName: p.middleName,
        phone: p.phone,

        companyName: p.companyName,
        edrpou: p.edrpou,
        contactPersonFirstName: p.contactPersonFirstName,
        contactPersonLastName: p.contactPersonLastName,
        contactPersonMiddleName: p.contactPersonMiddleName,
        contactPersonPhone: p.contactPersonPhone,

        cityRef: p.cityRef,
        cityName: p.cityName,

        warehouseRef: p.warehouseRef,
        warehouseNumber: p.warehouseNumber,
        warehouseType: p.warehouseType,

        streetRef: p.streetRef,
        streetName: p.streetName,
        building: p.building,
        flat: p.flat,

        npCounterpartyRef: p.npCounterpartyRef,
        npContactPersonRef: p.npContactPersonRef,
        npAddressRef: p.npAddressRef,

        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    };
  }

  /** Create one NP shipping profile from Bitrix contact legacyRaw (НОВАЯ ПОЧТА section). */
  async createShippingProfileFromBitrix(contactId: string, actor?: AuthUser) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true, legacySource: true, legacyRaw: true },
    });
    if (!contact) throw new BadRequestException("contact not found");
    if (actor) this.assertContactAccess(contact, actor);
    if (contact.legacySource !== "bitrix" || !contact.legacyRaw) {
      throw new BadRequestException(
        "Contact has no Bitrix data (legacySource=bitrix and legacyRaw required)",
      );
    }
    const raw = contact.legacyRaw as Record<string, unknown> | null;
    const npData = extractNpDataFromBitrixLegacyRaw(raw);
    if (!npData) {
      throw new BadRequestException(
        "No Nova Poshta fields found in Bitrix contact data (recipient, phone, city, or warehouse)",
      );
    }
    const body = bitrixNpDataToProfilePayload(npData);
    return this.createShippingProfile(contactId, body, actor);
  }

  // CREATE new profile for contact (optional, but handy for future UI)
  async createShippingProfile(
    contactId: string,
    body: Record<string, unknown>,
    actor?: AuthUser,
  ) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new BadRequestException("contact not found");
    if (actor) this.assertContactAccess(contact, actor);

    if (!body?.recipientType) throw new BadRequestException("recipientType required");
    if (!body?.deliveryType) throw new BadRequestException("deliveryType required");
    if (!body?.label) throw new BadRequestException("label required");

    const created = await this.prisma.contactShippingProfile.create({
      data: {
        contactId,
        label: String(body.label),
        isDefault: Boolean(body.isDefault ?? false),

        recipientType: body.recipientType as "PERSON" | "COMPANY",
        deliveryType: body.deliveryType as "WAREHOUSE" | "POSTOMAT" | "ADDRESS",

        firstName: body.firstName != null ? String(body.firstName) : null,
        lastName: body.lastName != null ? String(body.lastName) : null,
        middleName: body.middleName != null ? String(body.middleName) : null,
        phone: body.phone != null ? String(body.phone) : null,

        companyName: body.companyName != null ? String(body.companyName) : null,
        edrpou: body.edrpou != null ? String(body.edrpou) : null,
        contactPersonFirstName:
          body.contactPersonFirstName != null ? String(body.contactPersonFirstName) : null,
        contactPersonLastName:
          body.contactPersonLastName != null ? String(body.contactPersonLastName) : null,
        contactPersonMiddleName:
          body.contactPersonMiddleName != null ? String(body.contactPersonMiddleName) : null,
        contactPersonPhone:
          body.contactPersonPhone != null ? String(body.contactPersonPhone) : null,

        cityRef: body.cityRef != null ? String(body.cityRef) : null,
        cityName: body.cityName != null ? String(body.cityName) : null,

        warehouseRef: body.warehouseRef != null ? String(body.warehouseRef) : null,
        warehouseNumber: body.warehouseNumber != null ? String(body.warehouseNumber) : null,
        warehouseType: body.warehouseType != null ? String(body.warehouseType) : null,

        streetRef: body.streetRef != null ? String(body.streetRef) : null,
        streetName: body.streetName != null ? String(body.streetName) : null,
        building: body.building != null ? String(body.building) : null,
        flat: body.flat != null ? String(body.flat) : null,

        npCounterpartyRef: body.npCounterpartyRef != null ? String(body.npCounterpartyRef) : null,
        npContactPersonRef:
          body.npContactPersonRef != null ? String(body.npContactPersonRef) : null,
        npAddressRef: body.npAddressRef != null ? String(body.npAddressRef) : null,
      },
    });

    return { item: created };
  }

  async updateShippingProfile(
    contactId: string,
    profileId: string,
    body: Record<string, unknown>,
    actor?: AuthUser,
  ) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new BadRequestException("contact not found");
    if (actor) this.assertContactAccess(contact, actor);

    const existing = await this.prisma.contactShippingProfile.findFirst({
      where: { id: profileId, contactId },
    });
    if (!existing) throw new BadRequestException("shipping profile not found");

    await this.prisma.contactShippingProfile.update({
      where: { id: profileId },
      data: {
        ...(body.label != null && { label: String(body.label) }),
        ...(body.isDefault !== undefined && { isDefault: Boolean(body.isDefault) }),
        ...(body.recipientType != null && { recipientType: body.recipientType as "PERSON" | "COMPANY" }),
        ...(body.deliveryType != null && {
          deliveryType: body.deliveryType as "WAREHOUSE" | "POSTOMAT" | "ADDRESS",
        }),
        ...(body.firstName !== undefined && { firstName: body.firstName != null ? String(body.firstName) : null }),
        ...(body.lastName !== undefined && { lastName: body.lastName != null ? String(body.lastName) : null }),
        ...(body.phone !== undefined && { phone: body.phone != null ? String(body.phone) : null }),
        ...(body.cityRef !== undefined && { cityRef: body.cityRef != null ? String(body.cityRef) : null }),
        ...(body.cityName !== undefined && { cityName: body.cityName != null ? String(body.cityName) : null }),
        ...(body.warehouseRef !== undefined && {
          warehouseRef: body.warehouseRef != null ? String(body.warehouseRef) : null,
        }),
        ...(body.warehouseNumber !== undefined && {
          warehouseNumber: body.warehouseNumber != null ? String(body.warehouseNumber) : null,
        }),
      },
    });
    return { ok: true };
  }

  async deleteShippingProfile(contactId: string, profileId: string, actor?: AuthUser) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new BadRequestException("contact not found");
    if (actor) this.assertContactAccess(contact, actor);

    const existing = await this.prisma.contactShippingProfile.findFirst({
      where: { id: profileId, contactId },
    });
    if (!existing) throw new BadRequestException("shipping profile not found");

    await this.prisma.contactShippingProfile.delete({ where: { id: profileId } });
    return { ok: true };
  }

  // ===== MAPPER =====
  private mapToEntity(
    contact: Prisma.ContactGetPayload<{ include: { company: true; owner: true } }>,
  ) {
    return {
      id: contact.id,
      ownerId: contact.ownerId ?? null,
      companyId: contact.companyId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
      phoneNormalized: contact.phoneNormalized ?? null,
      email: contact.email,
      position: contact.position,
      address: contact.address ?? null,
      lat: contact.lat ?? null,
      lng: contact.lng ?? null,
      googlePlaceId: contact.googlePlaceId ?? null,
      isPrimary: contact.isPrimary,
      externalCode: contact.externalCode ?? null,
      region: contact.region ?? null,
      addressInfo: contact.addressInfo ?? null,
      city: contact.city ?? null,
      clientType: contact.clientType ?? null,
      company: contact.company
        ? {
            id: contact.company.id,
            name: contact.company.name,
            edrpou: contact.company.edrpou,
            taxId: contact.company.taxId,
          }
        : null,
      owner: contact.owner
        ? { id: contact.owner.id, fullName: contact.owner.fullName, email: contact.owner.email }
        : null,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }
}
