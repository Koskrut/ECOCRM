import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePagination } from "../common/pagination";

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (!data.firstName || !data.lastName) throw new BadRequestException("firstName/lastName required");
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
      include: { company: true }, // ✅ recipients убрали
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
        include: { company: true }, // ✅ recipients убрали
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
      include: { company: true }, // ✅ recipients убрали
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
      data: {
        ...data,
      },
      include: { company: true }, // ✅ recipients убрали
    });

    return this.mapToEntity(contact);
  }

  // ===== MAPPER =====
  // Важно: тип payload без recipients
  private mapToEntity(
    contact: Prisma.ContactGetPayload<{ include: { company: true } }>,
  ) {
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
