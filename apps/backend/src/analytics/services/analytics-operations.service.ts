import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import type { ResolvedPeriod } from "../utils/analytics-date.util";

@Injectable()
export class AnalyticsOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOperations(period: ResolvedPeriod, scope: AnalyticsScope) {
    const taskWhere: any = {
      createdAt: { gte: period.from, lte: period.to },
    };
    if (scope.orderScope.managerId) taskWhere.assigneeId = scope.orderScope.managerId;
    else if (scope.allowedAssigneeIds !== undefined) taskWhere.assigneeId = { in: scope.allowedAssigneeIds };

    const [createdTasks, completedTasks, overdueTasks, byStatus] = await Promise.all([
      this.prisma.task.count({ where: taskWhere }),
      this.prisma.task.count({ where: { ...taskWhere, status: "DONE" } }),
      this.prisma.task.count({
        where: {
          ...taskWhere,
          dueAt: { not: null, lt: period.to },
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
      this.prisma.task.groupBy({ by: ["status"], where: taskWhere, _count: { id: true } }),
    ]);

    return {
      createdTasks,
      completedTasks,
      overdueTasks,
      completionRate: createdTasks > 0 ? Math.round((completedTasks / createdTasks) * 10000) / 100 : 0,
      byStatus: byStatus.map((x) => ({ status: x.status, count: x._count.id })),
    };
  }
}

