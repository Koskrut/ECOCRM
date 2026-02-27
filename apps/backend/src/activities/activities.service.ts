import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { ActivityType } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

type CreateActivityBody = {
  type: ActivityType;
  title?: string;
  body: string;
  occurredAt?: string; // ISO
};

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.activity.findMany({
      where: { contactId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    });
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
    if (!actor || actor.role !== UserRole.MANAGER) return;
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { ownerId: true },
    });
    if (!contact) return;
    if (contact.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access contacts assigned to you");
    }
  }

  // ---------- helpers ----------
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
