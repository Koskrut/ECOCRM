import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { LeadChannel, LeadSource, LeadStatus, Prisma } from "@prisma/client";
import {
  CustomFieldEntityType,
  LeadEventType,
  LeadIdentityType,
  LeadStatus as LeadStatusEnum,
  UserRole,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePagination } from "../common/pagination";
import { getPhoneNormalizedDigits, normalizePhoneToE164 } from "../common/phone.utils";
import type { ListLeadsQueryDto } from "./dto/list-leads-query.dto";
import type { CreateLeadDto } from "./dto/create-lead.dto";
import type { UpdateLeadDto } from "./dto/update-lead.dto";
import type { UpdateLeadStatusDto } from "./dto/update-lead-status.dto";
import type { ConvertLeadDto, ConvertLeadDealDto } from "./dto/convert-lead.dto";
import type { AddNoteDto } from "./dto/add-note.dto";
import type { MetaSyncFormDto } from "./dto/meta-sync-form.dto";
import { ContactsService } from "../contacts/contacts.service";
import { CompaniesService } from "../companies/companies.service";
import { OrdersService } from "../orders/orders.service";
import type { CreateOrderDto } from "../orders/dto/create-order.dto";
import { SettingsService } from "../settings/settings.service";
import {
  fetchMetaLeadFromGraph,
  parseMetaCreatedTime,
  verifyMetaSignatureSha256,
} from "./leads-meta-webhook.utils";
import { normalizePhone, scoreLeadFromAnswers } from "./leads-meta.utils";
import { LeadsPipelineConfigService } from "./pipeline/leads-pipeline-config.service";
import { WorkflowDomainEmitterService } from "../workflows/workflow-domain-emitter.service";

export type MetaIngestWebhookResult =
  | { ok: true; leadId: string; deduped: boolean }
  | { ok: true; leads: Array<{ leadId: string; deduped: boolean }> };

type ParsedMetaLead = {
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
};

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly contactsService: ContactsService,
    private readonly companiesService: CompaniesService,
    private readonly ordersService: OrdersService,
    private readonly leadsPipelineConfig: LeadsPipelineConfigService,
    private readonly workflowEmitter: WorkflowDomainEmitterService,
  ) {}

  // ===== ACCESS HELPERS =====

  private assertLeadAccess(lead: { ownerId: string | null }, actor: AuthUser): void {
    if (actor.role === UserRole.MANAGER && lead.ownerId && lead.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access leads assigned to you");
    }
  }

  /** Only ADMIN can delete leads. */
  async remove(id: string, actor?: AuthUser) {
    if (!actor || actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only ADMIN can delete leads");
    }
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    await this.prisma.lead.delete({ where: { id } });
    return { ok: true };
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

    const phoneCanonical =
      dto.phone != null ? (normalizePhoneToE164(dto.phone) ?? (dto.phone.trim() || null)) : null;
    const phoneNormalized = dto.phone != null ? getPhoneNormalizedDigits(dto.phone) ?? null : null;
    const data: Prisma.LeadCreateInput = {
      company: { connect: { id: dto.companyId } },
      owner: ownerId ? { connect: { id: ownerId } } : undefined,
      status: LeadStatusEnum.NEW,
      source: dto.source ?? "OTHER",
      name: dto.name ?? null,
      phone: phoneCanonical,
      phoneNormalized,
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
      include: {
        items: { include: { product: true } },
        convertedOrder: { select: { id: true, orderNumber: true } },
      },
    });
    const mapped = this.mapToEntity(withItems ?? lead);
    this.workflowEmitter.emitRecordCreated(
      CustomFieldEntityType.LEAD,
      mapped.id,
      mapped as unknown as Record<string, unknown>,
    );
    return mapped;
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
        include: {
          owner: { select: { id: true, fullName: true } },
          convertedOrder: { select: { id: true, orderNumber: true } },
        },
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
        convertedOrder: { select: { id: true, orderNumber: true } },
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (actor) this.assertLeadAccess(lead, actor);
    return this.mapToEntity(lead);
  }

  async update(id: string, dto: UpdateLeadDto, actor?: AuthUser) {
    const existingFull = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        convertedOrder: { select: { id: true, orderNumber: true } },
      },
    });
    if (!existingFull) throw new NotFoundException("Lead not found");
    if (actor) this.assertLeadAccess(existingFull, actor);
    const before = this.mapToEntity(existingFull);
    const existing = { id: existingFull.id, ownerId: existingFull.ownerId, status: existingFull.status };

    const data: Prisma.LeadUpdateInput = {};
    if ("name" in dto) data.name = dto.name ?? null;
    if ("firstName" in dto) data.firstName = dto.firstName ?? null;
    if ("lastName" in dto) data.lastName = dto.lastName ?? null;
    if ("middleName" in dto) data.middleName = dto.middleName ?? null;
    if ("fullName" in dto) data.fullName = dto.fullName ?? null;
    if ("phone" in dto) {
      const canonical = normalizePhoneToE164(dto.phone ?? "") ?? (dto.phone?.trim() || null);
      const digits = getPhoneNormalizedDigits(dto.phone ?? "");
      data.phone = canonical ?? null;
      data.phoneNormalized = digits ?? null;
    }
    if ("email" in dto) data.email = dto.email ?? null;
    if ("companyName" in dto) data.companyName = dto.companyName ?? null;
    if ("region" in dto) data.region = dto.region ?? null;
    if ("city" in dto) data.city = dto.city ?? null;
    if ("npCityRef" in dto) data.npCityRef = dto.npCityRef ?? null;
    if ("address" in dto) data.address = dto.address ?? null;
    if ("lat" in dto) data.lat = dto.lat ?? null;
    if ("lng" in dto) data.lng = dto.lng ?? null;
    if ("googlePlaceId" in dto) data.googlePlaceId = dto.googlePlaceId ?? null;
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
      include: {
        items: { include: { product: true } },
        convertedOrder: { select: { id: true, orderNumber: true } },
      },
    });
    const next = this.mapToEntity(updated!);
    const keys = Object.keys(dto).filter((k) => k !== "items");
    const changes: Record<string, { previous?: unknown; current?: unknown }> = {};
    const b = before as unknown as Record<string, unknown>;
    const n = next as unknown as Record<string, unknown>;
    for (const k of keys) {
      if (b[k] !== n[k]) changes[k] = { previous: b[k], current: n[k] };
    }
    this.workflowEmitter.emitRecordUpdated(
      CustomFieldEntityType.LEAD,
      id,
      n,
      Object.keys(changes).length ? changes : undefined,
    );
    return next;
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

    if (lead.status !== dto.status) {
      const graph = await this.leadsPipelineConfig.getEffectiveTransitionGraph();
      const allowed = graph[lead.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Transition from status ${lead.status} to ${dto.status} is not allowed. Allowed from ${lead.status}: ${allowed.join(", ") || "none"}.`,
        );
      }
    }

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

    const createDeal = dto.createDeal !== false;
    if (createDeal && lead.convertedOrderId) {
      throw new ConflictException("Lead already has a conversion order");
    }

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

    let deal: unknown = null;
    let conversionOrderId: string | null = null;

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
      conversionOrderId = orderId;
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
        ...(conversionOrderId
          ? { convertedOrder: { connect: { id: conversionOrderId } } }
          : {}),
      },
      include: {
        convertedOrder: { select: { id: true, orderNumber: true } },
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
      convertedOrderId: lead.convertedOrderId ?? null,
      convertedOrder: (() => {
        const co = lead.convertedOrder as { id: string; orderNumber: string } | null | undefined;
        return co ? { id: co.id, orderNumber: co.orderNumber } : null;
      })(),
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
      region: lead.region ?? null,
      city: lead.city ?? null,
      npCityRef: lead.npCityRef ?? null,
      address: lead.address ?? null,
      lat: lead.lat ?? null,
      lng: lead.lng ?? null,
      googlePlaceId: lead.googlePlaceId ?? null,
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

  async metaWebhookVerifySubscribe(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): Promise<string> {
    if (mode !== "subscribe" || challenge == null || challenge === "") {
      throw new BadRequestException("Invalid Meta webhook verification request");
    }
    const secrets = await this.settings.getMetaLeadAdsSecrets();
    const expected =
      secrets.webhookVerifyToken ||
      process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ||
      "";
    if (!expected || token !== expected) {
      throw new ForbiddenException("Invalid webhook verify token");
    }
    return challenge;
  }

  private assertMetaWebhookSignature(opts: {
    rawBody: Buffer | undefined;
    signatureHeader: string | undefined;
  }): void {
    const secret = process.env.META_APP_SECRET?.trim();
    if (!secret) {
      if (process.env.NODE_ENV === "production") {
        this.logger.warn(
          "META_APP_SECRET is not set: Meta Lead Ads webhook signatures are not verified",
        );
      }
      return;
    }
    if (!opts.rawBody?.length) {
      throw new BadRequestException("Missing raw body for Meta webhook signature verification");
    }
    if (!verifyMetaSignatureSha256(opts.rawBody, opts.signatureHeader, secret)) {
      throw new UnauthorizedException("Invalid Meta webhook signature");
    }
  }

  async metaIngest(
    body: Record<string, unknown>,
    webhookOpts?: { rawBody?: Buffer; signatureHeader?: string },
  ): Promise<MetaIngestWebhookResult> {
    if (webhookOpts) {
      this.assertMetaWebhookSignature({
        rawBody: webhookOpts.rawBody,
        signatureHeader: webhookOpts.signatureHeader,
      });
    }

    const secrets = await this.settings.getMetaLeadAdsSecrets();
    const values = this.extractMetaLeadgenValues(body);
    if (values.length === 0) {
      throw new BadRequestException("Invalid Meta lead payload: no leadgen entries");
    }

    const graphVersion = process.env.META_GRAPH_API_VERSION?.trim() || "v21.0";
    const parsedList: ParsedMetaLead[] = [];
    for (const value of values) {
      const enriched = await this.enrichMetaLeadValueFromGraph(
        value,
        secrets.pageAccessToken,
        graphVersion,
      );
      const parsed = this.parseMetaValue(enriched, body);
      if (parsed) parsedList.push(parsed);
    }
    if (parsedList.length === 0) {
      throw new BadRequestException("Invalid Meta lead payload: could not parse leadgen values");
    }

    const companyId =
      secrets.companyId ||
      (process.env.META_LEAD_COMPANY_ID as string)?.trim() ||
      (await this.prisma.company.findFirst({ select: { id: true } }))?.id;
    if (!companyId) {
      throw new BadRequestException(
        "No company for Meta leads: set company in Settings → Meta, META_LEAD_COMPANY_ID, or create a company",
      );
    }

    const results: Array<{ leadId: string; deduped: boolean }> = [];
    for (const parsed of parsedList) {
      results.push(await this.persistMetaLeadFromParsed(companyId, parsed));
    }

    if (results.length === 1) {
      return { ok: true, leadId: results[0].leadId, deduped: results[0].deduped };
    }
    return { ok: true, leads: results };
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  private async fetchJsonWithRetry(
    url: string,
    opts: { retries: number; retryBaseMs: number },
  ): Promise<{ ok: boolean; status: number; json: unknown | null }> {
    let attempt = 0;
    while (true) {
      const res = await fetch(url, { method: "GET" });
      const status = res.status;
      if (res.ok) {
        return { ok: true, status, json: (await res.json()) as unknown };
      }

      // Best-effort backoff for rate limits and transient errors.
      const retryable = status === 429 || (status >= 500 && status <= 599);
      if (!retryable || attempt >= opts.retries) {
        let json: unknown | null = null;
        try {
          json = (await res.json()) as unknown;
        } catch {
          json = null;
        }
        return { ok: false, status, json };
      }

      const delay = Math.min(30_000, opts.retryBaseMs * Math.pow(2, attempt));
      await this.sleep(delay);
      attempt += 1;
    }
  }

  /**
   * Admin-only: bulk sync Meta Lead Ads leads for a specific form via Graph API.
   * Safe to re-run: lead dedupe is based on META_LEAD_ID (and phone/email).
   */
  async metaSyncForm(dto: MetaSyncFormDto, actor?: AuthUser): Promise<{
    ok: true;
    formId: string;
    pagesFetched: number;
    leadsFetched: number;
    persistedCreated: number;
    persistedDeduped: number;
    dryRun: boolean;
    errors: Array<{ page: number; status: number; url: string }>;
  }> {
    if (!actor || actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only ADMIN can sync Meta leads");
    }

    const secrets = await this.settings.getMetaLeadAdsSecrets();
    const pageAccessToken = secrets.pageAccessToken?.trim();
    if (!pageAccessToken) {
      throw new BadRequestException(
        "Meta Page Access Token is not set (Settings → Facebook / Meta Lead Ads)",
      );
    }

    const formId = String(dto.formId ?? "").trim();
    if (!formId) throw new BadRequestException("formId is required");

    const graphVersion = process.env.META_GRAPH_API_VERSION?.trim() || "v21.0";
    const limit = dto.pageSize ?? 100;
    const maxPages = dto.maxPages ?? 200;
    const dryRun = dto.dryRun === true;

    const companyId =
      dryRun
        ? null
        : secrets.companyId ||
          (process.env.META_LEAD_COMPANY_ID as string)?.trim() ||
          (await this.prisma.company.findFirst({ select: { id: true } }))?.id ||
          null;
    if (!dryRun && !companyId) {
      throw new BadRequestException(
        "No company for Meta leads: set company in Settings → Meta, META_LEAD_COMPANY_ID, or create a company",
      );
    }

    const baseUrl = new URL(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(formId)}/leads`,
    );
    // Minimal fields required for our parser; additional attribution fields are best-effort.
    baseUrl.searchParams.set(
      "fields",
      [
        "id",
        "created_time",
        "field_data",
        "form_id",
        "ad_id",
        "ad_name",
        "adset_id",
        "adset_name",
        "campaign_id",
        "campaign_name",
        "page_id",
      ].join(","),
    );
    baseUrl.searchParams.set("limit", String(limit));
    baseUrl.searchParams.set("access_token", pageAccessToken);
    if (dto.since) baseUrl.searchParams.set("since", dto.since);
    if (dto.until) baseUrl.searchParams.set("until", dto.until);

    let nextUrl: string | null = baseUrl.toString();
    let page = 0;
    let pagesFetched = 0;
    let leadsFetched = 0;
    let persistedCreated = 0;
    let persistedDeduped = 0;
    const errors: Array<{ page: number; status: number; url: string }> = [];

    while (nextUrl) {
      page += 1;
      if (page > maxPages) {
        this.logger.warn(`Meta sync stopped: reached maxPages=${maxPages} for form ${formId}`);
        break;
      }

      const r = await this.fetchJsonWithRetry(nextUrl, { retries: 5, retryBaseMs: 1000 });
      if (!r.ok || !r.json || typeof r.json !== "object") {
        errors.push({ page, status: r.status, url: nextUrl });
        break;
      }

      const payload = r.json as {
        data?: unknown;
        paging?: { next?: unknown };
      };

      const data = Array.isArray(payload.data) ? payload.data : [];
      pagesFetched += 1;

      for (const item of data) {
        if (!item || typeof item !== "object") continue;
        const lead = item as Record<string, unknown>;
        const leadId = String(lead.id ?? "").trim();
        if (!leadId) continue;

        leadsFetched += 1;
        if (dryRun) continue;

        // Adapt Graph lead object to the same shape as webhook change.value for reuse.
        const asValue: Record<string, unknown> = {
          leadgen_id: leadId,
          form_id: String(lead.form_id ?? formId) || formId,
          created_time: lead.created_time,
          field_data: lead.field_data,
          page_id: lead.page_id,
          ad_id: lead.ad_id,
          ad_name: lead.ad_name,
          adset_id: lead.adset_id,
          adset_name: lead.adset_name,
          campaign_id: lead.campaign_id,
          campaign_name: lead.campaign_name,
        };

        const parsed = this.parseMetaValue(asValue, { source: "meta-sync-form", formId });
        if (!parsed) continue;

        const res = await this.persistMetaLeadFromParsed(companyId as string, parsed);
        if (res.deduped) persistedDeduped += 1;
        else persistedCreated += 1;
      }

      const pagingNext = payload.paging?.next;
      nextUrl = typeof pagingNext === "string" && pagingNext.trim() ? pagingNext.trim() : null;
    }

    return {
      ok: true,
      formId,
      pagesFetched,
      leadsFetched,
      persistedCreated,
      persistedDeduped,
      dryRun,
      errors,
    };
  }

  private extractMetaLeadgenValues(body: Record<string, unknown>): Record<string, unknown>[] {
    const entries = Array.isArray(body.entry) ? body.entry : [];
    const out: Record<string, unknown>[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const changes = Array.isArray((entry as { changes?: unknown }).changes)
        ? (entry as { changes: unknown[] }).changes
        : [];
      for (const ch of changes) {
        if (!ch || typeof ch !== "object") continue;
        const field = (ch as { field?: string }).field;
        if (field != null && field !== "leadgen") continue;
        const value = (ch as { value?: unknown }).value;
        if (value && typeof value === "object") {
          out.push(value as Record<string, unknown>);
        }
      }
    }
    return out;
  }

  private async enrichMetaLeadValueFromGraph(
    value: Record<string, unknown>,
    pageAccessToken: string | undefined,
    graphVersion: string,
  ): Promise<Record<string, unknown>> {
    const fd = value.field_data;
    const hasFields = Array.isArray(fd) && fd.length > 0;
    if (hasFields || !pageAccessToken?.trim()) return value;
    const id = String(value.leadgen_id ?? value.lead_id ?? "").trim();
    if (!id) return value;
    const graph = await fetchMetaLeadFromGraph(id, pageAccessToken.trim(), graphVersion);
    if (!graph) {
      this.logger.warn(`Meta Graph API: could not fetch lead fields for ${id}`);
      return value;
    }
    const next: Record<string, unknown> = { ...value };
    if (graph.field_data?.length) next.field_data = graph.field_data as unknown[];
    if (graph.form_id && (next.form_id == null || String(next.form_id) === "")) {
      next.form_id = graph.form_id;
    }
    if (graph.created_time != null && next.created_time == null) {
      next.created_time = graph.created_time;
    }
    return next;
  }

  private parseMetaValue(value: Record<string, unknown>, rawBody: unknown): ParsedMetaLead | null {
    const metaLeadId = String(value.leadgen_id ?? value.lead_id ?? "").trim();
    if (!metaLeadId) return null;
    const formIdRaw = String(value.form_id ?? "").trim();
    const formId = formIdRaw || "unknown";

    const adId = String(value.ad_id ?? "");
    const adsetId = String(value.adset_id ?? value.adgroup_id ?? "");
    const campaignId = String(value.campaign_id ?? "");
    const createdTime = parseMetaCreatedTime(value.created_time);

    const fieldData = Array.isArray(value.field_data) ? value.field_data : [];
    const fieldMap = new Map<string, string>();
    for (const f of fieldData) {
      if (f && typeof f === "object" && "name" in f && "values" in f) {
        const name = String((f as { name: unknown }).name);
        const vals = (f as { values: unknown }).values;
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

    const answers = Array.from(fieldMap.entries()).map(([key, v]) => ({ key, value: v }));

    return {
      metaLeadId,
      formId,
      pageId: value.page_id != null ? String(value.page_id) : undefined,
      igAccountId: value.ig_account_id != null ? String(value.ig_account_id) : undefined,
      campaignId: campaignId || "unknown",
      campaignName: String(value.campaign_name ?? value.campaign_id ?? ""),
      adsetId: adsetId || "unknown",
      adsetName: String(value.adset_name ?? value.adgroup_id ?? ""),
      adId: adId || "unknown",
      adName: String(value.ad_name ?? value.ad_id ?? ""),
      createdTime,
      raw: rawBody,
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

  private async persistMetaLeadFromParsed(
    companyId: string,
    parsed: ParsedMetaLead,
  ): Promise<{ leadId: string; deduped: boolean }> {
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
      return { leadId: existingByPhone.leadId, deduped: true };
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
        return { leadId: existingByEmail.leadId, deduped: true };
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
      return { leadId: existingByMetaId.leadId, deduped: true };
    }

    const fullName =
      parsed.fullName || [parsed.lastName, parsed.firstName].filter(Boolean).join(" ") || null;
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
        phone: phoneNorm ?? parsed.phone ?? null,
        phoneNormalized: phoneNorm?.replace(/\D/g, "") ?? null,
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

    return { leadId: lead.id, deduped: false };
  }
}
