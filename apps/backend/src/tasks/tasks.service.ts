import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { Prisma, TaskStatus } from "@prisma/client";
import { CustomFieldEntityType, UserRole } from "@prisma/client";
import { WorkflowDomainEmitterService } from "../workflows/workflow-domain-emitter.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateTaskDto } from "./dto/create-task.dto";
import type { ListTasksQueryDto } from "./dto/list-tasks-query.dto";
import { buildTaskOverdueWhere, isTaskAttentionPreset } from "./tasks-attention.util";
import type { UpdateTaskDto } from "./dto/update-task.dto";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly workflowEmitter?: WorkflowDomainEmitterService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private assertTaskAccess(task: { assigneeId: string; createdById?: string | null }, actor: AuthUser): void {
    if (actor.role === UserRole.MANAGER && task.assigneeId !== actor.id && task.createdById !== actor.id) {
      throw new ForbiddenException("You can only access your own tasks or tasks you created");
    }
  }

  private async resolveAndValidateAssigneeId(actor: AuthUser, requestedAssigneeId?: string | null): Promise<string> {
    if (!requestedAssigneeId || requestedAssigneeId === actor.id) {
      return actor.id;
    }
    const assignee = await this.prisma.user.findUnique({
      where: { id: requestedAssigneeId },
      select: { id: true },
    });
    if (!assignee) {
      throw new NotFoundException("Assignee not found");
    }

    if (actor.role === UserRole.ADMIN) {
      return requestedAssigneeId;
    }

    if (actor.role === UserRole.LEAD) {
      const teammate = await this.prisma.user.findFirst({
        where: { id: requestedAssigneeId, OR: [{ id: actor.id }, { leadId: actor.id }] },
        select: { id: true },
      });
      if (!teammate) {
        throw new ForbiddenException("You can only assign tasks to your team");
      }
      return requestedAssigneeId;
    }

    const actorUser = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { leadId: true },
    });
    if (!actorUser?.leadId) {
      throw new ForbiddenException("You can only assign tasks to yourself");
    }
    const sameTeam = await this.prisma.user.findFirst({
      where: { id: requestedAssigneeId, leadId: actorUser.leadId },
      select: { id: true },
    });
    if (!sameTeam) {
      throw new ForbiddenException("You can only assign tasks within your team");
    }
    return requestedAssigneeId;
  }

  private async assertEntityAccess(
    actor: AuthUser,
    opts: { contactId?: string | null; companyId?: string | null; leadId?: string | null; orderId?: string | null },
  ): Promise<void> {
    if (opts.contactId) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: opts.contactId },
        select: { ownerId: true },
      });
      if (!contact) throw new NotFoundException("Contact not found");
      if (actor.role === UserRole.MANAGER && contact.ownerId != null && contact.ownerId !== actor.id) {
        throw new ForbiddenException("You can only create tasks for contacts assigned to you");
      }
    }
    if (opts.leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: opts.leadId },
        select: { ownerId: true },
      });
      if (!lead) throw new NotFoundException("Lead not found");
      if (actor.role === UserRole.MANAGER && lead.ownerId != null && lead.ownerId !== actor.id) {
        throw new ForbiddenException("You can only create tasks for leads assigned to you");
      }
    }
    if (opts.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: opts.orderId },
        select: { ownerId: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (actor.role === UserRole.MANAGER && order.ownerId !== actor.id) {
        throw new ForbiddenException("You can only create tasks for orders assigned to you");
      }
    }
    // company: no ownership, any authenticated user can link
  }

  async create(body: CreateTaskDto, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const contactId = body.contactId ?? null;
    const companyId = body.companyId ?? null;
    const leadId = body.leadId ?? null;
    const orderId = body.orderId ?? null;
    if (!contactId && !companyId && !leadId && !orderId) {
      throw new BadRequestException("At least one of contactId, companyId, leadId, orderId is required");
    }
    await this.assertEntityAccess(actor, { contactId, companyId, leadId, orderId });

    const assigneeId = await this.resolveAndValidateAssigneeId(actor, body.assigneeId);
    const dueAt =
      typeof body.dueAt === "string" && body.dueAt
        ? new Date(body.dueAt)
        : undefined;

    const task = await this.prisma.task.create({
      data: {
        assigneeId,
        contactId,
        companyId,
        leadId,
        orderId,
        createdById: actor.id,
        title: body.title.trim(),
        body: body.body?.trim() ?? null,
        dueAt: dueAt ?? null,
      },
      include: {
        assignee: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
        company: { select: { id: true, name: true } },
        lead: { select: { id: true, fullName: true, phone: true, companyName: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });
    this.workflowEmitter?.emitRecordCreated(
      CustomFieldEntityType.TASK,
      task.id,
      taskRecordFromRow(task as unknown as TaskRowLike),
    );
    if (assigneeId !== actor.id) {
      void this.notifications?.notifyTaskAssigned({
        assigneeId,
        taskId: task.id,
        title: `Нова задача: ${task.title}`,
        body: task.body,
        actorId: actor.id,
        orderId: task.orderId,
        leadId: task.leadId,
      });
    }
    return task;
  }

  async list(query: ListTasksQueryDto, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const where: Prisma.TaskWhereInput = {};
    const andParts: Prisma.TaskWhereInput[] = [];

    const idList = query.ids
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 100);
    if (idList && idList.length > 0) {
      andParts.push({ id: { in: idList } });
    } else if (query.attention && isTaskAttentionPreset(query.attention)) {
      andParts.push(buildTaskOverdueWhere({}));
    }

    if (actor.role === UserRole.MANAGER) {
      andParts.push({ OR: [{ assigneeId: actor.id }, { createdById: actor.id }] });
    } else if (query.assigneeId) {
      where.assigneeId = query.assigneeId;
    }
    if (query.contactId) where.contactId = query.contactId;
    if (query.companyId) where.companyId = query.companyId;
    if (query.leadId) where.leadId = query.leadId;
    if (query.orderId) where.orderId = query.orderId;
    if (query.status != null && !query.attention && !idList?.length) {
      if (Array.isArray(query.status)) {
        where.status = { in: query.status };
      } else {
        where.status = query.status as TaskStatus;
      }
    }
    if (!query.attention && !idList?.length && (query.dueFrom || query.dueTo)) {
      where.dueAt = {};
      if (query.dueFrom) {
        (where.dueAt as Prisma.DateTimeNullableFilter).gte = new Date(query.dueFrom);
      }
      if (query.dueTo) {
        (where.dueAt as Prisma.DateTimeNullableFilter).lte = new Date(query.dueTo);
      }
    }

    if (query.q) {
      const search = query.q.trim();
      if (search.length > 0) {
        const phoneDigits = search.replace(/\D/g, "");
        const searchOr: Prisma.TaskWhereInput[] = [
          { title: { contains: search, mode: "insensitive" } },
          { body: { contains: search, mode: "insensitive" } },
          {
            contact: {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ],
            },
          },
          { company: { name: { contains: search, mode: "insensitive" } } },
          {
            lead: {
              OR: [
                { fullName: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                { companyName: { contains: search, mode: "insensitive" } },
              ],
            },
          },
          { order: { orderNumber: { contains: search, mode: "insensitive" } } },
          { assignee: { fullName: { contains: search, mode: "insensitive" } } },
        ];
        if (phoneDigits.length >= 5) {
          searchOr.push(
            { contact: { phoneNormalized: { contains: phoneDigits } } },
            { lead: { phoneNormalized: { contains: phoneDigits } } },
          );
        }
        andParts.push({ OR: searchOr });
      }
    }

    if (andParts.length > 0) {
      where.AND = andParts;
    }

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 50));
    const skip = (page - 1) * pageSize;

    const sortBy = query.sortBy === "createdAt" || query.sortBy === "updatedAt" ? query.sortBy : "dueAt";
    const sortDir = query.sortDir === "asc" || query.sortDir === "desc" ? query.sortDir : "asc";
    const orderBy: Prisma.TaskOrderByWithRelationInput[] = [
      { [sortBy]: sortDir },
      { id: "asc" },
    ];

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          assignee: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true } },
          contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
          company: { select: { id: true, name: true } },
          lead: { select: { id: true, fullName: true, phone: true, companyName: true } },
          order: { select: { id: true, orderNumber: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getOne(id: string, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
        company: { select: { id: true, name: true } },
        lead: { select: { id: true, fullName: true, phone: true, companyName: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    this.assertTaskAccess(task, actor);
    return task;
  }

  async update(id: string, body: UpdateTaskDto, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    this.assertTaskAccess(task, actor);
    const prevSnapshot = taskRecordFromRow(task as unknown as TaskRowLike);

    const dueAt =
      body.dueAt !== undefined
        ? (typeof body.dueAt === "string" && body.dueAt ? new Date(body.dueAt) : null)
        : undefined;

    const assigneeId =
      body.assigneeId !== undefined
        ? await this.resolveAndValidateAssigneeId(actor, body.assigneeId)
        : undefined;

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title.trim() }),
        ...(body.body !== undefined && { body: body.body?.trim() ?? null }),
        ...(dueAt !== undefined && { dueAt }),
        ...(body.status !== undefined && { status: body.status }),
        ...(assigneeId !== undefined && { assigneeId }),
        ...(body.status === "DONE" && { completedAt: new Date() }),
        ...(body.status !== "DONE" && body.status !== undefined && { completedAt: null }),
      },
      include: {
        assignee: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
        company: { select: { id: true, name: true } },
        lead: { select: { id: true, fullName: true, phone: true, companyName: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });
    const nextSnapshot = taskRecordFromRow(updated as unknown as TaskRowLike);
    const changes = diffTaskRecords(prevSnapshot, nextSnapshot);
    this.workflowEmitter?.emitRecordUpdated(CustomFieldEntityType.TASK, id, nextSnapshot, changes);
    if (
      assigneeId !== undefined &&
      assigneeId !== task.assigneeId &&
      assigneeId !== actor.id
    ) {
      void this.notifications?.notifyTaskAssigned({
        assigneeId,
        taskId: updated.id,
        title: `Нова задача: ${updated.title}`,
        body: updated.body,
        actorId: actor.id,
        orderId: updated.orderId,
        leadId: updated.leadId,
      });
    }
    return updated;
  }

  async complete(id: string, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    this.assertTaskAccess(task, actor);
    const prevSnapshot = taskRecordFromRow(task as unknown as TaskRowLike);
    const updated = await this.prisma.task.update({
      where: { id },
      data: { status: "DONE", completedAt: new Date() },
      include: {
        assignee: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
        company: { select: { id: true, name: true } },
        lead: { select: { id: true, fullName: true, phone: true, companyName: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });
    const nextSnapshot = taskRecordFromRow(updated as unknown as TaskRowLike);
    this.workflowEmitter?.emitRecordUpdated(
      CustomFieldEntityType.TASK,
      id,
      nextSnapshot,
      diffTaskRecords(prevSnapshot, nextSnapshot),
    );
    return updated;
  }

  async cancel(id: string, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    this.assertTaskAccess(task, actor);
    const prevSnapshot = taskRecordFromRow(task as unknown as TaskRowLike);
    const updated = await this.prisma.task.update({
      where: { id },
      data: { status: "CANCELED" },
      include: {
        assignee: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
        company: { select: { id: true, name: true } },
        lead: { select: { id: true, fullName: true, phone: true, companyName: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });
    const nextSnapshot = taskRecordFromRow(updated as unknown as TaskRowLike);
    this.workflowEmitter?.emitRecordUpdated(
      CustomFieldEntityType.TASK,
      id,
      nextSnapshot,
      diffTaskRecords(prevSnapshot, nextSnapshot),
    );
    return updated;
  }
}

type TaskRowLike = {
  id: string;
  title: string;
  body: string | null;
  status: string;
  assigneeId: string;
  createdById: string | null;
  contactId: string | null;
  companyId: string | null;
  leadId: string | null;
  orderId: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
};

function taskRecordFromRow(t: TaskRowLike): Record<string, unknown> {
  return {
    id: t.id,
    title: t.title,
    body: t.body,
    status: t.status,
    assigneeId: t.assigneeId,
    createdById: t.createdById,
    contactId: t.contactId,
    companyId: t.companyId,
    leadId: t.leadId,
    orderId: t.orderId,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
  };
}

function diffTaskRecords(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, { previous?: unknown; current?: unknown }> | undefined {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const out: Record<string, { previous?: unknown; current?: unknown }> = {};
  for (const k of keys) {
    const a = prev[k];
    const b = next[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out[k] = { previous: a, current: b };
    }
  }
  return Object.keys(out).length ? out : undefined;
}
