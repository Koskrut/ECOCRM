import { ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { OrderScopeInput } from "./utils/analytics-filter.builder";

export type AnalyticsScope = {
  orderScope: OrderScopeInput;
  allowedAssigneeIds?: string[];
  emptyTeam?: boolean;
};

@Injectable()
export class AnalyticsScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveScope(
    actor: AuthUser,
    opts?: { managerId?: string; allowLead?: boolean },
  ): Promise<AnalyticsScope> {
    if (actor.role === UserRole.ADMIN) {
      return opts?.managerId
        ? { orderScope: { actor, managerId: opts.managerId }, allowedAssigneeIds: undefined }
        : { orderScope: { actor }, allowedAssigneeIds: undefined };
    }

    if (actor.role === UserRole.LEAD && opts?.allowLead) {
      const teamIds = await this.getTeamMemberIds(actor.id);
      const allowed = new Set(teamIds);
      if (opts.managerId) {
        if (!allowed.has(opts.managerId)) {
          throw new ForbiddenException("managerId is not in your team");
        }
        return {
          orderScope: { actor, allowedOwnerIds: [opts.managerId], managerId: opts.managerId },
          allowedAssigneeIds: [opts.managerId],
        };
      }
      if (teamIds.length === 0) {
        return {
          orderScope: { actor, allowedOwnerIds: [] },
          allowedAssigneeIds: [],
          emptyTeam: true,
        };
      }
      return {
        orderScope: { actor, allowedOwnerIds: teamIds },
        allowedAssigneeIds: teamIds,
      };
    }

    throw new ForbiddenException("Analytics is not available for this role");
  }

  private async getTeamMemberIds(leadId: string): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { leadId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}

