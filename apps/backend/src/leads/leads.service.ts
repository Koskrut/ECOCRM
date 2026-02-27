import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { LeadSource, LeadStatus, Prisma } from "@prisma/client";
import { LeadStatus as LeadStatusEnum, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePagination } from "../common/pagination";
import type { ListLeadsQueryDto } from "./dto/list-leads-query.dto";
import type { CreateLeadDto } from "./dto/create-lead.dto";
import type { UpdateLeadDto } from "./dto/update-lead.dto";
import type { UpdateLeadStatusDto } from "./dto/update-lead-status.dto";
import type { ConvertLeadDto, ConvertLeadDealDto } from "./dto/convert-lead.dto";
import { ContactsService } from "../contacts/contacts.service";
import { OrdersService } from "../orders/orders.service";
import type { CreateOrderDto } from "../orders/dto/create-order.dto";

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contactsService: ContactsService,
    private readonly ordersService: OrdersService,
  ) {}

  // ===== ACCESS HELPERS =====

  private assertLeadAccess(lead: { ownerId: string | null }, actor: AuthUser): void {
    if (actor.role === UserRole.MANAGER && lead.ownerId && lead.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access leads assigned to you");
    }
  }

  private buildListWhere(
    q: ListLeadsQueryDto,
    actor?: AuthUser,
  ): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = {};

    if (q.status) where.status = q.status as LeadStatus;
    if (q.source) where.source = q.source as LeadSource;

    if (q.q) {
      const search = q.q.trim();
      if (search.length > 0) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { companyName: { contains: search, mode: "insensitive" } },
          { message: { contains: search, mode: "insensitive" } },
        ];
      }
    }

    if (actor?.role === UserRole.MANAGER) {
      where.OR = [
        ...(where.OR ?? []),
        { ownerId: actor.id },
        { ownerId: null },
      ];
    }

    return where;
  }

  // ===== CRUD =====

  async create(dto: CreateLeadDto, actor?: AuthUser) {
    if (!dto.companyId) {
      throw new BadRequestException("companyId is required");
    }

    const ownerId = actor?.id ?? null;

    const data: Prisma.LeadCreateInput = {
      company: { connect: { id: dto.companyId } },
      owner: ownerId ? { connect: { id: ownerId } } : undefined,
      status: LeadStatusEnum.NEW,
      source: dto.source ?? "OTHER",
      name: dto.name ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      companyName: dto.companyName ?? null,
      message: dto.message ?? null,
      sourceMeta: (dto.sourceMeta ?? undefined) as Prisma.InputJsonValue | undefined,
      lastActivityAt: null,
    };

    const lead = await this.prisma.lead.create({ data });
    return this.mapToEntity(lead);
  }

  async list(q: ListLeadsQueryDto, actor?: AuthUser) {
    const { page, pageSize, offset, limit } = normalizePagination({
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
    });

    const where = this.buildListWhere(q, actor);

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      items: items.map((l) => this.mapToEntity(l)),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string, actor?: AuthUser) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException("Lead not found");
    if (actor) this.assertLeadAccess(lead, actor);
    return this.mapToEntity(lead);
  }

  async update(id: string, dto: UpdateLeadDto, actor?: AuthUser) {
    const existing = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });
    if (!existing) throw new NotFoundException("Lead not found");
    if (actor) this.assertLeadAccess(existing, actor);

    const data: Prisma.LeadUpdateInput = {};
    if ("name" in dto) data.name = dto.name ?? null;
    if ("phone" in dto) data.phone = dto.phone ?? null;
    if ("email" in dto) data.email = dto.email ?? null;
    if ("companyName" in dto) data.companyName = dto.companyName ?? null;
    if ("message" in dto) data.message = dto.message ?? null;
    if ("sourceMeta" in dto) {
      data.sourceMeta = (dto.sourceMeta ?? undefined) as Prisma.InputJsonValue | undefined;
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data,
    });

    return this.mapToEntity(updated);
  }

  // ===== STATUS =====

  private ensureStatusTransition(from: LeadStatus, to: LeadStatus) {
    // Сейчас разрешаем любые переходы статусов лида.
    // При необходимости можно сузить правила в будущем.
    void from;
    void to;
  }

  async updateStatus(id: string, dto: UpdateLeadStatusDto, actor?: AuthUser) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException("Lead not found");
    if (actor) this.assertLeadAccess(lead, actor);

    this.ensureStatusTransition(lead.status, dto.status);

    const isTerminal =
      dto.status === LeadStatusEnum.NOT_TARGET || dto.status === LeadStatusEnum.LOST;

    let statusReason: string | null = lead.statusReason ?? null;
    if (isTerminal) {
      if (!dto.reason || !dto.reason.trim()) {
        throw new BadRequestException("reason is required for NOT_TARGET or LOST");
      }
      statusReason = dto.reason.trim();
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        status: dto.status,
        statusReason,
        lastActivityAt: new Date(),
      },
    });

    return this.mapToEntity(updated);
  }

  // ===== CONVERT =====

  private parseName(fullName?: string | null): { firstName: string; lastName: string } {
    const safe = String(fullName ?? "").trim();
    if (!safe) {
      return { firstName: "Lead", lastName: "" };
    }
    const parts = safe.split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: "" };
    }
    const [firstName, ...rest] = parts;
    return { firstName, lastName: rest.join(" ") };
  }

  private buildOrderComment(deal: ConvertLeadDealDto | undefined): string | null {
    if (!deal) return null;
    const chunks: string[] = [];
    if (deal.title) chunks.push(deal.title);
    if (deal.comment) chunks.push(deal.comment);
    if (typeof deal.amount === "number") chunks.push(`Сумма лида: ${deal.amount}`);
    if (chunks.length === 0) return null;
    return chunks.join(" • ");
  }

  async convert(id: string, dto: ConvertLeadDto, actor?: AuthUser) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }

    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException("Lead not found");
    this.assertLeadAccess(lead, actor);

    let contactId: string;

    if (dto.contactMode === "link") {
      if (!dto.contactId) {
        throw new BadRequestException("contactId is required when contactMode='link'");
      }

      const contact = await this.prisma.contact.findUnique({
        where: { id: dto.contactId },
        select: { id: true, ownerId: true, companyId: true },
      });
      if (!contact) throw new NotFoundException("Contact not found");

      if (actor.role === UserRole.MANAGER && contact.ownerId && contact.ownerId !== actor.id) {
        throw new ForbiddenException("You can only use contacts assigned to you");
      }

      if (contact.companyId && contact.companyId !== lead.companyId) {
        throw new BadRequestException("Contact belongs to a different company");
      }

      contactId = contact.id;
    } else if (dto.contactMode === "create") {
      const baseName = this.parseName(dto.contact?.firstName || lead.name);
      const firstName = dto.contact?.firstName ?? baseName.firstName;
      const lastName =
        dto.contact?.lastName ??
        (baseName.lastName || (lead.companyName ? lead.companyName : ""));

      const phone = dto.contact?.phone ?? lead.phone ?? "";
      if (!phone) {
        throw new BadRequestException("phone is required to create contact from lead");
      }

      const created = await this.contactsService.create(
        {
          companyId: lead.companyId,
          firstName,
          lastName,
          phone,
          email: dto.contact?.email ?? lead.email ?? null,
          position: null,
          isPrimary: false,
        },
        actor,
      );

      contactId = created.id;
    } else {
      throw new BadRequestException("Unsupported contactMode");
    }

    const createDeal = dto.createDeal !== false;
    let deal: unknown = null;

    if (createDeal) {
      const comment = this.buildOrderComment(dto.deal);
      const orderDto: CreateOrderDto = {
        ownerId: actor.id,
        companyId: lead.companyId,
        clientId: contactId,
        contactId,
        comment: comment ?? undefined,
        discountAmount: 0,
      };

      deal = await this.ordersService.create(orderDto, actor);
    }

    const updatedLead = await this.prisma.lead.update({
      where: { id },
      data: {
        contact: { connect: { id: contactId } },
        status: LeadStatusEnum.WON,
        lastActivityAt: new Date(),
      },
    });

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });

    return {
      lead: this.mapToEntity(updatedLead),
      contact,
      deal,
    };
  }

  // ===== SUGGEST CONTACT =====

  async suggestContact(id: string, actor?: AuthUser) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, ownerId: true, phone: true, email: true },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (actor) this.assertLeadAccess(lead, actor);

    const where: Prisma.ContactWhereInput = {
      OR: [],
    };

    if (lead.phone) {
      (where.OR as Prisma.ContactWhereInput[]).push({
        phone: lead.phone,
      });
    }
    if (lead.email) {
      (where.OR as Prisma.ContactWhereInput[]).push({
        email: lead.email,
      });
    }

    if (!where.OR || (Array.isArray(where.OR) && where.OR.length === 0)) {
      return { items: [] };
    }

    const items = await this.prisma.contact.findMany({
      where,
      take: 3,
      orderBy: { createdAt: "desc" },
    });

    return { items };
  }

  // ===== MAPPER =====

  private mapToEntity(lead: Record<string, any>) {
    return {
      id: lead.id,
      companyId: lead.companyId,
      ownerId: lead.ownerId ?? null,
      contactId: lead.contactId ?? null,
      status: lead.status,
      source: lead.source,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      companyName: lead.companyName,
      message: lead.message,
      statusReason: lead.statusReason ?? null,
      sourceMeta: lead.sourceMeta ?? null,
      lastActivityAt: lead.lastActivityAt ?? null,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
  }
}

