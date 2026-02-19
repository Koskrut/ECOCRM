// apps/backend/src/contacts/contacts.service.ts
import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { normalizePagination } from "../common/pagination";

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ===== CREATE =====
  async create(data: {
    companyId?: string | null;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string | null;
    position?: string | null;
    isPrimary?: boolean;
  }) {
    if (!data.firstName || !data.lastName) {
      throw new BadRequestException("firstName/lastName required");
    }
    if (!data.phone) throw new BadRequestException("phone required");

    const contact = await this.prisma.contact.create({
      data: {
        companyId: data.companyId ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email ?? null,
        position: data.position ?? null,
        isPrimary: data.isPrimary ?? false,
      },
      include: { company: true },
    });

    return this.mapToEntity(contact);
  }

  // ===== LIST =====
  async list(params: { page?: number; pageSize?: number; companyId?: string }) {
    const { page, pageSize, offset, limit } = normalizePagination({
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 10,
    });

    const where: Prisma.ContactWhereInput = {
      ...(params.companyId ? { companyId: params.companyId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { company: true },
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
  async getById(id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!contact) throw new BadRequestException("contact not found");

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
      isPrimary: boolean;
    }>,
  ) {
    const contact = await this.prisma.contact.update({
      where: { id },
      data: { ...data },
      include: { company: true },
    });

    return this.mapToEntity(contact);
  }

  // ==========================================================
  // NP SHIPPING PROFILES
  // ==========================================================

  // LIST profiles for contact (used by TtnModal)
  async listShippingProfiles(contactId: string) {
    // ensure contact exists (nice error)
    const exists = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true },
    });
    if (!exists) throw new BadRequestException("contact not found");

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
  async createShippingProfile(contactId: string, body: any) {
    const exists = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true },
    });
    if (!exists) throw new BadRequestException("contact not found");

    if (!body?.recipientType) throw new BadRequestException("recipientType required");
    if (!body?.deliveryType) throw new BadRequestException("deliveryType required");
    if (!body?.label) throw new BadRequestException("label required");

    const created = await this.prisma.contactShippingProfile.create({
      data: {
        contactId,
        label: String(body.label),
        isDefault: Boolean(body.isDefault ?? false),

        recipientType: body.recipientType,
        deliveryType: body.deliveryType,

        firstName: body.firstName ?? null,
        lastName: body.lastName ?? null,
        middleName: body.middleName ?? null,
        phone: body.phone ?? null,

        companyName: body.companyName ?? null,
        edrpou: body.edrpou ?? null,
        contactPersonFirstName: body.contactPersonFirstName ?? null,
        contactPersonLastName: body.contactPersonLastName ?? null,
        contactPersonMiddleName: body.contactPersonMiddleName ?? null,
        contactPersonPhone: body.contactPersonPhone ?? null,

        cityRef: body.cityRef ?? null,
        cityName: body.cityName ?? null,

        warehouseRef: body.warehouseRef ?? null,
        warehouseNumber: body.warehouseNumber ?? null,
        warehouseType: body.warehouseType ?? null,

        streetRef: body.streetRef ?? null,
        streetName: body.streetName ?? null,
        building: body.building ?? null,
        flat: body.flat ?? null,

        npCounterpartyRef: body.npCounterpartyRef ?? null,
        npContactPersonRef: body.npContactPersonRef ?? null,
        npAddressRef: body.npAddressRef ?? null,
      },
    });

    return { item: created };
  }

  // ===== MAPPER =====
  private mapToEntity(contact: Prisma.ContactGetPayload<{ include: { company: true } }>) {
    return {
      id: contact.id,
      companyId: contact.companyId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
      email: contact.email,
      position: contact.position,
      isPrimary: contact.isPrimary,
      company: contact.company
        ? {
            id: contact.company.id,
            name: contact.company.name,
            edrpou: contact.company.edrpou,
            taxId: contact.company.taxId,
          }
        : null,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }
}
