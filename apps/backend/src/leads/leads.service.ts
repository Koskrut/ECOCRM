import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { LeadChannel, LeadSource, LeadStatus, Prisma } from "@prisma/client";
import {
  LeadEventType,
  LeadIdentityType,
  LeadStatus as LeadStatusEnum,
  UserRole,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePagination } from "../common/pagination";
import type { ListLeadsQueryDto } from "./dto/list-leads-query.dto";
import type { CreateLeadDto } from "./dto/create-lead.dto";
import type { UpdateLeadDto } from "./dto/update-lead.dto";
import type { UpdateLeadStatusDto } from "./dto/update-lead-status.dto";
import type { ConvertLeadDto, ConvertLeadDealDto } from "./dto/convert-lead.dto";
import type { AddNoteDto } from "./dto/add-note.dto";
import { ContactsService } from "../contacts/contacts.service";
import { CompaniesService } from "../companies/companies.service";
import { OrdersService } from "../orders/orders.service";
import type { CreateOrderDto } from "../orders/dto/create-order.dto";
import { normalizePhone, scoreLeadFromAnswers } from "./leads-meta.utils";

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contactsService: ContactsService,
    private readonly companiesService: CompaniesService,
    private readonly ordersService: OrdersService,
  ) {}

  // ===== ACCESS HELPERS =====

  private assertLeadAccess(lead: { ownerId: string | null }, actor: AuthUser): void {
    if (actor.role === UserRole.MANAGER && lead.ownerId && lead.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access leads assigned to you");
    }
  }

  private buildListWhere(q: ListLeadsQueryDto, actor?: AuthUser): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = {};

    if (q.status) where.status = q.status as LeadStatus;
    if (q.source) where.source = q.source as LeadSource;
    if (q.channel) where.channel = q.channel as LeadChannel;
    if (q.ownerId) where.ownerId = q.ownerId;
    if (q.dateFrom || q.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(q.dateFrom);
      if (q.dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(q.dateTo);
    }

    if (q.q) {
      const search = q.q.trim();
      if (search.length > 0) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { fullName: { contains: search, mode: "insensitive" } },
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { middleName: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { companyName: { contains: search, mode: "insensitive" } },
          { message: { contains: search, mode: "insensitive" } },
        ];
      }
    }

    if (actor?.role === UserRole.MANAGER) {
      where.OR = [...(where.OR ?? []), { ownerId: actor.id }, { ownerId: null }];
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

    if (dto.items?.length) {
      const byProduct = new Map<string, { qty: number; price: number }>();
      for (const it of dto.items) {
        const qty = Math.max(1, Math.trunc(it.qty));
        const price = it.price;
        const cur = byProduct.get(it.productId);
        if (cur) {
          cur.qty += qty;
          cur.price = price;
        } else {
          byProduct.set(it.productId, { qty, price });
        }
      }
      for (const [productId, { qty, price }] of byProduct) {
        await this.prisma.leadItem.create({
          data: {
            leadId: lead.id,
            productId,
            qty,
            price,
            lineTotal: qty * price,
          },
        });
      }
    }

    const withItems = await this.prisma.lead.findUnique({
      where: { id: lead.id },
      include: { items: { include: { product: true } } },
    });
    return this.mapToEntity(withItems ?? lead);
  }

  async list(q: ListLeadsQueryDto, actor?: AuthUser) {
    const { page, pageSize, offset, limit } = normalizePagination({
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
    });

    const where = this.buildListWhere(q, actor);
    const orderBy: Prisma.LeadOrderByWithRelationInput =
      q.sortBy === "score"
        ? { score: q.sortOrder ?? "desc" }
        : { createdAt: q.sortOrder ?? "desc" };

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        include: { owner: { select: { id: true, fullName: true } } },
      }),
      this.prisma.lead.count({ where }),
    ]);

    const leadIds = items.map((l) => l.id);
    let hasCallTodayIds = new Set<string>();
    let hasMissedCallIds = new Set<string>();

    if (leadIds.length > 0) {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const callsToday = await this.prisma.call.groupBy({
        by: ["leadId"],
        where: {
          leadId: { in: leadIds },
          startedAt: {
            gte: startOfToday,
            lte: now,
          },
        },
        _count: { _all: true },
      });
      hasCallTodayIds = new Set(callsToday.map((c) => c.leadId as string));

      const missedCalls = await this.prisma.call.groupBy({
        by: ["leadId"],
        where: {
          leadId: { in: leadIds },
          status: "MISSED",
        },
        _count: { _all: true },
      });
      hasMissedCallIds = new Set(missedCalls.map((c) => c.leadId as string));
    }

    const mapped = items.map((l) => {
      const base = this.mapToEntity(l);
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

  async getById(id: string, actor?: AuthUser) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        attribution: true,
        answers: true,
        events: { orderBy: { createdAt: "desc" } },
        identities: true,
        owner: { select: { id: true, fullName: true } },
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (actor) this.assertLeadAccess(lead, actor);
    return this.mapToEntity(lead);
  }

  async update(id: string, dto: UpdateLeadDto, actor?: AuthUser) {
    const existing = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, ownerId: true, status: true },
    });
    if (!existing) throw new NotFoundException("Lead not found");
    if (actor) this.assertLeadAccess(existing, actor);

    const data: Prisma.LeadUpdateInput = {};
    if ("name" in dto) data.name = dto.name ?? null;
    if ("firstName" in dto) data.firstName = dto.firstName ?? null;
    if ("lastName" in dto) data.lastName = dto.lastName ?? null;
    if ("middleName" in dto) data.middleName = dto.middleName ?? null;
    if ("fullName" in dto) data.fullName = dto.fullName ?? null;
    if ("phone" in dto) data.phone = dto.phone ?? null;
    if ("email" in dto) data.email = dto.email ?? null;
    if ("companyName" in dto) data.companyName = dto.companyName ?? null;
    if ("city" in dto) data.city = dto.city ?? null;
    if ("message" in dto) data.message = dto.message ?? null;
    if ("comment" in dto) data.comment = dto.comment ?? null;
    if ("channel" in dto) data.channel = dto.channel ?? null;
    if ("source" in dto)
      data.source = dto.source !== undefined && dto.source !== null ? dto.source : undefined;
    if ("ownerId" in dto) {
      data.owner = dto.ownerId ? { connect: { id: dto.ownerId } } : { disconnect: true };
    }
    if ("sourceMeta" in dto) {
      data.sourceMeta = (dto.sourceMeta ?? undefined) as Prisma.InputJsonValue | undefined;
    }

    if (dto.ownerId !== undefined && String(dto.ownerId) !== String(existing.ownerId)) {
      await this.prisma.leadEvent.create({
        data: {
          leadId: id,
          type: LeadEventType.ASSIGNED,
          message: "Owner changed",
          payload: {
            previousOwnerId: existing.ownerId,
            newOwnerId: dto.ownerId,
          } as Prisma.InputJsonValue,
        },
      });
    }

    await this.prisma.lead.update({ where: { id }, data });

    if (dto.items !== undefined) {
      await this.prisma.leadItem.deleteMany({ where: { leadId: id } });
      const byProduct = new Map<string, { qty: number; price: number }>();
      for (const it of dto.items) {
        const qty = Math.max(1, Math.trunc(it.qty));
        const price = it.price;
        const cur = byProduct.get(it.productId);
        if (cur) {
          cur.qty += qty;
          cur.price = price;
        } else {
          byProduct.set(it.productId, { qty, price });
        }
      }
      for (const [productId, { qty, price }] of byProduct) {
        await this.prisma.leadItem.create({
          data: {
            leadId: id,
            productId,
            qty,
            price,
            lineTotal: qty * price,
          },
        });
      }
    }

    const updated = await this.prisma.lead.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    return this.mapToEntity(updated!);
  }

  // ===== STATUS =====

  private ensureStatusTransition(
    from: LeadStatus,
    to: LeadStatus,
    lead: { phone?: string | null; name?: string | null },
  ) {
    if (to === LeadStatusEnum.WON) {
      if (!lead.phone) {
        throw new BadRequestException("Телефон обязателен для успешного завершения лида");
      }
      if (!lead.name) {
        throw new BadRequestException("Имя обязательно для успешного завершения лида");
      }
    }
  }

  async updateStatus(id: string, dto: UpdateLeadStatusDto, actor?: AuthUser) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException("Lead not found");
    if (actor) this.assertLeadAccess(lead, actor);

    this.ensureStatusTransition(lead.status, dto.status, lead);

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

    await this.prisma.leadEvent.create({
      data: {
        leadId: id,
        type: LeadEventType.STATUS_CHANGED,
        message: `Status → ${dto.status}`,
        payload: {
          from: lead.status,
          to: dto.status,
          reason: statusReason,
        } as Prisma.InputJsonValue,
      },
    });

    return this.mapToEntity(updated);
  }

  async addNote(id: string, dto: AddNoteDto, actor?: AuthUser) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: { ownerId: true } });
    if (!lead) throw new NotFoundException("Lead not found");
    if (actor) this.assertLeadAccess(lead, actor);
    await this.prisma.leadEvent.create({
      data: {
        leadId: id,
        type: LeadEventType.NOTE,
        message: dto.message,
        payload: { createdBy: actor?.id ?? null } as Prisma.InputJsonValue,
      },
    });
    return { ok: true };
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

    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    this.assertLeadAccess(lead, actor);

    let companyId: string = lead.companyId;
    if (dto.createCompany?.name?.trim()) {
      const company = await this.companiesService.create({
        name: dto.createCompany.name.trim(),
      });
      companyId = company.id;
    }

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

      if (contact.companyId && contact.companyId !== companyId) {
        throw new BadRequestException("Contact belongs to a different company");
      }

      contactId = contact.id;
    } else if (dto.contactMode === "create") {
      const baseName = this.parseName(dto.contact?.firstName || lead.name);
      const firstName = dto.contact?.firstName ?? baseName.firstName;
      const lastName =
        dto.contact?.lastName ?? (baseName.lastName || (lead.companyName ? lead.companyName : ""));
      const middleName = dto.contact?.middleName ?? lead.middleName ?? null;

      const phone = dto.contact?.phone ?? lead.phone ?? "";
      if (!phone) {
        throw new BadRequestException("phone is required to create contact from lead");
      }

      const created = await this.contactsService.create(
        {
          companyId,
          firstName,
          lastName,
          middleName,
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
        companyId,
        clientId: contactId,
        contactId,
        comment: comment ?? undefined,
        discountAmount: 0,
      };

      deal = await this.ordersService.create(orderDto, actor);
      const orderId = (deal as { id: string }).id;
      const leadItems =
        (lead as { items: Array<{ productId: string; qty: number; price: number }> }).items ?? [];
      for (const it of leadItems) {
        await this.ordersService.addItem(
          orderId,
          { productId: it.productId, qty: it.qty, price: it.price },
          actor,
        );
      }
    }

    const updatedLead = await this.prisma.lead.update({
      where: { id },
      data: {
        contact: { connect: { id: contactId } },
        status: LeadStatusEnum.WON,
        lastActivityAt: new Date(),
      },
    });

    // Migrate activities from Lead to Contact
    await this.prisma.activity.updateMany({
      where: { leadId: id, contactId: null },
      data: { contactId },
    });

    // Migrate telegram accounts from Lead to Contact
    await this.prisma.telegramAccount.updateMany({
      where: { leadId: id },
      data: { contactId, leadId: null },
    });

    // Migrate conversations from Lead to Contact
    await this.prisma.conversation.updateMany({
      where: { leadId: id },
      data: { contactId, leadId: null },
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
    const items = (lead.items as Array<Record<string, unknown>> | undefined) ?? [];
    const attribution = lead.attribution;
    const answers = (lead.answers as Array<Record<string, unknown>> | undefined) ?? [];
    const events = (lead.events as Array<Record<string, unknown>> | undefined) ?? [];
    const identities = (lead.identities as Array<Record<string, unknown>> | undefined) ?? [];
    const owner = lead.owner as { id: string; fullName: string } | undefined;
    return {
      id: lead.id,
      companyId: lead.companyId,
      ownerId: lead.ownerId ?? null,
      owner: owner ? { id: owner.id, fullName: owner.fullName } : null,
      contactId: lead.contactId ?? null,
      status: lead.status,
      source: lead.source,
      channel: lead.channel ?? null,
      name: lead.name,
      firstName: lead.firstName ?? null,
      lastName: lead.lastName ?? null,
      fullName: lead.fullName ?? null,
      phone: lead.phone,
      phoneNormalized: lead.phoneNormalized ?? null,
      email: lead.email,
      companyName: lead.companyName,
      city: lead.city ?? null,
      message: lead.message,
      comment: lead.comment ?? null,
      statusReason: lead.statusReason ?? null,
      sourceMeta: lead.sourceMeta ?? null,
      score: lead.score ?? 0,
      lastActivityAt: lead.lastActivityAt ?? null,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      items: items.map((it) => ({
        id: it.id,
        productId: it.productId,
        qty: it.qty,
        price: it.price,
        lineTotal: it.lineTotal,
        product: it.product ?? null,
      })),
      attribution: attribution
        ? {
            id: attribution.id,
            metaLeadId: attribution.metaLeadId,
            formId: attribution.formId,
            pageId: attribution.pageId ?? null,
            igAccountId: attribution.igAccountId ?? null,
            campaignId: attribution.campaignId,
            campaignName: attribution.campaignName,
            adsetId: attribution.adsetId,
            adsetName: attribution.adsetName,
            adId: attribution.adId,
            adName: attribution.adName,
            createdTime: attribution.createdTime,
            raw: attribution.raw ?? null,
          }
        : null,
      answers: answers.map((a) => ({
        id: a.id,
        key: a.key,
        value: a.value,
        createdAt: a.createdAt,
      })),
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        payload: e.payload ?? null,
        createdAt: e.createdAt,
      })),
      identities: identities.map((i) => ({
        id: i.id,
        type: i.type,
        value: i.value,
        isPrimary: i.isPrimary ?? false,
      })),
    };
  }

  // ===== META INGEST =====

  async metaIngest(
    body: Record<string, unknown>,
    _actor?: AuthUser,
  ): Promise<{ ok: true; leadId: string; deduped: boolean }> {
    const parsed = this.parseMetaPayload(body);
    if (!parsed) throw new BadRequestException("Invalid Meta lead payload: no entry or value");

    const companyId =
      (process.env.META_LEAD_COMPANY_ID as string) ||
      (await this.prisma.company.findFirst({ select: { id: true } }))?.id;
    if (!companyId)
      throw new BadRequestException(
        "No company for Meta leads: set META_LEAD_COMPANY_ID or create a company",
      );

    const phoneNorm = normalizePhone(parsed.phone);
    const existingByPhone =
      phoneNorm &&
      (await this.prisma.leadIdentity.findUnique({
        where: { type_value: { type: LeadIdentityType.PHONE, value: phoneNorm } },
        select: { leadId: true },
      }));
    if (existingByPhone) {
      await this.prisma.leadEvent.create({
        data: {
          leadId: existingByPhone.leadId,
          type: LeadEventType.DUPLICATE_MERGED,
          message: "Duplicate lead (by phone)",
          payload: { metaLeadId: parsed.metaLeadId } as Prisma.InputJsonValue,
        },
      });
      return { ok: true, leadId: existingByPhone.leadId, deduped: true };
    }

    const emailNorm = parsed.email?.trim() || null;
    if (emailNorm) {
      const existingByEmail = await this.prisma.leadIdentity.findUnique({
        where: { type_value: { type: LeadIdentityType.EMAIL, value: emailNorm } },
        select: { leadId: true },
      });
      if (existingByEmail) {
        await this.prisma.leadEvent.create({
          data: {
            leadId: existingByEmail.leadId,
            type: LeadEventType.DUPLICATE_MERGED,
            message: "Duplicate lead (by email)",
            payload: { metaLeadId: parsed.metaLeadId } as Prisma.InputJsonValue,
          },
        });
        return { ok: true, leadId: existingByEmail.leadId, deduped: true };
      }
    }

    const existingByMetaId = await this.prisma.leadIdentity.findUnique({
      where: { type_value: { type: LeadIdentityType.META_LEAD_ID, value: parsed.metaLeadId } },
      select: { leadId: true },
    });
    if (existingByMetaId) {
      await this.prisma.leadEvent.create({
        data: {
          leadId: existingByMetaId.leadId,
          type: LeadEventType.DUPLICATE_MERGED,
          message: "Duplicate lead (by Meta lead ID)",
          payload: { metaLeadId: parsed.metaLeadId } as Prisma.InputJsonValue,
        },
      });
      return { ok: true, leadId: existingByMetaId.leadId, deduped: true };
    }

    const fullName =
      parsed.fullName || [parsed.firstName, parsed.lastName].filter(Boolean).join(" ") || null;
    const lead = await this.prisma.lead.create({
      data: {
        companyId,
        source: "META",
        channel: parsed.channel ?? "FB_LEAD_ADS",
        status: LeadStatusEnum.NEW,
        firstName: parsed.firstName || null,
        lastName: parsed.lastName || null,
        fullName,
        name: fullName,
        phone: parsed.phone || null,
        phoneNormalized: phoneNorm,
        email: emailNorm,
        city: parsed.city || null,
        message: parsed.comment || null,
        comment: parsed.comment || null,
        score: 0,
      },
    });

    await this.prisma.leadMetaAttribution.create({
      data: {
        leadId: lead.id,
        metaLeadId: parsed.metaLeadId,
        formId: parsed.formId,
        pageId: parsed.pageId ?? null,
        igAccountId: parsed.igAccountId ?? null,
        campaignId: parsed.campaignId,
        campaignName: parsed.campaignName,
        adsetId: parsed.adsetId,
        adsetName: parsed.adsetName,
        adId: parsed.adId,
        adName: parsed.adName,
        createdTime: parsed.createdTime,
        raw: (parsed.raw ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    for (const a of parsed.answers) {
      await this.prisma.leadAnswer.create({
        data: { leadId: lead.id, key: a.key, value: a.value },
      });
    }

    if (phoneNorm) {
      await this.prisma.leadIdentity.create({
        data: { leadId: lead.id, type: LeadIdentityType.PHONE, value: phoneNorm, isPrimary: true },
      });
    }
    if (emailNorm) {
      await this.prisma.leadIdentity.create({
        data: {
          leadId: lead.id,
          type: LeadIdentityType.EMAIL,
          value: emailNorm,
          isPrimary: !phoneNorm,
        },
      });
    }
    await this.prisma.leadIdentity.create({
      data: {
        leadId: lead.id,
        type: LeadIdentityType.META_LEAD_ID,
        value: parsed.metaLeadId,
        isPrimary: false,
      },
    });

    await this.prisma.leadEvent.create({
      data: {
        leadId: lead.id,
        type: LeadEventType.CREATED,
        message: "Lead created from Meta",
        payload: { metaLeadId: parsed.metaLeadId } as Prisma.InputJsonValue,
      },
    });

    const scoreDelta = scoreLeadFromAnswers(parsed.answers, parsed.phone);
    const newScore = Math.max(0, lead.score + scoreDelta);
    await this.prisma.lead.update({
      where: { id: lead.id },
      data: { score: newScore },
    });
    await this.prisma.leadEvent.create({
      data: {
        leadId: lead.id,
        type: LeadEventType.UPDATED,
        message: "Score calculated",
        payload: { score: newScore, delta: scoreDelta } as Prisma.InputJsonValue,
      },
    });

    return { ok: true, leadId: lead.id, deduped: false };
  }

  private parseMetaPayload(body: Record<string, unknown>): {
    metaLeadId: string;
    formId: string;
    pageId?: string;
    igAccountId?: string;
    campaignId: string;
    campaignName: string;
    adsetId: string;
    adsetName: string;
    adId: string;
    adName: string;
    createdTime: Date;
    raw?: unknown;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    phone?: string;
    email?: string;
    city?: string;
    comment?: string;
    channel?: LeadChannel;
    answers: Array<{ key: string; value: string }>;
  } | null {
    const entry = Array.isArray(body.entry) ? body.entry[0] : null;
    const changes =
      entry && typeof entry === "object" && Array.isArray((entry as any).changes)
        ? (entry as any).changes[0]
        : null;
    const value = changes && typeof changes === "object" ? (changes as any).value : null;
    if (!value || typeof value !== "object") return null;

    const v = value as Record<string, unknown>;
    const metaLeadId = String(v.leadgen_id ?? v.lead_id ?? "");
    const formId = String(v.form_id ?? "");
    const adId = String(v.ad_id ?? "");
    const adsetId = String(v.adset_id ?? v.adgroup_id ?? "");
    const campaignId = String(v.campaign_id ?? "");
    if (!metaLeadId || !formId) return null;

    const createdTime =
      v.created_time != null ? new Date(Number(v.created_time) * 1000) : new Date();
    const fieldData = Array.isArray(v.field_data) ? v.field_data : [];
    const fieldMap = new Map<string, string>();
    for (const f of fieldData) {
      if (f && typeof f === "object" && "name" in f && "values" in f) {
        const name = String((f as any).name);
        const vals = (f as any).values;
        const val = Array.isArray(vals) ? vals[0] : vals;
        if (val != null) fieldMap.set(name, String(val));
      }
    }

    const first_name = fieldMap.get("first_name");
    const last_name = fieldMap.get("last_name");
    const full_name = fieldMap.get("full_name");
    const phone = fieldMap.get("phone_number") ?? fieldMap.get("phone");
    const email = fieldMap.get("email");
    const city = fieldMap.get("city");
    const comment = fieldMap.get("comment") ?? fieldMap.get("message");

    const answers = Array.from(fieldMap.entries()).map(([key, value]) => ({ key, value }));

    return {
      metaLeadId,
      formId,
      pageId: v.page_id != null ? String(v.page_id) : undefined,
      igAccountId: v.ig_account_id != null ? String(v.ig_account_id) : undefined,
      campaignId: campaignId || "unknown",
      campaignName: String(v.campaign_name ?? v.campaign_id ?? ""),
      adsetId: adsetId || "unknown",
      adsetName: String(v.adset_name ?? v.adgroup_id ?? ""),
      adId: adId || "unknown",
      adName: String(v.ad_name ?? v.ad_id ?? ""),
      createdTime,
      raw: body,
      firstName: first_name ?? undefined,
      lastName: last_name ?? undefined,
      fullName: full_name ?? undefined,
      phone: phone ?? undefined,
      email: email ?? undefined,
      city: city ?? undefined,
      comment: comment ?? undefined,
      channel: "FB_LEAD_ADS",
      answers,
    };
  }
}
