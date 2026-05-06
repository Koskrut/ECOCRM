/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest DI tokens must be value imports */
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { TimelineEntityType } from "./timeline.types";

/**
 * Centralized RBAC for canonical timeline entry points. Mirrors the existing
 * per-entity policies (orders/contacts/leads/companies/activities) so the UI
 * sees consistent 404/403 semantics regardless of which proxy was used before.
 */
@Injectable()
export class TimelineAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(
    entityType: TimelineEntityType,
    entityId: string,
    actor?: AuthUser,
  ): Promise<void> {
    switch (entityType) {
      case "order":
        return this.assertOrder(entityId, actor);
      case "contact":
        return this.assertContact(entityId, actor);
      case "lead":
        return this.assertLead(entityId, actor);
      case "company":
        return this.assertCompany(entityId, actor);
    }
  }

  private async assertOrder(orderId: string, actor?: AuthUser): Promise<void> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { ownerId: true },
    });
    if (!row) throw new NotFoundException("Order not found");
    if (!actor || actor.role !== UserRole.MANAGER) return;
    if (row.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access orders assigned to you");
    }
  }

  private async assertContact(contactId: string, actor?: AuthUser): Promise<void> {
    const row = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { ownerId: true },
    });
    if (!row) throw new NotFoundException("Contact not found");
    if (!actor || actor.role !== UserRole.MANAGER) return;
    if (row.ownerId && row.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access contacts assigned to you");
    }
  }

  private async assertLead(leadId: string, actor?: AuthUser): Promise<void> {
    const row = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { ownerId: true },
    });
    if (!row) throw new NotFoundException("Lead not found");
    if (!actor || actor.role !== UserRole.MANAGER) return;
    if (row.ownerId && row.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access leads assigned to you");
    }
  }

  private async assertCompany(companyId: string, actor?: AuthUser): Promise<void> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { ownerId: true },
    });
    if (!row) throw new NotFoundException("Company not found");
    if (!actor || actor.role !== UserRole.MANAGER) return;
    if (row.ownerId && row.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access companies assigned to you");
    }
  }
}
