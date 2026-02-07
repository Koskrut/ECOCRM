import { BadRequestException, Injectable } from "@nestjs/common";
import { ActivityType, PrismaClient } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";

type CreateActivityBody = {
  type: ActivityType;
  title?: string;
  body: string;
  occurredAt?: string; // ISO
};

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---------- ORDER ----------
  async listForOrder(orderId: string) {
    return this.prisma.activity.findMany({
      where: { orderId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async createForOrder(orderId: string, body: CreateActivityBody, user: AuthUser) {
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
  async listForContact(contactId: string) {
    return this.prisma.activity.findMany({
      where: { contactId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async createForContact(contactId: string, body: CreateActivityBody, user: AuthUser) {
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
