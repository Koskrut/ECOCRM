import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ActivityType } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { ContactAccessService } from "../contacts/contact-access.service";
import { PrismaService } from "../prisma/prisma.service";

type CreateActivityBody = {
  type: ActivityType;
  title?: string;
  body: string;
  occurredAt?: string; // ISO
};

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contactAccess: ContactAccessService,
  ) {}

  // ---------- ORDER ----------
  async listForOrder(orderId: string, actor?: AuthUser) {
    await this.assertOrderAccess(orderId, actor);
    return this.prisma.activity.findMany({
      where: { orderId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async createForOrder(orderId: string, body: CreateActivityBody, user: AuthUser) {
    await this.assertOrderAccess(orderId, user);
    const data = this.normalizeBody(body);
    return this.prisma.activity.create({
      data: {
        ...data,
        createdBy: user.id,
        orderId,
      },
    });
  }

  // ---------- CONTACT ----------
  async listForContact(contactId: string, actor?: AuthUser) {
    await this.assertContactAccess(contactId, actor);
    const items = await this.prisma.activity.findMany({
      where: { contactId },
      orderBy: [{ pinnedAt: "desc" }, { occurredAt: "desc" }, { createdAt: "desc" }],
      include: {
        call: true,
      },
    });
    return this.withCreatedByName(items);
  }

  async createForContact(contactId: string, body: CreateActivityBody, user: AuthUser) {
    await this.assertContactAccess(contactId, user);
    const data = this.normalizeBody(body);
    return this.prisma.activity.create({
      data: {
        ...data,
        createdBy: user.id,
        contactId,
      },
    });
  }

  // ---------- LEAD ----------
  async listForLead(leadId: string, actor?: AuthUser) {
    await this.assertLeadAccess(leadId, actor);
    const items = await this.prisma.activity.findMany({
      where: { leadId },
      orderBy: [{ pinnedAt: "desc" }, { occurredAt: "desc" }, { createdAt: "desc" }],
      include: {
        call: true,
      },
    });
    return this.withCreatedByName(items);
  }

  async createForLead(leadId: string, body: CreateActivityBody, user: AuthUser) {
    await this.assertLeadAccess(leadId, user);
    const data = this.normalizeBody(body);
    return this.prisma.activity.create({
      data: {
        ...data,
        createdBy: user.id,
        leadId,
      },
    });
  }

  // ---------- COMPANY ----------
  async listForCompany(companyId: string) {
    return this.prisma.activity.findMany({
      where: { companyId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async createForCompany(companyId: string, body: CreateActivityBody, user: AuthUser) {
    const data = this.normalizeBody(body);
    return this.prisma.activity.create({
      data: {
        ...data,
        createdBy: user.id,
        companyId,
      },
    });
  }

  // ---------- UPDATE / DELETE (by activity id) ----------
  async updateOne(
    activityId: string,
    dto: { body?: string; title?: string; pinnedAt?: string | null },
    actor: AuthUser,
  ) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { id: true, contactId: true, leadId: true, companyId: true, orderId: true },
    });
    if (!activity) throw new NotFoundException("Activity not found");
    if (activity.contactId) await this.assertContactAccess(activity.contactId, actor);
    else if (activity.leadId) await this.assertLeadAccess(activity.leadId, actor);
    else if (activity.companyId) {
      // listForCompany has no assert; allow update if user exists
      if (!actor) throw new ForbiddenException("Unauthorized");
    } else if (activity.orderId) await this.assertOrderAccess(activity.orderId, actor);
    else throw new ForbiddenException("Activity has no linked entity");

    const data: { body?: string; title?: string; pinnedAt?: Date | null } = {};
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.pinnedAt !== undefined) {
      data.pinnedAt =
        dto.pinnedAt === null || dto.pinnedAt === ""
          ? null
          : (() => {
              const d = new Date(dto.pinnedAt!);
              if (Number.isNaN(d.getTime())) throw new BadRequestException("pinnedAt must be valid ISO or null");
              return d;
            })();
    }
    return this.prisma.activity.update({
      where: { id: activityId },
      data,
    });
  }

  async deleteOne(activityId: string, actor: AuthUser) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { id: true, contactId: true, leadId: true, companyId: true, orderId: true },
    });
    if (!activity) throw new NotFoundException("Activity not found");
    if (activity.contactId) await this.assertContactAccess(activity.contactId, actor);
    else if (activity.leadId) await this.assertLeadAccess(activity.leadId, actor);
    else if (activity.companyId) {
      if (!actor) throw new ForbiddenException("Unauthorized");
    } else if (activity.orderId) await this.assertOrderAccess(activity.orderId, actor);
    else throw new ForbiddenException("Activity has no linked entity");

    return this.prisma.activity.delete({
      where: { id: activityId },
    });
  }

  private async assertOrderAccess(orderId: string, actor?: AuthUser): Promise<void> {
    if (!actor || actor.role !== UserRole.MANAGER) return;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { ownerId: true },
    });
    if (!order) return;
    if (order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access orders assigned to you");
    }
  }

  private async assertContactAccess(contactId: string, actor?: AuthUser): Promise<void> {
    if (!actor) throw new ForbiddenException("Unauthorized");
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, ownerId: true },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    await this.contactAccess.assertCanViewContact(contact, actor);
  }

  private async assertLeadAccess(leadId: string, actor?: AuthUser): Promise<void> {
    if (!actor || actor.role !== UserRole.MANAGER) return;
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { ownerId: true },
    });
    if (!lead) return;
    if (lead.ownerId && lead.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access leads assigned to you");
    }
  }

  // ---------- helpers ----------
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
