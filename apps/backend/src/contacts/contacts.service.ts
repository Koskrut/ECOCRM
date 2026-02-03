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
    });

    return {
      ...contact,
      companyId: contact.companyId ?? undefined,
      email: contact.email ?? undefined,
      position: contact.position ?? undefined,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    };
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
      }),
    ]);

    const items = contacts.map((contact) => ({
      ...contact,
      companyId: contact.companyId ?? undefined,
      email: contact.email ?? undefined,
      position: contact.position ?? undefined,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    }));

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
      include: { company: true },
    });

    if (!contact) {
      throw new NotFoundException("Contact not found");
    }

    return {
      ...contact,
      companyId: contact.companyId ?? undefined,
      company: contact.company
        ? {
            id: contact.company.id,
            name: contact.company.name,
          }
        : undefined,
      email: contact.email ?? undefined,
      position: contact.position ?? undefined,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    };
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
    });

    return {
      ...contact,
      companyId: contact.companyId ?? undefined,
      email: contact.email ?? undefined,
      position: contact.position ?? undefined,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    };
  }
}
