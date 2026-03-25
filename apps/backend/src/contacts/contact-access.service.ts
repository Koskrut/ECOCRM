// apps/backend/src/contacts/contact-access.service.ts
import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { OrderSource, OrderStage, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

/** Закриті етапи: не входять у headline KPI / активні агрегати карточки. */
export const CONTACT_CARD_CLOSED_ORDER_STAGES: OrderStage[] = [
  OrderStage.COMPLETED,
  OrderStage.CANCELED,
  OrderStage.REFUSED,
  OrderStage.RETURN_IN_PROGRESS,
];

@Injectable()
export class ContactAccessService {
  constructor(private readonly prisma: PrismaService) {}

  activeOrderFilter(): Prisma.OrderWhereInput {
    return {
      OR: [{ orderStage: { notIn: CONTACT_CARD_CLOSED_ORDER_STAGES } }, { orderStage: null }],
    };
  }

  /** Замовлення, видимі актору (узгоджено з OrdersService.list для MANAGER). */
  orderVisibilityWhere(actor: AuthUser, teamUserIds: string[]): Prisma.OrderWhereInput {
    if (actor.role === UserRole.ADMIN) {
      return {};
    }
    if (actor.role === UserRole.MANAGER) {
      return { OR: [{ ownerId: actor.id }, { orderSource: OrderSource.STORE }] };
    }
    if (actor.role === UserRole.LEAD) {
      return { OR: [{ ownerId: { in: teamUserIds } }, { orderSource: OrderSource.STORE }] };
    }
    return { id: "___no_access___" };
  }

  async getTeamUserIds(leadUserId: string): Promise<string[]> {
    const members = await this.prisma.user.findMany({
      where: { leadId: leadUserId },
      select: { id: true },
    });
    return [leadUserId, ...members.map((m) => m.id)];
  }

  private managerNullOwnerLinkageWhere(managerId: string): Prisma.ContactWhereInput {
    return {
      OR: [
        {
          ordersAsClient: {
            some: { OR: [{ ownerId: managerId }, { orderSource: OrderSource.STORE }] },
          },
        },
        {
          ordersAsContact: {
            some: { OR: [{ ownerId: managerId }, { orderSource: OrderSource.STORE }] },
          },
        },
        { activities: { some: { createdBy: managerId } } },
        { visits: { some: { ownerId: managerId } } },
        {
          tasks: {
            some: {
              OR: [{ assigneeId: managerId }, { createdById: managerId }],
            },
          },
        },
      ],
    };
  }

  private teamNullOwnerLinkageWhere(teamUserIds: string[]): Prisma.ContactWhereInput {
    return {
      OR: [
        {
          ordersAsClient: {
            some: {
              OR: [{ ownerId: { in: teamUserIds } }, { orderSource: OrderSource.STORE }],
            },
          },
        },
        {
          ordersAsContact: {
            some: {
              OR: [{ ownerId: { in: teamUserIds } }, { orderSource: OrderSource.STORE }],
            },
          },
        },
        { activities: { some: { createdBy: { in: teamUserIds } } } },
        { visits: { some: { ownerId: { in: teamUserIds } } } },
        {
          tasks: {
            some: {
              OR: [
                { assigneeId: { in: teamUserIds } },
                { createdById: { in: teamUserIds } },
              ],
            },
          },
        },
      ],
    };
  }

  /**
   * Фільтр списку контактів для MANAGER: свої + без власника лише за зв’язком order/activity/task/visit.
   */
  managerContactListWhere(managerId: string): Prisma.ContactWhereInput {
    return {
      OR: [{ ownerId: managerId }, { AND: [{ ownerId: null }, this.managerNullOwnerLinkageWhere(managerId)] }],
    };
  }

  /**
   * Фільтр списку контактів для LEAD: контакти команди + без власника з командним зв’язком.
   */
  leadContactListWhere(teamUserIds: string[]): Prisma.ContactWhereInput {
    return {
      OR: [
        { ownerId: { in: teamUserIds } },
        { AND: [{ ownerId: null }, this.teamNullOwnerLinkageWhere(teamUserIds)] },
      ],
    };
  }

  async assertCanViewContact(
    contact: { id: string; ownerId: string | null },
    actor: AuthUser,
  ): Promise<void> {
    if (actor.role === UserRole.ADMIN) {
      return;
    }
    if (actor.role === UserRole.MANAGER) {
      if (contact.ownerId === actor.id) {
        return;
      }
      if (contact.ownerId === null) {
        const n = await this.prisma.contact.count({
          where: { id: contact.id, AND: [this.managerNullOwnerLinkageWhere(actor.id)] },
        });
        if (n > 0) {
          return;
        }
      }
      throw new ForbiddenException("You can only access contacts assigned to you");
    }
    if (actor.role === UserRole.LEAD) {
      const team = await this.getTeamUserIds(actor.id);
      if (contact.ownerId != null && team.includes(contact.ownerId)) {
        return;
      }
      if (contact.ownerId === null) {
        const n = await this.prisma.contact.count({
          where: { id: contact.id, AND: [this.teamNullOwnerLinkageWhere(team)] },
        });
        if (n > 0) {
          return;
        }
      }
      throw new ForbiddenException("You can only access contacts in your team");
    }
    throw new ForbiddenException("Insufficient permissions to access this contact");
  }

  async assertLeadCanAssignOwner(newOwnerId: string | null, leadActorId: string): Promise<void> {
    if (newOwnerId === null) {
      return;
    }
    const team = await this.getTeamUserIds(leadActorId);
    if (!team.includes(newOwnerId)) {
      throw new ForbiddenException("LEAD can only assign owner to users in their team");
    }
  }
}
