import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaClient, Prisma } from "@prisma/client";
import { Pagination } from "../common/pagination";
import { CreateContactDto } from "./dto/create-contact.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";
import { Contact } from "./entities/contact.entity";

type ListContactsResult = {
  items: Contact[];
  total: number;
  page: number;
  pageSize: number;
};

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaClient) {}

  public async create(dto: CreateContactDto): Promise<Contact> {
    const contact = await this.prisma.contact.create({
      data: {
        companyId: dto.companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        email: dto.email,
        position: dto.position,
        isPrimary: dto.isPrimary ?? false,
      },
      include: { recipients: true }, // На случай, если они появятся при создании
    });

    return this.mapToEntity(contact);
  }

  public async list(
    search: string | undefined,
    companyId: string | undefined,
    pagination: Pagination,
  ): Promise<ListContactsResult> {
    const where: Prisma.ContactWhereInput = {};

    if (companyId) {
      where.companyId = companyId;
    }

    if (search && search.trim().length > 0) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, contacts] = await this.prisma.$transaction([
      this.prisma.contact.count({ where }),
      this.prisma.contact.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: pagination.offset,
        take: pagination.limit,
        include: { recipients: true }, // <-- Загружаем получателей для списка
      }),
    ]);

    const items = contacts.map((contact) => this.mapToEntity(contact));

    return {
      items,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  public async findOne(id: string): Promise<Contact> {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: { 
        company: true, 
        recipients: true // <-- Загружаем получателей для одиночного просмотра
      },
    });

    if (!contact) {
      throw new NotFoundException("Contact not found");
    }

    return this.mapToEntity(contact);
  }

  public async update(id: string, dto: UpdateContactDto): Promise<Contact> {
    const existing = await this.prisma.contact.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException("Contact not found");
    }

    const contact = await this.prisma.contact.update({
      where: { id },
      data: {
        companyId: dto.companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        email: dto.email,
        position: dto.position,
        isPrimary: dto.isPrimary,
      },
      include: { recipients: true },
    });

    return this.mapToEntity(contact);
  }

  // Вспомогательный метод для преобразования Prisma объекта в Entity
  private mapToEntity(
    contact: Prisma.ContactGetPayload<{ include: { company: true; recipients: true } } | { include: { recipients: true } }>
  ): Contact {
    // Приводим recipients к нужному виду (если они есть)
    const recipients = (contact.recipients || []).map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      city: r.city,
      warehouse: r.warehouse,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return {
      id: contact.id,
      companyId: contact.companyId ?? undefined,
      company: (contact as any).company
        ? {
            id: (contact as any).company.id,
            name: (contact as any).company.name,
          }
        : undefined,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
      email: contact.email ?? undefined,
      position: contact.position ?? undefined,
      isPrimary: contact.isPrimary,
      recipients: recipients, // <-- Добавлено поле
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    };
  }
}