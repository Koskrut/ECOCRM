// apps/backend/src/contacts/contacts.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomInt } from "crypto";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { signJwt } from "../auth/jwt";
import { hashPassword } from "../auth/password";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePagination } from "../common/pagination";
import {
  getPhoneNormalizedDigits,
  normalizePhoneToE164,
} from "../common/phone.utils";
import {
  extractNpDataFromBitrixLegacyRaw,
  bitrixNpDataToProfilePayload,
} from "./bitrix-np-mapper";
import { ContactAccessService } from "./contact-access.service";

export type ContactChangeHistoryValue = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

export type ContactChangeHistoryItem = {
  id: string;
  contactId: string;
  changedBy: string | null;
  changedByUser: { id: string; fullName: string; email: string } | null;
  action: string;
  payload: ContactChangeHistoryValue[];
  createdAt: string;
};

export type ContactTimelineItem = {
  id: string;
  source: "ACTIVITY" | "TASK" | "AUDIT";
  type: string;
  title: string;
  body: string;
  occurredAt: string;
  createdAt: string;
  pinnedAt?: string | null;
  createdBy: string;
  createdByName?: string | null;
  call?: {
    direction?: string;
    status?: string;
    durationSec?: number | null;
    recordingStatus?: string | null;
    recordingUrl?: string | null;
    startedAt?: string;
    from?: string;
    to?: string;
  };
  task?: {
    status: string;
    dueAt?: string | null;
    completedAt?: string | null;
    assigneeId: string;
    assigneeName?: string | null;
  };
  audit?: {
    action: string;
    payload: ContactChangeHistoryValue[];
  };
};

type ContactWithHistoryRelations = Prisma.ContactGetPayload<{ include: { company: true; owner: true } }>;

const CONTACT_HISTORY_FIELDS = [
  "companyId",
  "ownerId",
  "firstName",
  "lastName",
  "middleName",
  "phone",
  "email",
  "position",
  "address",
  "lat",
  "lng",
  "googlePlaceId",
  "isPrimary",
  "externalCode",
  "documentDisplayName",
  "region",
  "addressInfo",
  "city",
  "clientType",
  "status",
  "marketingCallOptOut",
] as const;

const CONTACT_SENSITIVE_UPDATE_FIELDS = ["ownerId", "companyId"] as const;

type ContactHistoryField = (typeof CONTACT_HISTORY_FIELDS)[number];
type ContactSensitiveUpdateField = (typeof CONTACT_SENSITIVE_UPDATE_FIELDS)[number];

type ContactHistorySnapshot = {
  companyId: string | null;
  companyName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  isPrimary: boolean;
  externalCode: string | null;
  documentDisplayName: string | null;
  region: string | null;
  addressInfo: string | null;
  city: string | null;
  clientType: string | null;
  status: string | null;
  marketingCallOptOut: boolean;
};

function isContactHistoryField(value: string): value is ContactHistoryField {
  return (CONTACT_HISTORY_FIELDS as readonly string[]).includes(value);
}

function isSensitiveContactUpdateField(value: ContactHistoryField): value is ContactSensitiveUpdateField {
  return (CONTACT_SENSITIVE_UPDATE_FIELDS as readonly string[]).includes(value);
}

function historyValueToString(value: string | number | boolean | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  private logGetCardSuccess(args: {
    contactId: string;
    actor?: AuthUser;
    startedAt: number;
    canonicalTotal: number;
    canonicalVisibleCount: number;
    legacyTotal: number;
    companyTotal: number;
  }) {
    const payload = {
      event: "contact_card_get",
      outcome: "ok",
      statusCode: 200,
      contactId: args.contactId,
      actorId: args.actor?.id ?? null,
      role: args.actor?.role ?? null,
      durationMs: Date.now() - args.startedAt,
      canonicalTotal: args.canonicalTotal,
      canonicalVisibleCount: args.canonicalVisibleCount,
      legacyTotal: args.legacyTotal,
      companyTotal: args.companyTotal,
      partialData: args.canonicalTotal > args.canonicalVisibleCount,
    };
    this.logger.log(JSON.stringify(payload));
  }

  private logGetCardFailure(args: {
    contactId: string;
    actor?: AuthUser;
    startedAt: number;
    error: unknown;
  }) {
    const statusCode =
      args.error instanceof ForbiddenException
        ? 403
        : args.error instanceof BadRequestException
          ? 400
          : args.error instanceof NotFoundException
            ? 404
            : 500;
    const payload = {
      event: "contact_card_get",
      outcome: statusCode === 403 ? "forbidden" : "error",
      statusCode,
      contactId: args.contactId,
      actorId: args.actor?.id ?? null,
      role: args.actor?.role ?? null,
      durationMs: Date.now() - args.startedAt,
      errorMessage: args.error instanceof Error ? args.error.message : String(args.error),
    };
    this.logger.warn(JSON.stringify(payload));
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactAccess: ContactAccessService,
  ) {}

  private toContactHistorySnapshot(contact: ContactWithHistoryRelations): ContactHistorySnapshot {
    return {
      companyId: contact.companyId ?? null,
      companyName: contact.company?.name ?? null,
      ownerId: contact.ownerId ?? null,
      ownerName: contact.owner?.fullName ?? null,
      firstName: contact.firstName ?? null,
      lastName: contact.lastName ?? null,
      middleName: contact.middleName ?? null,
      phone: contact.phone ?? null,
      email: contact.email ?? null,
      position: contact.position ?? null,
      address: contact.address ?? null,
      lat: contact.lat ?? null,
      lng: contact.lng ?? null,
      googlePlaceId: contact.googlePlaceId ?? null,
      isPrimary: contact.isPrimary,
      externalCode: contact.externalCode ?? null,
      documentDisplayName: contact.documentDisplayName ?? null,
      region: contact.region ?? null,
      addressInfo: contact.addressInfo ?? null,
      city: contact.city ?? null,
      clientType: contact.clientType ?? null,
      status: contact.status ?? null,
      marketingCallOptOut: contact.marketingCallOptOut,
    };
  }

  private getContactHistoryFieldValue(
    snapshot: ContactHistorySnapshot,
    field: ContactHistoryField,
  ): string | null {
    switch (field) {
      case "companyId":
        return historyValueToString(snapshot.companyName ?? snapshot.companyId);
      case "ownerId":
        return historyValueToString(snapshot.ownerName ?? snapshot.ownerId);
      case "firstName":
        return historyValueToString(snapshot.firstName);
      case "lastName":
        return historyValueToString(snapshot.lastName);
      case "middleName":
        return historyValueToString(snapshot.middleName);
      case "phone":
        return historyValueToString(snapshot.phone);
      case "email":
        return historyValueToString(snapshot.email);
      case "position":
        return historyValueToString(snapshot.position);
      case "address":
        return historyValueToString(snapshot.address);
      case "lat":
        return historyValueToString(snapshot.lat);
      case "lng":
        return historyValueToString(snapshot.lng);
      case "googlePlaceId":
        return historyValueToString(snapshot.googlePlaceId);
      case "isPrimary":
        return historyValueToString(snapshot.isPrimary);
      case "externalCode":
        return historyValueToString(snapshot.externalCode);
      case "documentDisplayName":
        return historyValueToString(snapshot.documentDisplayName);
      case "region":
        return historyValueToString(snapshot.region);
      case "addressInfo":
        return historyValueToString(snapshot.addressInfo);
      case "city":
        return historyValueToString(snapshot.city);
      case "clientType":
        return historyValueToString(snapshot.clientType);
      case "status":
        return historyValueToString(snapshot.status);
      case "marketingCallOptOut":
        return historyValueToString(snapshot.marketingCallOptOut);
    }
  }

  private buildCreatedContactHistoryPayload(
    snapshot: ContactHistorySnapshot,
  ): ContactChangeHistoryValue[] {
    return CONTACT_HISTORY_FIELDS.flatMap((field) => {
      const value = this.getContactHistoryFieldValue(snapshot, field);
      if (value == null || value === "false") {
        return [];
      }
      return [{ field, oldValue: null, newValue: value }];
    });
  }

  private buildUpdatedContactHistoryPayload(args: {
    before: ContactHistorySnapshot;
    after: ContactHistorySnapshot;
    changedFields: ContactHistoryField[];
  }): ContactChangeHistoryValue[] {
    return args.changedFields.flatMap((field) => {
      const oldValue = this.getContactHistoryFieldValue(args.before, field);
      const newValue = this.getContactHistoryFieldValue(args.after, field);
      if (oldValue === newValue) {
        return [];
      }
      return [{ field, oldValue, newValue }];
    });
  }

  private async appendContactHistory(args: {
    contactId: string;
    action: string;
    payload: ContactChangeHistoryValue[];
    actor?: AuthUser;
  }): Promise<void> {
    if (args.payload.length === 0) {
      return;
    }
    await this.prisma.contactChangeHistory.create({
      data: {
        contactId: args.contactId,
        changedBy: args.actor?.id ?? null,
        action: args.action,
        payload: args.payload as Prisma.InputJsonValue,
      },
    });
  }

  private async appendSensitiveContactHistoryForUpdate(args: {
    contactId: string;
    before: ContactHistorySnapshot;
    after: ContactHistorySnapshot;
    changedFields: ContactHistoryField[];
    actor?: AuthUser;
  }): Promise<void> {
    const sensitiveFields = args.changedFields.filter(isSensitiveContactUpdateField);
    for (const field of sensitiveFields) {
      const payload = this.buildUpdatedContactHistoryPayload({
        before: args.before,
        after: args.after,
        changedFields: [field],
      });
      await this.appendContactHistory({
        contactId: args.contactId,
        action: field === "ownerId" ? "OWNER_CHANGED" : "COMPANY_RELINKED",
        payload,
        actor: args.actor,
      });
    }
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
      documentDisplayName?: string | null;
      region?: string | null;
      addressInfo?: string | null;
      city?: string | null;
      clientType?: string | null;
      status?: string | null;
    },
    actor?: AuthUser,
  ) {
    if (!data.firstName || !data.lastName) {
      throw new BadRequestException("firstName/lastName required");
    }
    if (!data.phone) throw new BadRequestException("phone required");

    const phoneNormalized = getPhoneNormalizedDigits(data.phone);
    if (!phoneNormalized) throw new BadRequestException("phone must contain digits");

    if (await this.isPhoneTakenByOtherContact(phoneNormalized)) {
      throw new ConflictException("Контакт з таким номером телефону вже існує");
    }

    const ownerId = data.ownerId !== undefined ? data.ownerId : (actor?.id ?? null);

    if (actor?.role === UserRole.LEAD && ownerId) {
      await this.contactAccess.assertLeadCanAssignOwner(ownerId, actor.id);
    }

    const phoneCanonical = normalizePhoneToE164(data.phone) ?? data.phone.trim();
    const contact = await this.prisma.contact.create({
      data: {
        ownerId,
        companyId: data.companyId ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        middleName: data.middleName ?? null,
        phone: phoneCanonical,
        phoneNormalized,
        email: data.email ?? null,
        position: data.position ?? null,
        address: data.address ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        googlePlaceId: data.googlePlaceId ?? null,
        isPrimary: data.isPrimary ?? false,
        externalCode: data.externalCode ?? null,
        documentDisplayName: data.documentDisplayName ?? null,
        region: data.region ?? null,
        addressInfo: data.addressInfo ?? null,
        city: data.city ?? null,
        clientType: data.clientType ?? null,
        status: data.status ?? null,
      },
      include: { company: true, owner: true },
    });

    await this.appendContactHistory({
      contactId: contact.id,
      action: "CREATED",
      payload: this.buildCreatedContactHistoryPayload(this.toContactHistorySnapshot(contact)),
      actor,
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
      status?: string;
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
      andParts.push({
        AND: [{ email: { not: null } }, { email: { not: "" } }],
      });
    } else if (params.hasEmail === false) {
      andParts.push({ OR: [{ email: null }, { email: "" }] });
    }
    if (actor?.role === UserRole.MANAGER) {
      andParts.push(this.contactAccess.managerContactListWhere(actor.id));
    } else if (actor?.role === UserRole.LEAD) {
      const team = await this.contactAccess.getTeamUserIds(actor.id);
      andParts.push(this.contactAccess.leadContactListWhere(team));
    }
    const search = params.q?.trim();
    if (search) {
      const phoneDigits = search.replace(/\D/g, "");
      const tokens = search.split(/\s+/).filter(Boolean);
      const searchOr: Prisma.ContactWhereInput[] = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { middleName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { company: { name: { contains: search, mode: "insensitive" } } },
      ];
      if (tokens.length === 2) {
        const [a, b] = [tokens[0]!, tokens[1]!];
        searchOr.push({
          AND: [
            { firstName: { contains: a, mode: "insensitive" } },
            { lastName: { contains: b, mode: "insensitive" } },
          ],
        });
        searchOr.push({
          AND: [
            { firstName: { contains: b, mode: "insensitive" } },
            { lastName: { contains: a, mode: "insensitive" } },
          ],
        });
      } else if (tokens.length > 2) {
        const first = tokens[0]!;
        const last = tokens[tokens.length - 1]!;
        const middleJoined = tokens.slice(1, -1).join(" ");
        searchOr.push({
          AND: [
            { firstName: { contains: first, mode: "insensitive" } },
            { lastName: { contains: last, mode: "insensitive" } },
            { middleName: { contains: middleJoined, mode: "insensitive" } },
          ],
        });
        searchOr.push({
          AND: [
            { firstName: { contains: first, mode: "insensitive" } },
            { lastName: { contains: last, mode: "insensitive" } },
          ],
        });
      }
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
      ...(params.status
        ? { status: { contains: params.status, mode: "insensitive" } }
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
    if (actor) await this.contactAccess.assertCanViewContact({ id: contact.id, ownerId: contact.ownerId }, actor);

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
    if (actor) await this.contactAccess.assertCanViewContact({ id: contact.id, ownerId: contact.ownerId }, actor);

    const customer = await this.prisma.customer.findUnique({
      where: { contactId },
    });
    if (!customer) throw new NotFoundException("У контакта нет аккаунта в магазине");

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new BadRequestException("JWT not configured");

    /** Short numeric temp password for handoff (6 digits, easy to read aloud). */
    const tempPassword = String(randomInt(100_000, 1_000_000));
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { passwordHash: hashPassword(tempPassword) },
    });

    const setPasswordToken = signJwt(
      { contactId, purpose: "set-password", sub: customer.id },
      secret,
      { expiresInSeconds: 60 * 60 * 24 },
    );

    await this.appendContactHistory({
      contactId,
      action: "RESET_STORE_PASSWORD",
      payload: [{ field: "storePasswordReset", oldValue: null, newValue: "issued" }],
      actor,
    });

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
    if (actor) await this.contactAccess.assertCanViewContact({ id: contact.id, ownerId: contact.ownerId }, actor);

    const phoneNormalized = getPhoneNormalizedDigits(data.phone);
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

    const phoneCanonical = normalizePhoneToE164(data.phone) ?? data.phone.trim();
    const created = await this.prisma.contactPhone.create({
      data: {
        contactId,
        phone: phoneCanonical,
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
    if (actor) await this.contactAccess.assertCanViewContact({ id: contact.id, ownerId: contact.ownerId }, actor);

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
    if (actor) await this.contactAccess.assertCanViewContact({ id: contact.id, ownerId: contact.ownerId }, actor);

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
      documentDisplayName: string | null;
      region: string | null;
      addressInfo: string | null;
      city: string | null;
      clientType: string | null;
      status: string | null;
      marketingCallOptOut: boolean;
    }>,
    actor?: AuthUser,
  ) {
    const existing = await this.prisma.contact.findUnique({
      where: { id },
      include: { company: true, owner: true },
    });
    if (!existing) throw new BadRequestException("contact not found");
    if (actor) await this.contactAccess.assertCanViewContact({ id: existing.id, ownerId: existing.ownerId }, actor);

    if (actor && data.ownerId !== undefined) {
      if (actor.role === UserRole.MANAGER && (data.ownerId ?? null) !== (existing.ownerId ?? null)) {
        throw new ForbiddenException("Managers cannot change contact owner");
      }
      if (actor.role === UserRole.LEAD) {
        await this.contactAccess.assertLeadCanAssignOwner(data.ownerId ?? null, actor.id);
      }
    }

    if (data.phone !== undefined) {
      const phoneNormalized = getPhoneNormalizedDigits(data.phone);
      if (phoneNormalized && (await this.isPhoneTakenByOtherContact(phoneNormalized, id))) {
        throw new ConflictException("Контакт з таким номером телефону вже існує");
      }
    }

    const updateData: Prisma.ContactUpdateInput = { ...data };
    if (data.phone !== undefined) {
      const phoneNormalized = getPhoneNormalizedDigits(data.phone);
      const phoneCanonical = normalizePhoneToE164(data.phone);
      updateData.phoneNormalized = phoneNormalized ?? null;
      updateData.phone = phoneCanonical ?? data.phone;
    }

    const contact = await this.prisma.contact.update({
      where: { id },
      data: updateData,
      include: { company: true, owner: true },
    });

    const changedFields = Object.keys(data).filter(isContactHistoryField);
    const nonSensitiveChangedFields = changedFields.filter((field) => !isSensitiveContactUpdateField(field));
    const beforeSnapshot = this.toContactHistorySnapshot(existing);
    const afterSnapshot = this.toContactHistorySnapshot(contact);
    await this.appendContactHistory({
      contactId: id,
      action: "UPDATED",
      payload: this.buildUpdatedContactHistoryPayload({
        before: beforeSnapshot,
        after: afterSnapshot,
        changedFields: nonSensitiveChangedFields,
      }),
      actor,
    });
    await this.appendSensitiveContactHistoryForUpdate({
      contactId: id,
      before: beforeSnapshot,
      after: afterSnapshot,
      changedFields,
      actor,
    });

    return this.mapToEntity(contact);
  }

  async getChangeHistory(contactId: string, actor?: AuthUser): Promise<ContactChangeHistoryItem[]> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    if (actor) await this.contactAccess.assertCanViewContact({ id: contact.id, ownerId: contact.ownerId }, actor);

    const rows = await this.prisma.contactChangeHistory.findMany({
      where: { contactId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const changedByIds = Array.from(
      new Set(
        rows
          .map((row) => row.changedBy)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    );

    const users =
      changedByIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: changedByIds } },
            select: { id: true, fullName: true, email: true },
          })
        : [];

    const userById = new Map(users.map((user) => [user.id, user]));

    return rows.map((row) => ({
      id: row.id,
      contactId: row.contactId,
      changedBy: row.changedBy ?? null,
      changedByUser: row.changedBy ? userById.get(row.changedBy) ?? null : null,
      action: row.action,
      payload: (row.payload as ContactChangeHistoryValue[]) ?? [],
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getTimeline(contactId: string, actor?: AuthUser): Promise<{ items: ContactTimelineItem[] }> {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    await this.contactAccess.assertCanViewContact(contact, actor);

    const taskWhere: Prisma.TaskWhereInput = { contactId };
    if (actor.role === UserRole.MANAGER) {
      taskWhere.OR = [{ assigneeId: actor.id }, { createdById: actor.id }];
    } else if (actor.role === UserRole.LEAD) {
      const team = await this.contactAccess.getTeamUserIds(actor.id);
      taskWhere.assigneeId = { in: team };
    }

    const [activities, tasks, history] = await Promise.all([
      this.prisma.activity.findMany({
        where: { contactId },
        orderBy: [{ pinnedAt: "desc" }, { occurredAt: "desc" }, { createdAt: "desc" }],
        include: { call: true },
      }),
      this.prisma.task.findMany({
        where: taskWhere,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        include: { assignee: { select: { id: true, fullName: true } } },
      }),
      this.prisma.contactChangeHistory.findMany({
        where: { contactId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    const userIds = new Set<string>();
    activities.forEach((activity) => {
      if (activity.createdBy) userIds.add(activity.createdBy);
    });
    history.forEach((entry) => {
      if (entry.changedBy) userIds.add(entry.changedBy);
    });
    tasks.forEach((task) => {
      if (task.createdById) userIds.add(task.createdById);
    });

    const users =
      userIds.size > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, fullName: true },
          })
        : [];
    const userById = new Map(users.map((user) => [user.id, user.fullName]));

    const items: ContactTimelineItem[] = [
      ...activities.map((activity) => ({
        id: activity.id,
        source: "ACTIVITY" as const,
        type: activity.type,
        title: activity.title?.trim() || activity.type,
        body: activity.body ?? "",
        occurredAt: (activity.occurredAt ?? activity.createdAt).toISOString(),
        createdAt: activity.createdAt.toISOString(),
        pinnedAt: activity.pinnedAt?.toISOString() ?? null,
        createdBy: activity.createdBy,
        createdByName: userById.get(activity.createdBy) ?? activity.createdBy,
        call: activity.call
          ? {
              direction: activity.call.direction ?? undefined,
              status: activity.call.status ?? undefined,
              durationSec: activity.call.durationSec ?? null,
              recordingStatus: activity.call.recordingStatus ?? null,
              recordingUrl: activity.call.recordingUrl ?? null,
              startedAt: activity.call.startedAt?.toISOString() ?? undefined,
              from: activity.call.from ?? undefined,
              to: activity.call.to ?? undefined,
            }
          : undefined,
      })),
      ...tasks.map((task) => ({
        id: task.id,
        source: "TASK" as const,
        type: "TASK",
        title: task.title,
        body: task.body ?? "",
        occurredAt: (task.completedAt ?? task.updatedAt ?? task.createdAt).toISOString(),
        createdAt: task.createdAt.toISOString(),
        pinnedAt: null,
        createdBy: task.createdById ?? task.assigneeId,
        createdByName: task.createdById ? userById.get(task.createdById) ?? task.createdById : null,
        task: {
          status: task.status,
          dueAt: task.dueAt?.toISOString() ?? null,
          completedAt: task.completedAt?.toISOString() ?? null,
          assigneeId: task.assigneeId,
          assigneeName: task.assignee?.fullName ?? null,
        },
      })),
      ...history.map((entry) => ({
        id: entry.id,
        source: "AUDIT" as const,
        type: "AUDIT",
        title: entry.action,
        body: "",
        occurredAt: entry.createdAt.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        pinnedAt: null,
        createdBy: entry.changedBy ?? "system",
        createdByName: entry.changedBy ? userById.get(entry.changedBy) ?? entry.changedBy : "system",
        audit: {
          action: entry.action,
          payload: (entry.payload as ContactChangeHistoryValue[]) ?? [],
        },
      })),
    ].sort((a, b) => {
      if (a.pinnedAt && !b.pinnedAt) return -1;
      if (!a.pinnedAt && b.pinnedAt) return 1;
      return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    });

    return { items };
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
    if (actor) await this.contactAccess.assertCanViewContact({ id: contact.id, ownerId: contact.ownerId }, actor);

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
    if (actor) await this.contactAccess.assertCanViewContact({ id: contact.id, ownerId: contact.ownerId }, actor);
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
    if (actor) await this.contactAccess.assertCanViewContact({ id: contact.id, ownerId: contact.ownerId }, actor);

    if (!body?.recipientType) throw new BadRequestException("recipientType required");
    if (!body?.deliveryType) throw new BadRequestException("deliveryType required");
    if (!body?.label) throw new BadRequestException("label required");

    const nextIsDefault = Boolean(body.isDefault ?? false);
    const nextLabel = String(body.label);
    const previousDefault = nextIsDefault
      ? await this.prisma.contactShippingProfile.findFirst({
          where: { contactId, isDefault: true },
          orderBy: { updatedAt: "desc" },
        })
      : null;

    const created = await this.prisma.$transaction(async (tx) => {
      if (nextIsDefault) {
        await tx.contactShippingProfile.updateMany({
          where: { contactId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.contactShippingProfile.create({
        data: {
          contactId,
          label: nextLabel,
          isDefault: nextIsDefault,

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
    });

    if (nextIsDefault) {
      await this.appendContactHistory({
        contactId,
        action: "DELIVERY_DEFAULT_CHANGED",
        payload: [{ field: "deliveryDefault", oldValue: previousDefault?.label ?? null, newValue: created.label }],
        actor,
      });
    }

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
    if (actor) await this.contactAccess.assertCanViewContact({ id: contact.id, ownerId: contact.ownerId }, actor);

    const existing = await this.prisma.contactShippingProfile.findFirst({
      where: { id: profileId, contactId },
    });
    if (!existing) throw new BadRequestException("shipping profile not found");

    const nextLabel = body.label != null ? String(body.label) : existing.label;
    const nextIsDefault = body.isDefault !== undefined ? Boolean(body.isDefault) : existing.isDefault;
    const previousDefault =
      nextIsDefault && !existing.isDefault
        ? await this.prisma.contactShippingProfile.findFirst({
            where: { contactId, isDefault: true, id: { not: profileId } },
            orderBy: { updatedAt: "desc" },
          })
        : null;

    await this.prisma.$transaction(async (tx) => {
      if (nextIsDefault) {
        await tx.contactShippingProfile.updateMany({
          where: { contactId, isDefault: true, id: { not: profileId } },
          data: { isDefault: false },
        });
      }

      await tx.contactShippingProfile.update({
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
    });

    if (nextIsDefault && (!existing.isDefault || existing.label !== nextLabel)) {
      await this.appendContactHistory({
        contactId,
        action: "DELIVERY_DEFAULT_CHANGED",
        payload: [
          {
            field: "deliveryDefault",
            oldValue: previousDefault?.label ?? (existing.isDefault ? existing.label : null),
            newValue: nextLabel,
          },
        ],
        actor,
      });
    }
    return { ok: true };
  }

  async deleteShippingProfile(contactId: string, profileId: string, actor?: AuthUser) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new BadRequestException("contact not found");
    if (actor) await this.contactAccess.assertCanViewContact({ id: contact.id, ownerId: contact.ownerId }, actor);

    const existing = await this.prisma.contactShippingProfile.findFirst({
      where: { id: profileId, contactId },
    });
    if (!existing) throw new BadRequestException("shipping profile not found");

    await this.prisma.contactShippingProfile.delete({ where: { id: profileId } });
    if (existing.isDefault) {
      await this.appendContactHistory({
        contactId,
        action: "DELIVERY_DEFAULT_CHANGED",
        payload: [{ field: "deliveryDefault", oldValue: existing.label, newValue: null }],
        actor,
      });
    }
    return { ok: true };
  }

  /** Агрегат карточки контакта: KPI по канонічних замовленнях (clientId), legacy / company блоки, дисклеймер RBAC. */
  async getCard(contactId: string, actor?: AuthUser) {
    const t0 = Date.now();
    try {
    if (!actor) throw new BadRequestException("User is required");

    const teamUserIds =
      actor.role === UserRole.LEAD ? await this.contactAccess.getTeamUserIds(actor.id) : [actor.id];

    const orderVis = this.contactAccess.orderVisibilityWhere(actor, teamUserIds);
    const activeF = this.contactAccess.activeOrderFilter();

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: { company: true, owner: true },
    });
    if (!contact) throw new BadRequestException("contact not found");

    await this.contactAccess.assertCanViewContact({ id: contact.id, ownerId: contact.ownerId }, actor);

    const canonBase: Prisma.OrderWhereInput = {
      clientId: contactId,
      AND: [activeF],
    };

    const visibleWhere: Prisma.OrderWhereInput = { AND: [canonBase, orderVis] };

    const orderCardSelect = {
      id: true,
      orderNumber: true,
      totalAmount: true,
      currency: true,
      orderStage: true,
      debtAmount: true,
      createdAt: true,
      financialStatus: true,
      paymentDueDate: true,
    } as const;

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const legacyWhere: Prisma.OrderWhereInput = {
      AND: [{ contactId: contactId }, { clientId: null }, activeF, orderVis],
    };

    const companyWhere: Prisma.OrderWhereInput | null =
      contact.companyId != null
        ? {
            AND: [
              { companyId: contact.companyId },
              activeF,
              orderVis,
              { OR: [{ clientId: null }, { clientId: { not: contactId } }] },
            ],
          }
        : null;

    const [
      canonicalTotal,
      canonicalVisibleCount,
      agg,
      lastOrder,
      overdueAgg,
      lastActivity,
      canonicalListItems,
      legacyTotal,
      legacyItems,
      companyTotal,
      companyItems,
    ] = await Promise.all([
      this.prisma.order.count({ where: canonBase }),
      this.prisma.order.count({ where: visibleWhere }),
      this.prisma.order.aggregate({
        where: visibleWhere,
        _count: true,
        _sum: { totalAmount: true, debtAmount: true },
      }),
      this.prisma.order.findFirst({
        where: visibleWhere,
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, orderNumber: true },
      }),
      this.prisma.order.aggregate({
        where: {
          AND: [
            visibleWhere,
            { debtAmount: { gt: 0 } },
            { paymentDueDate: { lt: todayStart } },
          ],
        },
        _sum: { debtAmount: true },
      }),
      this.prisma.activity.findFirst({
        where: { contactId },
        orderBy: [{ pinnedAt: "desc" }, { occurredAt: "desc" }, { createdAt: "desc" }],
        select: { createdAt: true, occurredAt: true },
      }),
      this.prisma.order.findMany({
        where: visibleWhere,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: orderCardSelect,
      }),
      this.prisma.order.count({ where: legacyWhere }),
      this.prisma.order.findMany({
        where: legacyWhere,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: orderCardSelect,
      }),
      companyWhere ? this.prisma.order.count({ where: companyWhere }) : Promise.resolve(0),
      companyWhere
        ? this.prisma.order.findMany({
            where: companyWhere,
            orderBy: { createdAt: "desc" },
            take: 50,
            select: orderCardSelect,
          })
        : Promise.resolve([]),
    ]);

    const mapOrderRow = (o: (typeof legacyItems)[number]) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      totalAmount: o.totalAmount,
      currency: o.currency,
      orderStage: o.orderStage,
      debtAmount: o.debtAmount,
      financialStatus: o.financialStatus,
      paymentDueDate: o.paymentDueDate?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    });

    const totalRevenue = agg._sum.totalAmount ?? 0;
    const orderCount = agg._count;
    const avgOrder = orderCount > 0 ? totalRevenue / orderCount : 0;

    const lastActivityAt = lastActivity
      ? (lastActivity.occurredAt ?? lastActivity.createdAt).toISOString()
      : null;

    const out = {
      contact: this.mapToEntity(contact),
      kpi: {
        orderCount,
        totalRevenue,
        totalDebt: agg._sum.debtAmount ?? 0,
        overdueDebt: overdueAgg._sum.debtAmount ?? 0,
        averageOrderValue: avgOrder,
        lastOrderAt: lastOrder?.createdAt.toISOString() ?? null,
        lastActivityAt,
      },
      kpiAccess: {
        showPartialDataNotice: canonicalTotal > canonicalVisibleCount,
        partialDataNotice:
          "Показано показники лише з угод, доступних вам. Повна картина — у фінансовій звітності.",
      },
      canonicalOrders: {
        total: canonicalVisibleCount,
        items: canonicalListItems.map(mapOrderRow),
      },
      legacyLinkedOrders: {
        total: legacyTotal,
        items: legacyItems.map(mapOrderRow),
      },
      companyOrders: {
        total: companyTotal,
        items: companyItems.map(mapOrderRow),
      },
    };
    this.logGetCardSuccess({
      contactId,
      actor,
      startedAt: t0,
      canonicalTotal,
      canonicalVisibleCount,
      legacyTotal,
      companyTotal,
    });
    return out;
    } catch (e) {
      this.logGetCardFailure({ contactId, actor, startedAt: t0, error: e });
      throw e;
    }
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
      documentDisplayName: contact.documentDisplayName ?? null,
      region: contact.region ?? null,
      addressInfo: contact.addressInfo ?? null,
      city: contact.city ?? null,
      clientType: contact.clientType ?? null,
      status: contact.status ?? null,
      marketingCallOptOut: contact.marketingCallOptOut,
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
