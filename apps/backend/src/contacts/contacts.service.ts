// apps/backend/src/contacts/contacts.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePagination } from "../common/pagination";

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Нормализация телефона для проверки уникальности по всей базе (только цифры). */
  private normalizePhoneForUniqueness(phone: string): string {
    return String(phone ?? "").replace(/\D/g, "");
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
      phone: string;
      email?: string | null;
      position?: string | null;
      address?: string | null;
      ownerId?: string | null;
      isPrimary?: boolean;
    },
    actor?: AuthUser,
  ) {
    if (!data.firstName || !data.lastName) {
      throw new BadRequestException("firstName/lastName required");
    }
    if (!data.phone) throw new BadRequestException("phone required");

    const phoneNormalized = this.normalizePhoneForUniqueness(data.phone);
    if (!phoneNormalized) throw new BadRequestException("phone must contain digits");

    const existingByPhone = await this.prisma.contact.findUnique({
      where: { phoneNormalized },
    });
    if (existingByPhone) {
      throw new ConflictException("A contact with this phone number already exists");
    }

    const ownerId = data.ownerId !== undefined ? data.ownerId : (actor?.id ?? null);

    const contact = await this.prisma.contact.create({
      data: {
        ownerId,
        companyId: data.companyId ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        phoneNormalized,
        email: data.email ?? null,
        position: data.position ?? null,
        address: data.address ?? null,
        isPrimary: data.isPrimary ?? false,
      },
      include: { company: true, owner: true },
    });

    return this.mapToEntity(contact);
  }

  // ===== LIST =====
  async list(
    params: { page?: number; pageSize?: number; companyId?: string },
    actor?: AuthUser,
  ) {
    const { page, pageSize, offset, limit } = normalizePagination({
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 10,
    });

    const where: Prisma.ContactWhereInput = {
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(actor?.role === UserRole.MANAGER
        ? {
            OR: [{ ownerId: actor.id }, { ownerId: null }],
          }
        : {}),
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

    return {
      items: items.map((c) => this.mapToEntity(c)),
      total,
      page,
      pageSize,
    };
  }

  // ===== GET ONE =====
  async getById(id: string, actor?: AuthUser) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: { company: true, owner: true },
    });
    if (!contact) throw new BadRequestException("contact not found");
    if (actor) this.assertContactAccess(contact, actor);

    return this.mapToEntity(contact);
  }

  // ===== UPDATE =====
  async update(
    id: string,
    data: Partial<{
      companyId: string | null;
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
      position: string | null;
      address: string | null;
      ownerId: string | null;
      isPrimary: boolean;
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
      if (phoneNormalized) {
        const other = await this.prisma.contact.findFirst({
          where: {
            phoneNormalized,
            id: { not: id },
          },
        });
        if (other) {
          throw new ConflictException("A contact with this phone number already exists");
        }
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
      email: contact.email,
      position: contact.position,
      address: contact.address ?? null,
      isPrimary: contact.isPrimary,
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
