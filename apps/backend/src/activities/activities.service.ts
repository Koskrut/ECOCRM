/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest DI tokens must be value imports */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { ActivityType, Prisma } from "@prisma/client";
import { CustomFieldEntityType, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowDomainEmitterService } from "../workflows/workflow-domain-emitter.service";
import {
  ACTIVITIES_LIST_DEFAULT_LIMIT,
  ACTIVITIES_LIST_MAX_LIMIT,
} from "./dto/list-activities.query.dto";

type CreateActivityBody = {
  type: ActivityType;
  title?: string | null;
  body: string;
  occurredAt?: string;
};

type ListPagination = {
  limit?: number;
  cursor?: string;
};

type ActivityIncludeArgs = Prisma.ActivityFindManyArgs["include"];

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly workflowEmitter?: WorkflowDomainEmitterService,
  ) {}

  // ---------- ORDER ----------
  async listForOrder(orderId: string, actor?: AuthUser, pagination: ListPagination = {}) {
    await this.assertOrderAccess(orderId, actor);
    return this.runListQuery(
      { orderId },
      [{ occurredAt: "desc" }, { createdAt: "desc" }],
      pagination,
    );
  }

  async createForOrder(orderId: string, body: CreateActivityBody, user: AuthUser) {
    await this.assertOrderAccess(orderId, user);
    const data = this.normalizeBody(body);
    const act = await this.prisma.activity.create({
      data: {
        ...data,
        createdBy: user.id,
        orderId,
      },
    });
    this.emitActivityCreated(act);
    return act;
  }

  // ---------- CONTACT ----------
  async listForContact(contactId: string, actor?: AuthUser, pagination: ListPagination = {}) {
    await this.assertContactAccess(contactId, actor);
    const { items, nextCursor } = await this.runListQuery(
      { contactId },
      [{ pinnedAt: "desc" }, { occurredAt: "desc" }, { createdAt: "desc" }],
      pagination,
      { call: true },
    );
    const withNames = await this.withCreatedByName(items);
    return { items: withNames, nextCursor };
  }

  async createForContact(contactId: string, body: CreateActivityBody, user: AuthUser) {
    await this.assertContactAccess(contactId, user);
    const data = this.normalizeBody(body);
    const act = await this.prisma.activity.create({
      data: {
        ...data,
        createdBy: user.id,
        contactId,
      },
    });
    this.emitActivityCreated(act);
    return act;
  }

  // ---------- LEAD ----------
  async listForLead(leadId: string, actor?: AuthUser, pagination: ListPagination = {}) {
    await this.assertLeadAccess(leadId, actor);
    const { items, nextCursor } = await this.runListQuery(
      { leadId },
      [{ pinnedAt: "desc" }, { occurredAt: "desc" }, { createdAt: "desc" }],
      pagination,
      { call: true },
    );
    const withNames = await this.withCreatedByName(items);
    return { items: withNames, nextCursor };
  }

  async createForLead(leadId: string, body: CreateActivityBody, user: AuthUser) {
    await this.assertLeadAccess(leadId, user);
    const data = this.normalizeBody(body);
    const act = await this.prisma.activity.create({
      data: {
        ...data,
        createdBy: user.id,
        leadId,
      },
    });
    this.emitActivityCreated(act);
    return act;
  }

  // ---------- COMPANY ----------
  async listForCompany(companyId: string, actor?: AuthUser, pagination: ListPagination = {}) {
    await this.assertCompanyAccess(companyId, actor);
    return this.runListQuery(
      { companyId },
      [{ occurredAt: "desc" }, { createdAt: "desc" }],
      pagination,
    );
  }

  async createForCompany(companyId: string, body: CreateActivityBody, user: AuthUser) {
    await this.assertCompanyAccess(companyId, user);
    const data = this.normalizeBody(body);
    const act = await this.prisma.activity.create({
      data: {
        ...data,
        createdBy: user.id,
        companyId,
      },
    });
    this.emitActivityCreated(act);
    return act;
  }

  // ---------- UPDATE / DELETE (by activity id) ----------
  async updateOne(
    activityId: string,
    dto: { body?: string; title?: string | null; pinnedAt?: string | null },
    actor: AuthUser,
  ) {
    const activity = await this.loadActivityWithLinks(activityId);
    await this.assertActivityAccess(activity, actor);

    const data: { body?: string; title?: string | null; pinnedAt?: Date | null } = {};
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.pinnedAt !== undefined) {
      data.pinnedAt =
        dto.pinnedAt === null || dto.pinnedAt === ""
          ? null
          : (() => {
              const d = new Date(dto.pinnedAt!);
              if (Number.isNaN(d.getTime())) {
                throw new BadRequestException("pinnedAt must be valid ISO or null");
              }
              return d;
            })();
    }

    const prev = await this.prisma.activity.findUnique({ where: { id: activityId } });
    const updated = await this.prisma.activity.update({
      where: { id: activityId },
      data,
    });
    if (prev && this.workflowEmitter) {
      const changes: Record<string, { previous?: unknown; current?: unknown }> = {};
      if (dto.body !== undefined && prev.body !== updated.body) {
        changes.body = { previous: prev.body, current: updated.body };
      }
      if (dto.title !== undefined && prev.title !== updated.title) {
        changes.title = { previous: prev.title, current: updated.title };
      }
      if (
        dto.pinnedAt !== undefined &&
        String(prev.pinnedAt ?? "") !== String(updated.pinnedAt ?? "")
      ) {
        changes.pinnedAt = { previous: prev.pinnedAt, current: updated.pinnedAt };
      }
      if (Object.keys(changes).length) {
        this.workflowEmitter.emitRecordUpdated(
          CustomFieldEntityType.ACTIVITY,
          activityId,
          activityToRecord(updated),
          changes,
        );
      }
    }
    return updated;
  }

  async deleteOne(activityId: string, actor: AuthUser) {
    const activity = await this.loadActivityWithLinks(activityId);
    await this.assertActivityAccess(activity, actor);
    return this.prisma.activity.delete({ where: { id: activityId } });
  }

  // ---------- access ----------

  /** Multi-link safe: enforce access policy for every linked entity (logical AND). */
  private async assertActivityAccess(
    activity: {
      contactId: string | null;
      leadId: string | null;
      companyId: string | null;
      orderId: string | null;
    },
    actor: AuthUser,
  ): Promise<void> {
    const links: Array<keyof typeof activity> = ["contactId", "leadId", "companyId", "orderId"];
    const linked = links.filter((k) => activity[k]);
    if (linked.length === 0) {
      throw new ForbiddenException("Activity has no linked entity");
    }
    if (activity.contactId) await this.assertContactAccess(activity.contactId, actor);
    if (activity.leadId) await this.assertLeadAccess(activity.leadId, actor);
    if (activity.companyId) await this.assertCompanyAccess(activity.companyId, actor);
    if (activity.orderId) await this.assertOrderAccess(activity.orderId, actor);
  }

  private async loadActivityWithLinks(activityId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { id: true, contactId: true, leadId: true, companyId: true, orderId: true },
    });
    if (!activity) throw new NotFoundException("Activity not found");
    return activity;
  }

  private async assertOrderAccess(orderId: string, actor?: AuthUser): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { ownerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (!actor || actor.role !== UserRole.MANAGER) return;
    // Mirrors OrdersService.assertOrderAccess: MANAGER must be the owner.
    if (order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access orders assigned to you");
    }
  }

  private async assertContactAccess(contactId: string, actor?: AuthUser): Promise<void> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { ownerId: true },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    if (!actor || actor.role !== UserRole.MANAGER) return;
    // Mirrors ContactsService.assertContactAccess: legacy/unassigned visible to MANAGER.
    if (contact.ownerId && contact.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access contacts assigned to you");
    }
  }

  private async assertLeadAccess(leadId: string, actor?: AuthUser): Promise<void> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { ownerId: true },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (!actor || actor.role !== UserRole.MANAGER) return;
    // Mirrors LeadsService.assertLeadAccess: unassigned visible to MANAGER.
    if (lead.ownerId && lead.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access leads assigned to you");
    }
  }

  private async assertCompanyAccess(companyId: string, actor?: AuthUser): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { ownerId: true },
    });
    if (!company) throw new NotFoundException("Company not found");
    if (!actor || actor.role !== UserRole.MANAGER) return;
    // Mirrors CompaniesService company-access policy: unassigned visible to MANAGER.
    if (company.ownerId && company.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access companies assigned to you");
    }
  }

  // ---------- helpers ----------

  private resolveLimit(raw?: number): number {
    if (!raw || !Number.isFinite(raw)) return ACTIVITIES_LIST_DEFAULT_LIMIT;
    return Math.min(Math.max(Math.floor(raw), 1), ACTIVITIES_LIST_MAX_LIMIT);
  }

  private async runListQuery(
    where: Prisma.ActivityWhereInput,
    orderBy: Prisma.ActivityOrderByWithRelationInput[],
    pagination: ListPagination,
    include?: ActivityIncludeArgs,
  ): Promise<{
    items: Awaited<ReturnType<PrismaService["activity"]["findMany"]>>;
    nextCursor: string | null;
  }> {
    const take = this.resolveLimit(pagination.limit);
    const findArgs: Prisma.ActivityFindManyArgs = {
      where,
      orderBy,
      take,
    };
    if (pagination.cursor) {
      findArgs.cursor = { id: pagination.cursor };
      findArgs.skip = 1;
    }
    if (include) findArgs.include = include;
    const items = await this.prisma.activity.findMany(findArgs);
    const nextCursor =
      items.length === take && items.length > 0
        ? (items[items.length - 1] as { id: string }).id
        : null;
    return { items, nextCursor };
  }

  private async withCreatedByName<T extends { createdBy: string }>(items: T[]) {
    const ids = [...new Set(items.map((a) => a.createdBy).filter(Boolean))];
    if (ids.length === 0) return items.map((a) => ({ ...a, createdByName: a.createdBy }));
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    const map = new Map(users.map((u) => [u.id, u.fullName]));
    return items.map((a) => ({
      ...a,
      createdByName: map.get(a.createdBy) ?? a.createdBy,
    }));
  }

  private emitActivityCreated(act: {
    id: string;
    type: string;
    title: string | null;
    body: string;
    orderId: string | null;
    contactId: string | null;
    companyId: string | null;
    leadId: string | null;
    callId: string | null;
  }) {
    this.workflowEmitter?.emitRecordCreated(
      CustomFieldEntityType.ACTIVITY,
      act.id,
      activityToRecord(act),
    );
  }

  private normalizeBody(body: CreateActivityBody) {
    if (!body?.type) throw new BadRequestException("type is required");
    if (!body?.body || String(body.body).trim().length === 0) {
      throw new BadRequestException("body is required");
    }

    const occurredAt =
      body.occurredAt && String(body.occurredAt).trim().length > 0
        ? new Date(body.occurredAt)
        : null;

    if (occurredAt && Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException("occurredAt must be a valid ISO date");
    }

    return {
      type: body.type,
      title: body.title ?? null,
      body: body.body,
      occurredAt,
    };
  }
}

function activityToRecord(a: {
  id: string;
  type: string;
  title: string | null;
  body: string;
  orderId: string | null;
  contactId: string | null;
  companyId: string | null;
  leadId: string | null;
  callId: string | null;
}): Record<string, unknown> {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    body: a.body,
    orderId: a.orderId,
    contactId: a.contactId,
    companyId: a.companyId,
    leadId: a.leadId,
    callId: a.callId,
  };
}
