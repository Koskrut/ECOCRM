import { ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { OrderScopeInput } from "./utils/analytics-filter.builder";

export type AnalyticsScope = {
  orderScope: OrderScopeInput;
  /** For task assignee filter (LEAD: team; ADMIN: undefined = all) */
  allowedAssigneeIds?: string[];
  /** LEAD with zero team members — all aggregates are zero */
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
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
        body: JSON.stringify({
          sessionId: "18e84e",
          runId: "run-manager-scope-1",
          hypothesisId: "H22",
          location: "analytics-scope.service.ts:resolveScopeAdmin",
          message: "Resolve analytics scope for ADMIN",
          data: { actorId: actor.id, managerId: opts?.managerId ?? null, allowLead: Boolean(opts?.allowLead) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (opts?.managerId) {
        return {
          orderScope: { actor, managerId: opts.managerId },
          allowedAssigneeIds: undefined,
        };
      }
      return { orderScope: { actor }, allowedAssigneeIds: undefined };
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
      const ids = [...teamIds];
      if (ids.length === 0) {
        return {
          orderScope: { actor, allowedOwnerIds: [] },
          allowedAssigneeIds: [],
          emptyTeam: true,
        };
      }
      return {
        orderScope: { actor, allowedOwnerIds: ids },
        allowedAssigneeIds: ids,
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
